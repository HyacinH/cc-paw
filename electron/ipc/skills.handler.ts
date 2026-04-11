import { ipcMain, shell } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { CLAUDE_PATHS } from '../services/claude-paths'
import { readFile, writeFile, deleteFile, listDir } from '../services/file.service'
import { normalizeCliId } from '../services/cli-scope'
import type { CliId } from '../../src/types/cli.types'

export interface PluginSkillEntry {
  skillName: string
  description: string
  pluginKey: string    // e.g. "figma@claude-plugins-official"
  pluginName: string   // e.g. "figma"
  marketplace: string  // e.g. "claude-plugins-official"
  version: string
  content: string
  filePath: string
  referencesCount: number  // files in references/ dir (injected as context by Claude Code CLI)
}

function parseFrontmatter(content: string): Record<string, string> {
  const m = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!m) return {}
  const result: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    if (key && val) result[key] = val
  }
  return result
}

function resolveSkillsPaths(cliId?: CliId): { skillsDir: string; pluginsInstalledJson: string } {
  const effectiveCliId = normalizeCliId(cliId)
  if (effectiveCliId === 'codex') {
    const codexDir = path.join(os.homedir(), '.codex')
    return {
      skillsDir: path.join(codexDir, 'skills'),
      pluginsInstalledJson: path.join(codexDir, 'plugins', 'installed_plugins.json'),
    }
  }
  return {
    skillsDir: CLAUDE_PATHS.skillsDir,
    pluginsInstalledJson: CLAUDE_PATHS.pluginsInstalledJson,
  }
}

export function registerSkillsHandlers(): void {
  ipcMain.handle('skills:list', async (_event, cliId?: CliId) => {
    const { skillsDir } = resolveSkillsPaths(cliId)
    const result = await listDir(skillsDir)
    if (!result.success) return result
    const skills = result.data
      .filter((f) => f.endsWith('.md'))
      .map((f) => ({ name: f.replace(/\.md$/, ''), filename: f }))
    return { success: true, data: skills }
  })

  ipcMain.handle('skills:read', (_event, name: string, cliId?: CliId) => {
    const { skillsDir } = resolveSkillsPaths(cliId)
    return readFile(path.join(skillsDir, `${name}.md`))
  })

  ipcMain.handle('skills:write', (_event, name: string, content: string, cliId?: CliId) => {
    const { skillsDir } = resolveSkillsPaths(cliId)
    return writeFile(path.join(skillsDir, `${name}.md`), content)
  })

  ipcMain.handle('skills:delete', (_event, name: string, cliId?: CliId) => {
    const { skillsDir } = resolveSkillsPaths(cliId)
    return deleteFile(path.join(skillsDir, `${name}.md`))
  })

  ipcMain.handle('skills:rename', async (_event, oldName: string, newName: string, cliId?: CliId) => {
    const { skillsDir } = resolveSkillsPaths(cliId)
    try {
      const oldPath = path.join(skillsDir, `${oldName}.md`)
      const newPath = path.join(skillsDir, `${newName}.md`)
      await fs.rename(oldPath, newPath)
      return { success: true, data: undefined }
    } catch (err) {
      return { success: false, error: String(err), code: 'RENAME_ERROR' }
    }
  })

  ipcMain.handle('skills:fetch-url', async (_event, url: string) => {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'cc-paw/0.6.0', Accept: 'text/plain,text/markdown,*/*' },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) return { success: false, error: `HTTP ${res.status}: ${res.statusText}` }
      const text = await res.text()
      return { success: true, data: text }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('skills:open-url', (_event, url: string) => {
    shell.openExternal(url)
    return { success: true, data: undefined }
  })

  // 读取所有已安装插件的 Skills
  ipcMain.handle('skills:list-plugin-skills', async (_event, cliId?: CliId) => {
    const { pluginsInstalledJson } = resolveSkillsPaths(cliId)
    try {
      const raw = await fs.readFile(pluginsInstalledJson, 'utf-8')
      const installed = JSON.parse(raw) as {
        version: number
        plugins: Record<string, { scope: string; installPath: string; version: string }[]>
      }

      const results: PluginSkillEntry[] = []

      for (const [pluginKey, installs] of Object.entries(installed.plugins)) {
        const [pluginName, marketplace = 'unknown'] = pluginKey.split('@')

        // 取最新安装（最后一个）
        const latest = installs[installs.length - 1]
        if (!latest?.installPath) continue

        const skillsDir = path.join(latest.installPath, 'skills')
        let skillDirs: import('fs').Dirent[]
        try {
          skillDirs = await fs.readdir(skillsDir, { withFileTypes: true })
        } catch { continue }

        for (const entry of skillDirs.filter((d) => d.isDirectory())) {
          const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md')
          try {
            const content = await fs.readFile(skillMdPath, 'utf-8')
            const fm = parseFrontmatter(content)
            let referencesCount = 0
            try {
              const refs = await fs.readdir(path.join(skillsDir, entry.name, 'references'))
              referencesCount = refs.filter((f) => !f.startsWith('.')).length
            } catch { /* no references dir */ }
            results.push({
              skillName: fm.name || entry.name,
              description: fm.description || '',
              pluginKey,
              pluginName,
              marketplace,
              version: latest.version,
              content,
              filePath: skillMdPath,
              referencesCount,
            })
          } catch { /* no SKILL.md in this dir */ }
        }
      }

      return { success: true, data: results }
    } catch {
      return { success: true, data: [] }  // no installed_plugins.json → empty list
    }
  })
}
