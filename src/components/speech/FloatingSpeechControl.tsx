import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleExclamation, faGripVertical, faMicrophone, faMicrophoneSlash } from '@fortawesome/free-solid-svg-icons'
import { MicVAD } from '@ricky0123/vad-web'

import {
  SPEECH_MODEL_ID,
  loadSpeechModel,
  subscribeSpeechModelStatus,
  transcribeSpeechChunk,
  type SpeechRecognitionResult,
  type SpeechModelStatusPayload,
} from '../../speech/pythonSpeech'

const FLOATING_SPEECH_POSITION_STORAGE_KEY = 'eqoustics:floatingSpeechWindowPosition'
const DEFAULT_FLOATING_SPEECH_POSITION = { x: 18, y: 18 }
const VAD_ASSET_PROTOCOL_BASE_PATH = 'eqoustics-vad://assets/'
const VAD_SAMPLE_RATE_HZ = 16000
const MICROPHONE_LEVEL_FLOOR_DB = -60
const MICROPHONE_LEVEL_CEILING_DB = -18
const MICROPHONE_LEVEL_DECAY = 0.78

interface FloatingSpeechControlProps {
  disabled: boolean
  microphoneDeviceId?: string | null
  onBeforeListen?: () => void
  getCurrentRowLatex?: () => string
  onProcessingChange?: (isProcessing: boolean) => void
  onSpeechResult: (result: SpeechRecognitionResult) => void
}

interface DragState {
  pointerId: number
  offsetX: number
  offsetY: number
}

interface FloatingSpeechPosition {
  x: number
  y: number
}

interface InitialFloatingSpeechPosition {
  position: FloatingSpeechPosition
  isSaved: boolean
}

interface SpeechTooltip {
  title: string
  top: number
  left: number
  maxWidth: number
  placement: 'above' | 'below'
}

interface QueuedSpeechSegment {
  audioSampleRateHz: number
  audioSamples: Float32Array
}

interface PreparedVad {
  key: string
  promise: Promise<MicVAD>
}

type SpeechInputPreparationState = 'idle' | 'loading' | 'ready'

interface LightweightSpeechRecognitionResult {
  transcript: string
}

interface LightweightSpeechRecognitionResultList {
  length: number
  [index: number]: LightweightSpeechRecognitionResult
}

interface LightweightSpeechRecognitionEvent {
  resultIndex: number
  results: {
    length: number
    [index: number]: LightweightSpeechRecognitionResultList
  }
}

interface LightweightSpeechRecognitionErrorEvent {
  error?: string
}

interface LightweightSpeechRecognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onend: (() => void) | null
  onerror: ((event: LightweightSpeechRecognitionErrorEvent) => void) | null
  onresult: ((event: LightweightSpeechRecognitionEvent) => void) | null
  abort: () => void
  start: () => void
  stop: () => void
}

type LightweightSpeechRecognitionConstructor = new () => LightweightSpeechRecognition

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

function microphoneLevelFromFrame(frame: Float32Array) {
  let total = 0
  for (const sample of frame) {
    total += sample * sample
  }

  const rms = Math.sqrt(total / Math.max(1, frame.length))
  const decibels = 20 * Math.log10(rms + 0.000001)
  return clampNumber(
    (decibels - MICROPHONE_LEVEL_FLOOR_DB) / (MICROPHONE_LEVEL_CEILING_DB - MICROPHONE_LEVEL_FLOOR_DB),
    0,
    1,
  )
}

function clampPosition(x: number, y: number, element: HTMLElement) {
  const parent = element.parentElement
  if (!parent) return { x, y }

  const maxX = Math.max(0, parent.clientWidth - element.offsetWidth - 8)
  const maxY = Math.max(0, parent.clientHeight - element.offsetHeight - 8)

  return {
    x: Math.max(8, Math.min(x, maxX)),
    y: Math.max(8, Math.min(y, maxY)),
  }
}

function readInitialPosition(): InitialFloatingSpeechPosition {
  if (typeof window === 'undefined') return { position: DEFAULT_FLOATING_SPEECH_POSITION, isSaved: false }

  try {
    const savedPosition = window.localStorage.getItem(FLOATING_SPEECH_POSITION_STORAGE_KEY)
    if (!savedPosition) return { position: DEFAULT_FLOATING_SPEECH_POSITION, isSaved: false }

    const parsedPosition = JSON.parse(savedPosition) as Partial<FloatingSpeechPosition>
    if (typeof parsedPosition.x !== 'number' || typeof parsedPosition.y !== 'number') {
      return { position: DEFAULT_FLOATING_SPEECH_POSITION, isSaved: false }
    }
    if (!Number.isFinite(parsedPosition.x) || !Number.isFinite(parsedPosition.y)) {
      return { position: DEFAULT_FLOATING_SPEECH_POSITION, isSaved: false }
    }

    return { position: parsedPosition as FloatingSpeechPosition, isSaved: true }
  } catch {
    return { position: DEFAULT_FLOATING_SPEECH_POSITION, isSaved: false }
  }
}

function defaultRightPosition(element: HTMLElement) {
  const parent = element.parentElement
  if (!parent) return DEFAULT_FLOATING_SPEECH_POSITION

  return {
    x: parent.clientWidth - element.offsetWidth - 18,
    y: 18,
  }
}

function savePosition(position: FloatingSpeechPosition) {
  try {
    window.localStorage.setItem(FLOATING_SPEECH_POSITION_STORAGE_KEY, JSON.stringify({
      x: Math.round(position.x),
      y: Math.round(position.y),
    }))
  } catch {
    // Ignore storage failures so the speech control remains usable.
  }
}

function shortErrorMessage(error: string) {
  if (/python/i.test(error)) return 'Python unavailable'
  if (/no available backend|wasm/i.test(error)) return 'VAD unavailable'
  if (/litert_lm|litert-lm|lite_rt/i.test(error)) return 'LiteRT-LM missing'
  if (/transformers|torch|torchvision|accelerate|pillow|pil|librosa/i.test(error)) return 'Transformers missing'
  if (/failed to open downloaded/i.test(error)) return 'Local file failed'
  if (/failed to fetch|networkerror/i.test(error)) return 'Fetch failed'
  if (/load failed/i.test(error)) return 'Model load failed'
  if (/memory|allocation/i.test(error)) return 'Not enough memory'
  if (/unsupported|audio/i.test(error)) return 'Unsupported model'
  if (/401|403|unauthorized|forbidden|gated/i.test(error)) return 'Access denied'
  return 'Model load failed'
}

function formatMegabytes(bytes: number) {
  return `${Math.floor(bytes / 1024 / 1024)} MB`
}

function loaderLabelForStatus(status: SpeechModelStatusPayload, error: string | null) {
  if (error) return shortErrorMessage(error)
  if (status.loadStage === 'python') return 'Starting Python'
  if (status.loadStage === 'initializing') return 'Preparing Gemma'
  return 'Downloading Gemma'
}

function vadAssetBasePath() {
  if (window.location.protocol === 'file:') return VAD_ASSET_PROTOCOL_BASE_PATH

  return new URL('vad/', window.location.href).href
}

function microphoneConstraints(deviceId?: string | null): MediaStreamConstraints {
  return {
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      channelCount: 1,
      echoCancellation: true,
      autoGainControl: true,
      noiseSuppression: true,
    },
  }
}

function lightweightSpeechRecognitionConstructor(): LightweightSpeechRecognitionConstructor | null {
  const speechWindow = window as Window & {
    SpeechRecognition?: LightweightSpeechRecognitionConstructor
    webkitSpeechRecognition?: LightweightSpeechRecognitionConstructor
  }

  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
}

function normalizeWakePhrase(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function transcriptContainsWakePhrase(transcript: string, phrases: string[]) {
  const normalizedTranscript = normalizeWakePhrase(transcript)
  if (!normalizedTranscript) return false

  return phrases.some((phrase) => {
    const normalizedPhrase = normalizeWakePhrase(phrase)
    if (!normalizedPhrase) return false
    return normalizedTranscript === normalizedPhrase
      || normalizedTranscript.startsWith(`${normalizedPhrase} `)
      || normalizedTranscript.endsWith(` ${normalizedPhrase}`)
      || normalizedTranscript.includes(` ${normalizedPhrase} `)
  })
}

export function FloatingSpeechControl({ disabled, microphoneDeviceId, onBeforeListen, getCurrentRowLatex, onProcessingChange, onSpeechResult }: FloatingSpeechControlProps) {
  const initialPositionRef = useRef<InitialFloatingSpeechPosition | null>(null)
  if (!initialPositionRef.current) {
    initialPositionRef.current = readInitialPosition()
  }

  const [position, setPosition] = useState(initialPositionRef.current.position)
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSilentMode, setIsSilentMode] = useState(false)
  const [microphoneLevel, setMicrophoneLevel] = useState(0)
  const [lastError, setLastError] = useState<string | null>(null)
  const [speechTooltip, setSpeechTooltip] = useState<SpeechTooltip | null>(null)
  const [speechInputPreparationState, setSpeechInputPreparationState] = useState<SpeechInputPreparationState>('idle')
  const [modelStatus, setModelStatus] = useState<SpeechModelStatusPayload>({
    state: 'idle',
    modelId: SPEECH_MODEL_ID,
    loadProgress: 0,
  })

  const vadRef = useRef<MicVAD | null>(null)
  const preparedVadRef = useRef<PreparedVad | null>(null)
  const wakeRecognitionRef = useRef<LightweightSpeechRecognition | null>(null)
  const speechQueueRef = useRef<QueuedSpeechSegment[]>([])
  const isProcessingQueueRef = useRef(false)
  const isStartingListeningRef = useRef(false)
  const isListeningRef = useRef(false)
  const isVadAudioInitializedRef = useRef(false)
  const listeningSessionRef = useRef(0)
  const dragStateRef = useRef<DragState | null>(null)
  const hasSavedPositionRef = useRef(initialPositionRef.current.isSaved)
  const isSilentModeRef = useRef(false)
  const microphoneLevelRef = useRef(0)
  const isWakeRecognitionActiveRef = useRef(false)
  const isProcessingWakeCommandRef = useRef(false)
  const wakePhrasesRef = useRef(['listen', 'start listening'])
  const shouldRestartWakeRecognitionRef = useRef(false)
  const stopListeningRef = useRef<() => void>(() => undefined)
  const windowRef = useRef<HTMLDivElement | null>(null)
  const positionRef = useRef(position)
  const onSpeechResultRef = useRef(onSpeechResult)
  const onProcessingChangeRef = useRef(onProcessingChange)
  const onBeforeListenRef = useRef(onBeforeListen)
  const getCurrentRowLatexRef = useRef(getCurrentRowLatex)

  useEffect(() => {
    onSpeechResultRef.current = onSpeechResult
    onProcessingChangeRef.current = onProcessingChange
    onBeforeListenRef.current = onBeforeListen
    getCurrentRowLatexRef.current = getCurrentRowLatex
  }, [getCurrentRowLatex, onBeforeListen, onProcessingChange, onSpeechResult])

  useEffect(() => {
    return () => {
      onProcessingChangeRef.current?.(false)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    void window.eqoustics.listSpeechCommands().then((commands) => {
      if (!isMounted) return

      const listenCommand = commands.find((command) => command.command === 'listen')
      const phrases = [listenCommand?.name, ...(listenCommand?.aliases ?? [])]
        .filter((phrase): phrase is string => Boolean(phrase?.trim()))
      if (phrases.length > 0) {
        wakePhrasesRef.current = phrases
      }
    }).catch(() => {
      // Keep the built-in listen phrases if the command database is unavailable.
    })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    isSilentModeRef.current = isSilentMode
  }, [isSilentMode])

  useLayoutEffect(() => {
    const element = windowRef.current
    if (!element) return

    const basePosition = hasSavedPositionRef.current ? positionRef.current : defaultRightPosition(element)
    const nextPosition = clampPosition(basePosition.x, basePosition.y, element)
    positionRef.current = nextPosition
    setPosition(nextPosition)
  }, [])

  useEffect(() => {
    const handleResize = () => {
      const element = windowRef.current
      if (!element) return

      const basePosition = hasSavedPositionRef.current ? positionRef.current : defaultRightPosition(element)
      const nextPosition = clampPosition(basePosition.x, basePosition.y, element)
      positionRef.current = nextPosition
      setPosition(nextPosition)
      if (hasSavedPositionRef.current) {
        savePosition(nextPosition)
      }
      setSpeechTooltip(null)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const showSpeechTooltip = useCallback((title: string, element: HTMLElement) => {
    const editorRect = windowRef.current?.parentElement?.getBoundingClientRect()
    const bounds = editorRect ?? {
      top: 8,
      right: window.innerWidth - 8,
      bottom: window.innerHeight - 8,
      left: 8,
    }
    const rect = element.getBoundingClientRect()
    const maxWidth = Math.min(256, Math.max(80, bounds.right - bounds.left - 16))
    const estimatedHalfWidth = Math.min(Math.max(title.length * 3.8, 42), maxWidth / 2)
    const estimatedHeight = 24
    const hasRoomBelow = rect.bottom + estimatedHeight + 10 <= bounds.bottom
    const placement = hasRoomBelow || rect.top - estimatedHeight - 10 < bounds.top ? 'below' : 'above'
    const minLeft = bounds.left + estimatedHalfWidth + 8
    const maxLeft = bounds.right - estimatedHalfWidth - 8

    setSpeechTooltip({
      title,
      maxWidth,
      placement,
      left: clampNumber(rect.left + rect.width / 2, minLeft, Math.max(minLeft, maxLeft)),
      top: placement === 'below'
        ? Math.min(rect.bottom + 8, bounds.bottom - estimatedHeight - 4)
        : Math.max(rect.top - 8, bounds.top + estimatedHeight + 4),
    })
  }, [])

  const hideSpeechTooltip = useCallback(() => {
    setSpeechTooltip(null)
  }, [])

  const clearSpeechQueue = useCallback(() => {
    speechQueueRef.current = []
  }, [])

  const stopWakeCommandRecognition = useCallback(() => {
    shouldRestartWakeRecognitionRef.current = false
    isWakeRecognitionActiveRef.current = false
    const recognition = wakeRecognitionRef.current
    wakeRecognitionRef.current = null
    if (!recognition) return

    recognition.onend = null
    recognition.onerror = null
    recognition.onresult = null
    try {
      recognition.abort()
    } catch {
      // The recognizer may already be stopped by the browser.
    }
  }, [])

  const startWakeCommandRecognition = useCallback(() => {
    if (wakeRecognitionRef.current) return true

    const Recognition = lightweightSpeechRecognitionConstructor()
    if (!Recognition) {
      isWakeRecognitionActiveRef.current = false
      return false
    }

    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 3
    shouldRestartWakeRecognitionRef.current = true

    recognition.onresult = (event) => {
      for (let resultIndex = event.resultIndex; resultIndex < event.results.length; resultIndex += 1) {
        const result = event.results[resultIndex]
        for (let alternativeIndex = 0; alternativeIndex < result.length; alternativeIndex += 1) {
          if (!transcriptContainsWakePhrase(result[alternativeIndex]?.transcript ?? '', wakePhrasesRef.current)) continue

          shouldRestartWakeRecognitionRef.current = false
          clearSpeechQueue()
          isSilentModeRef.current = false
          setIsSilentMode(false)
          setLastError(null)
          stopWakeCommandRecognition()
          return
        }
      }
    }

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'network') {
        shouldRestartWakeRecognitionRef.current = false
        isWakeRecognitionActiveRef.current = false
      }
    }

    recognition.onend = () => {
      wakeRecognitionRef.current = null
      isWakeRecognitionActiveRef.current = false
      if (!shouldRestartWakeRecognitionRef.current || !isSilentModeRef.current) return

      window.setTimeout(() => {
        if (shouldRestartWakeRecognitionRef.current && isSilentModeRef.current) {
          startWakeCommandRecognition()
        }
      }, 250)
    }

    try {
      recognition.start()
      wakeRecognitionRef.current = recognition
      isWakeRecognitionActiveRef.current = true
      return true
    } catch {
      shouldRestartWakeRecognitionRef.current = false
      isWakeRecognitionActiveRef.current = false
      return false
    }
  }, [clearSpeechQueue, stopWakeCommandRecognition])

  const enterSilentMode = useCallback(() => {
    clearSpeechQueue()
    isSilentModeRef.current = true
    setIsSilentMode(true)
    setLastError(null)
    startWakeCommandRecognition()
  }, [clearSpeechQueue, startWakeCommandRecognition])

  const exitSilentMode = useCallback(() => {
    clearSpeechQueue()
    isSilentModeRef.current = false
    setIsSilentMode(false)
    stopWakeCommandRecognition()
    setLastError(null)
  }, [clearSpeechQueue, stopWakeCommandRecognition])

  const processWakeCommandSegment = useCallback((audioSamples: Float32Array, sampleRate: number) => {
    if (isProcessingWakeCommandRef.current) return

    isProcessingWakeCommandRef.current = true
    void transcribeSpeechChunk({
      audioSampleRateHz: sampleRate,
      audioSamples,
      currentRowLatex: '',
    }).then((result) => {
      if (!isSilentModeRef.current) return

      const isListenCommand = result.action.type === 'command' && result.action.command === 'listen'
      if (isListenCommand || transcriptContainsWakePhrase(result.transcript, wakePhrasesRef.current)) {
        exitSilentMode()
      }
    }).catch((error: unknown) => {
      if (!isSilentModeRef.current) return

      const message = error instanceof Error ? error.message : String(error)
      setLastError(message)
    }).finally(() => {
      isProcessingWakeCommandRef.current = false
    })
  }, [exitSilentMode])

  useEffect(() => {
    hideSpeechTooltip()
  }, [hideSpeechTooltip, isListening, lastError, modelStatus.state, speechInputPreparationState])

  useEffect(() => {
    let isMounted = true
    const unsubscribe = subscribeSpeechModelStatus((status) => {
      if (isMounted) {
        setModelStatus(status)
        setLastError(status.error ?? null)
      }
    })

    void loadSpeechModel().then((status) => {
      if (isMounted) {
        setModelStatus(status)
        setLastError(status.error ?? null)
      }
    }).catch((error: unknown) => {
      if (!isMounted) return
      const message = error instanceof Error ? error.message : String(error)
      setModelStatus({ state: 'error', modelId: SPEECH_MODEL_ID, error: message })
      setLastError(message)
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  const processSpeechQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) return

    isProcessingQueueRef.current = true
    setIsProcessing(true)
    onProcessingChangeRef.current?.(true)
    try {
      for (;;) {
        const segment = speechQueueRef.current.shift()
        if (!segment) break

        try {
          const result = await transcribeSpeechChunk({
            audioSampleRateHz: segment.audioSampleRateHz,
            audioSamples: segment.audioSamples,
            currentRowLatex: getCurrentRowLatexRef.current?.() ?? '',
          })

          if (isSilentModeRef.current) {
            setLastError(null)
            continue
          }

          if (result.action.type === 'command') {
            if (result.action.command === 'silence') {
              enterSilentMode()
              continue
            }
            if (result.action.command === 'listen') {
              exitSilentMode()
              continue
            }
            if (result.action.command === 'deactivate-microphone') {
              stopListeningRef.current()
              setLastError(null)
              continue
            }
          }

          onSpeechResultRef.current(result)
          setLastError(null)
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error)
          setLastError(message)
          setModelStatus((current) => ({ ...current, state: 'error', error: message }))
        }
      }
    } finally {
      isProcessingQueueRef.current = false
      setIsProcessing(false)
      onProcessingChangeRef.current?.(false)
    }
  }, [enterSilentMode, exitSilentMode])

  const enqueueSpeechSegment = useCallback((audioSamples: Float32Array, sampleRate: number) => {
    if (audioSamples.length === 0) return
    if (isSilentModeRef.current) {
      clearSpeechQueue()
      return
    }

    speechQueueRef.current.push({
      audioSampleRateHz: sampleRate,
      audioSamples: audioSamples.slice(),
    })
    void processSpeechQueue()
  }, [clearSpeechQueue, processSpeechQueue])

  const updateMicrophoneLevel = useCallback((frame: Float32Array) => {
    const nextLevel = Math.max(microphoneLevelFromFrame(frame), microphoneLevelRef.current * MICROPHONE_LEVEL_DECAY)
    microphoneLevelRef.current = nextLevel
    setMicrophoneLevel(nextLevel)
  }, [])

  const prepareSpeechVad = useCallback(() => {
    const key = microphoneDeviceId ?? ''
    if (vadRef.current && preparedVadRef.current?.key === key) {
      setSpeechInputPreparationState('ready')
      return Promise.resolve(vadRef.current)
    }
    if (preparedVadRef.current?.key === key) {
      setSpeechInputPreparationState('loading')
      return preparedVadRef.current.promise
    }
    if (vadRef.current) {
      const previousVad = vadRef.current
      vadRef.current = null
      if (isVadAudioInitializedRef.current) {
        isVadAudioInitializedRef.current = false
        void previousVad.destroy().catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          setLastError(message)
        })
      }
    }

    setSpeechInputPreparationState('loading')
    const assetBasePath = vadAssetBasePath()
    const streamConstraints = microphoneConstraints(microphoneDeviceId)
    const promise = MicVAD.new({
      model: 'v5',
      startOnLoad: false,
      baseAssetPath: assetBasePath,
      onnxWASMBasePath: assetBasePath,
      positiveSpeechThreshold: 0.5,
      negativeSpeechThreshold: 0.35,
      redemptionMs: 650,
      preSpeechPadMs: 300,
      minSpeechMs: 180,
      submitUserSpeechOnPause: true,
      ortConfig: (ort) => {
        ort.env.logLevel = 'error'
        ort.env.wasm.numThreads = 1
        ort.env.wasm.proxy = false
        ort.env.wasm.wasmPaths = {
          mjs: `${assetBasePath}ort-wasm-simd-threaded.jsep.mjs`,
          wasm: `${assetBasePath}ort-wasm-simd-threaded.jsep.wasm`,
        }
      },
      getStream: () => navigator.mediaDevices.getUserMedia(streamConstraints),
      resumeStream: () => navigator.mediaDevices.getUserMedia(streamConstraints),
      pauseStream: async (stream) => {
        stream.getTracks().forEach((track) => track.stop())
      },
      onSpeechEnd: (audio) => {
        if (!isListeningRef.current) return

        if (isSilentModeRef.current) {
          clearSpeechQueue()
          if (!isWakeRecognitionActiveRef.current) {
            processWakeCommandSegment(audio, VAD_SAMPLE_RATE_HZ)
          }
          return
        }
        enqueueSpeechSegment(audio, VAD_SAMPLE_RATE_HZ)
      },
      onVADMisfire: () => undefined,
      onSpeechStart: () => undefined,
      onSpeechRealStart: () => undefined,
      onFrameProcessed: (_probabilities, frame) => {
        if (!isListeningRef.current) return
        updateMicrophoneLevel(frame)
      },
    }).then((vad) => {
      if (preparedVadRef.current?.promise === promise) {
        vadRef.current = vad
        setSpeechInputPreparationState('ready')
      }
      return vad
    }).catch((error: unknown) => {
      if (preparedVadRef.current?.promise === promise) {
        setSpeechInputPreparationState('idle')
      }
      throw error
    })

    preparedVadRef.current = { key, promise }
    return promise
  }, [
    clearSpeechQueue,
    enqueueSpeechSegment,
    microphoneDeviceId,
    processWakeCommandSegment,
    updateMicrophoneLevel,
  ])

  useEffect(() => {
    if (disabled || isListening || isStartingListeningRef.current || modelStatus.state !== 'ready') return

    void prepareSpeechVad().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      setLastError(message)
    })
  }, [disabled, isListening, modelStatus.state, prepareSpeechVad])

  const stopListening = useCallback((releaseVad = false) => {
    isStartingListeningRef.current = false
    isListeningRef.current = false
    listeningSessionRef.current += 1
    clearSpeechQueue()
    stopWakeCommandRecognition()
    const vad = vadRef.current
    if (vad && isVadAudioInitializedRef.current) {
      const stopVad = releaseVad ? vad.destroy() : vad.pause()
      void stopVad.catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        setLastError(message)
      })
    }
    if (releaseVad) {
      vadRef.current = null
      preparedVadRef.current = null
      isVadAudioInitializedRef.current = false
      setSpeechInputPreparationState('idle')
    }

    isSilentModeRef.current = false
    microphoneLevelRef.current = 0
    setIsSilentMode(false)
    setMicrophoneLevel(0)
    setIsListening(false)
  }, [clearSpeechQueue, stopWakeCommandRecognition])

  stopListeningRef.current = () => stopListening()

  const startListening = useCallback(async () => {
    if (disabled || isListeningRef.current || isStartingListeningRef.current) return
    if (modelStatus.state !== 'ready') return

    isStartingListeningRef.current = true
    const listeningSession = listeningSessionRef.current + 1
    listeningSessionRef.current = listeningSession
    setLastError(null)
    clearSpeechQueue()
    stopWakeCommandRecognition()
    isSilentModeRef.current = false
    setIsSilentMode(false)
    microphoneLevelRef.current = 0
    setMicrophoneLevel(0)
    onBeforeListenRef.current?.()
    try {
      const vad = await prepareSpeechVad()

      if (listeningSessionRef.current !== listeningSession) {
        return
      }

      vadRef.current = vad
      isListeningRef.current = true
      await vad.start()
      isVadAudioInitializedRef.current = true
      if (listeningSessionRef.current !== listeningSession || vadRef.current !== vad) {
        await vad.pause()
        isListeningRef.current = false
        return
      }
      setIsListening(true)
    } catch (error) {
      if (listeningSessionRef.current === listeningSession) {
        isListeningRef.current = false
      }
      throw error
    } finally {
      if (listeningSessionRef.current === listeningSession) {
        isStartingListeningRef.current = false
      }
    }
  }, [clearSpeechQueue, disabled, modelStatus.state, prepareSpeechVad, stopWakeCommandRecognition])

  useEffect(() => {
    if (disabled && isListening) {
      stopListening()
    }
  }, [disabled, isListening, stopListening])

  useEffect(() => () => stopListening(true), [stopListening])

  const handleToggleListening = () => {
    hideSpeechTooltip()
    if (isSilentMode) {
      exitSilentMode()
      return
    }

    if (isListening) {
      stopListening()
      return
    }

    void startListening().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      setLastError(message)
      stopListening()
    })
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null
    if (!target?.closest('.speech-window-drag-handle')) return

    const element = event.currentTarget
    event.preventDefault()
    hideSpeechTooltip()
    hasSavedPositionRef.current = true
    dragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - element.getBoundingClientRect().left,
      offsetY: event.clientY - element.getBoundingClientRect().top,
    }
    element.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current
    const element = windowRef.current
    const parent = element?.parentElement
    if (!dragState || !element || !parent || dragState.pointerId !== event.pointerId) return

    hideSpeechTooltip()
    const parentRect = parent.getBoundingClientRect()
    const nextPosition = clampPosition(
      event.clientX - parentRect.left - dragState.offsetX,
      event.clientY - parentRect.top - dragState.offsetY,
      element,
    )
    positionRef.current = nextPosition
    setPosition(nextPosition)
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) return
    dragStateRef.current = null
    savePosition(positionRef.current)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const statusClass = isSilentMode ? 'silent' : isListening ? 'listening' : lastError ? 'error' : isProcessing ? 'processing' : modelStatus.state
  const currentVadKey = microphoneDeviceId ?? ''
  const isSpeechInputReady = speechInputPreparationState === 'ready'
    && preparedVadRef.current?.key === currentVadKey
    && vadRef.current !== null
  const isPreparingSpeechInput = modelStatus.state === 'ready' && !disabled && !isSpeechInputReady && !lastError
  const speechWindowStatusClass = isPreparingSpeechInput ? 'loading' : statusClass
  const modelProgress = typeof modelStatus.loadProgress === 'number'
    ? Math.max(0, Math.min(100, modelStatus.loadProgress))
    : null
  const showMicButton = modelStatus.state === 'ready' && (disabled || isSpeechInputReady) && !lastError
  const showErrorIcon = Boolean(lastError)
  const loaderLabel = isPreparingSpeechInput ? 'Preparing microphone' : loaderLabelForStatus(modelStatus, lastError)
  const loadedLabel = modelProgress !== null
    ? `${modelProgress}%`
    : formatMegabytes(modelStatus.loadedBytes ?? 0)
  const showLoadingProgress = modelStatus.state === 'loading' && modelStatus.loadStage === 'downloading'
  const showDownloadStatus = showLoadingProgress && !lastError
  const loadingTitle = `${loaderLabel}${showLoadingProgress ? `: ${loadedLabel}` : ''}`
  const micLabel = isSilentMode ? 'Listen' : isListening ? 'Disable microphone' : 'Activate microphone'
  const errorTitle = lastError ?? 'Speech model error'
  const microphoneLevelStyle = {
    '--speech-microphone-level': microphoneLevel.toFixed(3),
  } as CSSProperties

  return (
    <>
      <div
        ref={windowRef}
        className={`floating-speech-window floating-speech-window-${speechWindowStatusClass}`}
        style={{ left: position.x, top: position.y }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <span className="speech-window-drag-handle" aria-hidden="true">
          <FontAwesomeIcon icon={faGripVertical} />
        </span>
        {showMicButton ? (
          <span
            className="speech-window-tooltip-wrap"
            onMouseEnter={(event) => showSpeechTooltip(micLabel, event.currentTarget)}
            onMouseLeave={hideSpeechTooltip}
            onFocusCapture={(event) => showSpeechTooltip(micLabel, event.currentTarget)}
            onBlurCapture={hideSpeechTooltip}
          >
            <button
              type="button"
              className="speech-window-mic-button"
              disabled={disabled}
              aria-label={micLabel}
              aria-pressed={isListening}
              style={isListening ? microphoneLevelStyle : undefined}
              onClick={handleToggleListening}
            >
              <FontAwesomeIcon className="speech-window-mic-icon" icon={isListening ? faMicrophone : faMicrophoneSlash} />
            </button>
          </span>
        ) : showErrorIcon ? (
          <span
            className="speech-window-tooltip-wrap"
            onMouseEnter={(event) => showSpeechTooltip(errorTitle, event.currentTarget)}
            onMouseLeave={hideSpeechTooltip}
            onFocusCapture={(event) => showSpeechTooltip(errorTitle, event.currentTarget)}
            onBlurCapture={hideSpeechTooltip}
          >
            <div
              className="speech-window-state-icon speech-window-error-icon"
              role="status"
              aria-label={errorTitle}
              tabIndex={0}
            >
              <FontAwesomeIcon icon={faCircleExclamation} />
            </div>
          </span>
        ) : (
          <span
            className="speech-window-tooltip-wrap"
            onMouseEnter={(event) => showSpeechTooltip(loadingTitle, event.currentTarget)}
            onMouseLeave={hideSpeechTooltip}
            onFocusCapture={(event) => showSpeechTooltip(loadingTitle, event.currentTarget)}
            onBlurCapture={hideSpeechTooltip}
          >
            <div
              className="speech-window-state-icon speech-window-loader"
              role="status"
              aria-label={loadingTitle}
              tabIndex={0}
            >
              <span className="speech-window-loader-spinner" aria-hidden="true" />
            </div>
          </span>
        )}
        {speechTooltip ? (
          <span
            className={`dropdown-floating-tooltip speech-floating-tooltip${speechTooltip.placement === 'below' ? ' dropdown-floating-tooltip-below' : ''}`}
            role="tooltip"
            style={{
              top: `${speechTooltip.top}px`,
              left: `${speechTooltip.left}px`,
              maxWidth: `${speechTooltip.maxWidth}px`,
            }}
          >
            {speechTooltip.title}
          </span>
        ) : null}
      </div>
      {showDownloadStatus ? (
        <div className="speech-model-download-status" role="status" aria-live="polite">
          <span>Eqoustics is downloading the Gemma model.</span>
          <strong>{loadedLabel}</strong>
          <small>Please wait.</small>
          {modelProgress !== null ? (
            <span className="speech-model-download-progress" aria-hidden="true">
              <span style={{ width: `${modelProgress}%` }} />
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
