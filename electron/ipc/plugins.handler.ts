import { ipcMain } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { CLAUDE_PATHS } from '../services/claude-paths'

export interface InstalledPluginInfo {
  pluginKey: string       // "figma@claude-plugins-official"
  pluginName: string      // "figma"
  marketplace: string     // "claude-plugins-official"
  version: string
  installPath: string
  scope: string
  enabled: boolean
  skillsCount: number
  mcpServer: {
    name?: string
    title?: string
    description?: string
    type: 'remote' | 'local'
    url?: string         // remote
    command?: string     // local
    repositoryUrl?: string
  } | null
}

type RawSettings = { enabledPlugins?: Record<string, boolean>; [key: string]: unknown }

async function readRawSettings(): Promise<RawSettings> {
  try {
    const raw = await fs.readFile(CLAUDE_PATHS.settingsJson, 'utf-8')
    return JSON.parse(raw) as RawSettings
  } catch { return {} }
}

export function registerPluginsHandlers(): void {
  ipcMain.handle('plugins:list-installed', async () => {
    try {
      const rawInstalled = await fs.readFile(CLAUDE_PATHS.pluginsInstalledJson, 'utf-8')
      const installed = JSON.parse(rawInstalled) as {
        plugins: Record<string, { scope: string; installPath: string; version: string }[]>
      }
      const rawSettings = await readRawSettings()
      const enabledPlugins = rawSettings.enabledPlugins ?? {}

      const results: InstalledPluginInfo[] = []

      for (const [pluginKey, installs] of Object.entries(installed.plugins)) {
        const [pluginName, marketplace = 'unknown'] = pluginKey.split('@')
        const latest = installs[installs.length - 1]
        if (!latest?.installPath) continue

        // Count skills
        let skillsCount = 0
        try {
          const skillDirs = await fs.readdir(path.join(latest.installPath, 'skills'), { withFileTypes: true })
          skillsCount = skillDirs.filter((d) => d.isDirectory()).length
        } catch { /* no skills dir */ }

        // Parse server.json
        let mcpServer: InstalledPluginInfo['mcpServer'] = null
        try {
          const serverRaw = await fs.readFile(path.join(latest.installPath, 'server.json'), 'utf-8')
          const srv = JSON.parse(serverRaw) as {
            name?: string; title?: string; description?: string
            remotes?: { type: string; url: string }[]
            command?: string
            repository?: { url?: string }
          }
          const repositoryUrl = srv.repository?.url
          if (srv.remotes && srv.remotes.length > 0) {
            mcpServer = {
              name: srv.name, title: srv.title, description: srv.description,
              type: 'remote', url: srv.remotes[0].url, repositoryUrl,
            }
          } else if (srv.command) {
            mcpServer = { name: srv.name, title: srv.title, type: 'local', command: srv.command, repositoryUrl }
          }
        } catch { /* no server.json */ }

        // Fallback: read .mcp.json (standard MCP format used by some plugins e.g. atlassian)
        if (!mcpServer) {
          try {
            const mcpJsonRaw = await fs.readFile(path.join(latest.installPath, '.mcp.json'), 'utf-8')
            const mcpJson = JSON.parse(mcpJsonRaw) as {
              mcpServers?: Record<string, { type?: string; url?: string; command?: string }>
            }
            const entries = Object.entries(mcpJson.mcpServers ?? {})
            if (entries.length > 0) {
              const [name, srv] = entries[0]
              if (srv.url) {
                mcpServer = { name, type: 'remote', url: srv.url }
              } else if (srv.command) {
                mcpServer = { name, type: 'local', command: srv.command }
              }
            }
          } catch { /* no .mcp.json */ }
        }

        results.push({
          pluginKey, pluginName, marketplace,
          version: latest.version,
          installPath: latest.installPath,
          scope: latest.scope,
          enabled: enabledPlugins[pluginKey] !== false,  // default true if not explicitly false
          skillsCount,
          mcpServer,
        })
      }

      return { success: true, data: results }
    } catch {
      return { success: true, data: [] }
    }
  })

  ipcMain.handle('plugins:get-auth-status', async () => {
    try {
      const raw = await fs.readFile(
        path.join(CLAUDE_PATHS.dir, 'mcp-needs-auth-cache.json'), 'utf-8'
      )
      const cache = JSON.parse(raw) as Record<string, { timestamp: number }>
      return { success: true, data: cache }
    } catch {
      return { success: true, data: {} }
    }
  })

  ipcMain.handle('plugins:set-enabled', async (_event, pluginKey: string, enabled: boolean) => {
    try {
      const raw = await readRawSettings()
      raw.enabledPlugins = raw.enabledPlugins ?? {}
      raw.enabledPlugins[pluginKey] = enabled
      await fs.writeFile(CLAUDE_PATHS.settingsJson, JSON.stringify(raw, null, 2), 'utf-8')
      return { success: true, data: undefined }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })
}
