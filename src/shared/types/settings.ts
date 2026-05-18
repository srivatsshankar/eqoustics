import type {
  AppSettingsPayload as ActiveAppSettingsPayload,
  AppearancePreference,
  SpeechAccelerationBackend,
  SpeechModelSize,
} from '../ipc/channels'

export type AppearanceMode = AppearancePreference
export type { SpeechAccelerationBackend, SpeechModelSize }
export type AppSettings = ActiveAppSettingsPayload
export type AppSettingsPayload = ActiveAppSettingsPayload

export interface SettingsUpdateResult extends ActiveAppSettingsPayload {
  restartRequired: boolean
}
