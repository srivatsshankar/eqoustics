import { clipboard, contextBridge, ipcRenderer, nativeImage } from 'electron'

import { IPC_CHANNELS } from '../src/shared/ipc/channels'
import type {
  FileMenuAction,
  AppSettingsPayload,
  AppSettingsUpdatePayload,
  SpeechAudioChunkPayload,
  SpeechModelStatusPayload,
  SpeechTranscriptResult,
  WindowControlAction,
  WindowStatePayload,
} from '../src/shared/ipc/channels'
import type { NotebookDocument, RecentFileEntry, StoredNotebookFile } from '../src/shared/types/notebook'

contextBridge.exposeInMainWorld('eqoustics', {
  createNotebook: () => ipcRenderer.invoke(IPC_CHANNELS.createNotebook) as Promise<NotebookDocument>,
  onMenuAction: (listener: (action: FileMenuAction) => void) => {
    const wrappedListener = (_event: unknown, action: FileMenuAction) => {
      listener(action)
    }

    ipcRenderer.on(IPC_CHANNELS.menuAction, wrappedListener)

    return () => {
      ipcRenderer.off(IPC_CHANNELS.menuAction, wrappedListener)
    }
  },
  openNotebook: () => ipcRenderer.invoke(IPC_CHANNELS.openNotebook) as Promise<StoredNotebookFile | null>,
  openNotebookAtPath: (filePath: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.openNotebookAtPath, filePath) as Promise<StoredNotebookFile>
  },
  exportNotebookPdf: (payload: { title: string; html: string }) => {
    return ipcRenderer.invoke(IPC_CHANNELS.exportNotebookPdf, payload) as Promise<{ path: string } | null>
  },
  saveNotebook: (file: StoredNotebookFile & { title: string }) => {
    return ipcRenderer.invoke(IPC_CHANNELS.saveNotebook, file) as Promise<{ path: string }>
  },
  saveNotebookAs: (file: { title: string; content: string }) => {
    return ipcRenderer.invoke(IPC_CHANNELS.saveNotebookAs, file) as Promise<{ path: string } | null>
  },
  listRecentFiles: () => ipcRenderer.invoke(IPC_CHANNELS.listRecentFiles) as Promise<RecentFileEntry[]>,
  captureHtml: (html: string) => ipcRenderer.invoke(IPC_CHANNELS.captureHtml, html) as Promise<void>,
  writeClipboardText: (text: string) => ipcRenderer.invoke(IPC_CHANNELS.writeClipboardText, text) as Promise<void>,
  writeClipboardImage: (dataUrl: string) => clipboard.writeImage(nativeImage.createFromDataURL(dataUrl)),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet) as Promise<AppSettingsPayload>,
  updateSettings: (settings: AppSettingsUpdatePayload) => {
    return ipcRenderer.invoke(IPC_CHANNELS.settingsUpdate, settings) as Promise<AppSettingsPayload>
  },
  restartApp: () => ipcRenderer.invoke(IPC_CHANNELS.appRestart) as Promise<void>,
  getSpeechModelStatus: () => ipcRenderer.invoke(IPC_CHANNELS.speechModelGetStatus) as Promise<SpeechModelStatusPayload>,
  loadSpeechModel: () => ipcRenderer.invoke(IPC_CHANNELS.speechModelLoad) as Promise<SpeechModelStatusPayload>,
  transcribeSpeechChunk: (payload: SpeechAudioChunkPayload) => {
    return ipcRenderer.invoke(IPC_CHANNELS.speechTranscribeChunk, payload) as Promise<SpeechTranscriptResult>
  },
  onSpeechModelStatusChange: (listener: (status: SpeechModelStatusPayload) => void) => {
    const wrappedListener = (_event: unknown, status: SpeechModelStatusPayload) => {
      listener(status)
    }

    ipcRenderer.on(IPC_CHANNELS.speechModelStatusChanged, wrappedListener)

    return () => {
      ipcRenderer.off(IPC_CHANNELS.speechModelStatusChanged, wrappedListener)
    }
  },
  windowControl: (action: WindowControlAction) => ipcRenderer.invoke(IPC_CHANNELS.windowControl, action) as Promise<void>,
  getWindowState: () => ipcRenderer.invoke(IPC_CHANNELS.getWindowState) as Promise<WindowStatePayload>,
  onWindowStateChange: (listener: (state: WindowStatePayload) => void) => {
    const wrappedListener = (_event: unknown, state: WindowStatePayload) => {
      listener(state)
    }

    ipcRenderer.on(IPC_CHANNELS.windowStateChanged, wrappedListener)

    return () => {
      ipcRenderer.off(IPC_CHANNELS.windowStateChanged, wrappedListener)
    }
  },
})
