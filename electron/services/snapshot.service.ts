import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { CLAUDE_PATHS } from './claude-paths'
import type { SessionSnapshot, SnapshotStore } from '../../src/types/snapshot.types'

function snapshotsPath(): string {
  return path.join(app.getPath('userData'), 'session-snapshots.json')
}

async function loadStore(): Promise<SnapshotStore> {
  try {
    const data = await fs.readFile(snapshotsPath(), 'utf-8')
    const store = JSON.parse(data) as SnapshotStore
    // Migrate existing entries that lack a uid field
    let dirty = false
    for (const list of Object.values(store)) {
      for (const s of list) {
        if (!s.uid) {
          s.uid = crypto.randomUUID()
          dirty = true
        }
      }
    }
    if (dirty) await saveStore(store)
    return store
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
    uid: crypto.randomUUID(),
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

export async function deleteSnapshot(projectDir: string, uid: string): Promise<void> {
  const store = await loadStore()
  const list = store[projectDir] ?? []
  store[projectDir] = list.filter((s) => s.uid !== uid)
  await saveStore(store)
}

/**
 * Find the UUID of the most recently modified Claude conversation for this project.
 * Claude Code stores conversations as UUID.jsonl files in
 * ~/.claude/projects/<encoded-path>/
 * where encoded-path replaces every non-alphanumeric char with '-'.
 */
export async function getCurrentSessionId(projectDir: string): Promise<string | null> {
  // Encode: replace each non-alphanumeric char with '-'
  const encoded = projectDir.replace(/[^a-zA-Z0-9]/g, '-')
  const dirPath = path.join(CLAUDE_PATHS.projectsDir, encoded)

  try {
    const entries = await fs.readdir(dirPath)
    const jsonlFiles = entries.filter((f) => f.endsWith('.jsonl'))
    if (jsonlFiles.length === 0) return null

    const withStats = await Promise.all(
      jsonlFiles.map(async (f) => ({
        name: f,
        mtime: (await fs.stat(path.join(dirPath, f))).mtimeMs,
      }))
    )
    withStats.sort((a, b) => b.mtime - a.mtime)
    return withStats[0].name.replace(/\.jsonl$/, '')
  } catch {
    return null
  }
}
