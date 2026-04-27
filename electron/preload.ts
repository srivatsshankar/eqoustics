import { contextBridge, ipcRenderer } from 'electron'

import { IPC_CHANNELS } from '../src/shared/ipc/channels'
import type { FileMenuAction } from '../src/shared/ipc/channels'
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
})
