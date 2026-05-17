export type AppearanceMode = 'system' | 'light' | 'dark'
export type SpeechModelSize = '2b' | '4b' | '26b' | '31b'
export type SpeechAccelerationBackend = 'gpu' | 'cpu'
export type SpeechInferenceRuntime = 'litert' | 'transformers'

export interface AppSettings {
  microphoneDeviceId: string
  appearance: AppearanceMode
  speechModelSize: SpeechModelSize
  speechAcceleration: SpeechAccelerationBackend
  speechInferenceRuntime: SpeechInferenceRuntime
  transformersMtp: boolean
}

export interface SpeechModelOption {
  size: SpeechModelSize
  label: string
  modelId: string
}

export interface AppSettingsPayload {
  settings: AppSettings
  modelOptions: SpeechModelOption[]
}

export interface SettingsUpdateResult extends AppSettingsPayload {
  restartRequired: boolean
}
