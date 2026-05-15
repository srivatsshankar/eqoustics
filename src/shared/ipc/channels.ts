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
  windowControl: 'window:control',
  getWindowState: 'window:state:get',
  windowStateChanged: 'window:state:changed',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

export type FileMenuAction = 'new' | 'open' | 'save' | 'saveAs' | 'exportPdf'
export type WindowControlAction = 'minimize' | 'toggleMaximize' | 'close'
export type WindowStatePayload = { isMaximized: boolean }
