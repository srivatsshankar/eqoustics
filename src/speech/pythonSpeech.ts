import type {
  SpeechAudioChunkPayload,
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
  const sourceSamples = new Uint8Array(
    audio.audioSamples.buffer,
    audio.audioSamples.byteOffset,
    audio.audioSamples.byteLength,
  )
  const audioSamples = new ArrayBuffer(sourceSamples.byteLength)
  new Uint8Array(audioSamples).set(sourceSamples)
  const payload: SpeechAudioChunkPayload = {
    audioSampleRateHz: audio.audioSampleRateHz,
    audioSamples,
    currentRowLatex: audio.currentRowLatex,
  }
  const result: SpeechTranscriptResult = await window.eqoustics.transcribeSpeechChunk(payload)

  return result.transcript.trim()
}
