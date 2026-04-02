import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { CLAUDE_PATHS } from './claude-paths'
import type { SessionSnapshot, SnapshotStore, CurrentSessionInfo } from '../../src/types/snapshot.types'

// Runtime hint for "current session": used to avoid relying only on file mtime
// when user explicitly restores a historical session via --resume.
const activeSessionByProject = new Map<string, string>()


function snapshotsPath(): string {
  return path.join(app.getPath('userData'), 'session-snapshots.json')
}

function projectSessionsDir(projectDir: string): string {
  const encoded = projectDir.replace(/[^a-zA-Z0-9]/g, '-')
  return path.join(CLAUDE_PATHS.projectsDir, encoded)
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
  // Upsert: drop any existing entry for this session, append updated snapshot, keep newest 9
  store[projectDir] = [...list.filter((s) => s.id !== id), snapshot]
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .slice(0, 9)
  await saveStore(store)
  return snapshot
}

export async function deleteSnapshot(projectDir: string, snapshotId: string): Promise<void> {
  const store = await loadStore()
  const list = store[projectDir] ?? []
  store[projectDir] = list.filter((s) => s.id !== snapshotId)
  await saveStore(store)
}

export function setActiveSessionId(projectDir: string, sessionId: string): void {
  activeSessionByProject.set(projectDir, sessionId)
}

export function clearActiveSessionId(projectDir: string): void {
  activeSessionByProject.delete(projectDir)
}

export async function hasSessionJsonl(projectDir: string, sessionId: string): Promise<boolean> {
  try {
    await fs.stat(path.join(projectSessionsDir(projectDir), `${sessionId}.jsonl`))
    return true
  } catch {
    return false
  }
}

/**
 * Resolve the current session id with source metadata for diagnostics.
 */
export async function getCurrentSession(projectDir: string): Promise<CurrentSessionInfo> {
  const t0 = Date.now()
  const activeId = activeSessionByProject.get(projectDir)
  if (activeId) {
    if (await hasSessionJsonl(projectDir, activeId)) {
      console.debug('[snapshot-service] current-id:active-hit', { dir: path.basename(projectDir), ms: Date.now() - t0 })
      return { id: activeId, source: 'active' }
    }

    activeSessionByProject.delete(projectDir)
    console.debug('[snapshot-service] current-id:active-stale', {
      dir: path.basename(projectDir),
      ms: Date.now() - t0,
      activeId,
    })
  }

  const dirPath = projectSessionsDir(projectDir)

  try {
    const entries = await fs.readdir(dirPath)
    const jsonlFiles = entries.filter((f) => f.endsWith('.jsonl'))
    if (jsonlFiles.length === 0) {
      console.debug('[snapshot-service] current-id:none', { dir: path.basename(projectDir), ms: Date.now() - t0 })
      return { id: null, source: 'none' }
    }

    const withStats = await Promise.all(
      jsonlFiles.map(async (f) => ({
        name: f,
        mtime: (await fs.stat(path.join(dirPath, f))).mtimeMs,
      }))
    )
    withStats.sort((a, b) => b.mtime - a.mtime)
    const id = withStats[0].name.replace(/\.jsonl$/, '')
    console.debug('[snapshot-service] current-id:scanned', {
      dir: path.basename(projectDir),
      ms: Date.now() - t0,
      files: jsonlFiles.length,
      id,
    })
    return { id, source: 'scan' }
  } catch {
    console.debug('[snapshot-service] current-id:error', { dir: path.basename(projectDir), ms: Date.now() - t0 })
    return { id: null, source: 'error' }
  }
}


/**
 * Find the UUID of the most recently modified Claude conversation for this project.
 * Claude Code stores conversations as UUID.jsonl files in
 * ~/.claude/projects/<encoded-path>/
 * where encoded-path replaces every non-alphanumeric char with '-'.
 */
export async function getCurrentSessionId(projectDir: string): Promise<string | null> {
  const current = await getCurrentSession(projectDir)
  return current.id
}
