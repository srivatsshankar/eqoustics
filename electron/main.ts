import { Menu, app, type MenuItemConstructorOptions, BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Store from 'electron-store'

import { IPC_CHANNELS, type FileMenuAction } from '../src/shared/ipc/channels'
import { registerFileHandlers } from './ipc/file-handlers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
const store = new Store()

function dispatchMenuAction(action: FileMenuAction) {
  win?.webContents.send(IPC_CHANNELS.menuAction, action)
}

function buildApplicationMenu() {
  const fileMenu: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      {
        label: 'New',
        accelerator: 'CommandOrControl+N',
        click: () => dispatchMenuAction('new'),
      },
      {
        label: 'Open',
        accelerator: 'CommandOrControl+O',
        click: () => dispatchMenuAction('open'),
      },
      { type: 'separator' },
      {
        label: 'Save',
        accelerator: 'CommandOrControl+S',
        click: () => dispatchMenuAction('save'),
      },
      {
        label: 'Save As',
        accelerator: 'CommandOrControl+Shift+S',
        click: () => dispatchMenuAction('saveAs'),
      },
      { type: 'separator' },
      {
        label: 'Export PDF',
        accelerator: 'CommandOrControl+Shift+E',
        click: () => dispatchMenuAction('exportPdf'),
      },
      { type: 'separator' },
      process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
    ],
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate([fileMenu]))
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  win.once('ready-to-show', () => {
    win?.maximize()
    win?.show()
  })

  registerFileHandlers(win, store)

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  createWindow()
  buildApplicationMenu()
})
