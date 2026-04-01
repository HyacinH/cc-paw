import { ipcMain } from 'electron'
import { readFile, writeFile } from '../services/file.service'
import { CLAUDE_PATHS } from '../services/claude-paths'

export interface ClaudeCodeSettingsView {
  apiKeyHelper: string
  baseUrl: string
  defaultSonnetModel: string
  defaultOpusModel: string
  defaultHaikuModel: string
}

type RawSettings = {
  apiKeyHelper?: string
  env?: Record<string, string>
  [key: string]: unknown
}

async function readRaw(): Promise<RawSettings> {
  const result = await readFile(CLAUDE_PATHS.settingsJson)
  if (!result.success || !result.data) return {}
  try { return JSON.parse(result.data) as RawSettings } catch { return {} }
}

export function registerClaudeSettingsHandlers(): void {
  ipcMain.handle('claude-settings:read', async () => {
    try {
      const raw = await readRaw()
      const view: ClaudeCodeSettingsView = {
        apiKeyHelper: raw.apiKeyHelper ?? '',
        baseUrl: raw.env?.ANTHROPIC_BASE_URL ?? '',
        defaultSonnetModel: raw.env?.ANTHROPIC_DEFAULT_SONNET_MODEL ?? 'claude-sonnet-4-6',
        defaultOpusModel: raw.env?.ANTHROPIC_DEFAULT_OPUS_MODEL ?? 'claude-opus-4-6',
        defaultHaikuModel: raw.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? 'claude-haiku-4-5',
      }
      return { success: true, data: view }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  ipcMain.handle('claude-settings:write', async (_event, patch: Partial<ClaudeCodeSettingsView>) => {
    try {
      const raw = await readRaw()

      // Only update the fields we manage; leave all other settings (OTEL, telemetry, etc.) untouched
      if (patch.apiKeyHelper !== undefined) raw.apiKeyHelper = patch.apiKeyHelper
      if (patch.baseUrl !== undefined || patch.defaultSonnetModel !== undefined ||
          patch.defaultOpusModel !== undefined || patch.defaultHaikuModel !== undefined) {
        raw.env = raw.env ?? {}
        if (patch.baseUrl !== undefined) raw.env.ANTHROPIC_BASE_URL = patch.baseUrl
        if (patch.defaultSonnetModel !== undefined) raw.env.ANTHROPIC_DEFAULT_SONNET_MODEL = patch.defaultSonnetModel
        if (patch.defaultOpusModel !== undefined) raw.env.ANTHROPIC_DEFAULT_OPUS_MODEL = patch.defaultOpusModel
        if (patch.defaultHaikuModel !== undefined) raw.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = patch.defaultHaikuModel
      }

      return writeFile(CLAUDE_PATHS.settingsJson, JSON.stringify(raw, null, 2))
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })
}
