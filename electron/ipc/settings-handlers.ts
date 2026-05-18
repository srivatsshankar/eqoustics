import { app, ipcMain } from 'electron'

import {
  IPC_CHANNELS,
  type AppSettingsPayload,
  type AppSettingsUpdatePayload,
  type AppearancePreference,
  type SpeechAccelerationBackend,
  type SpeechModelSize,
} from '../../src/shared/ipc/channels'

export const APP_SETTINGS_KEY = 'appSettings'
const APP_SETTINGS_VERSION = 4

type ElectronStoreLike = {
  get: (key: string) => unknown
  set: (key: string, value: unknown) => void
}

interface StoredAppSettings {
  version?: number
  microphoneDeviceId?: string | null
  appearance?: AppearancePreference
  speechModelSize?: SpeechModelSize
  speechAcceleration?: SpeechAccelerationBackend
}

function defaultSpeechModelSize(): SpeechModelSize {
  return '2b'
}

function normalizeAppearance(value: unknown): AppearancePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

function normalizeSpeechModelSize(value: unknown): SpeechModelSize {
  return value === '4b' || value === '2b' ? value : defaultSpeechModelSize()
}

function defaultSpeechAcceleration(): SpeechAccelerationBackend {
  try {
    const gpuStatus = app.getGPUFeatureStatus()
    const compositingStatus = gpuStatus.gpu_compositing
    if (
      compositingStatus === 'disabled_software'
      || compositingStatus === 'disabled_off'
      || compositingStatus === 'unavailable_software'
      || compositingStatus === 'unavailable_off'
    ) {
      return 'cpu'
    }
  } catch {
    return 'cpu'
  }

  return 'gpu'
}

function normalizeSpeechAcceleration(value: unknown): SpeechAccelerationBackend {
  if (value === 'cpu' || value === 'gpu') return value
  return defaultSpeechAcceleration()
}

function readStoredSettings(store: ElectronStoreLike): StoredAppSettings {
  const stored = store.get(APP_SETTINGS_KEY)
  return stored && typeof stored === 'object' ? stored as StoredAppSettings : {}
}

export function readAppSettings(store: ElectronStoreLike): AppSettingsPayload {
  const stored = readStoredSettings(store)

  return {
    microphoneDeviceId: typeof stored.microphoneDeviceId === 'string' && stored.microphoneDeviceId
      ? stored.microphoneDeviceId
      : null,
    appearance: normalizeAppearance(stored.appearance),
    speechModelSize: normalizeSpeechModelSize(stored.speechModelSize),
    speechAcceleration: normalizeSpeechAcceleration(stored.speechAcceleration),
    totalMemoryBytes: 0,
  }
}

function updateAppSettings(store: ElectronStoreLike, update: AppSettingsUpdatePayload) {
  const current = readAppSettings(store)
  const next: StoredAppSettings = {
    version: APP_SETTINGS_VERSION,
    microphoneDeviceId: update.microphoneDeviceId === undefined
      ? current.microphoneDeviceId
      : update.microphoneDeviceId || null,
    appearance: update.appearance === undefined
      ? current.appearance
      : normalizeAppearance(update.appearance),
    speechModelSize: update.speechModelSize === undefined
      ? current.speechModelSize
      : normalizeSpeechModelSize(update.speechModelSize),
    speechAcceleration: update.speechAcceleration === undefined
      ? current.speechAcceleration
      : normalizeSpeechAcceleration(update.speechAcceleration),
  }

  store.set(APP_SETTINGS_KEY, next)
  return readAppSettings(store)
}

export function registerSettingsHandlers(store: ElectronStoreLike) {
  ipcMain.removeHandler(IPC_CHANNELS.settingsGet)
  ipcMain.handle(IPC_CHANNELS.settingsGet, () => readAppSettings(store))

  ipcMain.removeHandler(IPC_CHANNELS.settingsUpdate)
  ipcMain.handle(IPC_CHANNELS.settingsUpdate, (_event, update: AppSettingsUpdatePayload) => {
    return updateAppSettings(store, update)
  })

  ipcMain.removeHandler(IPC_CHANNELS.appRestart)
  ipcMain.handle(IPC_CHANNELS.appRestart, () => {
    app.relaunch()
    app.exit(0)
  })
}
