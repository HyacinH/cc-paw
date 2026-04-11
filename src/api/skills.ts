import type { SkillFile } from '../types/skill.types'
import type { PluginSkillEntry } from '../types/electron'
import type { CliId } from '../types/cli.types'

export async function listSkills(cliId?: CliId): Promise<SkillFile[]> {
  const result = await window.electronAPI.skills.list(cliId)
  if (!result.success) throw new Error(result.error)
  return result.data
}

export async function readSkill(name: string, cliId?: CliId): Promise<string | null> {
  const result = await window.electronAPI.skills.read(name, cliId)
  if (!result.success) throw new Error(result.error)
  return result.data
}

export async function writeSkill(name: string, content: string, cliId?: CliId): Promise<void> {
  const result = await window.electronAPI.skills.write(name, content, cliId)
  if (!result.success) throw new Error(result.error)
}

export async function deleteSkill(name: string, cliId?: CliId): Promise<void> {
  const result = await window.electronAPI.skills.delete(name, cliId)
  if (!result.success) throw new Error(result.error)
}

export async function renameSkill(oldName: string, newName: string, cliId?: CliId): Promise<void> {
  const result = await window.electronAPI.skills.rename(oldName, newName, cliId)
  if (!result.success) throw new Error(result.error)
}

export async function fetchSkillFromUrl(url: string): Promise<string> {
  const result = await window.electronAPI.skills.fetchUrl(url)
  if (!result.success) throw new Error(result.error)
  return result.data
}

export async function listPluginSkills(cliId?: CliId): Promise<PluginSkillEntry[]> {
  const result = await window.electronAPI.skills.listPluginSkills(cliId)
  if (!result.success) return []
  return result.data
}

export function openExternalUrl(url: string): void {
  window.open(url)
}
