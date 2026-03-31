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

async function parseProjectUsage(projectsDir: string): Promise<UsageStats> {
  const stats: UsageStats = {
    byProject: {},
    byDate: {},
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
        const date = ts ? ts.slice(0, 10) : new Date().toISOString().slice(0, 10)

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
      }
    }
  }

  return stats
}

export function registerUsageHandlers(): void {
  ipcMain.handle('usage:get-stats', async () => {
    try {
      const stats = await parseProjectUsage(CLAUDE_PATHS.projectsDir)
      return { success: true, data: stats }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
}
