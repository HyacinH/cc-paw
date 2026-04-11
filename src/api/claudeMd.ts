import type { CliId } from '../types/cli.types'

export async function readGlobalClaudeMd(cliId?: CliId): Promise<string | null> {
  const result = await window.electronAPI.claudeMd.readGlobal(cliId)
  if (!result.success) throw new Error(result.error)
  return result.data
}

export async function writeGlobalClaudeMd(content: string, cliId?: CliId): Promise<void> {
  const result = await window.electronAPI.claudeMd.writeGlobal(content, cliId)
  if (!result.success) throw new Error(result.error)
}

export async function readProjectClaudeMd(projectPath: string, cliId?: CliId): Promise<string | null> {
  const result = await window.electronAPI.claudeMd.readProject(projectPath, cliId)
  if (!result.success) throw new Error(result.error)
  return result.data
}

export async function writeProjectClaudeMd(projectPath: string, content: string, cliId?: CliId): Promise<void> {
  const result = await window.electronAPI.claudeMd.writeProject(projectPath, content, cliId)
  if (!result.success) throw new Error(result.error)
}
