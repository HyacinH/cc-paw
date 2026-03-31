import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import type { SessionSnapshot, SnapshotStore } from '../../src/types/snapshot.types'

function snapshotsPath(): string {
  return path.join(app.getPath('userData'), 'session-snapshots.json')
}

async function loadStore(): Promise<SnapshotStore> {
  try {
    const data = await fs.readFile(snapshotsPath(), 'utf-8')
    return JSON.parse(data) as SnapshotStore
  } catch {
    return {}
  }
}

async function saveStore(store: SnapshotStore): Promise<void> {
  await fs.writeFile(snapshotsPath(), JSON.stringify(store, null, 2), 'utf-8')
}

export async function listSnapshots(projectDir: string): Promise<SessionSnapshot[]> {
  const store = await loadStore()
  const list = store[projectDir] ?? []
  return [...list].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

export async function saveSnapshot(
  projectDir: string,
  name: string,
  description: string
): Promise<SessionSnapshot> {
  const id = await getCurrentSessionId(projectDir)
  if (!id) throw new Error('当前没有可暂存的会话')

  const snapshot: SessionSnapshot = {
    id,
    name,
    description,
    savedAt: new Date().toISOString(),
  }

  const store = await loadStore()
  const list = store[projectDir] ?? []
  store[projectDir] = [...list, snapshot]
  await saveStore(store)
  return snapshot
}

export async function deleteSnapshot(projectDir: string, snapshotId: string): Promise<void> {
  const store = await loadStore()
  const list = store[projectDir] ?? []
  store[projectDir] = list.filter((s) => s.id !== snapshotId)
  await saveStore(store)
}

/**
 * Find the UUID of the most recently modified Claude conversation for this project.
 * Claude Code stores conversations as UUID.jsonl files in
 * ~/.claude/projects/<encoded-path>/
 * where encoded-path replaces every non-alphanumeric char with '-'.
 */
export async function getCurrentSessionId(projectDir: string): Promise<string | null> {
  // Encode: replace any run of non-alphanumeric chars with '-'
  const encoded = projectDir.replace(/[^a-zA-Z0-9]+/g, '-')
  const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects')

  // Try exact encoded match first; fall back to scanning all dirs
  const candidates = [encoded]
  try {
    const all = await fs.readdir(claudeProjectsDir)
    for (const dir of all) {
      if (!candidates.includes(dir)) candidates.push(dir)
    }
  } catch {
    return null
  }

  for (const candidate of candidates) {
    const dirPath = path.join(claudeProjectsDir, candidate)
    try {
      const entries = await fs.readdir(dirPath)
      const jsonlFiles = entries.filter((f) => f.endsWith('.jsonl'))
      if (jsonlFiles.length === 0) continue

      const withStats = await Promise.all(
        jsonlFiles.map(async (f) => ({
          name: f,
          mtime: (await fs.stat(path.join(dirPath, f))).mtimeMs,
        }))
      )
      withStats.sort((a, b) => b.mtime - a.mtime)
      return withStats[0].name.replace(/\.jsonl$/, '')
    } catch {
      continue
    }
  }

  return null
}
