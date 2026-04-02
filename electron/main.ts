import { app, BrowserWindow, shell, ipcMain } from 'electron'
import path from 'path'
import { registerAllHandlers, cleanupPty } from './ipc'
import { initShellEnv } from './services/platform'

// Set app name early so macOS notifications show "CC Paw" even in dev mode
app.name = 'CC Paw'

function createWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    ...(isMac ? { titleBarStyle: 'hiddenInset' } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.webContents.on('console-message', (_event, _level, message) => {
    if (message.startsWith('[ProjectPage +') || message.startsWith('[TerminalPanel +')) {
      console.log(message)
    }
  })

  // 所有 window.open 调用转由系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {})
    return { action: 'deny' }
  })

  if (!app.isPackaged) {
    const DEV_URL = 'http://localhost:5173'
    win.loadURL(DEV_URL).catch(() => {
      // dev server not ready yet, retry once
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
  // 捕获完整 shell 环境变量，之后所有子进程（PTY、shell:run）都用这份 env
  await initShellEnv()
  // IPC handlers registered once — never inside createWindow to avoid duplicate registration
  registerAllHandlers(() => mainWindow)
  ipcMain.on('debug:timing', (_event, payload: { scope: string; label: string; detail?: Record<string, unknown> }) => {
    console.log(`[${payload.scope}] ${payload.label}`, payload.detail ?? {})
  })
  mainWindow = createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
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
