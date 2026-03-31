import type { AppSettings } from '../types/electron'

export async function readAppSettings(): Promise<AppSettings> {
  const result = await window.electronAPI.appSettings.read()
  if (!result.success) return {}
  return result.data
}

export async function writeAppSettings(settings: AppSettings): Promise<void> {
  const result = await window.electronAPI.appSettings.write(settings)
  if (!result.success) throw new Error(result.error)
}
