import { app, ipcMain } from 'electron'
import os from 'node:os'

import {
  IPC_CHANNELS,
  type AppSettingsPayload,
  type AppSettingsUpdatePayload,
  type AppearancePreference,
  type SpeechModelSize,
} from '../../src/shared/ipc/channels'

export const APP_SETTINGS_KEY = 'appSettings'
const MODEL_MEMORY_THRESHOLD_BYTES = 16 * 1024 * 1024 * 1024

type ElectronStoreLike = {
  get: (key: string) => unknown
  set: (key: string, value: unknown) => void
}

interface StoredAppSettings {
  microphoneDeviceId?: string | null
  appearance?: AppearancePreference
  speechModelSize?: SpeechModelSize
}

function defaultSpeechModelSize() {
  return os.totalmem() >= MODEL_MEMORY_THRESHOLD_BYTES ? '4b' : '2b'
}

function normalizeAppearance(value: unknown): AppearancePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

function normalizeSpeechModelSize(value: unknown): SpeechModelSize {
  return value === '4b' || value === '2b' ? value : defaultSpeechModelSize()
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
    totalMemoryBytes: os.totalmem(),
  }
}

function updateAppSettings(store: ElectronStoreLike, update: AppSettingsUpdatePayload) {
  const current = readAppSettings(store)
  const next: StoredAppSettings = {
    microphoneDeviceId: update.microphoneDeviceId === undefined
      ? current.microphoneDeviceId
      : update.microphoneDeviceId || null,
    appearance: update.appearance === undefined
      ? current.appearance
      : normalizeAppearance(update.appearance),
    speechModelSize: update.speechModelSize === undefined
      ? current.speechModelSize
      : normalizeSpeechModelSize(update.speechModelSize),
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
