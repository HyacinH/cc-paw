import { ipcMain } from 'electron'
import path from 'path'
import os from 'os'
import { CLAUDE_PATHS, projectClaudeMdPath } from '../services/claude-paths'
import { readFile, writeFile } from '../services/file.service'
import { normalizeCliId } from '../services/cli-scope'
import type { CliId } from '../../src/types/cli.types'

function globalInstructionPath(cliId: CliId): string {
  if (cliId === 'codex') return path.join(os.homedir(), '.codex', 'AGENTS.md')
  return CLAUDE_PATHS.globalClaudeMd
}

function projectInstructionPath(projectDir: string, cliId: CliId): string {
  if (cliId === 'codex') return path.join(projectDir, 'AGENTS.md')
  return projectClaudeMdPath(projectDir)
}

export function registerClaudeMdHandlers(): void {
  ipcMain.handle('claude-md:read-global', (_event, cliId?: CliId) =>
    readFile(globalInstructionPath(normalizeCliId(cliId)))
  )

  ipcMain.handle('claude-md:write-global', (_event, content: string, cliId?: CliId) =>
    writeFile(globalInstructionPath(normalizeCliId(cliId)), content)
  )

  ipcMain.handle('claude-md:read-project', (_event, projectDir: string, cliId?: CliId) =>
    readFile(projectInstructionPath(projectDir, normalizeCliId(cliId)))
  )

  ipcMain.handle('claude-md:write-project', (_event, projectDir: string, content: string, cliId?: CliId) =>
    writeFile(projectInstructionPath(projectDir, normalizeCliId(cliId)), content)
  )
}
