import { ipcMain } from 'electron'
import { CLAUDE_PATHS, projectClaudeMdPath } from '../services/claude-paths'
import { readFile, writeFile } from '../services/file.service'

export function registerClaudeMdHandlers(): void {
  ipcMain.handle('claude-md:read-global', () =>
    readFile(CLAUDE_PATHS.globalClaudeMd)
  )

  ipcMain.handle('claude-md:write-global', (_event, content: string) =>
    writeFile(CLAUDE_PATHS.globalClaudeMd, content)
  )

  ipcMain.handle('claude-md:read-project', (_event, projectDir: string) =>
    readFile(projectClaudeMdPath(projectDir))
  )

  ipcMain.handle('claude-md:write-project', (_event, projectDir: string, content: string) =>
    writeFile(projectClaudeMdPath(projectDir), content)
  )
}
