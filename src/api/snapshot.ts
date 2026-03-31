import type { SessionSnapshot } from '../types/snapshot.types'

export async function listSnapshots(projectDir: string): Promise<SessionSnapshot[]> {
  const result = await window.electronAPI.snapshot.list(projectDir)
  if (!result.success) throw new Error(result.error)
  return result.data
}

export async function saveSnapshot(
  projectDir: string,
  name: string,
  description: string
): Promise<SessionSnapshot> {
  const result = await window.electronAPI.snapshot.save(projectDir, name, description)
  if (!result.success) throw new Error(result.error)
  return result.data
}

export async function deleteSnapshot(projectDir: string, snapshotId: string): Promise<void> {
  const result = await window.electronAPI.snapshot.delete(projectDir, snapshotId)
  if (!result.success) throw new Error(result.error)
}
