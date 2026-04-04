import { app, BrowserWindow, shell, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron'
import path from 'path'
import fs from 'fs'
import { EDIT_COMMAND_IDS, type EditCommandId } from '../src/types/edit-command.types'
import { registerAllHandlers, cleanupPty } from './ipc'
import { initShellEnv } from './services/platform'

// Set app name early so native integration uses "CC Paw".
app.name = 'CC Paw'

const EDIT_COMMAND_ID_SET = new Set<EditCommandId>(EDIT_COMMAND_IDS)

function isEditCommandId(commandId: string): commandId is EditCommandId {
  return EDIT_COMMAND_ID_SET.has(commandId as EditCommandId)
}

function buildAppMenu(): Menu {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ]

  return Menu.buildFromTemplate(template)
}

function readAppIconDataUrl(): string | null {
  const iconPath = path.resolve(__dirname, '../../resources/icon.png')
  try {
    const iconBuffer = fs.readFileSync(iconPath)
    return `data:image/png;base64,${iconBuffer.toString('base64')}`
  } catch {
    return null
  }
}

function createWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const isWin = process.platform === 'win32'

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'CC Paw',
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const } : {}),
    ...(isWin
      ? {
          frame: false,
          autoHideMenuBar: true,
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isWin) {
    win.setMenuBarVisibility(false)
  }

  win.webContents.on('console-message', (_event, _level, message) => {
    if (message.startsWith('[ProjectPage +') || message.startsWith('[TerminalPanel +')) {
      console.log(message)
    }
  })

  // Route all window.open URLs to system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {})
    return { action: 'deny' }
  })

  if (!app.isPackaged) {
    const DEV_URL = 'http://localhost:5173'
    win.loadURL(DEV_URL).catch(() => {
      setTimeout(() => win.loadURL(DEV_URL).catch(() => {}), 1500)
    })
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

let mainWindow: BrowserWindow | null = null

app.whenReady().then(async () => {
  await initShellEnv()

  Menu.setApplicationMenu(buildAppMenu())

  registerAllHandlers(() => mainWindow)

  ipcMain.handle('window-controls:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.handle('window-controls:toggle-maximize', () => {
    if (!mainWindow) return false
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
      return false
    }
    mainWindow.maximize()
    return true
  })

  ipcMain.handle('window-controls:close', () => {
    mainWindow?.close()
  })

  ipcMain.handle('window-controls:is-maximized', () => {
    return mainWindow?.isMaximized() ?? false
  })

  ipcMain.handle('window-controls:app-icon', () => {
    return readAppIconDataUrl()
  })

  ipcMain.handle('app-menu:invoke', (_event, commandId: string) => {
    if (!mainWindow || !isEditCommandId(commandId)) return false

    switch (commandId) {
      case 'edit:undo':
        mainWindow.webContents.undo()
        return true
      case 'edit:redo':
        mainWindow.webContents.redo()
        return true
      case 'edit:cut':
        mainWindow.webContents.cut()
        return true
      case 'edit:copy':
        mainWindow.webContents.copy()
        return true
      case 'edit:paste':
        mainWindow.webContents.paste()
        return true
      case 'edit:selectAll':
        mainWindow.webContents.selectAll()
        return true
      default:
        return false
    }
  })

  ipcMain.on('debug:timing', (_event, payload: { scope: string; label: string; detail?: Record<string, unknown> }) => {
    console.log(`[${payload.scope}] ${payload.label}`, payload.detail ?? {})
  })

  mainWindow = createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
})

app.on('before-quit', () => {
  cleanupPty()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
