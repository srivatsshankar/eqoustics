export type AppearanceMode = 'system' | 'light' | 'dark'
export type SpeechModelSize = '2b' | '4b' | '26b' | '31b'

export interface AppSettings {
  microphoneDeviceId: string
  appearance: AppearanceMode
  speechModelSize: SpeechModelSize
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
