import { useState, useEffect, useMemo } from 'react'
import { BarChart2, Loader2, RefreshCw, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import type { UsageStats } from '../types/electron'


type ViewMode = 'hour' | 'day' | 'month' | 'week'
type QuickRangePreset = '48h' | '7d' | '30d'
type UsageRange = { startDate: string; endDate: string; startTime?: string; endTime?: string }

const MAX_HOURS = 72
const MAX_DAYS = 30
const MAX_WEEK_DAYS = 365
const MAX_YEARS = 5
const MAX_DAYS_TOTAL = 365 * MAX_YEARS

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function fmtCost(usd: number): string {
  if (usd < 0.01) return '< $0.01'
  return `$${usd.toFixed(2)}`
}

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function shiftDate(iso: string, deltaDays: number): string {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + deltaDays)
  return toISODate(d)
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return new Date()
  return new Date(y, m - 1, d)
}

function startOfIsoWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  d.setHours(0, 0, 0, 0)
  return d
}

function getInitialMultiplier(): number {
  const raw = localStorage.getItem('cc-paw-cost-multiplier')
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function dateDiffDaysInclusive(start: Date, end: Date): number {
  const s = new Date(start)
  const e = new Date(end)
  s.setHours(0, 0, 0, 0)
  e.setHours(0, 0, 0, 0)
  return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1
}

function dateDiffHoursInclusive(start: Date, end: Date): number {
  const s = new Date(start)
  const e = new Date(end)
  s.setHours(0, 0, 0, 0)
  e.setHours(23, 0, 0, 0)
  return Math.floor((e.getTime() - s.getTime()) / 3600000) + 1
}

function chooseViewByRange(startDate: string, endDate: string): ViewMode | null {
  const start = parseISODate(startDate)
  const end = parseISODate(endDate)
  const days = dateDiffDaysInclusive(start, end)
  if (days > MAX_DAYS_TOTAL) return null

  const hours = dateDiffHoursInclusive(start, end)
  if (hours <= MAX_HOURS) return 'hour'
  if (days <= MAX_DAYS) return 'day'
  if (days <= MAX_WEEK_DAYS) return 'week'
  return 'month'
}

function isViewAllowed(view: ViewMode, startDate: string, endDate: string): boolean {
  const start = parseISODate(startDate)
  const end = parseISODate(endDate)
  const days = dateDiffDaysInclusive(start, end)
  if (days > MAX_DAYS_TOTAL) return false

  const hours = dateDiffHoursInclusive(start, end)
  if (view === 'hour') return hours <= MAX_HOURS
  if (view === 'day') return days <= MAX_DAYS
  if (view === 'week') return days <= MAX_WEEK_DAYS
  return days <= MAX_DAYS_TOTAL
}

function projectName(key: string): string {
  const parts = key.replace(/^-/, '').split('-')
  return parts[parts.length - 1] || key
}

function projectPath(key: string): string {
  return '/' + key.replace(/^-/, '').replace(/-/g, '/')
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">{sub}</p>}
    </div>
  )
}

function UsageTrendChart({
  data,
  title,
  periodTotal,
}: {
  data: Array<{ key: string; label: string; tokens: number; dateText?: string }>
  title: string
  periodTotal: number
}) {
  if (data.length === 0) return null
  const max = Math.max(...data.map((d) => d.tokens), 1)

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">{title}</p>
      <div className="flex items-end gap-1 h-28">
        {data.map((d) => (
          <div key={d.key} className="flex-1 flex flex-col items-center gap-1 group relative min-w-0">
            <div
              className="w-full bg-orange-400/70 dark:bg-orange-500/60 rounded-sm transition-all hover:bg-orange-500"
              style={{ height: `${Math.max(2, (d.tokens / max) * 98)}px` }}
            />
            <span className="h-3 text-[10px] leading-3 text-gray-400 dark:text-gray-600 truncate">{d.label || '\u00A0'}</span>
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
              <div className="bg-gray-800 text-white text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap">
                {(d.dateText ?? d.label)}<br />{fmtTokens(d.tokens)}
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-600">当前所选时间总计：{fmtTokens(periodTotal)} tokens</p>
    </div>
  )
}

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

export default function UsagePage() {
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const today = toISODate(new Date())
  const [rangeStart, setRangeStart] = useState(() => toISODate(new Date(Date.now() - 6 * 86400000)))
  const [rangeEnd, setRangeEnd] = useState(() => today)
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [rangeHint, setRangeHint] = useState<string>('')
  const [rangeError, setRangeError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<Pick<UsageRange, 'startTime' | 'endTime'>>({})

  const [multiplier, setMultiplier] = useState<number>(() => getInitialMultiplier())
  const [multiplierInput, setMultiplierInput] = useState<string>(() => String(getInitialMultiplier()))
  const [multiplierError, setMultiplierError] = useState<string | null>(null)

  const applyRangePreset = (preset: QuickRangePreset) => {
    const end = new Date()

    if (preset === '48h') {
      const start = new Date(end.getTime() - 48 * 3600000)
      setRangeStart(toISODate(start))
      setRangeEnd(toISODate(end))
      setTimeRange({ startTime: start.toISOString(), endTime: end.toISOString() })
      return
    }

    const days = preset === '7d' ? 7 : 30
    const endIso = toISODate(end)
    const startIso = shiftDate(endIso, -(days - 1))
    setRangeStart(startIso)
    setRangeEnd(endIso)
    setTimeRange({})
  }

  const load = async (range: UsageRange = { startDate: rangeStart, endDate: rangeEnd, ...timeRange }) => {
    setLoading(true)
    setError(null)
    const r = await window.electronAPI.usage.getStats(range)
    if (r.success) setStats(r.data)
    else setError(r.error)
    setLoading(false)
  }


  useEffect(() => {
    localStorage.setItem('cc-paw-cost-multiplier', String(multiplier))
  }, [multiplier])

  useEffect(() => {
    if (rangeStart > rangeEnd) {
      setRangeError('开始日期不能晚于结束日期')
      setRangeHint('')
      return
    }

    const rawAuto = chooseViewByRange(rangeStart, rangeEnd)
    if (!rawAuto) {
      const adjustedStart = shiftDate(rangeEnd, -(MAX_DAYS_TOTAL - 1))
      setRangeStart(adjustedStart)
      setRangeError(`时间范围不能超过 ${MAX_YEARS} 年，已自动调整到可用范围`)
      setRangeHint('')
      return
    }

    setRangeError(null)
    setRangeHint('')

    const start = parseISODate(rangeStart)
    const end = parseISODate(rangeEnd)
    const hours = dateDiffHoursInclusive(start, end)
    const days = dateDiffDaysInclusive(start, end)

    if (hours > MAX_HOURS && days <= MAX_DAYS) {
      setRangeHint(`小时视图最多 ${MAX_HOURS} 小时；当前 ${hours} 小时，已自动切到日视图`)
    } else if (days > MAX_DAYS && days <= MAX_WEEK_DAYS) {
      setRangeHint(`日视图最多 ${MAX_DAYS} 天；当前 ${days} 天，已自动切到周视图`)
    } else if (days > MAX_WEEK_DAYS) {
      setRangeHint(`周视图最多 ${MAX_WEEK_DAYS} 天；当前 ${days} 天，已自动切到月视图`)
    }

    if (viewMode !== rawAuto) setViewMode(rawAuto)

    load({ startDate: rangeStart, endDate: rangeEnd, ...timeRange })
  }, [rangeStart, rangeEnd, timeRange.startTime, timeRange.endTime])

  const totalCost = stats ? stats.totals.estimatedCost : 0

  const chart = useMemo(() => {
    const empty = { title: '暂无数据', data: [] as Array<{ key: string; label: string; tokens: number; dateText?: string }>, periodTotal: 0 }
    if (!stats || rangeStart > rangeEnd) return empty

    const byDate = stats.byDate ?? {}
    const byHour = stats.byHour ?? {}

    const start = parseISODate(rangeStart)
    const end = parseISODate(rangeEnd)
    if (dateDiffDaysInclusive(start, end) > MAX_DAYS_TOTAL) return empty

    if (viewMode === 'hour') {
      const startHour = new Date(start)
      startHour.setHours(0, 0, 0, 0)
      const endHour = new Date(end)
      endHour.setHours(23, 0, 0, 0)

      const data: Array<{ key: string; label: string; tokens: number; dateText?: string }> = []
      const cursor = new Date(startHour)
      while (cursor <= endHour && data.length <= MAX_HOURS) {
        const isoDate = toISODate(cursor)
        const hour = String(cursor.getHours()).padStart(2, '0')
        const key = `${isoDate}T${hour}`
        const entry = byHour[key]
        const tokens = entry ? entry.inputTokens + entry.outputTokens : 0
        const displayLabel = Number(hour) % 6 === 0 ? hour : ''
        data.push({ key, label: displayLabel, tokens, dateText: `${isoDate} ${hour}:00` })
        cursor.setHours(cursor.getHours() + 1)
      }

      return {
        title: `小时视图（${rangeStart} ~ ${rangeEnd}，最多 ${MAX_HOURS} 小时）`,
        data,
        periodTotal: data.reduce((sum, d) => sum + d.tokens, 0),
      }
    }

    if (viewMode === 'day') {
      const data: Array<{ key: string; label: string; tokens: number; dateText?: string }> = []
      const cursor = new Date(start)
      while (cursor <= end && data.length <= MAX_DAYS) {
        const iso = toISODate(cursor)
        const entry = byDate[iso]
        const tokens = entry ? entry.inputTokens + entry.outputTokens : 0
        data.push({ key: iso, label: iso.slice(5), tokens, dateText: iso })
        cursor.setDate(cursor.getDate() + 1)
      }

      return {
        title: `日视图（${rangeStart} ~ ${rangeEnd}，最多 ${MAX_DAYS} 天）`,
        data,
        periodTotal: data.reduce((sum, d) => sum + d.tokens, 0),
      }
    }

    if (viewMode === 'month') {
      const monthMap: Record<string, number> = {}
      const cursor = new Date(start)
      while (cursor <= end) {
        const iso = toISODate(cursor)
        const entry = byDate[iso]
        const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
        monthMap[monthKey] = (monthMap[monthKey] ?? 0) + (entry ? entry.inputTokens + entry.outputTokens : 0)
        cursor.setDate(cursor.getDate() + 1)
      }

      const data = Object.entries(monthMap).map(([monthKey, tokens]) => ({
        key: monthKey,
        label: monthKey.slice(2),
        tokens,
        dateText: monthKey,
      }))

      return {
        title: `月视图（${rangeStart} ~ ${rangeEnd}，最多 ${MAX_YEARS} 年）`,
        data,
        periodTotal: data.reduce((sum, d) => sum + d.tokens, 0),
      }
    }

    const buckets: Array<{ key: string; label: string; tokens: number; dateText?: string }> = []
    const cursor = startOfIsoWeek(start)
    const endWeek = startOfIsoWeek(end)

    while (cursor <= endWeek) {
      const weekStart = new Date(cursor)
      const weekEnd = new Date(cursor)
      weekEnd.setDate(weekEnd.getDate() + 6)

      let tokens = 0
      const dayCursor = new Date(weekStart)
      while (dayCursor <= weekEnd) {
        if (dayCursor >= start && dayCursor <= end) {
          const iso = toISODate(dayCursor)
          const entry = byDate[iso]
          tokens += entry ? entry.inputTokens + entry.outputTokens : 0
        }
        dayCursor.setDate(dayCursor.getDate() + 1)
      }

      const key = `${toISODate(weekStart)}_${toISODate(weekEnd)}`
      buckets.push({
        key,
        label: `${weekStart.getMonth() + 1}/${weekStart.getDate()}`,
        tokens,
        dateText: `${toISODate(weekStart)} ~ ${toISODate(weekEnd)}`,
      })
      cursor.setDate(cursor.getDate() + 7)
    }

    return {
      title: `周视图（${rangeStart} ~ ${rangeEnd}，最多 ${MAX_WEEK_DAYS} 天）`,
      data: buckets,
      periodTotal: buckets.reduce((sum, b) => sum + b.tokens, 0),
    }
  }, [stats, rangeStart, rangeEnd, viewMode])

  const applyMultiplier = () => {
    const trimmed = multiplierInput.trim()
    const parsed = Number(trimmed)
    if (trimmed && Number.isFinite(parsed) && parsed > 0) {
      setMultiplier(parsed)
      setMultiplierInput(String(parsed))
      setMultiplierError(null)
      return
    }
    setMultiplierError('倍率必须是大于 0 的数字')
  }

  return (
    <div className="p-6 max-w-4xl space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <BarChart2 size={18} className="text-orange-500" />
            Token 用量
          </h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            读取自 ~/.claude/projects/ · 自动视图规则：72小时→30天→1年周视图→5年月视图
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {([
              { key: 'hour', label: 'H' },
              { key: 'day', label: 'D' },
              { key: 'week', label: 'W' },
              { key: 'month', label: 'M' },
            ] as const).map((item) => {
              const disabled = !isViewAllowed(item.key, rangeStart, rangeEnd)
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    if (!disabled) setViewMode(item.key)
                  }}
                  disabled={disabled}
                  className={`px-3 py-1.5 text-xs transition-colors ${
                    disabled
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      : viewMode === item.key
                        ? 'bg-orange-500 text-white'
                        : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                  title={disabled ? '当前日期范围下该视图不可用' : '可手动切换，超出范围会自动回到可用粒度'}
                >
                  {item.label}
                </button>
              )
            })}
          </div>

          <div className="relative group">
            <button
              className="min-w-[60px] px-3 py-1 text-xs rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800"
              title="快捷范围"
            >
              快捷
            </button>
            <div className="absolute right-0 top-full mt-1 hidden group-hover:flex flex-col gap-1 p-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-20">
              {[
                { label: '48h', key: '48h' as const },
                { label: '7天', key: '7d' as const },
                { label: '30天', key: '30d' as const },
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => applyRangePreset(preset.key)}
                  className="px-2 py-1 text-xs rounded text-left text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <input
              type="date"
              value={rangeStart}
              max={rangeEnd}
              onChange={(e) => {
                setRangeStart(e.target.value)
                setTimeRange({})
              }}
              className="date-input w-32 text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
            <span className="text-xs text-gray-400">至</span>
            <input
              type="date"
              value={rangeEnd}
              min={rangeStart}
              onChange={(e) => {
                setRangeEnd(e.target.value)
                setTimeRange({})
              }}
              className="date-input w-32 text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 dark:text-gray-500">倍率</span>
            <input
              type="text"
              inputMode="decimal"
              value={multiplierInput}
              onChange={(e) => {
                const next = e.target.value
                if (/^[0-9.]{0,5}$/.test(next)) {
                  setMultiplierInput(next)
                  if (multiplierError) setMultiplierError(null)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyMultiplier()
              }}
              placeholder="1"
              className="w-16 text-xs text-right bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-orange-400"
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

      {rangeError && <div className="text-xs text-red-500">{rangeError}</div>}
      {!rangeError && rangeHint && <div className="text-xs text-amber-500">{rangeHint}</div>}
      {multiplierError && <div className="text-xs text-red-500">{multiplierError}</div>}
      {!multiplierError && <div className="text-xs text-gray-400 dark:text-gray-600">倍率输入时仅限制字符与长度，按 Enter 应用</div>}

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

      {stats && !loading && !rangeError && (
        <>
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

          <UsageTrendChart data={chart.data} title={chart.title} periodTotal={chart.periodTotal} />

          <ProjectTable byProject={stats.byProject} multiplier={multiplier} />
        </>
      )}
    </div>
  )
}
