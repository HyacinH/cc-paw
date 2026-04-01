import { ipcMain, BrowserWindow, Notification } from 'electron'
import path from 'path'
import * as pty from 'node-pty'
import { hasPreviousSession, markSessionExists, clearPtySession } from '../services/session.service'
import { getShellEnv, findClaude, isWin } from '../services/platform'
import { getNotifyOnDone } from './app-settings.handler'

const BUFFER_MAX = 200 * 1024 // 200KB per session
const DONE_TIMEOUT_MS = 10_000  // 10s of silence → Claude finished responding
const PATTERN_WINDOW = 500      // chars of recent stripped output for cross-chunk pattern matching

// Strip ANSI/VT escape codes from terminal output
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b(?:\[[0-9;]*[A-Za-z]|\][^\x07]*(?:\x07|\x1b\\)|[^[\]])/g
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

// Only match patterns that unambiguously indicate Claude Code is waiting for
// user input. "❯" alone is excluded — it appears in Claude Code's normal prompt too,
// but "❯ 1." is specific to inquirer-style numbered selection menus.
const WAITING_PATTERNS = [
  /\(Y\/n\)/i,                // (Y/n) yes/no confirmation
  /\[Y\/n\]/i,
  /\(y\/N\)/i,
  /\[y\/N\]/i,
  /\(\d+[-/]\d+\)/,           // (1-3) or (1/2) numeric range — selection menus
  /press\s+enter/i,           // "Press Enter to continue"
  /do you want to proceed/i,  // Claude Code permission dialog (no \? — more forgiving)
  /do you want to allow/i,    // Claude Code tool-use permission
  /❯\s*\d+\./,                // "❯ N." — inquirer numbered selection cursor
]

// patternWindow is pre-stripped; no need to stripAnsi again here
function detectsWaiting(strippedText: string): boolean {
  return WAITING_PATTERNS.some(p => p.test(strippedText))
}

export type PtySessionState = 'running' | 'waiting-input' | 'done'

interface PtySession {
  proc: pty.IPty
  buffer: string
  state: PtySessionState
  hasHadOutput: boolean      // don't glow until the session actually produces output
  doneTimer: ReturnType<typeof setTimeout> | null       // silence → 'done'
  doneNotifyTimer: ReturnType<typeof setTimeout> | null // 2s after 'done' → send notification
  hadWaitingInput: boolean   // waiting-input fired this cycle; suppress done notification
  patternWindow: string      // rolling last-N stripped chars for cross-chunk pattern matching
}

const sessions = new Map<string, PtySession>()

function broadcastState(
  getMainWindow: () => BrowserWindow | null,
  projectDir: string,
  state: PtySessionState | 'exited'
): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send('pty:state', { projectDir, state })
  }
}

function sendNotification(
  title: string,
  body: string,
  getMainWindow: () => BrowserWindow | null,
): void {
  if (BrowserWindow.getFocusedWindow() !== null) return
  const notification = new Notification({ title, body })
  notification.on('click', () => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })
  notification.show()
}

function maybeNotify(projectDir: string, getMainWindow: () => BrowserWindow | null): void {
  const projectName = path.basename(projectDir)
  sendNotification(`${projectName} — Action Required`, 'Claude is waiting for your input. Click to respond.', getMainWindow)
}

function maybeNotifyDone(projectDir: string, getMainWindow: () => BrowserWindow | null): void {
  const projectName = path.basename(projectDir)
  sendNotification(`${projectName} — Done`, 'Claude has finished responding.', getMainWindow)
}

function scheduleDone(
  session: PtySession,
  projectDir: string,
  getMainWindow: () => BrowserWindow | null
): void {
  if (session.doneTimer !== null) clearTimeout(session.doneTimer)
  session.doneTimer = setTimeout(() => {
    session.doneTimer = null
    if (sessions.get(projectDir) !== session || session.state !== 'running') return
    session.state = 'done'
    broadcastState(getMainWindow, projectDir, 'done')
    // Wait 2s before notifying — if waiting-input or new output arrives, cancel
    if (session.doneNotifyTimer !== null) clearTimeout(session.doneNotifyTimer)
    session.doneNotifyTimer = setTimeout(async () => {
      session.doneNotifyTimer = null
      if (sessions.get(projectDir) !== session || session.state !== 'done') return
      if (session.hadWaitingInput) return  // waiting-input already notified this cycle
      if (await getNotifyOnDone()) maybeNotifyDone(projectDir, getMainWindow)
    }, 2000)
  }, DONE_TIMEOUT_MS)
}

function cancelDoneNotify(session: PtySession): void {
  if (session.doneNotifyTimer !== null) {
    clearTimeout(session.doneNotifyTimer)
    session.doneNotifyTimer = null
  }
}

function enterWaitingState(
  session: PtySession,
  projectDir: string,
  getMainWindow: () => BrowserWindow | null
): void {
  if (session.doneTimer !== null) {
    clearTimeout(session.doneTimer)
    session.doneTimer = null
  }
  cancelDoneNotify(session)  // waiting-input takes priority over done notification
  if (session.state !== 'waiting-input') {
    session.state = 'waiting-input'
    session.hadWaitingInput = true  // mark: done notification should be suppressed this cycle
    broadcastState(getMainWindow, projectDir, 'waiting-input')
    maybeNotify(projectDir, getMainWindow)
  }
}

function setRunning(
  session: PtySession,
  projectDir: string,
  getMainWindow: () => BrowserWindow | null
): void {
  cancelDoneNotify(session)  // new output arrived — cancel any pending done notification
  if (session.state !== 'running') {
    session.state = 'running'
    broadcastState(getMainWindow, projectDir, 'running')
  }
  // Restart the silence timer — if output stops for DONE_TIMEOUT_MS, switch to 'done'
  scheduleDone(session, projectDir, getMainWindow)
}

export function cleanupPty(): void {
  for (const [, session] of sessions) {
    if (session.doneTimer !== null) clearTimeout(session.doneTimer)
    cancelDoneNotify(session)
    try { session.proc.kill() } catch { /* ignore */ }
  }
  sessions.clear()
}

export function registerPtyHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('pty:create', async (_event, projectDir: string, newSession: boolean, resumeId?: string) => {
    // Close any existing session for this dir
    const existing = sessions.get(projectDir)
    if (existing) {
      if (existing.doneTimer !== null) clearTimeout(existing.doneTimer)
      cancelDoneNotify(existing)
      try { existing.proc.kill() } catch { /* ignore */ }
      sessions.delete(projectDir)
    }

    const fullEnv = getShellEnv()
    const claudeBin = findClaude()

    let claudeArgs: string[]
    if (resumeId) {
      claudeArgs = ['--resume', resumeId]
    } else {
      const shouldContinue = !newSession && await hasPreviousSession(projectDir)
      claudeArgs = shouldContinue ? ['--continue'] : []
    }

    const [spawnFile, spawnArgs] = isWin
      ? ['cmd.exe', ['/c', claudeBin, ...claudeArgs]]
      : [claudeBin, claudeArgs]

    try {
      const proc = pty.spawn(spawnFile, spawnArgs, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: projectDir,
        env: fullEnv as Record<string, string>,
      })

      // Don't broadcast 'running' immediately — wait for actual output so the
      // avatar only glows once the session is doing something.
      const session: PtySession = { proc, buffer: '', state: 'running', hasHadOutput: false, doneTimer: null, doneNotifyTimer: null, hadWaitingInput: false, patternWindow: '' }
      sessions.set(projectDir, session)

      proc.onData((data) => {
        // Append to rolling buffer
        session.buffer += data
        if (session.buffer.length > BUFFER_MAX) {
          session.buffer = session.buffer.slice(session.buffer.length - BUFFER_MAX)
        }
        const win = getMainWindow()
        if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
          win.webContents.send('pty:data', { projectDir, data })
        }

        // First real output: start glowing
        if (!session.hasHadOutput) {
          session.hasHadOutput = true
          broadcastState(getMainWindow, projectDir, 'running')
          scheduleDone(session, projectDir, getMainWindow)
        }

        // Accumulate stripped output in a small window for cross-chunk pattern matching.
        // Some prompts (e.g. inquirer selection menus) arrive across multiple PTY chunks
        // so checking only the current chunk would miss the full phrase.
        session.patternWindow += stripAnsi(data)
        if (session.patternWindow.length > PATTERN_WINDOW) {
          session.patternWindow = session.patternWindow.slice(-PATTERN_WINDOW)
        }

        // State detection: match against the accumulated window, not just the current chunk.
        // Once in 'waiting-input', stay there until the user actually sends input
        // (handled in pty:write). Otherwise subsequent ANSI/redraw chunks would
        // bounce the state back to 'running' and re-trigger the notification.
        if (detectsWaiting(session.patternWindow)) {
          enterWaitingState(session, projectDir, getMainWindow)
        } else if (session.state !== 'waiting-input') {
          setRunning(session, projectDir, getMainWindow)
        }
      })

      proc.onExit(({ exitCode }) => {
        const s = sessions.get(projectDir)
        if (s?.proc === proc) {
          if (s.doneTimer !== null) clearTimeout(s.doneTimer)
          sessions.delete(projectDir)
        }
        const win = getMainWindow()
        if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
          win.webContents.send('pty:exit', { projectDir, code: exitCode })
          win.webContents.send('pty:state', { projectDir, state: 'exited' })
        }
      })

      await markSessionExists(projectDir)
      return { success: true, data: undefined }
    } catch (err) {
      const msg = (err as NodeJS.ErrnoError).code === 'ENOENT'
        ? '未找到 claude 命令，请确认已安装 Claude Code CLI'
        : String(err)
      return { success: false, error: msg, code: 'SPAWN_ERROR' }
    }
  })

  ipcMain.handle('pty:write', (_event, projectDir: string, data: string) => {
    const session = sessions.get(projectDir)
    if (session) {
      session.proc.write(data)
      // User responded — exit waiting-input state and start a new interaction cycle
      if (session.state === 'waiting-input') {
        session.hadWaitingInput = false  // new cycle: done notification allowed again
        session.patternWindow = ''       // clear stale patterns so they don't re-trigger
        setRunning(session, projectDir, getMainWindow)
      }
    }
    return { success: true, data: undefined }
  })

  ipcMain.handle('pty:resize', (_event, projectDir: string, cols: number, rows: number) => {
    try {
      sessions.get(projectDir)?.proc.resize(cols, rows)
    } catch { /* ignore race */ }
    return { success: true, data: undefined }
  })

  ipcMain.handle('pty:kill', (_event, projectDir: string) => {
    const session = sessions.get(projectDir)
    if (session) {
      if (session.doneTimer !== null) clearTimeout(session.doneTimer)
      cancelDoneNotify(session)
      try { session.proc.kill() } catch { /* ignore */ }
      sessions.delete(projectDir)
    }
    return { success: true, data: undefined }
  })

  ipcMain.handle('pty:get-buffer', (_event, projectDir: string) => {
    return { success: true, data: sessions.get(projectDir)?.buffer ?? '' }
  })

  ipcMain.handle('pty:clear-session', async (_event, projectDir: string) => {
    await clearPtySession(projectDir)
    return { success: true, data: undefined }
  })

  ipcMain.handle('pty:has-session', (_event, projectDir: string) => {
    // Only checks for an active in-memory process; file marker is only for --continue
    return { success: true, data: sessions.has(projectDir) }
  })
}
