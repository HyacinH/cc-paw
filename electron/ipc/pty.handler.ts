import { ipcMain, BrowserWindow, Notification } from 'electron'
import path from 'path'
import * as pty from 'node-pty'
import { markSessionExists, clearPtySession } from '../services/session.service'
import { getShellEnv, isWin } from '../services/platform'
import { setActiveSessionId, clearActiveSessionId, getCurrentSession } from '../services/snapshot.service'
import { getNotifyOnDone } from './app-settings.handler'
import { resolveCliProvider } from '../services/cli-provider'
import { normalizeCliId, toScopeKey, DEFAULT_CLI_ID } from '../services/cli-scope'

const BUFFER_MAX = 200 * 1024 // 200KB per session
const DONE_TIMEOUT_MS = 10_000  // 10s of silence → Claude finished responding
const PATTERN_WINDOW = 500      // chars of recent stripped output for cross-chunk pattern matching
const ACTIVE_WINDOW_MS = 5_000 // suppress notifications briefly after terminal input in this project

function ptyLog(event: string, projectDir: string, extra?: Record<string, unknown>): void {
  const uptimeMs = Math.round(process.uptime() * 1000)
  console.log(`[pty +${uptimeMs}ms] ${event}`, { dir: path.basename(projectDir), ...extra })
}

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
  /what should claude do instead\?/i, // fallback/action correction prompt
  /❯\s*\d+\./,                // "❯ N." — inquirer numbered selection cursor
]

function detectPromptLineWaiting(strippedText: string): boolean {
  const normalized = strippedText.replace(/\r/g, '')
  const lines = normalized.split('\n')
  const tailLines = lines.slice(-6)
  if (tailLines.length === 0) return false
  const lastLine = tailLines[tailLines.length - 1] ?? ''
  // Claude input prompt line, e.g. "> " (possibly with indentation).
  // Keep this strict to avoid false positives from markdown quote content.
  return /^\s*>\s*$/.test(lastLine)
}

function detectTypedPromptLineFromBuffer(rawBuffer: string): boolean {
  const stripped = stripAnsi(rawBuffer).replace(/\r/g, '')
  const lines = stripped.split('\n')
  if (lines.length === 0) return false
  const lastLine = (lines[lines.length - 1] ?? '').trimStart()
  // Input line can be "> " or "> user typed text".
  return /^>($|\s+.*)/.test(lastLine)
}

// patternWindow is pre-stripped; no need to stripAnsi again here
function detectsWaiting(strippedText: string): boolean {
  return WAITING_PATTERNS.some(p => p.test(strippedText)) || detectPromptLineWaiting(strippedText)
}

export type PtySessionState = 'running' | 'waiting-input' | 'done'

interface PtySession {
  proc: pty.IPty
  buffer: string
  state: PtySessionState
  hasHadOutput: boolean      // don't glow until the session actually produces output
  interactionArmed: boolean  // arm one interaction cycle after user input
  doneTimer: ReturnType<typeof setTimeout> | null       // silence → 'done'
  doneNotifyTimer: ReturnType<typeof setTimeout> | null // 2s after 'done' → send notification
  hadWaitingInput: boolean   // waiting-input fired this cycle; suppress done notification
  patternWindow: string      // rolling last-N stripped chars for cross-chunk pattern matching
}

const sessions = new Map<string, PtySession>()
const lastInteractionAtByScope = new Map<string, number>()

function sessionScopeKey(projectDir: string, cliId: string = DEFAULT_CLI_ID): string {
  return toScopeKey(projectDir, cliId)
}

function getInteractionAgeMs(projectDir: string, cliId: string = DEFAULT_CLI_ID): number | null {
  const last = lastInteractionAtByScope.get(sessionScopeKey(projectDir, cliId))
  return last === undefined ? null : (Date.now() - last)
}

function broadcastState(
  getMainWindow: () => BrowserWindow | null,
  projectDir: string,
  state: PtySessionState | 'exited',
  cliId: string = DEFAULT_CLI_ID,
): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send('pty:state', { projectDir, state, cliId })
  }
}

function sendNotification(
  projectDir: string,
  title: string,
  body: string,
  getMainWindow: () => BrowserWindow | null,
  cliId: string = DEFAULT_CLI_ID,
): void {
  if (BrowserWindow.getFocusedWindow() !== null) {
    ptyLog('notify:skipped-window-focused', projectDir, { title })
    return
  }
  const interactionAgeMs = getInteractionAgeMs(projectDir, cliId)
  if (interactionAgeMs !== null && interactionAgeMs < ACTIVE_WINDOW_MS) {
    ptyLog('notify:skipped-recent-input', projectDir, {
      title,
      interactionAgeMs,
      activeWindowMs: ACTIVE_WINDOW_MS,
    })
    return
  }
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
  ptyLog('notify:sent', projectDir, { title })
}

function cliLabel(cliId?: string): string {
  return normalizeCliId(cliId) === 'codex' ? 'Codex' : 'Claude'
}

function maybeNotify(projectDir: string, getMainWindow: () => BrowserWindow | null, cliId: string = DEFAULT_CLI_ID): void {
  const projectName = path.basename(projectDir)
  const label = cliLabel(cliId)
  sendNotification(projectDir, `${projectName} — Action Required`, `${label} is waiting for your input. Click to respond.`, getMainWindow, cliId)
}

function maybeNotifyDone(projectDir: string, getMainWindow: () => BrowserWindow | null, cliId: string = DEFAULT_CLI_ID): void {
  const projectName = path.basename(projectDir)
  const label = cliLabel(cliId)
  sendNotification(projectDir, `${projectName} — Done`, `${label} has finished responding.`, getMainWindow, cliId)
}

function scheduleDone(
  session: PtySession,
  projectDir: string,
  getMainWindow: () => BrowserWindow | null,
  scopeKey: string,
  cliId: string = DEFAULT_CLI_ID,
): void {
  if (session.doneTimer !== null) clearTimeout(session.doneTimer)
  session.doneTimer = setTimeout(() => {
    session.doneTimer = null
    if (sessions.get(scopeKey) !== session || session.state !== 'running') return
    session.state = 'done'
    session.interactionArmed = false
    broadcastState(getMainWindow, projectDir, 'done', cliId)
    // Wait 2s before notifying — if waiting-input or new output arrives, cancel
    if (session.doneNotifyTimer !== null) clearTimeout(session.doneNotifyTimer)
    session.doneNotifyTimer = setTimeout(async () => {
      session.doneNotifyTimer = null
      if (sessions.get(scopeKey) !== session || session.state !== 'done') return
      if (session.hadWaitingInput) return  // waiting-input already notified this cycle
      if (await getNotifyOnDone()) maybeNotifyDone(projectDir, getMainWindow, cliId)
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
  getMainWindow: () => BrowserWindow | null,
  cliId: string = DEFAULT_CLI_ID,
): void {
  if (session.doneTimer !== null) {
    clearTimeout(session.doneTimer)
    session.doneTimer = null
  }
  cancelDoneNotify(session)  // waiting-input takes priority over done notification
  if (session.state !== 'waiting-input') {
    session.state = 'waiting-input'
    session.interactionArmed = false
    session.hadWaitingInput = true  // mark: done notification should be suppressed this cycle
    broadcastState(getMainWindow, projectDir, 'waiting-input', cliId)
    maybeNotify(projectDir, getMainWindow, cliId)
  }
}

function setRunning(
  session: PtySession,
  projectDir: string,
  getMainWindow: () => BrowserWindow | null,
  scopeKey: string,
  cliId: string = DEFAULT_CLI_ID,
): void {
  cancelDoneNotify(session)  // new output arrived — cancel any pending done notification
  if (session.state !== 'running') {
    session.state = 'running'
    broadcastState(getMainWindow, projectDir, 'running', cliId)
  }
  // Restart the silence timer — if output stops for DONE_TIMEOUT_MS, switch to 'done'
  scheduleDone(session, projectDir, getMainWindow, scopeKey, cliId)
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
  ipcMain.handle('pty:create', async (_event, projectDir: string, newSession: boolean, resumeId?: string, cliId?: string) => {
    const fullEnv = getShellEnv()
    const resolved = resolveCliProvider(cliId)
    const effectiveCliId = normalizeCliId(resolved.effectiveCliId)
    const scopeKey = sessionScopeKey(projectDir, effectiveCliId)

    // Close any existing session for this project+cli scope
    const existing = sessions.get(scopeKey)
    if (existing) {
      if (existing.doneTimer !== null) clearTimeout(existing.doneTimer)
      cancelDoneNotify(existing)
      try { existing.proc.kill() } catch { /* ignore */ }
      sessions.delete(scopeKey)
      ptyLog('session:replaced', projectDir, { cliId: effectiveCliId })
    }
    // Reset runtime hint before deciding/starting next flow.
    // For --resume we'll set it again only after spawn succeeds.
    clearActiveSessionId(projectDir, effectiveCliId)
    const launchPlan = await resolved.provider.resolveLaunchPlan({
      projectDir,
      newSession,
      resumeId,
      getCurrentSession: (dir) => getCurrentSession(dir, effectiveCliId),
      clearPersistedSession: (dir) => clearPtySession(dir, effectiveCliId),
    })
    const launchResumeId = launchPlan.launchResumeId
    const idSource = launchPlan.idSource
    const sessionIntent = launchPlan.sessionIntent
    const cliArgs = launchPlan.args

    if (resolved.fellBack) {
      ptyLog('provider:fallback', projectDir, {
        requestedCliId: resolved.requestedCliId,
        effectiveCliId: resolved.effectiveCliId,
      })
    }

    // For non-resume flows we don't have a concrete session UUID yet.
    // Fall back to file-based detection until one is known.
    if (!launchResumeId) {
      clearActiveSessionId(projectDir, effectiveCliId)
    }

    const [spawnFile, spawnArgs] = isWin
      ? ['cmd.exe', ['/c', launchPlan.binary, ...cliArgs]]
      : [launchPlan.binary, cliArgs]

    ptyLog('session:spawning', projectDir, {
      spawnFile,
      cliArgs,
      newSession,
      resumeId,
      cliId: resolved.effectiveCliId,
      sessionIntent,
      idSource,
      launchResumeId,
    })

    try {
      const proc = pty.spawn(spawnFile, spawnArgs, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: projectDir,
        env: fullEnv as Record<string, string>,
        ...(isWin ? { useConpty: true } : {}),
      })

      // Status cycle (running/done) is armed by user input, not by startup banner output.
      const session: PtySession = {
        proc,
        buffer: '',
        state: 'running',
        hasHadOutput: false,
        interactionArmed: false,
        doneTimer: null,
        doneNotifyTimer: null,
        hadWaitingInput: false,
        patternWindow: '',
      }
      sessions.set(scopeKey, session)
      if (launchResumeId) {
        setActiveSessionId(projectDir, launchResumeId, effectiveCliId)
      }
      ptyLog('session:spawned', projectDir, {
        pid: proc.pid,
        cols: 80,
        rows: 24,
        cliId: resolved.effectiveCliId,
        sessionIntent,
        idSource,
        launchResumeId,
      })

      const spawnStartedAt = Date.now()
      let firstOutputAt: number | null = null
      let firstPrintableAt: number | null = null
      let outputChunkCount = 0

      proc.onData((data) => {
        outputChunkCount += 1
        const stripped = stripAnsi(data)
        const printable = stripped.replace(/\s+/g, '')

        // Append to rolling buffer
        session.buffer += data
        if (session.buffer.length > BUFFER_MAX) {
          session.buffer = session.buffer.slice(session.buffer.length - BUFFER_MAX)
        }
        const win = getMainWindow()
        if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
          win.webContents.send('pty:data', { projectDir, data, cliId: effectiveCliId })
        }

        // First real output chunk
        if (!session.hasHadOutput) {
          session.hasHadOutput = true
          firstOutputAt = Date.now()
          ptyLog('session:first-output', projectDir, {
            bytes: data.length,
            strippedBytes: stripped.length,
            printableBytes: printable.length,
            chunkIndex: outputChunkCount,
            elapsedMs: firstOutputAt - spawnStartedAt,
          })
        }

        // First printable output (ignore pure cursor/show-hide/noise chunks)
        if (firstPrintableAt === null && printable.length > 0) {
          firstPrintableAt = Date.now()
          ptyLog('session:first-printable-output', projectDir, {
            bytes: data.length,
            strippedBytes: stripped.length,
            printableBytes: printable.length,
            chunkIndex: outputChunkCount,
            elapsedMs: firstPrintableAt - spawnStartedAt,
            preview: stripped.slice(0, 120),
          })
        }

        // Accumulate stripped output in a small window for cross-chunk pattern matching.
        // Some prompts (e.g. inquirer selection menus) arrive across multiple PTY chunks
        // so checking only the current chunk would miss the full phrase.
        session.patternWindow += stripped
        if (session.patternWindow.length > PATTERN_WINDOW) {
          session.patternWindow = session.patternWindow.slice(-PATTERN_WINDOW)
        }

        // State detection: match against the accumulated window, not just the current chunk.
        // Once in 'waiting-input', stay there until the user actually sends input
        // (handled in pty:write). Otherwise subsequent ANSI/redraw chunks would
        // bounce the state back to 'running' and re-trigger the notification.
        if (session.interactionArmed && detectsWaiting(session.patternWindow)) {
          enterWaitingState(session, projectDir, getMainWindow, effectiveCliId)
        } else if (session.state !== 'waiting-input' && session.interactionArmed) {
          setRunning(session, projectDir, getMainWindow, scopeKey, effectiveCliId)
        }
      })

      proc.onExit(({ exitCode }) => {
        const lifetimeMs = Date.now() - spawnStartedAt
        const timeToFirstOutputMs = firstOutputAt === null ? null : firstOutputAt - spawnStartedAt
        const timeToFirstPrintableOutputMs = firstPrintableAt === null ? null : firstPrintableAt - spawnStartedAt
        const hadOutput = firstOutputAt !== null
        const s = sessions.get(scopeKey)
        const bufferBytes = s?.buffer.length ?? 0
        const strippedTail = (s?.buffer ?? '').replace(ANSI_RE, '').slice(-240)
        if (s?.proc === proc) {
          if (s.doneTimer !== null) clearTimeout(s.doneTimer)
          sessions.delete(scopeKey)
        }
        lastInteractionAtByScope.delete(scopeKey)
        clearActiveSessionId(projectDir, effectiveCliId)
        ptyLog('session:exit', projectDir, {
          exitCode,
          newSession,
          resumeId,
          cliId: resolved.effectiveCliId,
          sessionIntent,
          idSource,
          launchResumeId,
          cliArgs,
          lifetimeMs,
          hadOutput,
          timeToFirstOutputMs,
          timeToFirstPrintableOutputMs,
          outputChunkCount,
          bufferBytes,
          strippedTail,
        })
        const win = getMainWindow()
        if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
          win.webContents.send('pty:exit', { projectDir, code: exitCode, cliId: effectiveCliId })
          win.webContents.send('pty:state', { projectDir, state: 'exited', cliId: effectiveCliId })
        }
      })

      await markSessionExists(projectDir, effectiveCliId)
      return { success: true, data: undefined }
    } catch (err) {
      const errorWithCode = err as { code?: string }
      const msg = errorWithCode.code === 'ENOENT'
        ? `未找到 ${resolved.provider.id} 命令，请确认已安装 ${resolved.provider.displayName} CLI`
        : String(err)
      ptyLog('session:spawn-error', projectDir, { msg })
      return { success: false, error: msg, code: 'SPAWN_ERROR' }
    }
  })

  ipcMain.handle('pty:write', (_event, projectDir: string, data: string, cliId?: string) => {
    const resolved = resolveCliProvider(cliId)
    const effectiveCliId = normalizeCliId(resolved.effectiveCliId)
    const scopeKey = sessionScopeKey(projectDir, effectiveCliId)
    const session = sessions.get(scopeKey)
    if (session) {
      session.interactionArmed = true
      lastInteractionAtByScope.set(scopeKey, Date.now())
      session.proc.write(data)
      // Prompt text may already be on screen before the user types, and no new
      // output chunk may arrive immediately. Detect waiting state right away so
      // renderer-side cursor recovery can trigger in time.
      if (detectsWaiting(session.patternWindow) || detectTypedPromptLineFromBuffer(session.buffer)) {
        enterWaitingState(session, projectDir, getMainWindow, effectiveCliId)
        return { success: true, data: undefined }
      }
      // User responded — exit waiting-input state and start a new interaction cycle
      if (session.state === 'waiting-input') {
        session.hadWaitingInput = false  // new cycle: done notification allowed again
        session.patternWindow = ''       // clear stale patterns so they don't re-trigger
        setRunning(session, projectDir, getMainWindow, scopeKey, effectiveCliId)
      }
    }
    return { success: true, data: undefined }
  })

  ipcMain.handle('pty:resize', (_event, projectDir: string, cols: number, rows: number, cliId?: string) => {
    try {
      const resolved = resolveCliProvider(cliId)
      const effectiveCliId = normalizeCliId(resolved.effectiveCliId)
      sessions.get(sessionScopeKey(projectDir, effectiveCliId))?.proc.resize(cols, rows)
      ptyLog('session:resize', projectDir, { cols, rows, cliId: effectiveCliId })
    } catch { /* ignore race */ }
    return { success: true, data: undefined }
  })

  ipcMain.handle('pty:kill', (_event, projectDir: string, cliId?: string) => {
    const resolved = resolveCliProvider(cliId)
    const effectiveCliId = normalizeCliId(resolved.effectiveCliId)
    const scopeKey = sessionScopeKey(projectDir, effectiveCliId)
    const session = sessions.get(scopeKey)
    if (session) {
      if (session.doneTimer !== null) clearTimeout(session.doneTimer)
      cancelDoneNotify(session)
      try { session.proc.kill() } catch { /* ignore */ }
      sessions.delete(scopeKey)
    }
    ptyLog('session:killed', projectDir, { cliId: effectiveCliId })
    clearActiveSessionId(projectDir, effectiveCliId)
    lastInteractionAtByScope.delete(scopeKey)
    return { success: true, data: undefined }
  })

  ipcMain.handle('pty:get-buffer', (_event, projectDir: string, cliId?: string) => {
    const resolved = resolveCliProvider(cliId)
    const effectiveCliId = normalizeCliId(resolved.effectiveCliId)
    const buf = sessions.get(sessionScopeKey(projectDir, effectiveCliId))?.buffer ?? ''
    ptyLog('session:buffer-get', projectDir, { bytes: buf.length, cliId: effectiveCliId })
    return { success: true, data: buf }
  })

  ipcMain.handle('pty:clear-session', async (_event, projectDir: string, cliId?: string) => {
    const resolved = resolveCliProvider(cliId)
    await clearPtySession(projectDir, normalizeCliId(resolved.effectiveCliId))
    return { success: true, data: undefined }
  })

  ipcMain.handle('pty:has-session', (_event, projectDir: string, cliId?: string) => {
    // Only checks for an active in-memory process; file marker is only for --continue
    const resolved = resolveCliProvider(cliId)
    const effectiveCliId = normalizeCliId(resolved.effectiveCliId)
    return { success: true, data: sessions.has(sessionScopeKey(projectDir, effectiveCliId)) }
  })
}
