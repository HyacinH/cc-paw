import type { SkillFile } from '../types/skill.types'
import type { PluginSkillEntry } from '../types/electron'

export async function listSkills(): Promise<SkillFile[]> {
  const result = await window.electronAPI.skills.list()
  if (!result.success) throw new Error(result.error)
  return result.data
}

export async function readSkill(name: string): Promise<string | null> {
  const result = await window.electronAPI.skills.read(name)
  if (!result.success) throw new Error(result.error)
  return result.data
}

export async function writeSkill(name: string, content: string): Promise<void> {
  const result = await window.electronAPI.skills.write(name, content)
  if (!result.success) throw new Error(result.error)
}

export async function deleteSkill(name: string): Promise<void> {
  const result = await window.electronAPI.skills.delete(name)
  if (!result.success) throw new Error(result.error)
}

export async function renameSkill(oldName: string, newName: string): Promise<void> {
  const result = await window.electronAPI.skills.rename(oldName, newName)
  if (!result.success) throw new Error(result.error)
}

export async function fetchSkillFromUrl(url: string): Promise<string> {
  const result = await window.electronAPI.skills.fetchUrl(url)
  if (!result.success) throw new Error(result.error)
  return result.data
}

export async function listPluginSkills(): Promise<PluginSkillEntry[]> {
  const result = await window.electronAPI.skills.listPluginSkills()
  if (!result.success) return []
  return result.data
}

export function openExternalUrl(url: string): void {
  window.open(url)
}
