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
  speechListCommands: 'speech:commands:list',
  speechAddCommandAlias: 'speech:commands:addAlias',
  speechDeleteCommandAlias: 'speech:commands:deleteAlias',
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
export type SpeechAccelerationBackend = 'gpu' | 'cpu'
export interface AppSettingsPayload {
  microphoneDeviceId: string | null
  appearance: AppearancePreference
  speechModelSize: SpeechModelSize
  speechAcceleration: SpeechAccelerationBackend
  totalMemoryBytes: number
}
export type AppSettingsUpdatePayload = Partial<Pick<AppSettingsPayload, 'microphoneDeviceId' | 'appearance' | 'speechModelSize' | 'speechAcceleration'>>
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

export type SpeechRecognitionCommand =
  | 'new-line'
  | 'new-paragraph'
  | 'go-to-row'
  | 'go-to-end'
  | 'bold-that'
  | 'italic-that'
  | 'underline-that'
  | 'bold-row'
  | 'italic-row'
  | 'underline-row'
  | 'capitalize-row'
  | 'sentence-case-row'
  | 'lowercase-row'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'heading-4'
  | 'delete-that'
  | 'delete-row'
  | 'clear-row'
  | 'bullet-that'
  | 'number-that'
  | 'correction'
  | 'save-document'
  | 'save-document-as'
  | 'open-document'
  | 'undo-that'
  | 'redo-that'
  | 'type-correction'
  | 'type-text'
  | 'help-me'
  | 'close-help'
  | 'minimize-window'
  | 'maximize-window'
  | 'close-window'
  | 'silence'
  | 'listen'
  | 'deactivate-microphone'
export type SpeechCommandCategory = 'navigation' | 'formatting' | 'microphone'

export interface SpeechCommandInfo {
  command: SpeechRecognitionCommand
  name: string
  category: SpeechCommandCategory
  description: string
  aliases: string[]
  userAliases: string[]
  canCreateAliases: boolean
}

export interface SpeechCommandAliasPayload {
  command: SpeechRecognitionCommand
  alias: string
}

export type SpeechRecognitionAction =
  | {
    type: 'command'
    command: SpeechRecognitionCommand
    rowNumber?: number
  }
  | {
    type: 'insert'
    text: string
    insertMode: 'latex' | 'text'
  }
  | {
    type: 'replace-row'
    latex: string
  }
  | {
    type: 'ignore'
  }

export interface SpeechTranscriptResult {
  transcript: string
  action: SpeechRecognitionAction
}
