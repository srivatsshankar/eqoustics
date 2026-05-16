import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleExclamation, faGripVertical, faMicrophone, faMicrophoneSlash } from '@fortawesome/free-solid-svg-icons'

import {
  SPEECH_MODEL_ID,
  loadSpeechModel,
  subscribeSpeechModelStatus,
  transcribeSpeechChunk,
  type SpeechModelStatusPayload,
} from '../../speech/pythonSpeech'

const VAD_INITIAL_NOISE_RMS = 0.004
const VAD_MIN_VOICE_RMS = 0.01
const VAD_START_RATIO = 2.8
const VAD_CONTINUE_RATIO = 1.9
const VAD_NOISE_SMOOTHING = 0.05
const VAD_PRE_ROLL_MS = 300
const VAD_MIN_VOICE_MS = 180
const VAD_END_SILENCE_MS = 650
const VAD_MAX_SEGMENT_MS = 12000
const FLOATING_SPEECH_POSITION_STORAGE_KEY = 'eqoustics:floatingSpeechWindowPosition'
const DEFAULT_FLOATING_SPEECH_POSITION = { x: 18, y: 18 }

interface FloatingSpeechControlProps {
  disabled: boolean
  microphoneDeviceId?: string | null
  onBeforeListen?: () => void
  getCurrentRowLatex?: () => string
  onTranscript: (transcript: string) => void
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

interface VadState {
  isSpeaking: boolean
  speechMs: number
  silenceMs: number
  segmentMs: number
  segmentChunks: Float32Array[]
  preRollMs: number
  preRollChunks: Float32Array[]
  noiseRms: number
}

function createVadState(): VadState {
  return {
    isSpeaking: false,
    speechMs: 0,
    silenceMs: 0,
    segmentMs: 0,
    segmentChunks: [],
    preRollMs: 0,
    preRollChunks: [],
    noiseRms: VAD_INITIAL_NOISE_RMS,
  }
}

function mergeAudioChunks(chunks: Float32Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const merged = new Float32Array(length)
  let offset = 0

  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }

  return merged
}

function audioDurationMs(chunk: Float32Array, sampleRate: number) {
  return (chunk.length / sampleRate) * 1000
}

function audioRms(samples: Float32Array) {
  let total = 0
  for (const sample of samples) {
    total += sample * sample
  }

  return Math.sqrt(total / Math.max(1, samples.length))
}

function isVoiceFrame(rms: number, vadState: VadState) {
  const ratio = vadState.isSpeaking ? VAD_CONTINUE_RATIO : VAD_START_RATIO
  return rms >= Math.max(VAD_MIN_VOICE_RMS, vadState.noiseRms * ratio)
}

function updateNoiseFloor(vadState: VadState, rms: number) {
  vadState.noiseRms = (vadState.noiseRms * (1 - VAD_NOISE_SMOOTHING)) + (rms * VAD_NOISE_SMOOTHING)
}

function rememberPreRoll(vadState: VadState, chunk: Float32Array, sampleRate: number) {
  vadState.preRollChunks.push(chunk)
  vadState.preRollMs += audioDurationMs(chunk, sampleRate)

  while (vadState.preRollMs > VAD_PRE_ROLL_MS && vadState.preRollChunks.length > 1) {
    const removedChunk = vadState.preRollChunks.shift()
    if (!removedChunk) break
    vadState.preRollMs -= audioDurationMs(removedChunk, sampleRate)
  }
}

function resetVadSegment(vadState: VadState) {
  vadState.isSpeaking = false
  vadState.speechMs = 0
  vadState.silenceMs = 0
  vadState.segmentMs = 0
  vadState.segmentChunks = []
  vadState.preRollMs = 0
  vadState.preRollChunks = []
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
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

function readSavedPosition(): FloatingSpeechPosition {
  if (typeof window === 'undefined') return DEFAULT_FLOATING_SPEECH_POSITION

  try {
    const savedPosition = window.localStorage.getItem(FLOATING_SPEECH_POSITION_STORAGE_KEY)
    if (!savedPosition) return DEFAULT_FLOATING_SPEECH_POSITION

    const parsedPosition = JSON.parse(savedPosition) as Partial<FloatingSpeechPosition>
    if (typeof parsedPosition.x !== 'number' || typeof parsedPosition.y !== 'number') {
      return DEFAULT_FLOATING_SPEECH_POSITION
    }
    if (!Number.isFinite(parsedPosition.x) || !Number.isFinite(parsedPosition.y)) {
      return DEFAULT_FLOATING_SPEECH_POSITION
    }

    return parsedPosition as FloatingSpeechPosition
  } catch {
    return DEFAULT_FLOATING_SPEECH_POSITION
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
  if (/litert_lm|litert-lm/i.test(error)) return 'LiteRT-LM missing'
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

export function FloatingSpeechControl({ disabled, microphoneDeviceId, onBeforeListen, getCurrentRowLatex, onTranscript }: FloatingSpeechControlProps) {
  const [position, setPosition] = useState(readSavedPosition)
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [speechTooltip, setSpeechTooltip] = useState<SpeechTooltip | null>(null)
  const [modelStatus, setModelStatus] = useState<SpeechModelStatusPayload>({
    state: 'idle',
    modelId: SPEECH_MODEL_ID,
    loadProgress: 0,
  })

  const audioContextRef = useRef<AudioContext | null>(null)
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const vadStateRef = useRef<VadState>(createVadState())
  const speechQueueRef = useRef<QueuedSpeechSegment[]>([])
  const isProcessingQueueRef = useRef(false)
  const dragStateRef = useRef<DragState | null>(null)
  const windowRef = useRef<HTMLDivElement | null>(null)
  const positionRef = useRef(position)
  const onTranscriptRef = useRef(onTranscript)
  const onBeforeListenRef = useRef(onBeforeListen)
  const getCurrentRowLatexRef = useRef(getCurrentRowLatex)

  useEffect(() => {
    onTranscriptRef.current = onTranscript
    onBeforeListenRef.current = onBeforeListen
    getCurrentRowLatexRef.current = getCurrentRowLatex
  }, [getCurrentRowLatex, onBeforeListen, onTranscript])

  useLayoutEffect(() => {
    const element = windowRef.current
    if (!element) return

    const nextPosition = clampPosition(positionRef.current.x, positionRef.current.y, element)
    positionRef.current = nextPosition
    setPosition(nextPosition)
  }, [])

  useEffect(() => {
    const handleResize = () => {
      const element = windowRef.current
      if (!element) return

      const nextPosition = clampPosition(positionRef.current.x, positionRef.current.y, element)
      positionRef.current = nextPosition
      setPosition(nextPosition)
      savePosition(nextPosition)
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

  useEffect(() => {
    hideSpeechTooltip()
  }, [hideSpeechTooltip, isListening, lastError, modelStatus.state])

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
    try {
      for (;;) {
        const segment = speechQueueRef.current.shift()
        if (!segment) break

        try {
          const transcript = (await transcribeSpeechChunk({
            audioSampleRateHz: segment.audioSampleRateHz,
            audioSamples: segment.audioSamples,
            currentRowLatex: getCurrentRowLatexRef.current?.() ?? '',
          })).trim()
          if (transcript) {
            onTranscriptRef.current(transcript)
          }
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
    }
  }, [])

  const enqueueSpeechSegment = useCallback((chunks: Float32Array[], sampleRate: number) => {
    if (chunks.length === 0) return

    speechQueueRef.current.push({
      audioSampleRateHz: sampleRate,
      audioSamples: mergeAudioChunks(chunks),
    })
    void processSpeechQueue()
  }, [processSpeechQueue])

  const flushActiveSpeechSegment = useCallback(() => {
    const audioContext = audioContextRef.current
    const vadState = vadStateRef.current
    if (!audioContext || vadState.segmentChunks.length === 0) {
      vadStateRef.current = createVadState()
      return
    }

    const shouldQueue = vadState.speechMs >= VAD_MIN_VOICE_MS
    const chunks = vadState.segmentChunks
    vadStateRef.current = createVadState()

    if (shouldQueue) {
      enqueueSpeechSegment(chunks, audioContext.sampleRate)
    }
  }, [enqueueSpeechSegment])

  const processAudioFrame = useCallback((chunk: Float32Array, sampleRate: number) => {
    const vadState = vadStateRef.current
    const frameMs = audioDurationMs(chunk, sampleRate)
    const rms = audioRms(chunk)
    const hasVoice = isVoiceFrame(rms, vadState)

    if (!vadState.isSpeaking) {
      rememberPreRoll(vadState, chunk, sampleRate)
      if (!hasVoice) {
        updateNoiseFloor(vadState, rms)
        return
      }

      vadState.isSpeaking = true
      vadState.speechMs = frameMs
      vadState.silenceMs = 0
      vadState.segmentMs = vadState.preRollMs
      vadState.segmentChunks = [...vadState.preRollChunks]
      vadState.preRollMs = 0
      vadState.preRollChunks = []
      return
    }

    vadState.segmentChunks.push(chunk)
    vadState.segmentMs += frameMs
    if (hasVoice) {
      vadState.speechMs += frameMs
      vadState.silenceMs = 0
    } else {
      vadState.silenceMs += frameMs
    }

    if (vadState.silenceMs < VAD_END_SILENCE_MS && vadState.segmentMs < VAD_MAX_SEGMENT_MS) {
      return
    }

    const shouldQueue = vadState.speechMs >= VAD_MIN_VOICE_MS
    const chunks = vadState.segmentChunks
    resetVadSegment(vadState)

    if (shouldQueue) {
      enqueueSpeechSegment(chunks, sampleRate)
    }
  }, [enqueueSpeechSegment])

  const stopListening = useCallback(() => {
    flushActiveSpeechSegment()
    processorRef.current?.disconnect()
    audioSourceRef.current?.disconnect()
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    void audioContextRef.current?.close()

    processorRef.current = null
    audioSourceRef.current = null
    mediaStreamRef.current = null
    audioContextRef.current = null
    vadStateRef.current = createVadState()
    setIsListening(false)
  }, [flushActiveSpeechSegment])

  const startListening = useCallback(async () => {
    if (disabled || isListening) return
    if (modelStatus.state !== 'ready') return

    setLastError(null)
    onBeforeListenRef.current?.()
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: microphoneDeviceId ? { exact: microphoneDeviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
      },
    })
    const audioContext = new AudioContext()
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }
    vadStateRef.current = createVadState()
    const source = audioContext.createMediaStreamSource(stream)
    const processor = audioContext.createScriptProcessor(4096, 1, 1)

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0)
      const output = event.outputBuffer.getChannelData(0)
      const chunk = new Float32Array(input)

      output.fill(0)
      processAudioFrame(chunk, audioContext.sampleRate)
    }

    source.connect(processor)
    processor.connect(audioContext.destination)

    audioContextRef.current = audioContext
    audioSourceRef.current = source
    processorRef.current = processor
    mediaStreamRef.current = stream
    setIsListening(true)
  }, [disabled, isListening, microphoneDeviceId, modelStatus.state, processAudioFrame])

  useEffect(() => {
    if (disabled && isListening) {
      stopListening()
    }
  }, [disabled, isListening, stopListening])

  useEffect(() => stopListening, [stopListening])

  const handleToggleListening = () => {
    hideSpeechTooltip()
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

  const statusClass = isListening ? 'listening' : lastError ? 'error' : isProcessing ? 'processing' : modelStatus.state
  const modelProgress = typeof modelStatus.loadProgress === 'number'
    ? Math.max(0, Math.min(100, modelStatus.loadProgress))
    : null
  const showMicButton = modelStatus.state === 'ready' && !lastError
  const showErrorIcon = Boolean(lastError)
  const loaderLabel = loaderLabelForStatus(modelStatus, lastError)
  const loadedLabel = modelProgress !== null
    ? `${modelProgress}%`
    : formatMegabytes(modelStatus.loadedBytes ?? 0)
  const loadingTitle = `${loaderLabel}${modelStatus.state === 'loading' ? `: ${loadedLabel}` : ''}`
  const micLabel = isListening ? 'Disable microphone' : 'Activate microphone'
  const errorTitle = lastError ?? 'Speech model error'

  return (
    <div
      ref={windowRef}
      className={`floating-speech-window floating-speech-window-${statusClass}`}
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
            onClick={handleToggleListening}
          >
            <FontAwesomeIcon icon={isListening ? faMicrophone : faMicrophoneSlash} />
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
  )
}
