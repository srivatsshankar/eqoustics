import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { IPC_CHANNELS } from '../../src/shared/ipc/channels'
import {
  EQOUSTICS_FILE_EXTENSION,
  createEmptyNotebookDocument,
  type RecentFileEntry,
  type StoredNotebookFile,
} from '../../src/shared/types/notebook'

const RECENT_FILES_KEY = 'recentFiles'
const MAX_RECENT_FILES = 8

type ElectronStoreLike = {
  get: (key: string) => unknown
  set: (key: string, value: unknown) => void
}

function getNotebookFilters() {
  return [{ name: 'Eqoustics Notebook', extensions: [EQOUSTICS_FILE_EXTENSION] }]
}

function updateRecentFiles(store: ElectronStoreLike, filePath: string, title: string) {
  const existing = (store.get(RECENT_FILES_KEY) as RecentFileEntry[] | undefined) ?? []
  const deduped = existing.filter((entry) => entry.path !== filePath)

  const updated: RecentFileEntry[] = [
    {
      path: filePath,
      title,
      lastOpenedAt: new Date().toISOString(),
    },
    ...deduped,
  ].slice(0, MAX_RECENT_FILES)

  store.set(RECENT_FILES_KEY, updated)
}

async function readNotebookFile(filePath: string): Promise<StoredNotebookFile> {
  const content = await readFile(filePath, 'utf8')

  return { path: filePath, content }
}

function buildDefaultSavePath(window: BrowserWindow, title: string) {
  const sanitizedTitle = title.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'Untitled Notebook'
  const baseDir = app.getPath('documents') || window.getTitle()

  return path.join(baseDir, `${sanitizedTitle}.${EQOUSTICS_FILE_EXTENSION}`)
}

export function registerFileHandlers(mainWindow: BrowserWindow, store: ElectronStoreLike) {
  ipcMain.handle(IPC_CHANNELS.createNotebook, async () => {
    return createEmptyNotebookDocument()
  })

  ipcMain.handle(IPC_CHANNELS.openNotebook, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: getNotebookFilters(),
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const file = await readNotebookFile(result.filePaths[0])
    const title = path.basename(file.path, path.extname(file.path))
    updateRecentFiles(store, file.path, title)

    return file
  })

  ipcMain.handle(IPC_CHANNELS.openNotebookAtPath, async (_, filePath: string) => {
    const file = await readNotebookFile(filePath)
    const title = path.basename(file.path, path.extname(file.path))
    updateRecentFiles(store, file.path, title)

    return file
  })

  ipcMain.handle(IPC_CHANNELS.saveNotebook, async (_, file: StoredNotebookFile & { title: string }) => {
    await writeFile(file.path, file.content, 'utf8')
    updateRecentFiles(store, file.path, file.title)
    return { path: file.path }
  })

  ipcMain.handle(IPC_CHANNELS.saveNotebookAs, async (_, file: { title: string; content: string }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: buildDefaultSavePath(mainWindow, file.title),
      filters: getNotebookFilters(),
    })

    if (result.canceled || !result.filePath) {
      return null
    }

    await writeFile(result.filePath, file.content, 'utf8')
    updateRecentFiles(store, result.filePath, file.title)

    return { path: result.filePath }
  })

  ipcMain.handle(IPC_CHANNELS.exportNotebookPdf, async (_, payload: { title: string; html: string }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: buildDefaultSavePath(mainWindow, payload.title).replace(/\.tex$/i, '.pdf'),
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    })

    if (result.canceled || !result.filePath) {
      return null
    }

    const previewWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
      },
    })

    try {
      await previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(payload.html)}`)
      const pdfBuffer = await previewWindow.webContents.printToPDF({
        landscape: false,
        printBackground: true,
      })
      await writeFile(result.filePath, pdfBuffer)
      return { path: result.filePath }
    } finally {
      previewWindow.destroy()
    }
  })

  ipcMain.handle(IPC_CHANNELS.listRecentFiles, async () => {
    return (store.get(RECENT_FILES_KEY) as RecentFileEntry[] | undefined) ?? []
  })
}