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

    const term = new Terminal({
      theme: theme === 'dark' ? DARK_THEME : LIGHT_THEME,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, monospace',
      fontSize: 13,
      lineHeight: 1.5,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
      windowsMode: window.electronAPI.platform === 'win32',
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)

    termRef.current = term
    fitAddonRef.current = fitAddon

    // 发送按键到对应的 PTY session
    term.onData((data) => {
      window.electronAPI.pty.write(projectDir, data).catch(() => {})
    })

    // 等浏览器完成布局后再 fit + 启动 PTY，确保尺寸准确，避免光标偏移
    requestAnimationFrame(() => {
      fitAddon.fit()

      // 先检查是否已有运行中的 session，有则重放缓冲区，无则启动新进程
      window.electronAPI.pty.hasSession(projectDir).then(async (r) => {
        const hasRunning = r.success && r.data

        if (hasRunning && !newSession) {
          // 重放历史输出
          const bufResult = await window.electronAPI.pty.getBuffer(projectDir)
          if (bufResult.success && bufResult.data) {
            term.write(bufResult.data, () => term.scrollToBottom())
          }
        } else {
          // 启动新 PTY 进程
          const result = await window.electronAPI.pty.create(projectDir, newSession, resumeId)
          if (!result.success) {
            term.write(`\r\n\x1b[31m错误：${(result as { error: string }).error}\x1b[0m\r\n`)
          }
        }
      }).catch((err: unknown) => {
        term.write(`\r\n\x1b[31m启动失败：${String(err)}\x1b[0m\r\n`)
      })
    })

    // 接收该 session 的 PTY 输出
    const unsubData = window.electronAPI.pty.onData(projectDir, (data) => {
      term.write(data)
    })

    const unsubExit = window.electronAPI.pty.onExit(projectDir, () => {
      term.write('\r\n\x1b[2m[进程已退出]\x1b[0m\r\n')
    })

    // 监听容器尺寸变化，自动 fit
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        const { cols, rows } = term
        window.electronAPI.pty.resize(projectDir, cols, rows).catch(() => {})
      } catch { /* ignore */ }
    })
    resizeObserver.observe(container)

    return () => {
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
