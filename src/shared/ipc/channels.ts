export const IPC_CHANNELS = {
  createNotebook: 'notebook:create',
  menuAction: 'menu:action',
  openNotebook: 'notebook:open',
  openNotebookAtPath: 'notebook:openAtPath',
  exportNotebookPdf: 'notebook:exportPdf',
  saveNotebook: 'notebook:save',
  saveNotebookAs: 'notebook:saveAs',
  listRecentFiles: 'recent-files:list',
  captureHtml: 'clipboard:captureHtml',
  writeClipboardText: 'clipboard:writeText',
  speechModelGetStatus: 'speech:model:getStatus',
  speechModelLoad: 'speech:model:load',
  speechModelStatusChanged: 'speech:model:statusChanged',
  speechTranscribeChunk: 'speech:transcribeChunk',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  appRestart: 'app:restart',
  windowControl: 'window:control',
  getWindowState: 'window:state:get',
  windowStateChanged: 'window:state:changed',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

export type FileMenuAction = 'new' | 'open' | 'save' | 'saveAs' | 'exportPdf'
export type WindowControlAction = 'minimize' | 'toggleMaximize' | 'close'
export type WindowStatePayload = { isMaximized: boolean }
export type AppearancePreference = 'system' | 'light' | 'dark'
export type SpeechModelSize = '2b' | '4b'
export interface AppSettingsPayload {
  microphoneDeviceId: string | null
  appearance: AppearancePreference
  speechModelSize: SpeechModelSize
  totalMemoryBytes: number
}
export type AppSettingsUpdatePayload = Partial<Pick<AppSettingsPayload, 'microphoneDeviceId' | 'appearance' | 'speechModelSize'>>
export type SpeechModelState = 'idle' | 'loading' | 'ready' | 'error'
export type SpeechModelLoadStage = 'python' | 'downloading' | 'initializing'

export interface SpeechModelStatusPayload {
  state: SpeechModelState
  modelId: string
  loadStage?: SpeechModelLoadStage
  loadProgress?: number
  loadedBytes?: number
  totalBytes?: number
  error?: string
}

export interface SpeechAudioChunkPayload {
  audioSampleRateHz: number
  audioSamples: ArrayBuffer
  currentRowLatex?: string
}

export interface SpeechTranscriptResult {
  transcript: string
}
