import type { SessionSnapshot, CurrentSessionInfo } from '../types/snapshot.types'
import type { CliId } from '../types/cli.types'

export async function listSnapshots(projectDir: string, cliId?: CliId): Promise<SessionSnapshot[]> {
  const result = await window.electronAPI.snapshot.list(projectDir, cliId)
  if (!result.success) throw new Error(result.error)
  return result.data
}

export async function saveSnapshot(
  projectDir: string,
  name: string,
  description: string,
  cliId?: CliId
): Promise<SessionSnapshot> {
  const result = await window.electronAPI.snapshot.save(projectDir, name, description, cliId)
  if (!result.success) throw new Error(result.error)
  return result.data
}

export async function deleteSnapshot(projectDir: string, snapshotId: string, cliId?: CliId): Promise<void> {
  const result = await window.electronAPI.snapshot.delete(projectDir, snapshotId, cliId)
  if (!result.success) throw new Error(result.error)
}

export async function getCurrentSession(projectDir: string, cliId?: CliId): Promise<CurrentSessionInfo> {
  const result = await window.electronAPI.snapshot.currentId(projectDir, cliId)
  if (!result.success) return { id: null, source: 'error' }
  return result.data
}

export async function getCurrentSessionId(projectDir: string, cliId?: CliId): Promise<string | null> {
  const current = await getCurrentSession(projectDir, cliId)
  return current.id
}

export async function summarizeSession(projectDir: string, cliId?: CliId): Promise<string> {
  const result = await window.electronAPI.snapshot.summarize(projectDir, cliId)
  if (!result.success) throw new Error(result.error)
  return result.data
}
