import { useState, useEffect, useMemo } from 'react'
import { BarChart2, Loader2, RefreshCw, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import type { UsageStats } from '../types/electron'


function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function fmtCost(usd: number): string {
  if (usd < 0.01) return '< $0.01'
  return `$${usd.toFixed(2)}`
}

// projectKey e.g. "-Users-foo-bar-myproject" → "myproject"
function projectName(key: string): string {
  const parts = key.replace(/^-/, '').split('-')
  return parts[parts.length - 1] || key
}
function projectPath(key: string): string {
  return '/' + key.replace(/^-/, '').replace(/-/g, '/')
}

// ─── Summary card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Daily chart (last 30 days bar chart via CSS) ─────────────────────────────
function DailyChart({ byDate }: { byDate: UsageStats['byDate'] }) {
  const days = useMemo(() => {
    const result: { date: string; label: string; tokens: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const iso = d.toISOString().slice(0, 10)
      const entry = byDate[iso]
      const tokens = entry ? entry.inputTokens + entry.outputTokens : 0
      result.push({ date: iso, label: d.getDate().toString(), tokens })
    }
    return result
  }, [byDate])

  const max = Math.max(...days.map(d => d.tokens), 1)

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">近 30 天 Token 趋势（输入 + 输出）</p>
      <div className="flex items-end gap-0.5 h-24">
        {days.map((d) => (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5 group relative">
            <div
              className="w-full bg-orange-400/70 dark:bg-orange-500/60 rounded-sm transition-all hover:bg-orange-500"
              style={{ height: `${Math.max(2, (d.tokens / max) * 88)}px` }}
            />
            {/* Tooltip */}
            {d.tokens > 0 && (
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                <div className="bg-gray-800 text-white text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap">
                  {d.date}<br />{fmtTokens(d.tokens)}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-gray-400 dark:text-gray-600">
        <span>30天前</span>
        <span>今天</span>
      </div>
    </div>
  )
}

// ─── Per-project table ────────────────────────────────────────────────────────
function ProjectTable({ byProject, multiplier }: { byProject: UsageStats['byProject']; multiplier: number }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const rows = useMemo(() =>
    Object.entries(byProject)
      .map(([key, s]) => ({ key, ...s, cost: s.estimatedCost }))
      .sort((a, b) => b.outputTokens + b.inputTokens - (a.outputTokens + a.inputTokens)),
    [byProject]
  )

  if (rows.length === 0) return null

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <p className="px-4 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-800">
        按项目统计
      </p>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {rows.map((row) => (
          <div key={row.key}>
            <button
              onClick={() => setExpanded(expanded === row.key ? null : row.key)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{projectName(row.key)}</p>
                <p className="text-xs text-gray-400 dark:text-gray-600 font-mono truncate">{projectPath(row.key)}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{fmtTokens(row.inputTokens + row.outputTokens)}</p>
                <p className="text-xs text-gray-400 dark:text-gray-600">≈ {fmtCost(row.cost * multiplier)}</p>
              </div>
              <div className="text-gray-400 dark:text-gray-600 shrink-0">
                {expanded === row.key ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </button>
            {expanded === row.key && (
              <div className="px-4 pb-3 grid grid-cols-2 gap-2 text-xs bg-gray-50 dark:bg-gray-800/30">
                {[
                  ['输入 tokens', fmtTokens(row.inputTokens)],
                  ['输出 tokens', fmtTokens(row.outputTokens)],
                  ['Cache 读取', fmtTokens(row.cacheReadTokens)],
                  ['Cache 写入', fmtTokens(row.cacheWriteTokens)],
                  ['会话数', String(row.sessionCount)],
                  ['消息数', String(row.messageCount)],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between py-1 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-gray-500 dark:text-gray-400">{label}</span>
                    <span className="font-mono text-gray-700 dark:text-gray-300">{val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function UsagePage() {
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [multiplier, setMultiplier] = useState<number>(
    () => parseFloat(localStorage.getItem('cc-paw-cost-multiplier') ?? '1') || 1
  )

  const load = async () => {
    setLoading(true); setError(null)
    const r = await window.electronAPI.usage.getStats()
    if (r.success) setStats(r.data)
    else setError(r.error)
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    localStorage.setItem('cc-paw-cost-multiplier', String(multiplier))
  }, [multiplier])

  const totalCost = stats ? stats.totals.estimatedCost : 0

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <BarChart2 size={18} className="text-orange-500" />
            Token 用量
          </h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            读取自 ~/.claude/projects/ · 费用按每条消息实际模型定价
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 dark:text-gray-500">倍率</span>
            <input
              type="number"
              min="0"
              max="9.99"
              step="0.01"
              value={multiplier}
              onChange={e => {
                const v = parseFloat(e.target.value)
                if (v > 0 && v <= 9.99) setMultiplier(v)
              }}
              className="w-16 text-xs text-right bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-orange-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            刷新
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-600 py-8 justify-center">
          <Loader2 size={16} className="animate-spin" />
          正在读取会话记录…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {stats && !loading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="总输出 tokens"
              value={fmtTokens(stats.totals.outputTokens)}
              sub={`输入 ${fmtTokens(stats.totals.inputTokens)}`}
            />
            <StatCard
              label="Cache 命中"
              value={fmtTokens(stats.totals.cacheReadTokens)}
              sub="节省大量费用"
            />
            <StatCard
              label="累计会话"
              value={String(stats.totals.sessionCount)}
              sub={`${stats.totals.messageCount} 条消息`}
            />
            <StatCard
              label="估算费用"
              value={fmtCost(totalCost * multiplier)}
              sub={multiplier !== 1 ? `× ${multiplier} 倍率` : '按实际模型定价'}
            />
          </div>

          {/* Daily chart */}
          <DailyChart byDate={stats.byDate} />

          {/* Per-project */}
          <ProjectTable byProject={stats.byProject} multiplier={multiplier} />
        </>
      )}
    </div>
  )
}
