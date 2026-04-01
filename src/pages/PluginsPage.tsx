import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Search, ExternalLink, Loader2, AlertCircle, Package,
  RefreshCw, Terminal, ChevronDown, ChevronUp, CheckCircle2,
  XCircle, Play, RotateCcw, Power, Globe, Cpu, BookOpen, Zap,
} from 'lucide-react'
import { openExternalUrl } from '../api/skills'
import type { InstalledPluginInfo } from '../types/electron'

interface MarketplacePlugin {
  name: string
  description?: string
  category?: string
  homepage?: string
  author?: { name: string; email?: string }
  tags?: string[]
}

interface InstallLog {
  pluginName: string
  command: string
  output: string
  success: boolean
  running: boolean
}

const MARKETPLACE_URL =
  'https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json'

const CATEGORY_LABELS: Record<string, string> = {
  development: '开发工具',
  productivity: '效率',
  security: '安全',
  data: '数据',
  location: '位置服务',
  communication: '通信',
  deployment: '部署',
  monitoring: '监控',
  design: '设计',
  testing: '测试',
}


// ── Install log panel ─────────────────────────────────────────────────────────
function InstallLogPanel({ log, onClose }: { log: InstallLog; onClose: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [log.output])

  return (
    <div className="border-t border-gray-200 dark:border-gray-800 bg-[#030712] shrink-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200/60 dark:border-gray-800/60">
        <div className="flex items-center gap-2">
          {log.running ? (
            <Loader2 size={12} className="animate-spin text-orange-400" />
          ) : log.success ? (
            <CheckCircle2 size={12} className="text-green-400" />
          ) : (
            <XCircle size={12} className="text-red-400" />
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {log.running ? `正在安装 ${log.pluginName}…` : log.success ? `安装成功` : `安装失败`}
          </span>
          <code className="text-[10px] text-gray-400 dark:text-gray-600 font-mono ml-1">{log.command}</code>
        </div>
        <button onClick={onClose} className="text-[10px] text-gray-400 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 px-1">
          关闭
        </button>
      </div>
      <div ref={scrollRef} className="h-32 overflow-y-auto px-4 py-2">
        <pre className="text-[11px] font-mono text-gray-500 dark:text-gray-400 whitespace-pre-wrap leading-relaxed">
          {log.output || (log.running ? '等待输出…' : '（无输出）')}
        </pre>
      </div>
    </div>
  )
}

// ── Custom command runner ─────────────────────────────────────────────────────
function CustomCommandPanel() {
  const [cmd, setCmd] = useState('')
  const [log, setLog] = useState<{ output: string; success: boolean; running: boolean } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [log?.output])

  const run = async () => {
    const command = cmd.trim()
    if (!command) return
    setLog({ output: '', success: false, running: true })
    const result = await window.electronAPI.shell.run(command)
    setLog({ output: result.output, success: result.success, running: false })
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-800 shrink-0">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <Terminal size={12} className="text-orange-400" />
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">自定义命令</span>
          <span className="text-[10px] text-gray-400 dark:text-gray-600">
            可运行 npx skills add、claude plugin marketplace add 等任意命令
          </span>
        </div>
        <div className="flex gap-2">
          <input
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') run() }}
            placeholder="npx skills add https://github.com/vercel-labs/skills --skill find-skills"
            className="flex-1 text-xs bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-2.5 py-1.5 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-orange-500 font-mono"
          />
          <button
            onClick={run}
            disabled={!cmd.trim() || log?.running}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs rounded transition-colors shrink-0"
          >
            {log?.running ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
            运行
          </button>
        </div>

        {log && (
          <div className="mt-2">
            <div ref={scrollRef} className="max-h-28 overflow-y-auto bg-[#030712] rounded border border-gray-200 dark:border-gray-800 px-3 py-2">
              <div className="flex items-center gap-1.5 mb-1">
                {log.running ? (
                  <Loader2 size={10} className="animate-spin text-orange-400" />
                ) : log.success ? (
                  <CheckCircle2 size={10} className="text-green-400" />
                ) : (
                  <XCircle size={10} className="text-red-400" />
                )}
                <span className={`text-[10px] ${log.success ? 'text-green-400' : log.running ? 'text-orange-400' : 'text-red-400'}`}>
                  {log.running ? '运行中…' : log.success ? '执行成功' : '执行失败'}
                </span>
              </div>
              <pre className="text-[11px] font-mono text-gray-500 dark:text-gray-400 whitespace-pre-wrap leading-relaxed">
                {log.output || (log.running ? '等待输出…' : '（无输出）')}
              </pre>
            </div>
            {!log.running && (
              <button
                onClick={() => setLog(null)}
                className="mt-1 text-[10px] text-gray-400 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400"
              >
                清除
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Plugin card ───────────────────────────────────────────────────────────────
function PluginCard({
  plugin,
  installing,
  installed,
  onInstall,
}: {
  plugin: MarketplacePlugin
  installing: boolean
  installed: boolean
  onInstall: () => void
}) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-3 hover:border-gray-300 dark:hover:border-gray-700 transition-colors flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate font-mono">{plugin.name}</p>
          {plugin.category && (
            <span className="text-[10px] text-orange-400/80 bg-orange-400/10 px-1.5 py-0.5 rounded mt-0.5 inline-block">
              {CATEGORY_LABELS[plugin.category] ?? plugin.category}
            </span>
          )}
          {plugin.author && (
            <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-0.5 truncate">{plugin.author.name}</p>
          )}
        </div>
        {plugin.homepage && (
          <button
            onClick={() => openExternalUrl(plugin.homepage!)}
            className="p-1 text-gray-400 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 shrink-0 transition-colors"
            title="打开主页"
          >
            <ExternalLink size={11} />
          </button>
        )}
      </div>

      {plugin.description && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed line-clamp-2 flex-1">
          {plugin.description}
        </p>
      )}

      <button
        onClick={onInstall}
        disabled={installing}
        className={`flex items-center justify-center gap-1.5 w-full py-1.5 rounded text-[11px] font-medium transition-colors ${
          installing
            ? 'bg-orange-500/20 text-orange-400 cursor-not-allowed'
            : installed
            ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
            : 'bg-gray-100 dark:bg-gray-800 hover:bg-orange-500/20 hover:text-orange-400 text-gray-500 dark:text-gray-400'
        }`}
        title={`claude plugin install ${plugin.name}@claude-plugins-official`}
      >
        {installing ? (
          <><Loader2 size={10} className="animate-spin" /> 安装中…</>
        ) : installed ? (
          <><CheckCircle2 size={10} /> 已安装</>
        ) : (
          <><Play size={10} /> 安装</>
        )}
      </button>
    </div>
  )
}

// ── Installed tab ─────────────────────────────────────────────────────────────
function InstalledTab({ claudeBin }: { claudeBin: string }) {
  const [plugins, setPlugins] = useState<InstalledPluginInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [togglingKey, setTogglingKey] = useState<string | null>(null)
  const [uninstallingKey, setUninstallingKey] = useState<string | null>(null)
  const [uninstallLog, setUninstallLog] = useState<{ key: string; output: string; success: boolean } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.plugins.listInstalled()
      if (result.success) setPlugins(result.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleToggle = async (plugin: InstalledPluginInfo) => {
    setTogglingKey(plugin.pluginKey)
    try {
      await window.electronAPI.plugins.setEnabled(plugin.pluginKey, !plugin.enabled)
      setPlugins((prev) => prev.map((p) =>
        p.pluginKey === plugin.pluginKey ? { ...p, enabled: !p.enabled } : p
      ))
    } finally {
      setTogglingKey(null)
    }
  }

  const handleUninstall = async (plugin: InstalledPluginInfo) => {
    if (!confirm(`卸载插件 "${plugin.pluginKey}"？`)) return
    const command = `${claudeBin} plugin uninstall ${plugin.pluginKey}`
    setUninstallingKey(plugin.pluginKey)
    setUninstallLog(null)
    const result = await window.electronAPI.shell.run(command)
    setUninstallingKey(null)
    setUninstallLog({ key: plugin.pluginKey, output: result.output, success: result.success })
    if (result.success) await load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-gray-400 dark:text-gray-500">
        <Loader2 size={14} className="animate-spin" />
        <span className="text-sm">加载中...</span>
      </div>
    )
  }

  if (plugins.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 dark:text-gray-600">
        <Package size={28} className="text-gray-500 dark:text-gray-700" />
        <p className="text-sm">尚未安装任何插件</p>
        <p className="text-xs text-gray-500 dark:text-gray-700">切换到「市场」tab 浏览并安装</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] text-gray-400 dark:text-gray-500">{plugins.length} 个已安装插件</p>
        <button onClick={load} className="p-1 text-gray-400 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 rounded" title="刷新">
          <RotateCcw size={11} />
        </button>
      </div>

      {plugins.map((plugin) => {
        const isToggling = togglingKey === plugin.pluginKey
        const isUninstalling = uninstallingKey === plugin.pluginKey
        const log = uninstallLog?.key === plugin.pluginKey ? uninstallLog : null

        return (
          <div key={plugin.pluginKey} className={`bg-white dark:bg-gray-900 border rounded-lg p-4 transition-colors ${plugin.enabled ? 'border-gray-200 dark:border-gray-800' : 'border-gray-200/50 dark:border-gray-800/50 opacity-60'}`}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 font-mono">{plugin.pluginName}</span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-600 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                    {plugin.marketplace}
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-700">v{plugin.version}</span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-700">· {plugin.scope} 范围</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Enable/Disable toggle */}
                <button
                  onClick={() => handleToggle(plugin)}
                  disabled={isToggling}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    plugin.enabled
                      ? 'bg-green-500/15 text-green-400 hover:bg-red-500/15 hover:text-red-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:bg-green-500/15 hover:text-green-400'
                  }`}
                  title={plugin.enabled ? '点击禁用' : '点击启用'}
                >
                  {isToggling ? <Loader2 size={10} className="animate-spin" /> : <Power size={10} />}
                  {plugin.enabled ? '已启用' : '已禁用'}
                </button>
                {/* Uninstall */}
                <button
                  onClick={() => handleUninstall(plugin)}
                  disabled={isUninstalling}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-gray-400 dark:text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  {isUninstalling ? <Loader2 size={10} className="animate-spin" /> : <XCircle size={10} />}
                  卸载
                </button>
              </div>
            </div>

            {/* Info rows */}
            <div className="space-y-1.5">
              {/* MCP Server info */}
              {plugin.mcpServer ? (
                <div className="flex items-start gap-2 text-[11px]">
                  {plugin.mcpServer.type === 'remote'
                    ? <Globe size={11} className="text-blue-400 mt-0.5 shrink-0" />
                    : <Cpu size={11} className="text-purple-400 mt-0.5 shrink-0" />
                  }
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={plugin.mcpServer.type === 'remote' ? 'text-blue-400' : 'text-purple-400'}>
                        MCP {plugin.mcpServer.type === 'remote' ? '远程服务器' : '本地服务器'}
                      </span>
                      {plugin.mcpServer.title && (
                        <span className="text-gray-400 dark:text-gray-500">— {plugin.mcpServer.title}</span>
                      )}
                      {plugin.mcpServer.repositoryUrl && (
                        <button
                          onClick={() => openExternalUrl(plugin.mcpServer!.repositoryUrl!)}
                          className="flex items-center gap-1 text-orange-400/80 hover:text-orange-400 transition-colors"
                        >
                          <ExternalLink size={10} />
                          查看文档 / 授权设置
                        </button>
                      )}
                    </div>
                    <p className="text-gray-400 dark:text-gray-600 font-mono truncate mt-0.5">
                      {plugin.mcpServer.url ?? plugin.mcpServer.command}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-700">
                  <Cpu size={11} className="shrink-0" />
                  无 MCP 服务器
                </div>
              )}

              {/* Skills count */}
              {plugin.skillsCount > 0 && (
                <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
                  <Zap size={11} className="text-orange-400/60 shrink-0" />
                  包含 {plugin.skillsCount} 个 Skill，可在「Skills」页面查看
                </div>
              )}
            </div>

            {/* Uninstall log */}
            {log && (
              <div className={`mt-3 p-2 rounded border text-[11px] font-mono ${log.success ? 'border-green-800/50 bg-green-900/10 text-green-400' : 'border-red-800/50 bg-red-900/10 text-red-400'}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  {log.success ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                  {log.success ? '卸载成功' : '卸载失败'}
                </div>
                {log.output && <pre className="text-gray-400 dark:text-gray-500 whitespace-pre-wrap">{log.output}</pre>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PluginsPage() {
  type Tab = 'market' | 'installed'
  const [tab, setTab] = useState<Tab>('market')

  const [plugins, setPlugins] = useState<MarketplacePlugin[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [claudeBin, setClaudeBin] = useState('claude')

  const [installingName, setInstallingName] = useState<string | null>(null)
  const [installedNames, setInstalledNames] = useState<Set<string>>(new Set())
  const [installLog, setInstallLog] = useState<InstallLog | null>(null)

  const [showCustom, setShowCustom] = useState(false)

  const fetchPlugins = () => {
    setLoading(true)
    setError(null)
    fetch(MARKETPLACE_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ plugins: MarketplacePlugin[] }>
      })
      .then((json) => setPlugins(json.plugins))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchPlugins()
    window.electronAPI.shell.findClaude().then((r) => {
      if (r.success && r.data) setClaudeBin(r.data)
    })
  }, [])

  const categories = useMemo(() => {
    if (!plugins) return []
    const cats = new Set(plugins.map((p) => p.category).filter(Boolean) as string[])
    return Array.from(cats).sort()
  }, [plugins])

  const filtered = useMemo(() => {
    if (!plugins) return []
    const q = search.toLowerCase()
    return plugins.filter((p) => {
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        (p.author?.name ?? '').toLowerCase().includes(q)
      const matchCat = category === 'all' || p.category === category
      return matchSearch && matchCat
    })
  }, [plugins, search, category])

  const handleInstall = async (plugin: MarketplacePlugin) => {
    const command = `${claudeBin} plugin install ${plugin.name}@claude-plugins-official`

    setInstallingName(plugin.name)
    setInstallLog({ pluginName: plugin.name, command, output: '', success: false, running: true })

    const result = await window.electronAPI.shell.run(command)

    setInstallingName(null)
    setInstallLog({ pluginName: plugin.name, command, output: result.output, success: result.success, running: false })
    if (result.success) {
      setInstalledNames((prev) => new Set([...prev, plugin.name]))
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
        {/* Tab selector */}
        <div className="flex items-center gap-1 mb-3 bg-gray-100/60 dark:bg-gray-800/60 rounded-lg p-0.5 w-fit">
          <button
            onClick={() => setTab('market')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${tab === 'market' ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >
            <Package size={11} /> 市场
          </button>
          <button
            onClick={() => setTab('installed')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${tab === 'installed' ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >
            <BookOpen size={11} /> 已安装
          </button>
        </div>

        {/* Market-specific header */}
        {tab === 'market' && (
          <>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <Package size={14} className="text-orange-400" />
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">官方插件市场</span>
                <code className="text-[10px] text-gray-400 dark:text-gray-600 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                  claude-plugins-official
                </code>
                {plugins && <span className="text-[10px] text-gray-400 dark:text-gray-500">{plugins.length} 个插件</span>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchPlugins}
                  disabled={loading}
                  className="p-1.5 text-gray-400 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors disabled:opacity-50"
                  title="刷新"
                >
                  <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={() => openExternalUrl('https://claude.com/plugins')}
                  className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 hover:text-orange-400 transition-colors"
                >
                  <ExternalLink size={11} />
                  浏览器打开
                </button>
              </div>
            </div>
            <div className="relative mb-2">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索插件名称或描述..."
                className="w-full pl-7 pr-3 py-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-xs text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-orange-500"
              />
            </div>
            {categories.length > 0 && (
              <div className="flex gap-1.5 flex-wrap pb-3">
                <button
                  onClick={() => setCategory('all')}
                  className={`px-2 py-0.5 rounded text-[11px] transition-colors ${category === 'all' ? 'bg-orange-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                >
                  全部
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`px-2 py-0.5 rounded text-[11px] transition-colors ${category === cat ? 'bg-orange-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                  >
                    {CATEGORY_LABELS[cat] ?? cat}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Content */}
      {tab === 'installed' ? (
        <InstalledTab claudeBin={claudeBin} />
      ) : (
        <>
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center h-full gap-2 text-gray-400 dark:text-gray-500">
                <Loader2 size={14} className="animate-spin" />
                <span className="text-sm">加载中...</span>
              </div>
            )}
            {error && !loading && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
                <AlertCircle size={24} className="text-red-400" />
                <p className="text-sm text-red-400">加载失败</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{error}</p>
                <button
                  onClick={fetchPlugins}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded transition-colors"
                >
                  <RotateCcw size={11} /> 重试
                </button>
              </div>
            )}
            {!loading && !error && (
              <div className="p-4 grid grid-cols-2 gap-2">
                {filtered.map((plugin) => (
                  <PluginCard
                    key={plugin.name}
                    plugin={plugin}
                    installing={installingName === plugin.name}
                    installed={installedNames.has(plugin.name)}
                    onInstall={() => handleInstall(plugin)}
                  />
                ))}
                {filtered.length === 0 && (
                  <div className="col-span-2 flex items-center justify-center h-32 text-gray-400 dark:text-gray-600 text-sm">
                    没有找到匹配的插件
                  </div>
                )}
              </div>
            )}
          </div>
          {installLog && (
            <InstallLogPanel log={installLog} onClose={() => setInstallLog(null)} />
          )}
          <div className="border-t border-gray-200 dark:border-gray-800 shrink-0">
            <button
              onClick={() => setShowCustom((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Terminal size={11} />
                第三方 Skills / 自定义命令
                <span className="text-[10px] text-gray-500 dark:text-gray-700">— npx skills add、claude plugin marketplace add…</span>
              </span>
              {showCustom ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
            </button>
            {showCustom && <CustomCommandPanel />}
          </div>
        </>
      )}
    </div>
  )
}
