import { createWriteStream, existsSync } from 'node:fs'
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import https from 'node:https'

const rootDir = process.cwd()
const venvDir = path.join(rootDir, '.eqoustics-python')
const packageVenvDir = path.join(rootDir, '.eqoustics-python-package')
const portablePythonDir = path.join(rootDir, '.eqoustics-python-portable')
const cacheDir = path.join(rootDir, '.eqoustics-python-cache')
const requirementsPath = path.join(rootDir, 'electron', 'python', 'requirements-speech.txt')
const isWindows = process.platform === 'win32'
const venvPython = isWindows
  ? path.join(venvDir, 'Scripts', 'python.exe')
  : path.join(venvDir, 'bin', 'python')
const packageVenvPython = isWindows
  ? path.join(packageVenvDir, 'Scripts', 'python.exe')
  : path.join(packageVenvDir, 'bin', 'python')
const portablePython = path.join(portablePythonDir, 'python.exe')
const torchIndexUrl = process.env.EQOUSTICS_TORCH_INDEX_URL || 'https://download.pytorch.org/whl/cu128'
const portableTorchIndexUrl = process.env.EQOUSTICS_PORTABLE_TORCH_INDEX_URL || 'https://download.pytorch.org/whl/cpu'
const skipPortable = process.argv.includes('--skip-portable')
const forcePrepare = process.env.EQOUSTICS_FORCE_PYTHON_PREPARE === '1'

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: options.quiet ? 'pipe' : 'inherit',
    shell: false,
  })

  if (result.status === 0) {
    return result
  }

  if (options.optional) {
    return null
  }

  throw new Error(`[Eqoustics] Command failed: ${command} ${args.join(' ')}`)
}

function commandWorks(command, args = ['--version']) {
  return Boolean(run(command, args, { optional: true, quiet: true }))
}

function runOutput(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    shell: false,
  })

  if (result.status !== 0) {
    throw new Error(`[Eqoustics] Command failed: ${command} ${args.join(' ')}\n${result.stderr ?? ''}`)
  }

  return result.stdout.trim()
}

function downloadFile(url, destination, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (
        response.statusCode
        && response.statusCode >= 300
        && response.statusCode < 400
        && response.headers.location
      ) {
        response.resume()
        if (redirectCount > 5) {
          reject(new Error(`[Eqoustics] Too many redirects while downloading ${url}`))
          return
        }
        downloadFile(new URL(response.headers.location, url).toString(), destination, redirectCount + 1)
          .then(resolve)
          .catch(reject)
        return
      }

      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`[Eqoustics] Download failed (${response.statusCode}) for ${url}`))
        return
      }

      const file = createWriteStream(destination)
      response.pipe(file)
      file.on('finish', () => {
        file.close(resolve)
      })
      file.on('error', reject)
    }).on('error', reject)
  })
}

function pythonBaseCommand() {
  if (process.env.EQOUSTICS_BASE_PYTHON && commandWorks(process.env.EQOUSTICS_BASE_PYTHON)) {
    return { command: process.env.EQOUSTICS_BASE_PYTHON, args: [] }
  }

  if (isWindows && commandWorks('py', ['-3', '--version'])) {
    return { command: 'py', args: ['-3'] }
  }

  if (commandWorks('python3')) {
    return { command: 'python3', args: [] }
  }

  if (commandWorks('python')) {
    return { command: 'python', args: [] }
  }

  throw new Error('[Eqoustics] Python 3 was not found. Install Python 3, then retry.')
}

function speechDependencyCheckScript(options = {}) {
  const pythonIsWindows = isWindows ? 'True' : 'False'
  const requireCuda = options.requireCuda ? 'True' : 'False'
  const rejectCuda = options.rejectCuda ? 'True' : 'False'
  return `
import importlib.util
import sys
missing = [
    package for package in ("torch", "torchvision", "transformers", "accelerate", "PIL", "librosa", "litert_lm")
    if importlib.util.find_spec(package) is None
]
if missing:
    sys.exit(1)
import torch
if ${pythonIsWindows} and ${requireCuda} and torch.version.cuda is None:
    sys.exit(1)
if ${pythonIsWindows} and ${rejectCuda} and torch.version.cuda is not None:
    sys.exit(1)
sys.exit(0)
`
}

function pythonHasSpeechDependencies(pythonPath, options = {}) {
  if (!existsSync(pythonPath)) return false

  return Boolean(run(pythonPath, ['-B', '-c', speechDependencyCheckScript(options)], { optional: true, quiet: true }))
}

function localVenvHasSpeechDependencies() {
  return pythonHasSpeechDependencies(venvPython, { requireCuda: isWindows })
}

function packageVenvHasSpeechDependencies() {
  return pythonHasSpeechDependencies(packageVenvPython, { rejectCuda: isWindows })
}

function portablePythonHasSpeechDependencies() {
  return pythonHasSpeechDependencies(portablePython, { rejectCuda: isWindows })
}

async function withHeartbeat(label, task) {
  const startedAt = Date.now()
  const heartbeat = setInterval(() => {
    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000)
    console.log(`[Eqoustics] ${label}... elapsed ${elapsedSeconds}s.`)
  }, 30_000)

  try {
    return await task()
  } finally {
    clearInterval(heartbeat)
  }
}

async function prunePythonCacheFiles(root) {
  if (!existsSync(root)) return

  let removedCount = 0
  async function walk(directory) {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '__pycache__') {
          await rm(entryPath, { recursive: true, force: true })
          removedCount += 1
        } else {
          await walk(entryPath)
        }
      } else if (entry.isFile() && /\.(?:pyc|pyo)$/i.test(entry.name)) {
        await rm(entryPath, { force: true })
        removedCount += 1
      }
    }
  }

  await withHeartbeat('Still pruning Python bytecode caches from the portable runtime', () => walk(root))
  if (removedCount > 0) {
    console.log(`[Eqoustics] Removed ${removedCount} Python bytecode cache entries from the portable runtime.`)
  }
}

async function configurePortablePythonPath() {
  const entries = await readdir(portablePythonDir)
  const pathFile = entries.find((entry) => /^python\d+\._pth$/i.test(entry))
  if (!pathFile) {
    throw new Error('[Eqoustics] Portable Python path configuration file was not found.')
  }

  await writeFile(
    path.join(portablePythonDir, pathFile),
    [
      pathFile.replace('._pth', '.zip'),
      '.',
      'Lib',
      'Lib\\site-packages',
      'import site',
      '',
    ].join('\n'),
  )
}

function installSpeechDependencies(pythonPath, selectedTorchIndexUrl) {
  console.log('[Eqoustics] Updating Python packaging tools...')
  run(pythonPath, ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel'])

  if (isWindows) {
    console.log(`[Eqoustics] Installing PyTorch from ${selectedTorchIndexUrl}`)
    run(pythonPath, [
      '-m',
      'pip',
      'install',
      '--upgrade',
      'torch',
      'torchvision',
      '--index-url',
      selectedTorchIndexUrl,
    ])
  }

  if (existsSync(requirementsPath)) {
    console.log('[Eqoustics] Installing Python speech dependencies...')
    run(pythonPath, ['-m', 'pip', 'install', '-r', requirementsPath])
  }
}

function ensureVirtualEnvironment(targetDir, targetPython, basePython) {
  if (existsSync(targetPython)) return

  console.log(`[Eqoustics] Creating Python virtual environment at ${targetDir}`)
  run(basePython.command, [...basePython.args, '-m', 'venv', targetDir])
}

async function prepareWindowsPortablePython(sourceVenvDir, sourcePython) {
  if (!isWindows) return

  const pythonVersion = runOutput(sourcePython, [
    '-c',
    'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")',
  ])
  const embedZipName = `python-${pythonVersion}-embed-amd64.zip`
  const embedZipPath = path.join(cacheDir, embedZipName)
  const embedUrl = `https://www.python.org/ftp/python/${pythonVersion}/${embedZipName}`

  await mkdir(cacheDir, { recursive: true })
  if (!existsSync(embedZipPath)) {
    console.log(`[Eqoustics] Downloading portable Python runtime ${pythonVersion}...`)
    await downloadFile(embedUrl, embedZipPath)
  }

  console.log(`[Eqoustics] Preparing self-contained portable Python runtime at ${portablePythonDir}`)
  await rm(portablePythonDir, { recursive: true, force: true })
  await mkdir(portablePythonDir, { recursive: true })
  run('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `Expand-Archive -LiteralPath '${embedZipPath.replaceAll("'", "''")}' -DestinationPath '${portablePythonDir.replaceAll("'", "''")}' -Force`,
  ])

  await mkdir(path.join(portablePythonDir, 'Lib'), { recursive: true })
  console.log('[Eqoustics] Copying Python packages into the portable runtime...')
  await withHeartbeat('Still copying Python packages into the portable runtime', () => cp(
    path.join(sourceVenvDir, 'Lib', 'site-packages'),
    path.join(portablePythonDir, 'Lib', 'site-packages'),
    { recursive: true, force: true },
  ))
  await prunePythonCacheFiles(path.join(portablePythonDir, 'Lib', 'site-packages'))
  await configurePortablePythonPath()

  console.log('[Eqoustics] Verifying self-contained portable Python runtime...')
  run(portablePython, [
    '-B',
    '-c',
    'import torch, torchvision, transformers, accelerate, librosa, PIL, litert_lm; print(torch.__version__); print(torch.cuda.is_available())',
  ])
}

async function main() {
  await mkdir(path.dirname(venvDir), { recursive: true })

  const basePython = pythonBaseCommand()

  if (skipPortable) {
    ensureVirtualEnvironment(venvDir, venvPython, basePython)

    if (!forcePrepare && localVenvHasSpeechDependencies()) {
      console.log('[Eqoustics] Local Python virtual environment is ready for development.')
      return
    }

    installSpeechDependencies(venvPython, torchIndexUrl)
    console.log('[Eqoustics] Skipping portable Python runtime preparation for development mode.')
    return
  }

  const packageReady = packageVenvHasSpeechDependencies()
  const portableReady = isWindows && portablePythonHasSpeechDependencies()

  if (!forcePrepare && packageReady && portableReady) {
    await prunePythonCacheFiles(path.join(portablePythonDir, 'Lib', 'site-packages'))
    console.log('[Eqoustics] CPU package and portable Python runtimes are ready for packaging.')
    return
  }

  ensureVirtualEnvironment(packageVenvDir, packageVenvPython, basePython)

  if (forcePrepare || !packageVenvHasSpeechDependencies()) {
    installSpeechDependencies(packageVenvPython, portableTorchIndexUrl)
  } else {
    console.log('[Eqoustics] CPU package Python virtual environment already has speech dependencies.')
  }

  if (!forcePrepare && portablePythonHasSpeechDependencies()) {
    await prunePythonCacheFiles(path.join(portablePythonDir, 'Lib', 'site-packages'))
    console.log('[Eqoustics] Portable Python runtime already has speech dependencies.')
  } else {
    await prepareWindowsPortablePython(packageVenvDir, packageVenvPython)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
