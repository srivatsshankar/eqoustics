import { app, BrowserWindow, ipcMain, net } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

import {
  IPC_CHANNELS,
  type SpeechAudioChunkPayload,
  type SpeechCommandAliasPayload,
  type SpeechCommandInfo,
  type SpeechInferenceRuntime,
  type SpeechModelLoadStage,
  type SpeechModelStatusPayload,
  type SpeechTranscriptResult,
  type SpeechModelSize,
} from '../../src/shared/ipc/channels'
import { readAppSettings } from './settings-handlers'

const TARGET_AUDIO_SAMPLE_RATE_HZ = 16000
const ANY_SPEECH_DEPENDENCY_CHECK_SCRIPT = `
import importlib.util
import sys
has_litert = importlib.util.find_spec("litert_lm") is not None
has_transformers = (
    importlib.util.find_spec("torch") is not None
    and importlib.util.find_spec("torchvision") is not None
    and importlib.util.find_spec("transformers") is not None
    and importlib.util.find_spec("accelerate") is not None
    and importlib.util.find_spec("PIL") is not None
    and importlib.util.find_spec("librosa") is not None
)
sys.exit(0 if has_litert or has_transformers else 1)
`
const LITERT_DEPENDENCY_CHECK_SCRIPT = 'import litert_lm'
const TRANSFORMERS_DEPENDENCY_CHECK_SCRIPT = `
import importlib.util
import sys
missing = [
    package for package in ("torch", "torchvision", "transformers", "accelerate", "PIL", "librosa")
    if importlib.util.find_spec(package) is None
]
sys.exit(1 if missing else 0)
`

const SPEECH_MODEL_OPTIONS: Record<SpeechModelSize, {
  modelId: string
  repo: string
  filename: string
}> = {
  '2b': {
    modelId: 'google/gemma-4-E2B-it',
    repo: 'litert-community/gemma-4-E2B-it-litert-lm',
    filename: 'gemma-4-E2B-it.litertlm',
  },
  '4b': {
    modelId: 'google/gemma-4-E4B-it',
    repo: 'litert-community/gemma-4-E4B-it-litert-lm',
    filename: 'gemma-4-E4B-it.litertlm',
  },
}

type ElectronStoreLike = {
  get: (key: string) => unknown
  set: (key: string, value: unknown) => void
}

interface SpeechModelAssetResult {
  modelPath: string
  loadedBytes: number
  totalBytes?: number
}

interface WorkerCommand {
  type: string
  [key: string]: unknown
}

interface WorkerEnvelope extends WorkerCommand {
  id: number
}

interface WorkerProgressPayload {
  stage?: SpeechModelLoadStage
  loadedBytes?: number
  totalBytes?: number
}

interface WorkerResponse<T> {
  id: number
  ok?: boolean
  result?: T
  error?: string
  progress?: WorkerProgressPayload
}

interface PythonCommand {
  command: string
  args: string[]
}

type PythonDependencyMode = SpeechInferenceRuntime | 'any' | 'stdlib'

const DEFAULT_TRANSCRIBE_TIMEOUT_MS = 3 * 60 * 1000

let downloadPromise: Promise<SpeechModelAssetResult> | null = null
let loadPromise: Promise<SpeechModelStatusPayload> | null = null
let workerPromise: Promise<PythonSpeechWorker> | null = null
let status: SpeechModelStatusPayload = {
  state: 'idle',
  modelId: SPEECH_MODEL_OPTIONS['2b'].modelId,
}

function selectedModel(store: ElectronStoreLike) {
  return SPEECH_MODEL_OPTIONS[readAppSettings(store).speechModelSize]
}

function modelDirectory(modelSize: SpeechModelSize) {
  return path.join(app.getPath('userData'), 'models', modelSize)
}

function modelPath(modelSize: SpeechModelSize) {
  return path.join(modelDirectory(modelSize), SPEECH_MODEL_OPTIONS[modelSize].filename)
}

function modelCacheDirectory() {
  return path.join(app.getPath('userData'), 'litert-lm-cache')
}

function transformersCacheDirectory() {
  return path.join(app.getPath('userData'), 'huggingface-cache')
}

function commandDatabasePath() {
  return path.join(app.getPath('userData'), 'speech_commands.sqlite')
}

function workerScriptPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'python', 'speech_worker.py')
  }

  return path.join(process.env.APP_ROOT ?? path.join(process.cwd()), 'electron', 'python', 'speech_worker.py')
}

function setStatus(nextStatus: SpeechModelStatusPayload) {
  status = nextStatus
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.speechModelStatusChanged, status)
    }
  }
}

function speechTranscribeTimeoutMs() {
  const configured = Number(process.env.EQOUSTICS_SPEECH_TRANSCRIBE_TIMEOUT_MS)
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TRANSCRIBE_TIMEOUT_MS
}

function resetSpeechWorkerAfterFailure(error: Error) {
  loadPromise = null
  workerPromise = null
  setStatus({
    state: 'error',
    modelId: status.modelId,
    loadProgress: status.loadProgress,
    loadedBytes: status.loadedBytes,
    totalBytes: status.totalBytes,
    error: error.message,
  })
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function speechTiming(label: string, startedAt: number, details: Record<string, unknown> = {}) {
  if (process.env.EQOUSTICS_SPEECH_TIMING !== '1') return

  const detailText = Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => ` ${key}=${String(value)}`)
    .join('')
  console.info(`[speech timing] ${label}: ${(performance.now() - startedAt).toFixed(1)}ms${detailText}`)
}

function publishDownloadProgress(loadedBytes: number, totalBytes?: number) {
  setStatus({
    state: 'loading',
    modelId: status.modelId,
    loadStage: 'downloading',
    loadProgress: totalBytes ? Math.min(99, Math.round((loadedBytes / totalBytes) * 100)) : undefined,
    loadedBytes,
    totalBytes,
  })
}

async function existingModelResult(modelSize: SpeechModelSize): Promise<SpeechModelAssetResult | null> {
  try {
    const fileStat = await stat(modelPath(modelSize))
    return {
      modelPath: modelPath(modelSize),
      loadedBytes: fileStat.size,
      totalBytes: fileStat.size,
    }
  } catch {
    return null
  }
}

function downloadFile(url: string, destination: string, redirectCount = 0): Promise<SpeechModelAssetResult> {
  if (redirectCount > 8) {
    return Promise.reject(new Error('Too many redirects while downloading Gemma model.'))
  }

  return new Promise((resolve, reject) => {
    const request = net.request(url)

    request.on('response', (response) => {
      const statusCode = response.statusCode
      const redirectUrl = response.headers.location

      if (statusCode >= 300 && statusCode < 400 && redirectUrl) {
        response.on('data', () => undefined)
        void downloadFile(Array.isArray(redirectUrl) ? redirectUrl[0] : redirectUrl, destination, redirectCount + 1)
          .then(resolve, reject)
        return
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.on('data', () => undefined)
        reject(new Error(`Gemma model download failed with HTTP ${statusCode}.`))
        return
      }

      const contentLengthHeader = response.headers['content-length']
      const totalBytes = Number(Array.isArray(contentLengthHeader) ? contentLengthHeader[0] : contentLengthHeader)
      const safeTotalBytes = Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : undefined
      let loadedBytes = 0
      const file = fs.createWriteStream(destination)
      let settled = false

      const fail = (error: Error) => {
        if (settled) return
        settled = true
        file.destroy()
        request.abort()
        reject(error)
      }

      response.on('data', (chunk: Buffer) => {
        loadedBytes += chunk.byteLength
        file.write(chunk)
        publishDownloadProgress(loadedBytes, safeTotalBytes)
      })

      response.on('end', () => {
        file.end()
      })

      response.on('error', (error: Error) => fail(error))
      file.on('error', (error: Error) => fail(error))

      file.on('finish', () => {
        if (settled) return
        settled = true
        if (safeTotalBytes && loadedBytes !== safeTotalBytes) {
          reject(new Error(`Gemma model download incomplete: ${loadedBytes} of ${safeTotalBytes} bytes.`))
          return
        }

        resolve({
          modelPath: destination,
          loadedBytes,
          totalBytes: safeTotalBytes,
        })
      })
    })

    request.on('error', reject)
    request.end()
  })
}

async function ensureSpeechModelAsset(modelSize: SpeechModelSize): Promise<SpeechModelAssetResult> {
  const model = SPEECH_MODEL_OPTIONS[modelSize]
  const existing = await existingModelResult(modelSize)
  if (existing) {
    publishDownloadProgress(existing.loadedBytes, existing.totalBytes)
    return existing
  }

  if (downloadPromise) {
    return downloadPromise
  }

  downloadPromise = (async () => {
    await mkdir(modelDirectory(modelSize), { recursive: true })
    const nextModelPath = modelPath(modelSize)
    const temporaryPath = `${nextModelPath}.download`
    await rm(temporaryPath, { force: true })

    try {
      const modelUrl = `https://huggingface.co/${model.repo}/resolve/main/${model.filename}`
      const result = await downloadFile(modelUrl, temporaryPath)
      await rename(temporaryPath, nextModelPath)
      return {
        ...result,
        modelPath: nextModelPath,
      }
    } catch (error) {
      await rm(temporaryPath, { force: true })
      throw error
    } finally {
      downloadPromise = null
    }
  })()

  return downloadPromise
}

function pythonCandidates(): PythonCommand[] {
  if (process.env.EQOUSTICS_PYTHON) {
    return [{ command: process.env.EQOUSTICS_PYTHON, args: [] }]
  }

  const appRoot = process.env.APP_ROOT ?? process.cwd()
  const bundledPythonRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'python-venv')
    : path.join(appRoot, '.eqoustics-python')

  if (process.platform === 'win32') {
    return [
      {
        command: app.isPackaged
          ? path.join(bundledPythonRoot, 'python.exe')
          : path.join(bundledPythonRoot, 'Scripts', 'python.exe'),
        args: [],
      },
      { command: path.join(app.getPath('userData'), 'python-venv', 'Scripts', 'python.exe'), args: [] },
      { command: 'py', args: ['-3'] },
      { command: 'python', args: [] },
    ]
  }

  const homeDirectory = os.homedir()
  return [
    { command: path.join(bundledPythonRoot, 'bin', 'python'), args: [] },
    { command: path.join(homeDirectory, '.eqoustics-python', 'bin', 'python'), args: [] },
    { command: path.join(app.getPath('userData'), 'python-venv', 'bin', 'python'), args: [] },
    { command: 'python3', args: [] },
    { command: 'python', args: [] },
  ]
}

function commandExits(candidate: PythonCommand, args: string[]) {
  return new Promise<boolean>((resolve) => {
    const child = spawn(candidate.command, [...candidate.args, ...args], { windowsHide: true })

    child.once('error', () => resolve(false))
    child.once('exit', (code) => resolve(code === 0))
  })
}

function commandRuns(candidate: PythonCommand) {
  return commandExits(candidate, ['--version'])
}

function dependencyCheckScript(mode: PythonDependencyMode) {
  if (mode === 'litert') return LITERT_DEPENDENCY_CHECK_SCRIPT
  if (mode === 'transformers') return TRANSFORMERS_DEPENDENCY_CHECK_SCRIPT
  return ANY_SPEECH_DEPENDENCY_CHECK_SCRIPT
}

function commandHasSpeechDependency(candidate: PythonCommand, mode: PythonDependencyMode) {
  return commandExits(candidate, ['-c', dependencyCheckScript(mode)])
}

function missingDependencyMessage(mode: PythonDependencyMode) {
  if (mode === 'transformers') {
    return 'No Python runtime with Transformers speech dependencies found. Run run-dev-install.bat again, or install them into the Python Eqoustics uses with: python -m pip install --upgrade torch torchvision accelerate transformers pillow librosa. If you use a custom Python, set EQOUSTICS_PYTHON to that executable.'
  }

  if (mode === 'litert') {
    return "No Python runtime with LiteRT-LM found. Run run-dev-install.bat again, or install it with: python -m pip install --upgrade 'litert-lm-api>=0.11.0'. If you use a custom Python, set EQOUSTICS_PYTHON to that executable."
  }

  return "No Python runtime with speech dependencies found. Run run-dev-install.bat again, or install electron/python/requirements-speech.txt into the Python Eqoustics uses."
}

async function resolvePythonCommand(mode: PythonDependencyMode = 'any') {
  let sawPython = false
  for (const candidate of pythonCandidates()) {
    if (!(await commandRuns(candidate))) {
      continue
    }

    sawPython = true
    if (mode === 'stdlib') {
      return candidate
    }
    if (await commandHasSpeechDependency(candidate, mode)) {
      return candidate
    }
  }

  if (sawPython) {
    throw new Error(missingDependencyMessage(mode))
  }

  throw new Error('No Python 3 runtime found. Install Python or set EQOUSTICS_PYTHON to the Python executable.')
}

class PythonSpeechWorker {
  private readonly child: ChildProcessWithoutNullStreams
  readonly dependencyMode: PythonDependencyMode
  private nextId = 1
  private stdoutBuffer = ''
  private stderrBuffer = ''
  private closedIntentionally = false
  private readonly pending = new Map<number, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    onProgress?: (progress: WorkerProgressPayload) => void
    timeout?: ReturnType<typeof setTimeout>
  }>()

  constructor(python: PythonCommand, dependencyMode: PythonDependencyMode) {
    this.dependencyMode = dependencyMode
    this.child = spawn(python.command, [...python.args, workerScriptPath()], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    this.child.stdout.setEncoding('utf8')
    this.child.stderr.setEncoding('utf8')
    this.child.stdout.on('data', (data: string) => this.handleStdout(data))
    this.child.stderr.on('data', (data: string) => {
      this.stderrBuffer = `${this.stderrBuffer}${data}`.slice(-4000)
    })
    this.child.once('error', (error) => this.handleFailure(error))
    this.child.once('exit', (code, signal) => {
      this.handleFailure(new Error(`Python speech worker exited (${signal ?? code ?? 'unknown'}): ${this.stderrBuffer.trim()}`))
    })
  }

  request<T>(command: WorkerCommand, onProgress?: (progress: WorkerProgressPayload) => void, timeoutMs?: number) {
    const id = this.nextId
    this.nextId += 1
    const envelope: WorkerEnvelope = { id, ...command }

    return new Promise<T>((resolve, reject) => {
      const timeout = timeoutMs
        ? setTimeout(() => {
          const pending = this.pending.get(id)
          if (!pending) return

          this.pending.delete(id)
          const error = new Error(`Python speech worker request timed out after ${timeoutMs}ms.`)
          pending.reject(error)
          this.closedIntentionally = true
          this.close()
          resetSpeechWorkerAfterFailure(error)
        }, timeoutMs)
        : undefined

      this.pending.set(id, {
        resolve: (value) => {
          if (timeout) clearTimeout(timeout)
          resolve(value as T)
        },
        reject: (error) => {
          if (timeout) clearTimeout(timeout)
          reject(error)
        },
        onProgress,
        timeout,
      })

      this.child.stdin.write(`${JSON.stringify(envelope)}\n`, (error) => {
        if (!error) return
        const pending = this.pending.get(id)
        this.pending.delete(id)
        if (pending?.timeout) clearTimeout(pending.timeout)
        reject(error)
      })
    })
  }

  close() {
    this.closedIntentionally = true
    this.child.kill()
  }

  private handleStdout(data: string) {
    this.stdoutBuffer += data

    for (;;) {
      const newlineIndex = this.stdoutBuffer.indexOf('\n')
      if (newlineIndex < 0) return

      const line = this.stdoutBuffer.slice(0, newlineIndex).trim()
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1)
      if (!line) continue

      let response: WorkerResponse<unknown>
      try {
        response = JSON.parse(line) as WorkerResponse<unknown>
      } catch {
        this.stderrBuffer = `${this.stderrBuffer}\n${line}`.slice(-4000)
        continue
      }

      const pending = this.pending.get(response.id)
      if (!pending) continue

      if (response.progress) {
        pending.onProgress?.(response.progress)
        continue
      }

      this.pending.delete(response.id)

      if (response.ok) {
        pending.resolve(response.result)
      } else {
        pending.reject(new Error(response.error ?? 'Python speech worker failed.'))
      }
    }
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) {
      if (pending.timeout) clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.pending.clear()
    workerPromise = null
  }

  private handleFailure(error: Error) {
    this.rejectAll(error)
    if (!this.closedIntentionally) {
      resetSpeechWorkerAfterFailure(error)
    }
  }
}

async function getWorker(requiredMode: PythonDependencyMode = 'any') {
  const existingWorker = workerPromise ? await workerPromise.catch(() => null) : null
  if (workerPromise && !existingWorker) {
    workerPromise = null
  }
  if (existingWorker && requiredMode !== 'any' && requiredMode !== 'stdlib' && existingWorker.dependencyMode !== requiredMode) {
    existingWorker.close()
    workerPromise = null
  }

  if (!workerPromise) {
    workerPromise = (async () => {
      const python = await resolvePythonCommand(requiredMode)
      return new PythonSpeechWorker(python, requiredMode)
    })()
  }

  return workerPromise
}

async function loadSpeechModel(store: ElectronStoreLike): Promise<SpeechModelStatusPayload> {
  const settings = readAppSettings(store)
  const model = SPEECH_MODEL_OPTIONS[settings.speechModelSize]
  if (status.state === 'ready') {
    return status
  }

  if (loadPromise) {
    return loadPromise
  }

  setStatus({ state: 'loading', modelId: model.modelId, loadStage: 'downloading', loadProgress: 0, loadedBytes: 0 })
  loadPromise = (async () => {
    try {
      const modelSize = settings.speechModelSize
      const modelAsset = settings.speechInferenceRuntime === 'litert'
        ? await ensureSpeechModelAsset(modelSize)
        : {
          modelPath: '',
          loadedBytes: 0,
          totalBytes: undefined,
        }
      setStatus({
        state: 'loading',
        modelId: model.modelId,
        loadStage: 'python',
        loadProgress: 100,
        loadedBytes: modelAsset.loadedBytes,
        totalBytes: modelAsset.totalBytes,
      })

      const worker = await getWorker(settings.speechInferenceRuntime)
      setStatus({
        state: 'loading',
        modelId: model.modelId,
        loadStage: 'initializing',
        loadProgress: 100,
        loadedBytes: modelAsset.loadedBytes,
        totalBytes: modelAsset.totalBytes,
      })
      await worker.request<{ ready: boolean }>({
        type: 'load',
        modelPath: modelAsset.modelPath,
        modelId: model.modelId,
        modelSize,
        runtime: settings.speechInferenceRuntime,
        backend: settings.speechAcceleration,
        audioBackend: settings.speechAcceleration,
        transformersMtp: settings.transformersMtp,
        maxNumTokens: process.env.EQOUSTICS_LITERT_MAX_TOKENS ? Number(process.env.EQOUSTICS_LITERT_MAX_TOKENS) : undefined,
        speculativeDecoding: process.env.EQOUSTICS_LITERT_SPECULATIVE_DECODING ?? 'true',
        cacheDir: settings.speechInferenceRuntime === 'litert' ? modelCacheDirectory() : transformersCacheDirectory(),
      }, (progress) => {
        const stage: SpeechModelLoadStage = progress.stage ?? 'downloading'
        const totalBytes = progress.totalBytes
        const loadedBytes = progress.loadedBytes ?? 0
        const loadProgress = totalBytes && totalBytes > 0
          ? Math.min(99, Math.max(0, Math.round((loadedBytes / totalBytes) * 100)))
          : stage === 'initializing' ? 100 : undefined
        setStatus({
          state: 'loading',
          modelId: model.modelId,
          loadStage: stage,
          loadProgress,
          loadedBytes,
          totalBytes,
        })
      })

      setStatus({
        state: 'ready',
        modelId: model.modelId,
        loadProgress: 100,
        loadedBytes: modelAsset.loadedBytes,
        totalBytes: modelAsset.totalBytes,
      })
      return status
    } catch (error) {
      setStatus({
        state: 'error',
        modelId: model.modelId,
        loadProgress: status.loadProgress,
        loadedBytes: status.loadedBytes,
        totalBytes: status.totalBytes,
        error: errorMessage(error),
      })
      return status
    } finally {
      loadPromise = null
    }
  })()

  return loadPromise
}

function resampleAudio(samples: Float32Array, sourceRate: number) {
  if (sourceRate === TARGET_AUDIO_SAMPLE_RATE_HZ) {
    return samples
  }

  const ratio = sourceRate / TARGET_AUDIO_SAMPLE_RATE_HZ
  const nextLength = Math.max(1, Math.round(samples.length / ratio))
  const resampled = new Float32Array(nextLength)

  for (let index = 0; index < nextLength; index += 1) {
    const sourceIndex = index * ratio
    const lowerIndex = Math.floor(sourceIndex)
    const upperIndex = Math.min(samples.length - 1, lowerIndex + 1)
    const fraction = sourceIndex - lowerIndex
    resampled[index] = samples[lowerIndex] * (1 - fraction) + samples[upperIndex] * fraction
  }

  return resampled
}

function wavBufferFromSamples(samples: Float32Array, sampleRate: number) {
  const buffer = Buffer.alloc(44 + samples.length * 2)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + samples.length * 2, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples.length * 2, 40)

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]))
    buffer.writeInt16LE(sample < 0 ? sample * 0x8000 : sample * 0x7fff, 44 + index * 2)
  }

  return buffer
}

async function transcribeSpeechChunk(store: ElectronStoreLike, payload: SpeechAudioChunkPayload): Promise<SpeechTranscriptResult> {
  const requestStarted = performance.now()
  const currentStatus = status.state === 'ready' ? status : await loadSpeechModel(store)
  if (currentStatus.state !== 'ready') {
    throw new Error(currentStatus.error ?? 'Python Gemma speech model is not ready.')
  }

  const worker = await getWorker()
  const sourceSamples = new Float32Array(payload.audioSamples)
  const samples = resampleAudio(sourceSamples, payload.audioSampleRateHz)
  const audioPath = path.join(os.tmpdir(), `eqoustics-speech-${randomUUID()}.wav`)

  const wavStarted = performance.now()
  await writeFile(audioPath, wavBufferFromSamples(samples, TARGET_AUDIO_SAMPLE_RATE_HZ))
  speechTiming('wav-write', wavStarted, { samples: samples.length })
  try {
    const workerStarted = performance.now()
    return await worker.request<SpeechTranscriptResult>({
      type: 'transcribe',
      audioPath,
      currentRowLatex: payload.currentRowLatex ?? '',
      commandDbPath: commandDatabasePath(),
    }, undefined, speechTranscribeTimeoutMs())
      .finally(() => speechTiming('worker-request', workerStarted))
  } finally {
    await rm(audioPath, { force: true })
    speechTiming('speech-request-total', requestStarted)
  }
}

async function listSpeechCommands(): Promise<SpeechCommandInfo[]> {
  const worker = await getWorker('stdlib')
  return worker.request<SpeechCommandInfo[]>({
    type: 'list-commands',
    commandDbPath: commandDatabasePath(),
  })
}

async function addSpeechCommandAlias(payload: SpeechCommandAliasPayload): Promise<SpeechCommandInfo[]> {
  const worker = await getWorker('stdlib')
  return worker.request<SpeechCommandInfo[]>({
    type: 'add-command-alias',
    commandDbPath: commandDatabasePath(),
    command: payload.command,
    alias: payload.alias,
  })
}

async function deleteSpeechCommandAlias(payload: SpeechCommandAliasPayload): Promise<SpeechCommandInfo[]> {
  const worker = await getWorker('stdlib')
  return worker.request<SpeechCommandInfo[]>({
    type: 'delete-command-alias',
    commandDbPath: commandDatabasePath(),
    command: payload.command,
    alias: payload.alias,
  })
}

export function registerSpeechModelHandlers(store: ElectronStoreLike) {
  status = {
    state: 'idle',
    modelId: selectedModel(store).modelId,
  }

  ipcMain.removeHandler(IPC_CHANNELS.speechModelGetStatus)
  ipcMain.handle(IPC_CHANNELS.speechModelGetStatus, () => status)

  ipcMain.removeHandler(IPC_CHANNELS.speechModelLoad)
  ipcMain.handle(IPC_CHANNELS.speechModelLoad, () => loadSpeechModel(store))

  ipcMain.removeHandler(IPC_CHANNELS.speechListCommands)
  ipcMain.handle(IPC_CHANNELS.speechListCommands, () => listSpeechCommands())

  ipcMain.removeHandler(IPC_CHANNELS.speechAddCommandAlias)
  ipcMain.handle(IPC_CHANNELS.speechAddCommandAlias, (_event, payload: SpeechCommandAliasPayload) => {
    return addSpeechCommandAlias(payload)
  })

  ipcMain.removeHandler(IPC_CHANNELS.speechDeleteCommandAlias)
  ipcMain.handle(IPC_CHANNELS.speechDeleteCommandAlias, (_event, payload: SpeechCommandAliasPayload) => {
    return deleteSpeechCommandAlias(payload)
  })

  ipcMain.removeHandler(IPC_CHANNELS.speechTranscribeChunk)
  ipcMain.handle(IPC_CHANNELS.speechTranscribeChunk, (_event, payload: SpeechAudioChunkPayload) => {
    return transcribeSpeechChunk(store, payload)
  })
}
