import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, Trash2, Power, Save, X, AlertCircle, Server,
  Globe, Cpu, ExternalLink, RefreshCw, ShieldCheck, ShieldAlert, Info,
  Loader2, CheckCircle2, RotateCcw, Terminal, Eye, EyeOff, FileJson,
} from 'lucide-react'
import { readMcpConfig, writeMcpConfig } from '../api/mcp'
import type { MCPConfig, MCPServerConfig } from '../types/mcp.types'
import type { InstalledPluginInfo } from '../types/electron'
import { TerminalPanel } from '../components/terminal/TerminalPanel'

// ─── Row types ────────────────────────────────────────────────────────────────
interface ArgRow { id: string; value: string }
interface KVRow  { id: string; key: string; value: string; masked: boolean }

// ─── Form state ───────────────────────────────────────────────────────────────
interface FormState {
  name: string
  serverType: 'command' | 'remote'
  command: string
  args: ArgRow[]
  env: KVRow[]
  url: string
  headers: KVRow[]
  disabled: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9)

function isSensitive(key: string) {
  return /key|token|secret|password|pass|auth|credential/i.test(key)
}

const EMPTY_FORM: FormState = {
  name: '', serverType: 'command',
  command: '', args: [], env: [],
  url: '', headers: [],
  disabled: false,
}

function configToForm(name: string, srv: MCPServerConfig): FormState {
  if (srv.url) {
    return {
      ...EMPTY_FORM, name, serverType: 'remote',
      url: srv.url,
      headers: Object.entries(srv.headers ?? {}).map(([key, value]) => ({
        id: uid(), key, value, masked: isSensitive(key),
      })),
      disabled: srv.disabled ?? false,
    }
  }
  return {
    ...EMPTY_FORM, name, serverType: 'command',
    command: srv.command ?? '',
    args: (srv.args ?? []).map(v => ({ id: uid(), value: v })),
    env: Object.entries(srv.env ?? {}).map(([key, value]) => ({
      id: uid(), key, value, masked: isSensitive(key),
    })),
    disabled: srv.disabled ?? false,
  }
}

function formToConfig(form: FormState): MCPServerConfig {
  const base = form.disabled ? { disabled: true as const } : {}
  if (form.serverType === 'remote') {
    const headers: Record<string, string> = {}
    form.headers.filter(r => r.key.trim()).forEach(r => { headers[r.key.trim()] = r.value })
    return {
      ...base,
      type: 'http' as const,
      url: form.url.trim(),
      ...(Object.keys(headers).length ? { headers } : {}),
    }
  }
  const env: Record<string, string> = {}
  form.env.filter(r => r.key.trim()).forEach(r => { env[r.key.trim()] = r.value })
  return {
    ...base,
    command: form.command.trim(),
    args: form.args.map(a => a.value).filter(Boolean),
    ...(Object.keys(env).length ? { env } : {}),
  }
}

function parseJsonImport(raw: string): { name?: string; patch: Partial<FormState> } | null {
  try {
    const parsed = JSON.parse(raw)
    let config: Record<string, unknown> | null = null
    let name = ''

    if (parsed?.mcpServers && typeof parsed.mcpServers === 'object') {
      const entries = Object.entries(parsed.mcpServers as Record<string, unknown>)
      if (entries.length) [name, config] = entries[0] as [string, Record<string, unknown>]
    } else if (parsed?.command || parsed?.url) {
      config = parsed
    } else {
      const entries = Object.entries(parsed ?? {})
      if (entries.length === 1 && typeof entries[0][1] === 'object') {
        [name, config] = entries[0] as [string, Record<string, unknown>]
      }
    }
    if (!config) return null

    const patch: Partial<FormState> = {}
    if (config.url) {
      patch.serverType = 'remote'
      patch.url = String(config.url)
      if (config.headers && typeof config.headers === 'object') {
        patch.headers = Object.entries(config.headers as Record<string, string>).map(([key, value]) => ({
          id: uid(), key, value, masked: isSensitive(key),
        }))
      }
    } else {
      patch.serverType = 'command'
      patch.command = String(config.command ?? '')
      patch.args = ((config.args as string[]) ?? []).map(v => ({ id: uid(), value: v }))
      if (config.env && typeof config.env === 'object') {
        patch.env = Object.entries(config.env as Record<string, string>).map(([key, value]) => ({
          id: uid(), key, value, masked: isSensitive(key),
        }))
      }
    }
    if (typeof config.disabled === 'boolean') patch.disabled = config.disabled
    return { name: name || undefined, patch }
  } catch { return null }
}

// ─── JsonImportPanel ──────────────────────────────────────────────────────────
function JsonImportPanel({ onImport, onClose }: {
  onImport: (result: { name?: string; patch: Partial<FormState> }) => void
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="rounded-xl border border-orange-500/25 bg-orange-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileJson size={13} className="text-orange-400" />
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">粘贴 JSON 配置</span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            支持单个 server 配置或完整 mcp.json
          </span>
        </div>
        <button onClick={onClose} className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded">
          <X size={12} />
        </button>
      </div>
      <textarea
        value={text}
        onChange={e => { setText(e.target.value); setError(null) }}
        placeholder={'{\n  "command": "npx",\n  "args": ["-y", "@scope/package"],\n  "env": { "API_KEY": "..." }\n}'}
        rows={6}
        autoFocus
        className="w-full text-xs font-mono bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
      />
      {error && (
        <p className="text-[11px] text-red-400 flex items-center gap-1.5">
          <AlertCircle size={11} />{error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            const result = parseJsonImport(text)
            if (!result) { setError('无法识别格式，请确认是合法的 MCP 配置 JSON'); return }
            onImport(result)
            onClose()
          }}
          disabled={!text.trim()}
          className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors"
        >
          解析并填入
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  )
}

// ─── ArgsEditor ───────────────────────────────────────────────────────────────
function ArgsEditor({ args, onChange }: { args: ArgRow[]; onChange: (args: ArgRow[]) => void }) {
  const refsMap = useRef<Map<string, HTMLInputElement>>(new Map())

  const add = () => {
    const row: ArgRow = { id: uid(), value: '' }
    onChange([...args, row])
    setTimeout(() => refsMap.current.get(row.id)?.focus(), 30)
  }
  const update = (id: string, value: string) =>
    onChange(args.map(a => a.id === id ? { ...a, value } : a))
  const remove = (id: string, idx: number) => {
    onChange(args.filter(a => a.id !== id))
    if (idx > 0) setTimeout(() => refsMap.current.get(args[idx - 1].id)?.focus(), 30)
  }

  return (
    <div className="space-y-1.5">
      {args.map((arg, idx) => (
        <div key={arg.id} className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-300 dark:text-gray-700 w-4 text-right tabular-nums shrink-0 select-none">
            {idx + 1}
          </span>
          <input
            ref={el => el ? refsMap.current.set(arg.id, el) : refsMap.current.delete(arg.id)}
            value={arg.value}
            onChange={e => update(arg.id, e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); add() }
              if (e.key === 'Backspace' && !arg.value) { e.preventDefault(); remove(arg.id, idx) }
            }}
            placeholder={idx === 0 ? '-y' : idx === 1 ? '@scope/package' : `参数 ${idx + 1}`}
            className="flex-1 text-xs font-mono bg-white dark:bg-gray-950 ring-1 ring-inset ring-gray-200 dark:ring-gray-700 rounded-md px-2.5 py-1.5 text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-400 transition-shadow"
          />
          <button
            onClick={() => remove(arg.id, idx)}
            className="p-1 text-gray-300 dark:text-gray-700 hover:text-red-400 rounded shrink-0 transition-colors"
          >
            <X size={11} />
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 hover:text-orange-400 transition-colors ml-6 mt-0.5"
      >
        <Plus size={11} /> 添加参数
      </button>
    </div>
  )
}

// ─── KVEditor ─────────────────────────────────────────────────────────────────
function KVEditor({ rows, onChange, addLabel = '添加变量' }: {
  rows: KVRow[]
  onChange: (rows: KVRow[]) => void
  addLabel?: string
}) {
  const add = () => onChange([...rows, { id: uid(), key: '', value: '', masked: false }])
  const upd = (id: string, field: 'key' | 'value', val: string) =>
    onChange(rows.map(r => {
      if (r.id !== id) return r
      const next = { ...r, [field]: val }
      if (field === 'key') next.masked = isSensitive(val)
      return next
    }))
  const toggle = (id: string) => onChange(rows.map(r => r.id === id ? { ...r, masked: !r.masked } : r))
  const remove = (id: string) => onChange(rows.filter(r => r.id !== id))

  return (
    <div className="space-y-1.5">
      {rows.length > 0 && (
        <div className="grid gap-1.5 mb-0.5" style={{ gridTemplateColumns: '1fr 1fr auto auto' }}>
          <span className="text-[9px] uppercase tracking-wider text-gray-400 dark:text-gray-600 px-1">键</span>
          <span className="text-[9px] uppercase tracking-wider text-gray-400 dark:text-gray-600 px-1">值</span>
          <span /><span />
        </div>
      )}
      {rows.map(row => (
        <div key={row.id} className="grid gap-1.5 items-center" style={{ gridTemplateColumns: '1fr 1fr auto auto' }}>
          <input
            value={row.key}
            onChange={e => upd(row.id, 'key', e.target.value)}
            placeholder="KEY"
            className="text-xs font-mono bg-white dark:bg-gray-950 ring-1 ring-inset ring-gray-200 dark:ring-gray-700 rounded-md px-2.5 py-1.5 text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-400 transition-shadow"
          />
          <input
            value={row.value}
            onChange={e => upd(row.id, 'value', e.target.value)}
            type={row.masked ? 'password' : 'text'}
            placeholder="value"
            className="text-xs font-mono bg-white dark:bg-gray-950 ring-1 ring-inset ring-gray-200 dark:ring-gray-700 rounded-md px-2.5 py-1.5 text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-400 transition-shadow"
          />
          <button
            onClick={() => toggle(row.id)}
            title={row.masked ? '显示值' : '隐藏值'}
            className={`p-1 rounded shrink-0 transition-colors ${row.masked ? 'text-orange-400 hover:text-orange-500' : 'text-gray-300 dark:text-gray-700 hover:text-gray-500 dark:hover:text-gray-400'}`}
          >
            {row.masked ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
          <button
            onClick={() => remove(row.id)}
            className="p-1 text-gray-300 dark:text-gray-700 hover:text-red-400 rounded shrink-0 transition-colors"
          >
            <X size={11} />
          </button>
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 hover:text-orange-400 transition-colors mt-0.5">
        <Plus size={11} /> {addLabel}
      </button>
    </div>
  )
}

// ─── TypeSwitcher ─────────────────────────────────────────────────────────────
function TypeSwitcher({ value, onChange }: {
  value: 'command' | 'remote'
  onChange: (v: 'command' | 'remote') => void
}) {
  const options: ['command' | 'remote', React.ElementType, string][] = [
    ['command', Terminal, '本地命令'],
    ['remote', Globe, '远程 HTTP'],
  ]
  return (
    <div className="inline-flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5">
      {options.map(([v, Icon, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            value === v
              ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Icon size={12} />
          {label}
        </button>
      ))}
    </div>
  )
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500 mb-2.5">
      {children}
    </p>
  )
}


// ─── PluginMcpPanel ───────────────────────────────────────────────────────────
type AuthStep = 'idle' | 'starting' | 'waiting' | 'verifying' | 'done' | 'error'

function needsAuth(pluginName: string, authCache: Record<string, { timestamp: number }>): boolean {
  return Object.keys(authCache).some(k => k.startsWith(`plugin:${pluginName}:`))
}

function PluginMcpPanel({
  plugin, authCache, onToggleEnabled, onClose, onAuthDone,
}: {
  plugin: InstalledPluginInfo
  authCache: Record<string, { timestamp: number }>
  onToggleEnabled: (plugin: InstalledPluginInfo) => void
  onClose: () => void
  onAuthDone: () => void
}) {
  const mcp = plugin.mcpServer!
  const isAuthNeeded = needsAuth(plugin.pluginName, authCache)
  const authedKey = `mcp-authed-${plugin.pluginKey}`
  const [wasAuthed] = useState(() => localStorage.getItem(authedKey) === '1')
  const [authStep, setAuthStep] = useState<AuthStep>('idle')
  const [authError, setAuthError] = useState<string | null>(null)
  const [terminalDir, setTerminalDir] = useState<string | null>(null)
  const [terminalKey, setTerminalKey] = useState(0)
  const [autoOpenedUrl, setAutoOpenedUrl] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const ptyUnsubRef = useRef<(() => void) | null>(null)
  const verifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mcpOutputRef = useRef('')

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  const stopPtyListener = () => {
    if (ptyUnsubRef.current) { ptyUnsubRef.current(); ptyUnsubRef.current = null }
    if (verifyTimerRef.current) { clearTimeout(verifyTimerRef.current); verifyTimerRef.current = null }
    mcpOutputRef.current = ''
  }

  useEffect(() => () => { stopPolling(); stopPtyListener() }, [])
  useEffect(() => {
    stopPolling(); stopPtyListener()
    setAuthStep('idle'); setAuthError(null); setTerminalDir(null); setAutoOpenedUrl(null)
  }, [plugin.pluginKey])
  useEffect(() => { if (isAuthNeeded) localStorage.removeItem(authedKey) }, [isAuthNeeded, authedKey])

  useEffect(() => {
    if (authStep !== 'verifying') return
    mcpOutputRef.current = ''
    verifyTimerRef.current = setTimeout(async () => {
      if (terminalDir) await window.electronAPI.pty.write(terminalDir, '/mcp\n')
      stopPtyListener()
      ptyUnsubRef.current = terminalDir ? window.electronAPI.pty.onData(terminalDir, chunk => {
        const clean = chunk.replace(/\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
        mcpOutputRef.current += clean
        if (/figma[^\n]*(connected|running|active)/i.test(mcpOutputRef.current)) {
          stopPtyListener()
          localStorage.setItem(authedKey, '1')
          setAuthStep('done')
          setTerminalDir(null)
          onAuthDone()
        }
      }) : null
    }, 1500)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStep])

  const startPolling = () => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      const authResult = await window.electronAPI.plugins.getAuthStatus()
      if (authResult.success) {
        const stillNeeds = Object.keys(authResult.data).some(k => k.startsWith(`plugin:${plugin.pluginName}:`))
        if (!stillNeeds) { stopPolling(); setAuthStep('verifying'); onAuthDone() }
      }
    }, 3000)
  }

  const startAuth = async () => {
    setAuthStep('starting'); setAuthError(null); setAutoOpenedUrl(null)
    try {
      const homeResult = await window.electronAPI.shell.run('echo $HOME')
      const homeDir = homeResult.output.trim() || '~'
      setTerminalDir(homeDir); setTerminalKey(k => k + 1)
      setAuthStep('waiting'); startPolling()
      stopPtyListener()
      ptyUnsubRef.current = window.electronAPI.pty.onData(homeDir, chunk => {
        const clean = chunk.replace(/\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
        const match = clean.match(/https?:\/\/[^\s\r\n"'<>\\]+/)
        if (match) {
          const url = match[0].replace(/[.,;:!?)]+$/, '')
          if (/oauth|authorize|auth/i.test(url) || url.includes(plugin.pluginName)) {
            window.electronAPI.skills.openUrl(url).catch(() => {})
            setAutoOpenedUrl(url)
          }
        }
      })
    } catch (e) { setAuthStep('error'); setAuthError(String(e)) }
  }

  const cancelAuth = () => {
    stopPolling(); stopPtyListener()
    if (terminalDir) window.electronAPI.pty.kill(terminalDir).catch(() => {})
    setAuthStep('idle'); setTerminalDir(null); setAutoOpenedUrl(null)
  }

  return (
    <div className={`p-6 ${terminalDir ? '' : 'max-w-2xl'}`}>
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {mcp.type === 'remote'
              ? <Globe size={16} className="text-blue-400" />
              : <Cpu size={16} className="text-purple-400" />
            }
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 font-mono">{plugin.pluginName}</h2>
            <span className="text-[10px] text-gray-400 dark:text-gray-600 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
              {mcp.type === 'remote' ? '远程 HTTP' : '本地命令'}
            </span>
            <span className="text-[10px] text-gray-500 dark:text-gray-700">via {plugin.marketplace}</span>
          </div>
          {mcp.title && <p className="text-sm text-gray-500 dark:text-gray-400">{mcp.title}</p>}
          {mcp.description && <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">{mcp.description}</p>}
        </div>
        <button onClick={onClose} className="p-1.5 text-gray-400 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 rounded">
          <X size={14} />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
            {mcp.type === 'remote' ? '连接地址' : '启动命令'}
          </p>
          <code className="block text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 font-mono">
            {mcp.url ?? mcp.command}
          </code>
        </div>

        <div>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">授权状态</p>
          {mcp.type === 'remote' ? (
            <div className={`flex items-start gap-3 p-3 rounded-lg border ${
              authStep === 'done' || (wasAuthed && !isAuthNeeded) ? 'bg-green-500/10 border-green-500/30'
              : authStep === 'verifying' ? 'bg-blue-500/10 border-blue-500/30'
              : isAuthNeeded ? 'bg-amber-500/10 border-amber-500/30'
              : 'bg-gray-100/60 dark:bg-gray-800/50 border-gray-300 dark:border-gray-700'
            }`}>
              {authStep === 'done' || (wasAuthed && !isAuthNeeded) ? <CheckCircle2 size={16} className="text-green-400 mt-0.5 shrink-0" />
               : authStep === 'verifying' ? <ShieldCheck size={16} className="text-blue-400 mt-0.5 shrink-0" />
               : isAuthNeeded ? <ShieldAlert size={16} className="text-amber-400 mt-0.5 shrink-0" />
               : <ShieldCheck size={16} className="text-gray-500 dark:text-gray-400 mt-0.5 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${
                  authStep === 'done' || (wasAuthed && !isAuthNeeded) ? 'text-green-400'
                  : authStep === 'verifying' ? 'text-blue-400'
                  : isAuthNeeded ? 'text-amber-400'
                  : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {authStep === 'done' ? '授权成功！MCP 已连接'
                   : wasAuthed && !isAuthNeeded ? '已授权，连接正常'
                   : authStep === 'verifying' ? '正在验证连接状态…'
                   : isAuthNeeded ? '需要授权'
                   : '连接正常，无待授权请求'}
                </p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                  {authStep === 'done' ? '已确认 OAuth 授权完成，Claude Code 会话将自动使用新的授权。'
                   : wasAuthed && !isAuthNeeded ? '之前已完成 OAuth 授权，Claude Code 可正常使用此 MCP。若遇到连接问题，可在 Claude Code 会话中运行 /mcp 重新检测。'
                   : authStep === 'verifying' ? '正在自动运行 /mcp 验证连接状态…如未自动检测到，可在终端手动运行 /mcp 并点击下方按钮确认。'
                   : isAuthNeeded ? '此远程 MCP 需要 OAuth 授权。点击下方按钮在 App 内打开终端并启动 Claude Code，系统会弹出浏览器完成授权。'
                   : 'Claude Code 未检测到待授权请求，MCP 应可正常使用。如需重新授权，在 Claude Code 会话中运行 /mcp 命令。'}
                </p>
                {authStep === 'verifying' && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => { localStorage.setItem(authedKey, '1'); setAuthStep('done'); setTerminalDir(null) }}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 text-[11px] font-medium rounded transition-colors"
                    >
                      <CheckCircle2 size={11} /> /mcp 显示已连接，确认成功
                    </button>
                    <button
                      onClick={() => setAuthStep('waiting')}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 text-[11px] rounded transition-colors"
                    >
                      <RotateCcw size={11} /> 未成功，继续等待
                    </button>
                  </div>
                )}
                {isAuthNeeded && authStep !== 'done' && authStep !== 'verifying' && (
                  <div className="mt-3">
                    {authStep === 'idle' && (
                      <button onClick={startAuth} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded transition-colors">
                        <Terminal size={12} /> 开始授权（在 App 内打开终端）
                      </button>
                    )}
                    {authStep === 'starting' && (
                      <div className="flex items-center gap-2 text-[11px] text-amber-400">
                        <Loader2 size={12} className="animate-spin" /> 正在启动终端…
                      </div>
                    )}
                    {authStep === 'waiting' && (
                      <div className="space-y-1.5">
                        {autoOpenedUrl ? (
                          <div className="flex items-center gap-2 text-[11px] text-blue-400">
                            <CheckCircle2 size={12} className="shrink-0" />
                            <span>已自动打开浏览器，请完成授权后返回</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-[11px] text-amber-400">
                            <Loader2 size={12} className="animate-spin shrink-0" />
                            <span>等待 Claude Code 触发 OAuth 授权…</span>
                          </div>
                        )}
                        <button onClick={cancelAuth} className="text-[10px] text-gray-400 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 underline">
                          取消
                        </button>
                      </div>
                    )}
                    {authStep === 'error' && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-red-400">{authError}</p>
                        <button onClick={startAuth} className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                          <RotateCcw size={10} /> 重试
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500 bg-gray-100/60 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2">
              <Info size={12} /> 本地 MCP 服务器无需授权，由 Claude Code 直接启动
            </div>
          )}
        </div>

        {isAuthNeeded && (authStep === 'idle' || authStep === 'error') && (
          <div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">授权流程说明</p>
            <ol className="space-y-2">
              {[
                '点击「开始授权」，在下方打开内嵌终端并自动启动 Claude Code',
                '在终端中向 Claude 发送任意一条消息（如 "hello"）',
                'Claude Code 检测到未授权的 MCP 后，自动弹出浏览器授权页面',
                `在浏览器中完成 ${plugin.pluginName} 账号授权，此页面自动更新（全局生效）`,
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[11px] text-gray-500 dark:text-gray-400">
                  <span className="flex-none w-4 h-4 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-[9px] text-gray-400 dark:text-gray-500 flex items-center justify-center font-medium mt-0.5">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}

        {terminalDir && (authStep === 'waiting' || authStep === 'verifying') && (
          <div className="border border-amber-500/30 rounded-lg overflow-hidden" style={{ height: 320 }}>
            <div className="flex items-center justify-between px-3 py-1.5 bg-white dark:bg-gray-900 border-b border-amber-500/20 shrink-0">
              <div className="flex items-center gap-2">
                <Loader2 size={10} className="animate-spin text-amber-400" />
                <span className="text-[10px] text-amber-400 font-mono">
                  {authStep === 'verifying' ? 'claude — 请输入 /mcp 验证 figma 连接状态' : 'claude — 发送任意消息触发 MCP OAuth 授权'}
                </span>
              </div>
              <button onClick={cancelAuth} className="text-gray-400 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 p-0.5 rounded">
                <X size={12} />
              </button>
            </div>
            <div style={{ height: 282 }}>
              <TerminalPanel key={terminalKey} projectDir={terminalDir} newSession={true} />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {mcp.repositoryUrl && (
            <button
              onClick={() => window.open(mcp.repositoryUrl)}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 hover:text-white rounded transition-colors"
            >
              <ExternalLink size={11} /> 查看文档 / 授权说明
            </button>
          )}
          {mcp.type === 'remote' && (
            <button
              onClick={() => window.open(mcp.url)}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 rounded transition-colors"
            >
              <Globe size={11} /> MCP 服务地址
            </button>
          )}
        </div>

        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-700 dark:text-gray-300">插件状态</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-0.5">
                控制 Claude Code 是否加载此插件（写入 settings.json enabledPlugins）
              </p>
            </div>
            <button
              onClick={() => onToggleEnabled(plugin)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                plugin.enabled
                  ? 'bg-green-500/15 text-green-400 hover:bg-red-500/15 hover:text-red-400'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:bg-green-500/15 hover:text-green-400'
              }`}
            >
              <Power size={11} />
              {plugin.enabled ? '已启用（点击禁用）' : '已禁用（点击启用）'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── McpPage ──────────────────────────────────────────────────────────────────
export default function McpPage() {
  const [config, setConfig] = useState<MCPConfig>({ mcpServers: {} })
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedOk, setSavedOk] = useState(false)
  const [showJsonImport, setShowJsonImport] = useState(false)
  const [toggleNotice, setToggleNotice] = useState<{ action: string; tip: string; cmd?: string } | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [pluginMcps, setPluginMcps] = useState<InstalledPluginInfo[]>([])
  const [authCache, setAuthCache] = useState<Record<string, { timestamp: number }>>({})
  const [selectedPlugin, setSelectedPlugin] = useState<InstalledPluginInfo | null>(null)
  const [loadingPlugins, setLoadingPlugins] = useState(false)

  const showNotice = useCallback((action: string, tip: string, cmd?: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setToggleNotice({ action, tip, cmd })
    noticeTimer.current = setTimeout(() => setToggleNotice(null), 6000)
  }, [])

  const reload = useCallback(async () => {
    const cfg = await readMcpConfig()
    setConfig(cfg)
  }, [])

  const reloadPlugins = useCallback(async () => {
    setLoadingPlugins(true)
    try {
      const [instResult, authResult] = await Promise.all([
        window.electronAPI.plugins.listInstalled(),
        window.electronAPI.plugins.getAuthStatus(),
      ])
      if (instResult.success) setPluginMcps(instResult.data.filter(p => p.mcpServer !== null))
      if (authResult.success) setAuthCache(authResult.data)
    } finally { setLoadingPlugins(false) }
  }, [])

  useEffect(() => { reload(); reloadPlugins() }, [reload, reloadPlugins])

  const serverNames = Object.keys(config.mcpServers)

  const openServer = (name: string) => {
    // Don't reset the form if already editing this server (preserve unsaved edits)
    if (name === selectedName && !isNew) {
      setSelectedPlugin(null)
      return
    }
    setSelectedName(name)
    setSelectedPlugin(null)
    setIsNew(false)
    setError(null)
    setSavedOk(false)
    setShowJsonImport(false)
    setForm(configToForm(name, config.mcpServers[name]))
  }

  const openNew = () => {
    setSelectedName(null)
    setSelectedPlugin(null)
    setIsNew(true)
    setError(null)
    setSavedOk(false)
    setShowJsonImport(false)
    setForm(EMPTY_FORM)
  }

  const handleClose = () => { setSelectedName(null); setIsNew(false); setShowJsonImport(false) }

  const handleJsonImport = ({ name, patch }: { name?: string; patch: Partial<FormState> }) => {
    setForm(prev => ({ ...prev, ...patch, name: name ?? prev.name }))
  }

  const handleSave = async () => {
    setSaving(true); setError(null); setSavedOk(false)
    try {
      const serverName = form.name.trim()
      if (!serverName) { setError('服务器名称不能为空'); setSaving(false); return }
      if (form.serverType === 'command' && !form.command.trim()) {
        setError('命令不能为空'); setSaving(false); return
      }
      if (form.serverType === 'remote' && !form.url.trim()) {
        setError('连接地址不能为空'); setSaving(false); return
      }
      // For new: check no collision; for rename: check not colliding with a different existing server
      const isRename = !isNew && selectedName !== serverName
      if ((isNew || isRename) && config.mcpServers[serverName] && serverName !== selectedName) {
        setError('名称已存在'); setSaving(false); return
      }

      const newConfig: MCPConfig = { ...config, mcpServers: { ...config.mcpServers } }
      // Handle rename: remove old key if name changed
      if (!isNew && selectedName && selectedName !== serverName) {
        delete newConfig.mcpServers[selectedName]
      }
      newConfig.mcpServers[serverName] = formToConfig(form)

      await writeMcpConfig(newConfig)
      setConfig(newConfig)
      setSelectedName(serverName)
      setIsNew(false)
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2500)
    } catch (e) { setError(String(e)) }
    finally { setSaving(false) }
  }

  const handleDelete = async (name: string) => {
    if (!confirm(`删除 MCP Server "${name}"？`)) return
    const newConfig: MCPConfig = { ...config, mcpServers: { ...config.mcpServers } }
    delete newConfig.mcpServers[name]
    await writeMcpConfig(newConfig)
    setConfig(newConfig)
    if (selectedName === name) handleClose()
  }

  const handleToggleDisabled = async (name: string) => {
    const srv = config.mcpServers[name]
    const nowDisabled = !srv.disabled
    const newConfig: MCPConfig = {
      ...config,
      mcpServers: { ...config.mcpServers, [name]: { ...srv, disabled: nowDisabled } },
    }
    await writeMcpConfig(newConfig)
    setConfig(newConfig)
    if (selectedName === name) setForm(f => ({ ...f, disabled: nowDisabled }))
    showNotice(
      nowDisabled ? `"${name}" 已禁用` : `"${name}" 已启用`,
      '开启新会话后生效',
    )
  }

  const handleTogglePluginEnabled = async (plugin: InstalledPluginInfo) => {
    const newEnabled = !plugin.enabled
    await window.electronAPI.plugins.setEnabled(plugin.pluginKey, newEnabled)

    // Also move the plugin's MCP server between active/disabled in ~/.claude.json
    // so Claude Code CLI actually stops loading it
    const serverName = plugin.mcpServer?.name
    if (serverName && config.mcpServers[serverName] !== undefined) {
      const newConfig: MCPConfig = {
        ...config,
        mcpServers: { ...config.mcpServers, [serverName]: { ...config.mcpServers[serverName], disabled: !newEnabled } },
      }
      await writeMcpConfig(newConfig)
      setConfig(newConfig)
    }

    const updated = { ...plugin, enabled: newEnabled }
    setPluginMcps(prev => prev.map(p => p.pluginKey === plugin.pluginKey ? updated : p))
    setSelectedPlugin(updated)
    showNotice(
      newEnabled ? `"${plugin.pluginName}" 插件已启用` : `"${plugin.pluginName}" 插件已禁用`,
      '在当前会话中运行',
      '/reload-plugins 即可生效',
    )
  }

  const showingPlugin = selectedPlugin !== null
  const showingManual = !showingPlugin && (selectedName !== null || isNew)

  // Cmd+S to save
  useEffect(() => {
    if (!showingManual) return
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSave() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showingManual, form])

  return (
    <div className="flex h-full">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <div className="w-60 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col shrink-0">

        {/* Manual section header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">手动配置</span>
          <button
            onClick={openNew}
            className="p-1 text-gray-400 dark:text-gray-500 hover:text-orange-500 hover:bg-orange-500/10 rounded transition-colors"
            title="添加 Server"
          >
            <Plus size={13} />
          </button>
        </div>

        {/* Manual server list */}
        <div className="border-b border-gray-200 dark:border-gray-800 py-1">
          {serverNames.length === 0 && (
            <p className="px-3 py-4 text-[11px] text-gray-400 dark:text-gray-600 text-center">
              暂无手动配置
              <br />
              <button onClick={openNew} className="text-orange-400 hover:text-orange-500 mt-1 inline-block">
                + 添加第一个
              </button>
            </p>
          )}
          {serverNames.map(name => {
            const srv = config.mcpServers[name]
            const isDisabled = srv.disabled ?? false
            const isRemote = !!srv.url
            const isSelected = selectedName === name && !isNew && !showingPlugin
            return (
              <div
                key={name}
                onClick={() => openServer(name)}
                className={`flex items-center gap-2 mx-1.5 px-2 py-2 cursor-pointer rounded-lg transition-colors ${
                  isSelected
                    ? 'bg-orange-500/15 text-orange-500'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                }`}
              >
                <div className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${
                  isSelected ? 'bg-orange-500/20' : 'bg-gray-100 dark:bg-gray-800'
                }`}>
                  {isRemote
                    ? <Globe size={11} className={isSelected ? 'text-orange-400' : 'text-gray-400 dark:text-gray-500'} />
                    : <Terminal size={11} className={isSelected ? 'text-orange-400' : 'text-gray-400 dark:text-gray-500'} />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate font-medium leading-tight ${isDisabled ? 'text-gray-400 dark:text-gray-500' : ''}`}>{name}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-600 truncate leading-tight">
                    {isRemote ? srv.url : srv.command}
                  </p>
                </div>
                <span
                  title={isDisabled ? '已禁用' : '已启用'}
                  className={`shrink-0 w-1.5 h-1.5 rounded-full ${isDisabled ? 'bg-gray-300 dark:bg-gray-600' : 'bg-green-400'}`}
                />
              </div>
            )
          })}
        </div>

        {/* Plugin MCP section */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">插件 MCP</span>
          <button
            onClick={reloadPlugins}
            disabled={loadingPlugins}
            className="p-1 text-gray-400 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 rounded disabled:opacity-50 transition-colors"
            title="刷新"
          >
            <RefreshCw size={11} className={loadingPlugins ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {pluginMcps.length === 0 && !loadingPlugins && (
            <p className="px-3 py-4 text-[11px] text-gray-400 dark:text-gray-600 text-center">
              无插件 MCP
              <br />
              <span className="text-[10px]">在插件市场安装含 MCP 的插件</span>
            </p>
          )}
          {pluginMcps.map(plugin => {
            const mcp = plugin.mcpServer!
            const isAuthNeeded = needsAuth(plugin.pluginName, authCache)
            const isSelected = selectedPlugin?.pluginKey === plugin.pluginKey
            return (
              <div
                key={plugin.pluginKey}
                onClick={() => { setSelectedPlugin(plugin); setSelectedName(null); setIsNew(false) }}
                className={`group flex items-center gap-2 mx-1.5 px-2 py-2 cursor-pointer rounded-lg transition-colors ${
                  isSelected ? 'bg-blue-500/15' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                } ${!plugin.enabled ? 'opacity-50' : ''}`}
              >
                <div className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${
                  isSelected ? 'bg-blue-500/20' : 'bg-gray-100 dark:bg-gray-800'
                }`}>
                  {mcp.type === 'remote'
                    ? <Globe size={11} className={isSelected ? 'text-blue-400' : 'text-gray-400 dark:text-gray-500'} />
                    : <Cpu size={11} className={isSelected ? 'text-blue-400' : 'text-gray-400 dark:text-gray-500'} />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className={`text-sm truncate font-medium leading-tight ${isSelected ? 'text-blue-400' : !plugin.enabled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                      {plugin.pluginName}
                    </span>
                    {isAuthNeeded && <span title="需要授权"><ShieldAlert size={10} className="text-amber-400 shrink-0" /></span>}
                  </div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-600 truncate leading-tight">
                    {mcp.type === 'remote' ? mcp.url : mcp.command}
                  </p>
                </div>
                <span
                  title={plugin.enabled ? '已启用' : '已禁用'}
                  className={`shrink-0 w-1.5 h-1.5 rounded-full ${plugin.enabled ? 'bg-green-400' : 'bg-gray-300 dark:bg-gray-600'}`}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col">

        {/* Toggle notice */}
        {toggleNotice && (
          <div className="flex items-center justify-between px-4 py-2 bg-blue-500/10 border-b border-blue-500/20 text-xs shrink-0">
            <span className="text-blue-400">{toggleNotice.action}</span>
            <div className="flex items-center gap-1.5 text-blue-300/70">
              <span>{toggleNotice.tip}</span>
              {toggleNotice.cmd && (
                <span className="font-mono bg-blue-500/20 px-1.5 py-0.5 rounded text-blue-200">
                  {toggleNotice.cmd}
                </span>
              )}
              <button onClick={() => setToggleNotice(null)} className="ml-1 text-blue-300/40 hover:text-blue-300 transition-colors">
                <X size={11} />
              </button>
            </div>
          </div>
        )}

        {showingPlugin ? (
          <div className="flex-1 overflow-y-auto">
            <PluginMcpPanel
              plugin={selectedPlugin!}
              authCache={authCache}
              onToggleEnabled={handleTogglePluginEnabled}
              onClose={() => setSelectedPlugin(null)}
              onAuthDone={reloadPlugins}
            />
          </div>
        ) : showingManual ? (
          <div className="flex flex-col h-full">
            {/* Form header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                {isNew ? '添加 MCP Server' : '编辑 Server'}
              </h2>
              <div className="flex items-center gap-2">
                {savedOk && (
                  <span className="flex items-center gap-1 text-xs text-green-400">
                    <CheckCircle2 size={12} /> 已保存
                  </span>
                )}
                {error && (
                  <span className="flex items-center gap-1 text-xs text-red-400">
                    <AlertCircle size={12} /> {error}
                  </span>
                )}
                {!isNew && selectedName && (
                  <button
                    onClick={() => handleToggleDisabled(selectedName)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                      form.disabled
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-green-400 hover:bg-green-500/10'
                        : 'bg-green-500/10 text-green-400 hover:bg-red-500/10 hover:text-red-400'
                    }`}
                    title={form.disabled ? '点击启用' : '点击禁用'}
                  >
                    <Power size={12} />
                    {form.disabled ? '已禁用' : '已启用'}
                  </button>
                )}
                <button
                  onClick={() => setShowJsonImport(v => !v)}
                  title="粘贴 JSON 配置"
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                    showJsonImport
                      ? 'bg-orange-500/15 text-orange-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-orange-400'
                  }`}
                >
                  <FileJson size={13} />
                  JSON 导入
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  title="保存 (⌘S)"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  <Save size={13} />
                  {saving ? '保存中…' : '保存'}
                </button>
                <button onClick={handleClose} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors">
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Form body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 max-w-2xl">

              {/* JSON Import Panel */}
              {showJsonImport && (
                <JsonImportPanel
                  onImport={handleJsonImport}
                  onClose={() => setShowJsonImport(false)}
                />
              )}

              {/* Name — first, it's the most important identity field */}
              <div>
                <SectionLabel>服务器名称 <span className="text-orange-400 normal-case">*</span></SectionLabel>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. my-server"
                  autoFocus={isNew}
                  className="w-full text-sm bg-white dark:bg-gray-950 ring-1 ring-inset ring-gray-200 dark:ring-gray-700 rounded-lg px-3 py-2 text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-orange-400 transition-shadow"
                />
                {!isNew && selectedName && form.name.trim() && form.name.trim() !== selectedName && (
                  <p className="text-[10px] text-amber-400 mt-1.5">
                    将以新名称「{form.name.trim()}」保存，原名称「{selectedName}」会被删除
                  </p>
                )}
              </div>

              {/* Type switcher */}
              <div>
                <SectionLabel>服务器类型</SectionLabel>
                <TypeSwitcher
                  value={form.serverType}
                  onChange={t => setForm(f => ({ ...f, serverType: t }))}
                />
              </div>

              {/* ── Command type fields ── */}
              {form.serverType === 'command' && (
                <>
                  <div>
                    <SectionLabel>启动命令 <span className="text-orange-400 normal-case">*</span></SectionLabel>
                    <input
                      value={form.command}
                      onChange={e => setForm(f => ({ ...f, command: e.target.value }))}
                      placeholder="e.g. npx / uvx / node"
                      className="w-full text-sm font-mono bg-white dark:bg-gray-950 ring-1 ring-inset ring-gray-200 dark:ring-gray-700 rounded-lg px-3 py-2 text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-orange-400 transition-shadow"
                    />
                  </div>

                  <div>
                    <SectionLabel>参数 (Args)</SectionLabel>
                    <p className="text-[10px] text-gray-400 dark:text-gray-600 mb-2.5">
                      每行一个参数，含空格的参数不会被拆分。回车添加下一行，退格删除空行。
                    </p>
                    <ArgsEditor args={form.args} onChange={args => setForm(f => ({ ...f, args }))} />
                  </div>

                  <div>
                    <SectionLabel>环境变量 (ENV)</SectionLabel>
                    <p className="text-[10px] text-gray-400 dark:text-gray-600 mb-2.5">
                      包含 key/token/secret 的键名会自动遮蔽值。
                    </p>
                    <KVEditor
                      rows={form.env}
                      onChange={env => setForm(f => ({ ...f, env }))}
                      addLabel="添加环境变量"
                    />
                  </div>
                </>
              )}

              {/* ── Remote type fields ── */}
              {form.serverType === 'remote' && (
                <>
                  <div>
                    <SectionLabel>连接地址 (URL) <span className="text-orange-400 normal-case">*</span></SectionLabel>
                    <input
                      value={form.url}
                      onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                      placeholder="https://mcp.example.com/sse"
                      className="w-full text-sm font-mono bg-white dark:bg-gray-950 ring-1 ring-inset ring-gray-200 dark:ring-gray-700 rounded-lg px-3 py-2 text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-orange-400 transition-shadow"
                    />
                  </div>

                  <div>
                    <SectionLabel>请求头 (Headers)</SectionLabel>
                    <KVEditor
                      rows={form.headers}
                      onChange={headers => setForm(f => ({ ...f, headers }))}
                      addLabel="添加请求头"
                    />
                  </div>
                </>
              )}

              {/* Delete — only for existing servers, inside scrollable body */}
              {!isNew && selectedName && (
                <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                  <button
                    onClick={() => handleDelete(selectedName)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 size={12} />
                    删除此服务器
                  </button>
                </div>
              )}

            </div>
          </div>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400 dark:text-gray-600">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <Server size={22} className="opacity-50" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-500">选择或添加 MCP 服务器</p>
              <p className="text-xs text-gray-400 dark:text-gray-600">手动配置的服务器可编辑，插件 MCP 可查看连接状态</p>
            </div>
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 text-xs font-medium rounded-lg transition-colors"
            >
              <Plus size={13} /> 添加 Server
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
