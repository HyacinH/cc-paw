import { ipcMain, app } from 'electron'
import path from 'path'
import { readFile, writeFile } from '../services/file.service'

export interface AppSettings {
  projects?: string[]
  apiKey?: string
  baseUrl?: string
  model?: string
  notifyOnDone?: boolean  // default true — notify when Claude finishes responding
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'app-settings.json')
}

/** Called from pty.handler — reads notifyOnDone directly to avoid circular IPC */
export async function getNotifyOnDone(): Promise<boolean> {
  const result = await readFile(settingsPath())
  if (!result.success || !result.data) return true
  try {
    const s = JSON.parse(result.data) as AppSettings
    return s.notifyOnDone !== false  // default true when absent
  } catch { return true }
}

export function registerAppSettingsHandlers(): void {
  ipcMain.handle('app-settings:read', async () => {
    const result = await readFile(settingsPath())
    if (!result.success) return result
    if (result.data === null) return { success: true, data: {} as AppSettings }
    try {
      return { success: true, data: JSON.parse(result.data) as AppSettings }
    } catch {
      return { success: true, data: {} as AppSettings }
    }
  })

  ipcMain.handle('app-settings:write', async (_event, settings: AppSettings) => {
    return writeFile(settingsPath(), JSON.stringify(settings, null, 2))
  })
}
