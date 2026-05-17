import type {
  SpeechAudioChunkPayload,
  SpeechRecognitionAction,
  SpeechModelStatusPayload,
  SpeechTranscriptResult,
} from '../shared/ipc/channels'

export const SPEECH_MODEL_ID = 'google/gemma-4'
export type { SpeechModelStatusPayload } from '../shared/ipc/channels'

export interface SpeechAudioChunk {
  audioSampleRateHz: number
  audioSamples: Float32Array
  currentRowLatex?: string
}

export type SpeechRecognitionResult = {
  transcript: string
  action: SpeechRecognitionAction
}

function normalizeSpeechTranscriptResult(result: SpeechTranscriptResult | undefined): SpeechRecognitionResult {
  const transcript = (result?.transcript ?? '').trim()

  if (!result?.action) {
    return {
      transcript,
      action: transcript ? { type: 'insert', insertMode: 'text', text: transcript } : { type: 'ignore' },
    }
  }

  return {
    transcript,
    action: result.action,
  }
}

export function subscribeSpeechModelStatus(listener: (status: SpeechModelStatusPayload) => void) {
  const unsubscribe = window.eqoustics.onSpeechModelStatusChange(listener)

  void window.eqoustics.getSpeechModelStatus().then(listener).catch((error: unknown) => {
    listener({
      state: 'error',
      modelId: SPEECH_MODEL_ID,
      error: error instanceof Error ? error.message : String(error),
    })
  })

  return unsubscribe
}

export function loadSpeechModel() {
  return window.eqoustics.loadSpeechModel()
}

export async function transcribeSpeechChunk(audio: SpeechAudioChunk) {
  const sourceBuffer = audio.audioSamples.buffer
  let audioSamples: ArrayBuffer
  if (
    sourceBuffer instanceof ArrayBuffer
    && audio.audioSamples.byteOffset === 0
    && audio.audioSamples.byteLength === sourceBuffer.byteLength
  ) {
    audioSamples = sourceBuffer
  } else {
    const sourceSamples = new Uint8Array(sourceBuffer, audio.audioSamples.byteOffset, audio.audioSamples.byteLength)
    audioSamples = new ArrayBuffer(sourceSamples.byteLength)
    new Uint8Array(audioSamples).set(sourceSamples)
  }
  const payload: SpeechAudioChunkPayload = {
    audioSampleRateHz: audio.audioSampleRateHz,
    audioSamples,
    currentRowLatex: audio.currentRowLatex,
  }
  const result: SpeechTranscriptResult = await window.eqoustics.transcribeSpeechChunk(payload)

  return normalizeSpeechTranscriptResult(result)
}
