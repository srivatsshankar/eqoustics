import { app, BrowserWindow, clipboard, dialog, ipcMain } from 'electron'
import { access, readFile, unlink, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
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

type CaptureBounds = {
  x: number
  y: number
  width: number
  height: number
}

function getNotebookFilters() {
  return [{ name: 'Eqoustics Notebook', extensions: [EQOUSTICS_FILE_EXTENSION] }]
}

function recentTitleFromPath(filePath: string) {
  return path.basename(filePath, path.extname(filePath))
}

function normalizeRecentFileEntry(entry: RecentFileEntry): RecentFileEntry {
  return {
    ...entry,
    title: recentTitleFromPath(entry.path),
  }
}

async function fileExists(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function listExistingRecentFiles(store: ElectronStoreLike) {
  const existing = (store.get(RECENT_FILES_KEY) as RecentFileEntry[] | undefined) ?? []
  const normalizedEntries: RecentFileEntry[] = []

  for (const entry of existing) {
    if (await fileExists(entry.path)) {
      normalizedEntries.push(normalizeRecentFileEntry(entry))
    }
  }

  const nextEntries = normalizedEntries.slice(0, MAX_RECENT_FILES)
  if (JSON.stringify(existing) !== JSON.stringify(nextEntries)) {
    store.set(RECENT_FILES_KEY, nextEntries)
  }

  return nextEntries
}

function updateRecentFiles(store: ElectronStoreLike, filePath: string) {
  const existing = ((store.get(RECENT_FILES_KEY) as RecentFileEntry[] | undefined) ?? [])
    .map(normalizeRecentFileEntry)
  const deduped = existing.filter((entry) => entry.path !== filePath)

  const updated: RecentFileEntry[] = [
    {
      path: filePath,
      title: recentTitleFromPath(filePath),
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
    updateRecentFiles(store, file.path)

    return file
  })

  ipcMain.handle(IPC_CHANNELS.openNotebookAtPath, async (_, filePath: string) => {
    const file = await readNotebookFile(filePath)
    updateRecentFiles(store, file.path)

    return file
  })

  ipcMain.handle(IPC_CHANNELS.saveNotebook, async (_, file: StoredNotebookFile & { title: string }) => {
    await writeFile(file.path, file.content, 'utf8')
    updateRecentFiles(store, file.path)
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
    updateRecentFiles(store, result.filePath)

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
    return listExistingRecentFiles(store)
  })

  ipcMain.handle(IPC_CHANNELS.writeClipboardText, (_event, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.handle(IPC_CHANNELS.captureHtml, async (_, html: string) => {
    const tempPath = path.join(app.getPath('temp'), `eq-cap-${Date.now()}.html`)

    const win = new BrowserWindow({
      show: false,
      frame: false,
      skipTaskbar: true,
      width: 1400,
      height: 200,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })

    try {
      await writeFile(tempPath, html, 'utf8')
      await win.loadURL(pathToFileURL(tempPath).href)

      const bounds: CaptureBounds = await win.webContents.executeJavaScript(
        `document.fonts.ready.then(() => new Promise((resolve) => requestAnimationFrame(() => {
          const content = document.querySelector('.copy-render-content') || document.body
          const elements = [content, ...content.querySelectorAll('*')]
          const rects = elements.flatMap((element) => Array.from(element.getClientRects()))
            .filter((rect) => rect.width > 0 && rect.height > 0)

          if (rects.length === 0) {
            resolve({ x: 0, y: 0, width: 1, height: 1 })
            return
          }

          const bleed = 1
          const left = Math.max(0, Math.floor(Math.min(...rects.map((rect) => rect.left)) - bleed))
          const top = Math.max(0, Math.floor(Math.min(...rects.map((rect) => rect.top)) - bleed))
          const right = Math.ceil(Math.max(...rects.map((rect) => rect.right)) + bleed)
          const bottom = Math.ceil(Math.max(...rects.map((rect) => rect.bottom)) + bleed)

          resolve({
            x: left,
            y: top,
            width: Math.max(1, right - left),
            height: Math.max(1, bottom - top),
          })
        })))`
      )

      win.setContentSize(Math.max(40, bounds.x + bounds.width), Math.max(1, bounds.y + bounds.height))
      await new Promise((resolve) => setTimeout(resolve, 50))
      const image = await win.webContents.capturePage(bounds)
      clipboard.writeImage(image)
    } finally {
      win.destroy()
      try { await unlink(tempPath) } catch { /* ignore */ }
    }
  })
}
