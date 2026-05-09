import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Store from 'electron-store'

import { IPC_CHANNELS, type WindowControlAction, type WindowStatePayload } from '../src/shared/ipc/channels'
import { registerFileHandlers } from './ipc/file-handlers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Force classic scrollbars so custom ::-webkit-scrollbar styling is honored in Electron.
app.commandLine.appendSwitch('disable-features', 'OverlayScrollbar,OverlayScrollbars')

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

function getWindowState(window: BrowserWindow): WindowStatePayload {
  return { isMaximized: window.isMaximized() }
}

function publishWindowState(window: BrowserWindow) {
  window.webContents.send(IPC_CHANNELS.windowStateChanged, getWindowState(window))
}

function registerWindowControlHandlers() {
  ipcMain.removeHandler(IPC_CHANNELS.windowControl)
  ipcMain.handle(IPC_CHANNELS.windowControl, (event, action: WindowControlAction) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender)

    if (!targetWindow) {
      return
    }

    switch (action) {
      case 'minimize':
        targetWindow.minimize()
        return
      case 'toggleMaximize':
        if (targetWindow.isMaximized()) {
          targetWindow.unmaximize()
        } else {
          targetWindow.maximize()
        }
        return
      case 'close':
        targetWindow.close()
        return
    }
  })

  ipcMain.removeHandler(IPC_CHANNELS.getWindowState)
  ipcMain.handle(IPC_CHANNELS.getWindowState, (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender)

    if (!targetWindow) {
      return { isMaximized: false }
    }

    return getWindowState(targetWindow)
  })
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    frame: false,
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

  const createdWindow = win
  createdWindow.on('maximize', () => publishWindowState(createdWindow))
  createdWindow.on('unmaximize', () => publishWindowState(createdWindow))

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
  registerWindowControlHandlers()
  createWindow()
  Menu.setApplicationMenu(null)
})
