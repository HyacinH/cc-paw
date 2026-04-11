import { ipcMain } from 'electron'
import os from 'os'
import path from 'path'
import { CLAUDE_PATHS } from '../services/claude-paths'
import { readFile, writeFile } from '../services/file.service'
import { normalizeCliId } from '../services/cli-scope'
import type { MCPServerConfig, MCPConfig } from '../../src/types/mcp.types'
import type { CliId } from '../../src/types/cli.types'

type ClaudeJson = Record<string, unknown> & {
  mcpServers?: Record<string, MCPServerConfig>
  _disabled_mcpServers?: Record<string, MCPServerConfig>
}

type ReadResult = { ok: true; raw: ClaudeJson } | { ok: false; error: string }

const CODEX_CONFIG_TOML = path.join(os.homedir(), '.codex', 'config.toml')
const CODEX_DISABLED_SECTION = 'cc_paw_disabled_mcp_servers'

function escapeTomlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function formatTomlKey(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : `"${escapeTomlString(key)}"`
}

function parseTomlKeyToken(token: string): string {
  const trimmed = token.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return trimmed
}

function splitTomlPath(raw: string): string[] {
  const out: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]
    if (ch === '"' && raw[i - 1] !== '\\') {
      inQuotes = !inQuotes
      current += ch
      continue
    }
    if (ch === '.' && !inQuotes) {
      if (current.trim()) out.push(parseTomlKeyToken(current))
      current = ''
      continue
    }
    current += ch
  }

  if (current.trim()) out.push(parseTomlKeyToken(current))
  return out
}

function parseTomlStringValue(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) return null
  const body = trimmed.slice(1, -1)
  return body.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

function parseTomlStringArray(raw: string): string[] | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null
  const out: string[] = []
  const re = /"((?:\\.|[^"\\])*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(trimmed)) !== null) {
    out.push(m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'))
  }
  return out
}

function parseTomlBoolean(raw: string): boolean | null {
  const trimmed = raw.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  return null
}

function renderTomlStringArray(values: string[]): string {
  return `[${values.map((v) => `"${escapeTomlString(v)}"`).join(', ')}]`
}

function stripManagedCodexMcpSections(content: string): string {
  const lines = content.split('\n')
  const out: string[] = []
  let skip = false

  for (const line of lines) {
    const header = line.match(/^\s*\[(.+?)\]\s*$/)?.[1]?.trim()
    if (header) {
      const pathParts = splitTomlPath(header)
      const managed = pathParts[0] === 'mcp_servers' || pathParts[0] === CODEX_DISABLED_SECTION
      skip = managed
      if (!skip) out.push(line)
      continue
    }
    if (!skip) out.push(line)
  }

  return out.join('\n').trimEnd()
}

function parseCodexMcpFromToml(content: string): MCPConfig {
  type Bucket = 'active' | 'disabled'
  type SubSection = 'base' | 'env' | 'headers'

  const active: Record<string, MCPServerConfig> = {}
  const disabled: Record<string, MCPServerConfig> = {}

  let current: { bucket: Bucket; name: string; sub: SubSection } | null = null

  const ensure = (bucket: Bucket, name: string): MCPServerConfig => {
    const target = bucket === 'active' ? active : disabled
    target[name] = target[name] ?? {}
    return target[name]
  }

  for (const line of content.split('\n')) {
    const header = line.match(/^\s*\[(.+?)\]\s*$/)?.[1]?.trim()
    if (header) {
      const p = splitTomlPath(header)
      if (p[0] === 'mcp_servers' && p.length >= 2) {
        const name = p[1]
        const sub = p[2] === 'env' ? 'env' : p[2] === 'headers' ? 'headers' : 'base'
        current = { bucket: 'active', name, sub }
        ensure('active', name)
        continue
      }
      if (p[0] === CODEX_DISABLED_SECTION && p.length >= 2) {
        const name = p[1]
        const sub = p[2] === 'env' ? 'env' : p[2] === 'headers' ? 'headers' : 'base'
        current = { bucket: 'disabled', name, sub }
        ensure('disabled', name)
        continue
      }
      current = null
      continue
    }

    if (!current) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue

    const key = parseTomlKeyToken(line.slice(0, eq))
    const rawValue = line.slice(eq + 1).trim()
    const target = ensure(current.bucket, current.name)

    if (current.sub === 'base') {
      if (key === 'command' || key === 'url' || key === 'type') {
        const parsed = parseTomlStringValue(rawValue)
        if (parsed !== null) (target as Record<string, unknown>)[key] = parsed
        continue
      }
      if (key === 'args') {
        const parsed = parseTomlStringArray(rawValue)
        if (parsed !== null) target.args = parsed
        continue
      }
      if (key === 'enabled') {
        const parsed = parseTomlBoolean(rawValue)
        if (parsed === false) target.disabled = true
      }
      continue
    }

    const parsed = parseTomlStringValue(rawValue)
    if (parsed === null) continue

    if (current.sub === 'env') {
      target.env = target.env ?? {}
      target.env[key] = parsed
      continue
    }
    if (current.sub === 'headers') {
      target.headers = target.headers ?? {}
      target.headers[key] = parsed
    }
  }

  const merged: Record<string, MCPServerConfig> = {}
  for (const [name, srv] of Object.entries(active)) {
    merged[name] = { ...srv, disabled: srv.disabled ?? false }
  }
  for (const [name, srv] of Object.entries(disabled)) {
    merged[name] = { ...srv, disabled: true }
  }

  return { mcpServers: merged }
}

function renderCodexMcpSections(config: MCPConfig): string {
  const active: Record<string, MCPServerConfig> = {}
  const disabled: Record<string, MCPServerConfig> = {}

  for (const [name, srv] of Object.entries(config.mcpServers ?? {})) {
    const { disabled: isDisabled, ...rest } = srv
    if (isDisabled) disabled[name] = rest
    else active[name] = rest
  }

  const lines: string[] = []

  const pushServer = (sectionPrefix: string, name: string, srv: MCPServerConfig) => {
    lines.push(`[${sectionPrefix}.${formatTomlKey(name)}]`)

    if (srv.url) lines.push(`url = "${escapeTomlString(srv.url)}"`)
    if (srv.command) lines.push(`command = "${escapeTomlString(srv.command)}"`)
    if (srv.type && srv.type !== 'stdio') lines.push(`type = "${escapeTomlString(srv.type)}"`)
    if (srv.args && srv.args.length > 0) lines.push(`args = ${renderTomlStringArray(srv.args)}`)

    if (srv.env && Object.keys(srv.env).length > 0) {
      lines.push('')
      lines.push(`[${sectionPrefix}.${formatTomlKey(name)}.env]`)
      for (const [k, v] of Object.entries(srv.env)) {
        lines.push(`${formatTomlKey(k)} = "${escapeTomlString(v)}"`)
      }
    }

    if (srv.headers && Object.keys(srv.headers).length > 0) {
      lines.push('')
      lines.push(`[${sectionPrefix}.${formatTomlKey(name)}.headers]`)
      for (const [k, v] of Object.entries(srv.headers)) {
        lines.push(`${formatTomlKey(k)} = "${escapeTomlString(v)}"`)
      }
    }

    lines.push('')
  }

  for (const name of Object.keys(active).sort()) {
    pushServer('mcp_servers', name, active[name])
  }
  for (const name of Object.keys(disabled).sort()) {
    pushServer(CODEX_DISABLED_SECTION, name, disabled[name])
  }

  return lines.join('\n').trimEnd()
}

async function readClaudeJson(): Promise<ReadResult> {
  const r = await readFile(CLAUDE_PATHS.claudeJson)
  if (!r.success) return { ok: false, error: r.error }
  if (!r.data) return { ok: true, raw: {} }
  try {
    return { ok: true, raw: JSON.parse(r.data) as ClaudeJson }
  } catch {
    return { ok: false, error: '~/.claude.json 格式错误，无法安全写入' }
  }
}

async function readMcpByCli(cliId: CliId): Promise<{ success: true; data: MCPConfig } | { success: false; error: string }> {
  if (cliId === 'codex') {
    const r = await readFile(CODEX_CONFIG_TOML)
    if (!r.success && !/ENOENT/i.test(r.error)) return { success: false, error: r.error }
    const data = parseCodexMcpFromToml(r.data ?? '')
    return { success: true, data }
  }

  const r = await readClaudeJson()
  if (!r.ok) return { success: false, error: r.error }

  const active = Object.entries(r.raw.mcpServers ?? {})
    .map(([k, v]) => [k, { ...v, disabled: false }] as [string, MCPServerConfig])
  const disabled = Object.entries(r.raw._disabled_mcpServers ?? {})
    .map(([k, v]) => [k, { ...v, disabled: true }] as [string, MCPServerConfig])

  return { success: true, data: { mcpServers: Object.fromEntries([...active, ...disabled]) } as MCPConfig }
}

async function writeMcpByCli(cliId: CliId, config: MCPConfig): Promise<{ success: boolean; error?: string }> {
  if (cliId === 'codex') {
    const r = await readFile(CODEX_CONFIG_TOML)
    if (!r.success && !/ENOENT/i.test(r.error)) return { success: false, error: r.error }

    const stripped = stripManagedCodexMcpSections(r.data ?? '')
    const rendered = renderCodexMcpSections(config)
    const next = [stripped, rendered].filter(Boolean).join('\n\n').trimEnd() + '\n'
    return writeFile(CODEX_CONFIG_TOML, next)
  }

  const r = await readClaudeJson()
  if (!r.ok) return { success: false, error: r.error }

  const active: Record<string, MCPServerConfig> = {}
  const disabled: Record<string, MCPServerConfig> = {}
  for (const [name, srv] of Object.entries(config.mcpServers)) {
    const { disabled: isDisabled, ...rest } = srv
    if (isDisabled) disabled[name] = rest
    else active[name] = rest
  }

  r.raw.mcpServers = active
  if (Object.keys(disabled).length > 0) r.raw._disabled_mcpServers = disabled
  else delete r.raw._disabled_mcpServers

  return writeFile(CLAUDE_PATHS.claudeJson, JSON.stringify(r.raw, null, 2))
}

export function registerMcpHandlers(): void {
  ipcMain.handle('mcp:read', async (_event, cliId?: CliId) => {
    try {
      const effectiveCliId = normalizeCliId(cliId)
      return await readMcpByCli(effectiveCliId)
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  ipcMain.handle('mcp:write', async (_event, config: MCPConfig, cliId?: CliId) => {
    try {
      const effectiveCliId = normalizeCliId(cliId)
      return await writeMcpByCli(effectiveCliId, config)
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })
}
