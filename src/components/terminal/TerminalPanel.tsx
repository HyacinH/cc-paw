import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useThemeStore } from '../../store/theme.store'

const DARK_THEME = {
  background: '#030712',
  foreground: '#f3f4f6',
  cursor: '#f97316',
  selectionBackground: '#f9731640',
  black: '#1f2937', brightBlack: '#374151',
  red: '#ef4444', brightRed: '#f87171',
  green: '#22c55e', brightGreen: '#4ade80',
  yellow: '#eab308', brightYellow: '#facc15',
  blue: '#3b82f6', brightBlue: '#60a5fa',
  magenta: '#a855f7', brightMagenta: '#c084fc',
  cyan: '#06b6d4', brightCyan: '#22d3ee',
  white: '#d1d5db', brightWhite: '#f9fafb',
}

const LIGHT_THEME = {
  background: '#faf6ef',
  foreground: '#2d2218',
  cursor: '#f97316',
  selectionBackground: '#f9731630',
  black: '#3d2e1e', brightBlack: '#6b5a47',
  red: '#c0392b', brightRed: '#e74c3c',
  green: '#27ae60', brightGreen: '#2ecc71',
  yellow: '#d68910', brightYellow: '#f39c12',
  blue: '#2471a3', brightBlue: '#2e86c1',
  magenta: '#7d3c98', brightMagenta: '#9b59b6',
  cyan: '#0e7a8a', brightCyan: '#17a589',
  white: '#5d4e3a', brightWhite: '#2d2218',
}

const PRE_READY_BUFFER_MAX = 1024 * 1024 // 1MB
const PRE_READY_FLUSH_CHUNK_SIZE = 8 * 1024 // 8KB

interface TerminalPanelProps {
  projectDir: string
  newSession: boolean
  resumeId?: string
}

export function TerminalPanel({ projectDir, newSession, resumeId }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const { theme } = useThemeStore()

  // Update terminal theme when light/dark mode changes
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = theme === 'dark' ? DARK_THEME : LIGHT_THEME
    }
  }, [theme])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    type TerminalState = 'booting' | 'starting' | 'live' | 'disposed'
    let state: TerminalState = 'booting'
    let preReadyBuffer = ''
    let preReadyTruncated = false
    let pendingFitTimer: ReturnType<typeof setTimeout> | null = null

    const isActive = () => state !== 'disposed'

    const log = (msg: string, extra?: Record<string, unknown>) =>
      console.debug(`[TerminalPanel] ${msg}`, { state, projectDir: projectDir.split(/[\\/]/).pop(), ...extra })

    const appendPreReadyBuffer = (data: string) => {
      preReadyBuffer += data
      if (preReadyBuffer.length > PRE_READY_BUFFER_MAX) {
        preReadyBuffer = preReadyBuffer.slice(preReadyBuffer.length - PRE_READY_BUFFER_MAX)
        if (!preReadyTruncated) log('pre-ready buffer truncated', { maxBytes: PRE_READY_BUFFER_MAX })
        preReadyTruncated = true
      }
    }

    const flushPreReadyBuffer = (term: Terminal) => {
      if (!preReadyBuffer) return
      const totalBytes = preReadyBuffer.length
      let offset = 0
      const buffer = preReadyBuffer
      preReadyBuffer = ''
      log('flushing pre-ready buffer', { bytes: totalBytes, truncated: preReadyTruncated })

      const writeChunk = () => {
        if (!isActive()) return
        const next = buffer.slice(offset, offset + PRE_READY_FLUSH_CHUNK_SIZE)
        if (!next) {
          term.scrollToBottom()
          return
        }
        offset += next.length
        term.write(next, writeChunk)
      }

      writeChunk()
    }

    const isWin = window.electronAPI.platform === 'win32'

    const term = new Terminal({
      theme: theme === 'dark' ? DARK_THEME : LIGHT_THEME,
      // On Windows, prefer fonts with robust CJK/emoji metrics to reduce cursor drift.
      // 'Cascadia Code' and 'Consolas' render more reliably in packaged Electron on Windows.
      fontFamily: isWin
        ? '"Cascadia Code", "Consolas", "JetBrains Mono", "Fira Code", monospace'
        : '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, monospace',
      fontSize: 13,
      // Windows: conservative lineHeight reduces cursor-drift amplification from DPI scaling.
      lineHeight: isWin ? 1.2 : 1.5,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
      windowsMode: isWin,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)
    log('mount', { projectDir, newSession, isWin, lineHeight: isWin ? 1.2 : 1.5 })

    termRef.current = term
    fitAddonRef.current = fitAddon

    // 发送按键到对应的 PTY session
    term.onData((data) => {
      if (state !== 'live') return
      window.electronAPI.pty.write(projectDir, data).catch(() => {})
    })

    // 接收该 session 的 PTY 输出（booting/starting 时缓存，live 时直写）
    const unsubData = window.electronAPI.pty.onData(projectDir, (data) => {
      if (!isActive()) return
      if (state !== 'live') {
        appendPreReadyBuffer(data)
        return
      }
      term.write(data)
    })

    const unsubExit = window.electronAPI.pty.onExit(projectDir, () => {
      if (!isActive()) return
      if (state !== 'live') {
        appendPreReadyBuffer('\r\n\x1b[2m[进程已退出]\x1b[0m\r\n')
        return
      }
      term.write('\r\n\x1b[2m[进程已退出]\x1b[0m\r\n')
    })
    log('listeners attached')

    const ensureReadyThenStart = async () => {
      if (!isActive()) return

      // 等容器尺寸可用 (state: booting)
      let attempts = 0
      while (isActive() && attempts < 20) {
        const rect = container.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) break
        attempts += 1
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }
      if (!isActive()) return
      log('container ready', { width: container.getBoundingClientRect().width, height: container.getBoundingClientRect().height, attempts })

      // 首次 fit + resize
      try {
        fitAddon.fit()
        await window.electronAPI.pty.resize(projectDir, term.cols, term.rows)
        log('first fit+resize', { cols: term.cols, rows: term.rows })
      } catch {
        // ignore
      }
      if (!isActive()) return

      // booting → starting：尺寸已同步，开始启动 PTY
      state = 'starting'

      // 第二次 fit + resize（下一轮事件循环）
      pendingFitTimer = setTimeout(() => {
        pendingFitTimer = null
        if (!isActive()) return
        try {
          fitAddon.fit()
          const { cols, rows } = term
          window.electronAPI.pty.resize(projectDir, cols, rows).catch(() => {})
          log('second fit+resize', { cols, rows })
        } catch {
          // ignore
        }
      }, 16)

      // 先检查是否已有运行中的 session，有则重放缓冲区，无则启动新进程
      window.electronAPI.pty.hasSession(projectDir).then(async (r) => {
        if (!isActive()) return
        const hasRunning = r.success && r.data

        if (hasRunning && !newSession) {
          // 重放历史输出
          const bufResult = await window.electronAPI.pty.getBuffer(projectDir)
          if (!isActive()) return
          if (bufResult.success && bufResult.data) {
            appendPreReadyBuffer(bufResult.data)
          }
        } else {
          // 启动新 PTY 进程
          const result = await window.electronAPI.pty.create(projectDir, newSession, resumeId)
          if (!isActive()) return
          if (!result.success) {
            appendPreReadyBuffer(`\r\n\x1b[31m错误：${(result as { error: string }).error}\x1b[0m\r\n`)
          }
        }

        if (!isActive()) return
        // starting → live：PTY 就绪，可正常收发
        state = 'live'
        log('live — flushing buffer', { hasRunning, newSession })
        if (preReadyTruncated) {
          term.write('\r\n\x1b[33m[提示] 启动阶段输出较多，已截断最早部分内容。\x1b[0m\r\n')
        }
        flushPreReadyBuffer(term)
      }).catch((err: unknown) => {
        if (!isActive()) return
        appendPreReadyBuffer(`\r\n\x1b[31m启动失败：${String(err)}\x1b[0m\r\n`)
        state = 'live'
        flushPreReadyBuffer(term)
      })
    }

    void ensureReadyThenStart()

    // 监听容器尺寸变化，自动 fit
    const resizeObserver = new ResizeObserver(() => {
      if (!isActive()) return
      try {
        fitAddon.fit()
        const { cols, rows } = term
        window.electronAPI.pty.resize(projectDir, cols, rows).catch(() => {})
      } catch { /* ignore */ }
    })
    resizeObserver.observe(container)

    return () => {
      log('unmount — disposing')
      state = 'disposed'
      if (pendingFitTimer !== null) {
        clearTimeout(pendingFitTimer)
        pendingFitTimer = null
      }
      unsubData()
      unsubExit()
      resizeObserver.disconnect()
      // 注意：不 kill PTY，保持 session 在后台运行
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
    }
  // resumeId is intentionally omitted from deps: ProjectPage forces a full remount via
  // key={`${projectDir}-${sessionKey}`} whenever resumeId changes, so the effect always
  // runs fresh with the correct value. eslint-disable covers the omission.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectDir, newSession])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ padding: '8px' }}
    />
  )
}
