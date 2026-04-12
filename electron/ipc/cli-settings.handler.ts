import { ipcMain } from 'electron'
import path from 'path'
import os from 'os'
import { readFile, writeFile } from '../services/file.service'
import { CLAUDE_PATHS } from '../services/claude-paths'
import { normalizeCliId } from '../services/cli-scope'
import type { CliId } from '../../src/types/cli.types'

export interface CliSettingsView {
  apiKey: string
  baseUrl: string
  defaultModel: string
  defaultSonnetModel: string
  defaultOpusModel: string
  defaultHaikuModel: string
}

type RawClaudeSettings = {
  apiKeyHelper?: string
  env?: Record<string, string>
  [key: string]: unknown
}

const CODEX_DIR = path.join(os.homedir(), '.codex')
const CODEX_AUTH_JSON = path.join(CODEX_DIR, 'auth.json')
const CODEX_CONFIG_TOML = path.join(CODEX_DIR, 'config.toml')

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeTomlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function parseTomlQuotedValue(content: string, key: string): string {
  const m = content.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*"([^"]*)"\\s*$`, 'm'))
  return m?.[1] ?? ''
}

function upsertTopLevelTomlQuoted(content: string, key: string, value: string): string {
  const line = `${key} = "${escapeTomlString(value)}"`
  const re = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*"[^"]*"\\s*$`, 'm')
  if (re.test(content)) return content.replace(re, line)
  return `${line}\n${content}`.trimEnd() + '\n'
}

function parseSectionTomlQuotedValue(content: string, section: string, key: string): string {
  const sectionRe = new RegExp(`^\\s*\\[${escapeRegExp(section)}\\]\\s*$([\\s\\S]*?)(?=^\\s*\\[|$)`, 'm')
  const sectionBody = content.match(sectionRe)?.[1] ?? ''
  const keyRe = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*"([^"]*)"\\s*$`, 'm')
  return sectionBody.match(keyRe)?.[1] ?? ''
}

function upsertSectionTomlQuoted(content: string, section: string, key: string, value: string): string {
  const headerRe = new RegExp(`^\\s*\\[${escapeRegExp(section)}\\]\\s*$`, 'm')
  const keyLine = `${key} = "${escapeTomlString(value)}"`

  if (!headerRe.test(content)) {
    const prefix = content.trimEnd()
    return `${prefix}${prefix ? '\n\n' : ''}[${section}]\n${keyLine}\n`
  }

  const sectionRe = new RegExp(`(^\\s*\\[${escapeRegExp(section)}\\]\\s*$)([\\s\\S]*?)(?=^\\s*\\[|$)`, 'm')
  return content.replace(sectionRe, (_full, header: string, body: string) => {
    const keyRe = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*"[^"]*"\\s*$`, 'm')
    if (keyRe.test(body)) {
      return `${header}${body.replace(keyRe, keyLine)}`
    }
    const normalizedBody = body.endsWith('\n') || body.length === 0 ? body : `${body}\n`
    return `${header}${normalizedBody}${keyLine}\n`
  })
}

async function readRawClaude(): Promise<RawClaudeSettings> {
  const result = await readFile(CLAUDE_PATHS.settingsJson)
  if (!result.success || !result.data) return {}
  try { return JSON.parse(result.data) as RawClaudeSettings } catch { return {} }
}

async function readRawCodexAuth(): Promise<Record<string, unknown>> {
  const result = await readFile(CODEX_AUTH_JSON)
  if (!result.success || !result.data) return {}
  try { return JSON.parse(result.data) as Record<string, unknown> } catch { return {} }
}

async function readRawCodexToml(): Promise<string> {
  const result = await readFile(CODEX_CONFIG_TOML)
  if (!result.success || !result.data) return ''
  return result.data
}

async function readSettingsByCli(cliId: CliId): Promise<CliSettingsView> {
  if (cliId === 'codex') {
    const auth = await readRawCodexAuth()
    const toml = await readRawCodexToml()
    const provider = parseTomlQuotedValue(toml, 'model_provider') || 'aicodemirror'
    const baseUrl = parseSectionTomlQuotedValue(toml, `model_providers.${provider}`, 'base_url')
    return {
      apiKey: typeof auth.OPENAI_API_KEY === 'string' ? auth.OPENAI_API_KEY : '',
      baseUrl,
      defaultModel: parseTomlQuotedValue(toml, 'model'),
      defaultSonnetModel: '',
      defaultOpusModel: '',
      defaultHaikuModel: '',
    }
  }

  const raw = await readRawClaude()
  return {
    apiKey: raw.env?.ANTHROPIC_API_KEY ?? '',
    baseUrl: raw.env?.ANTHROPIC_BASE_URL ?? '',
    defaultModel: '',
    defaultSonnetModel: raw.env?.ANTHROPIC_DEFAULT_SONNET_MODEL ?? 'claude-sonnet-4-6',
    defaultOpusModel: raw.env?.ANTHROPIC_DEFAULT_OPUS_MODEL ?? 'claude-opus-4-6',
    defaultHaikuModel: raw.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? 'claude-haiku-4-5',
  }
}

async function writeSettingsByCli(cliId: CliId, patch: Partial<CliSettingsView>): Promise<{ success: boolean; error?: string }> {
  if (cliId === 'codex') {
    const auth = await readRawCodexAuth()
    const authPatch = { ...auth }
    if (patch.apiKey !== undefined) authPatch.OPENAI_API_KEY = patch.apiKey

    let toml = await readRawCodexToml()
    const provider = parseTomlQuotedValue(toml, 'model_provider') || 'aicodemirror'
    if (!parseTomlQuotedValue(toml, 'model_provider')) {
      toml = upsertTopLevelTomlQuoted(toml, 'model_provider', provider)
    }

    if (patch.defaultModel !== undefined) {
      toml = upsertTopLevelTomlQuoted(toml, 'model', patch.defaultModel)
    }
    if (patch.baseUrl !== undefined) {
      toml = upsertSectionTomlQuoted(toml, `model_providers.${provider}`, 'base_url', patch.baseUrl)
    }

    const authResult = await writeFile(CODEX_AUTH_JSON, JSON.stringify(authPatch, null, 2))
    if (!authResult.success) return authResult
    return writeFile(CODEX_CONFIG_TOML, toml)
  }

  const raw = await readRawClaude()
  raw.env = raw.env ?? {}

  if (patch.apiKey !== undefined) {
    raw.env.ANTHROPIC_API_KEY = patch.apiKey
    if (patch.apiKey.trim()) raw.apiKeyHelper = ''
  }
  if (patch.baseUrl !== undefined) raw.env.ANTHROPIC_BASE_URL = patch.baseUrl
  if (patch.defaultSonnetModel !== undefined) raw.env.ANTHROPIC_DEFAULT_SONNET_MODEL = patch.defaultSonnetModel
  if (patch.defaultOpusModel !== undefined) raw.env.ANTHROPIC_DEFAULT_OPUS_MODEL = patch.defaultOpusModel
  if (patch.defaultHaikuModel !== undefined) raw.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = patch.defaultHaikuModel

  return writeFile(CLAUDE_PATHS.settingsJson, JSON.stringify(raw, null, 2))
}

export function registerCliSettingsHandlers(): void {
  ipcMain.handle('cli-settings:read', async (_event, cliId?: CliId) => {
    try {
      const effectiveCliId = normalizeCliId(cliId)
      const data = await readSettingsByCli(effectiveCliId)
      return { success: true, data }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  ipcMain.handle('cli-settings:write', async (_event, patch: Partial<CliSettingsView>, cliId?: CliId) => {
    try {
      const effectiveCliId = normalizeCliId(cliId)
      return await writeSettingsByCli(effectiveCliId, patch)
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })
}
