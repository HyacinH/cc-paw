import { ipcMain } from 'electron'
import { CLAUDE_PATHS } from '../services/claude-paths'
import { readFile, writeFile } from '../services/file.service'
import type { MCPServerConfig, MCPConfig } from '../../src/types/mcp.types'

/**
 * MCP config lives in ~/.claude.json → mcpServers.
 * This is the only location Claude Code CLI reads/writes (confirmed by experiment).
 * ~/.claude/mcp.json is ignored entirely — Claude Code CLI does not read it.
 *
 * Disabled servers are moved to _disabled_mcpServers (a CC Paw-managed key in the same file)
 * so Claude Code CLI never sees them. The disabled flag is implied by which map they're in.
 */

type ClaudeJson = Record<string, unknown> & {
  mcpServers?: Record<string, MCPServerConfig>
  _disabled_mcpServers?: Record<string, MCPServerConfig>
}

type ReadResult = { ok: true; raw: ClaudeJson } | { ok: false; error: string }

async function readClaudeJson(): Promise<ReadResult> {
  const r = await readFile(CLAUDE_PATHS.claudeJson)
  if (!r.success) return { ok: false, error: r.error }  // I/O error — refuse to write
  if (!r.data) return { ok: true, raw: {} }              // file absent — safe to create
  try {
    return { ok: true, raw: JSON.parse(r.data) as ClaudeJson }
  } catch {
    return { ok: false, error: '~/.claude.json 格式错误，无法安全写入' }
  }
}

export function registerMcpHandlers(): void {
  ipcMain.handle('mcp:read', async () => {
    const r = await readClaudeJson()
    if (!r.ok) return { success: false, error: r.error }

    // Merge active + disabled servers; UI distinguishes via disabled flag
    const active = Object.entries(r.raw.mcpServers ?? {})
      .map(([k, v]) => [k, { ...v, disabled: false }] as [string, MCPServerConfig])
    const disabled = Object.entries(r.raw._disabled_mcpServers ?? {})
      .map(([k, v]) => [k, { ...v, disabled: true }] as [string, MCPServerConfig])

    return { success: true, data: { mcpServers: Object.fromEntries([...active, ...disabled]) } as MCPConfig }
  })

  ipcMain.handle('mcp:write', async (_event, config: MCPConfig) => {
    const r = await readClaudeJson()
    if (!r.ok) return { success: false, error: r.error }

    // Separate active vs disabled — only active servers go into mcpServers that Claude Code CLI reads
    const active: Record<string, MCPServerConfig> = {}
    const disabled: Record<string, MCPServerConfig> = {}
    for (const [name, srv] of Object.entries(config.mcpServers)) {
      const { disabled: isDisabled, ...rest } = srv
      if (isDisabled) {
        disabled[name] = rest
      } else {
        active[name] = rest
      }
    }

    r.raw.mcpServers = active
    // Clean up _disabled_mcpServers key when empty
    if (Object.keys(disabled).length > 0) {
      r.raw._disabled_mcpServers = disabled
    } else {
      delete r.raw._disabled_mcpServers
    }

    return writeFile(CLAUDE_PATHS.claudeJson, JSON.stringify(r.raw, null, 2))
  })
}
