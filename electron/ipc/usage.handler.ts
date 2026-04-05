import { ipcMain } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { CLAUDE_PATHS } from '../services/claude-paths'

export interface SessionUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  model: string
  date: string        // YYYY-MM-DD
  projectKey: string  // e.g. "-Users-foo-myproject"
  sessionId: string
}

export interface UsageStats {
  byProject: Record<string, {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    sessionCount: number
    messageCount: number
    estimatedCost: number
  }>
  byDate: Record<string, {      // YYYY-MM-DD
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
  }>
  byHour: Record<string, {      // YYYY-MM-DDTHH
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
  }>
  totals: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    sessionCount: number
    messageCount: number
    estimatedCost: number
  }
}

// Pricing per million tokens (USD) — Sonnet default, Opus detected by model name
const PRICE = {
  sonnet: { input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75 },
  opus:   { input: 15, output: 75, cacheRead: 1.50, cacheWrite: 18.75 },
  haiku:  { input: 0.80, output: 4, cacheRead: 0.08, cacheWrite: 1.00 },
}

function modelTier(model: string): keyof typeof PRICE {
  if (model.includes('opus'))  return 'opus'
  if (model.includes('haiku')) return 'haiku'
  return 'sonnet'
}

export function calcCost(stats: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }, model = 'sonnet'): number {
  const p = PRICE[modelTier(model)]
  return (
    (stats.inputTokens      * p.input      +
     stats.outputTokens     * p.output     +
     stats.cacheReadTokens  * p.cacheRead  +
     stats.cacheWriteTokens * p.cacheWrite) / 1_000_000
  )
}

interface UsageQueryRange {
  startDate: string
  endDate: string
  startTime?: string
  endTime?: string
}

function rangeKey(range?: UsageQueryRange): string {
  if (!range) return 'all'
  return `${range.startDate}__${range.endDate}__${range.startTime ?? ''}__${range.endTime ?? ''}`
}

let usageCache: {
  signature: string
  byRange: Map<string, UsageStats>
} | null = null

async function buildProjectsSignature(projectsDir: string): Promise<string> {
  let projectEntries: fs.Dirent[]
  try {
    projectEntries = await fs.readdir(projectsDir, { withFileTypes: true })
  } catch {
    return 'missing'
  }

  let fileCount = 0
  let totalSize = 0
  let maxMtimeMs = 0

  for (const entry of projectEntries) {
    if (!entry.isDirectory()) continue
    const projectDir = path.join(projectsDir, entry.name)

    let files: string[]
    try {
      files = (await fs.readdir(projectDir)).filter((f) => f.endsWith('.jsonl'))
    } catch {
      continue
    }

    fileCount += files.length

    for (const file of files) {
      try {
        const stat = await fs.stat(path.join(projectDir, file))
        totalSize += stat.size
        if (stat.mtimeMs > maxMtimeMs) maxMtimeMs = stat.mtimeMs
      } catch {
        // ignore transient file errors
      }
    }
  }

  return `${projectEntries.length}:${fileCount}:${totalSize}:${Math.floor(maxMtimeMs)}`
}

async function parseProjectUsage(projectsDir: string, range?: UsageQueryRange): Promise<UsageStats> {
  const stats: UsageStats = {
    byProject: {},
    byDate: {},
    byHour: {},
    totals: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, sessionCount: 0, messageCount: 0, estimatedCost: 0 },
  }

  let projectKeys: string[]
  try {
    const entries = await fs.readdir(projectsDir, { withFileTypes: true })
    projectKeys = entries.filter(e => e.isDirectory()).map(e => e.name)
  } catch { return stats }

  for (const projectKey of projectKeys) {
    const projectDir = path.join(projectsDir, projectKey)
    let files: string[]
    try {
      files = (await fs.readdir(projectDir)).filter(f => f.endsWith('.jsonl'))
    } catch { continue }

    const seenSessions = new Set<string>()

    for (const file of files) {
      const sessionId = file.replace('.jsonl', '')
      const filePath = path.join(projectDir, file)

      let text: string
      try { text = await fs.readFile(filePath, 'utf-8') }
      catch { continue }

      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        let obj: Record<string, unknown>
        try { obj = JSON.parse(line) } catch { continue }

        const msg = obj.message as Record<string, unknown> | undefined
        const usage = msg?.usage as Record<string, number> | undefined
        if (!usage) continue

        const input  = usage.input_tokens ?? 0
        const output = usage.output_tokens ?? 0
        const cacheRead  = usage.cache_read_input_tokens ?? 0
        const cacheWrite = usage.cache_creation_input_tokens ?? 0

        if (!input && !output && !cacheRead && !cacheWrite) continue

        const model = (msg?.model as string | undefined) ?? 'sonnet'
        const msgCost = calcCost({ inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite }, model)

        const ts = obj.timestamp as string | undefined
        const nowIso = new Date().toISOString()
        const normalizedTs = ts && ts.length >= 13 ? ts : nowIso
        const parsedDate = new Date(normalizedTs)

        let date = normalizedTs.slice(0, 10)
        let hourKey = normalizedTs.slice(0, 13)

        if (!Number.isNaN(parsedDate.getTime())) {
          const y = parsedDate.getFullYear()
          const m = String(parsedDate.getMonth() + 1).padStart(2, '0')
          const d = String(parsedDate.getDate()).padStart(2, '0')
          const hour = String(parsedDate.getHours()).padStart(2, '0')
          date = `${y}-${m}-${d}`
          hourKey = `${date}T${hour}`
        }

        const inDateRange = !range || (date >= range.startDate && date <= range.endDate)
        if (!inDateRange) continue

        if (range?.startTime || range?.endTime) {
          if (Number.isNaN(parsedDate.getTime())) continue
          const timeMs = parsedDate.getTime()
          if (range.startTime) {
            const startMs = new Date(range.startTime).getTime()
            if (!Number.isNaN(startMs) && timeMs < startMs) continue
          }
          if (range.endTime) {
            const endMs = new Date(range.endTime).getTime()
            if (!Number.isNaN(endMs) && timeMs > endMs) continue
          }
        }

        // totals
        stats.totals.inputTokens      += input
        stats.totals.outputTokens     += output
        stats.totals.cacheReadTokens  += cacheRead
        stats.totals.cacheWriteTokens += cacheWrite
        stats.totals.messageCount++
        stats.totals.estimatedCost    += msgCost

        // by project
        if (!stats.byProject[projectKey]) {
          stats.byProject[projectKey] = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, sessionCount: 0, messageCount: 0, estimatedCost: 0 }
        }
        stats.byProject[projectKey].inputTokens      += input
        stats.byProject[projectKey].outputTokens     += output
        stats.byProject[projectKey].cacheReadTokens  += cacheRead
        stats.byProject[projectKey].cacheWriteTokens += cacheWrite
        stats.byProject[projectKey].messageCount++
        stats.byProject[projectKey].estimatedCost    += msgCost
        if (!seenSessions.has(sessionId)) {
          seenSessions.add(sessionId)
          stats.byProject[projectKey].sessionCount++
          stats.totals.sessionCount++
        }

        // by date
        if (!stats.byDate[date]) {
          stats.byDate[date] = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
        }
        stats.byDate[date].inputTokens      += input
        stats.byDate[date].outputTokens     += output
        stats.byDate[date].cacheReadTokens  += cacheRead
        stats.byDate[date].cacheWriteTokens += cacheWrite

        // by hour
        if (!stats.byHour[hourKey]) {
          stats.byHour[hourKey] = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
        }
        stats.byHour[hourKey].inputTokens      += input
        stats.byHour[hourKey].outputTokens     += output
        stats.byHour[hourKey].cacheReadTokens  += cacheRead
        stats.byHour[hourKey].cacheWriteTokens += cacheWrite
      }
    }
  }

  return stats
}

export function registerUsageHandlers(): void {
  ipcMain.handle('usage:get-stats', async (_event, range?: { startDate?: string; endDate?: string; startTime?: string; endTime?: string }) => {
    try {
      const parsedRange = range?.startDate && range?.endDate
        ? {
            startDate: range.startDate,
            endDate: range.endDate,
            startTime: range.startTime,
            endTime: range.endTime,
          }
        : undefined

      const signature = await buildProjectsSignature(CLAUDE_PATHS.projectsDir)
      if (!usageCache || usageCache.signature !== signature) {
        usageCache = {
          signature,
          byRange: new Map<string, UsageStats>(),
        }
      }

      const key = rangeKey(parsedRange)
      const cached = usageCache.byRange.get(key)
      if (cached) return { success: true, data: cached }

      const stats = await parseProjectUsage(CLAUDE_PATHS.projectsDir, parsedRange)
      usageCache.byRange.set(key, stats)
      return { success: true, data: stats }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
}
