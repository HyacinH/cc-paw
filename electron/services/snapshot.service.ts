import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import { CLAUDE_PATHS } from './claude-paths'
import type { SessionSnapshot, SnapshotStore, CurrentSessionInfo } from '../../src/types/snapshot.types'
import type { CliId } from '../../src/types/cli.types'
import { DEFAULT_CLI_ID, toScopeKey } from './cli-scope'

// Runtime hint for current session id, isolated by CLI scope.
const activeSessionByScope = new Map<string, string>()

function snapshotsPath(): string {
  return path.join(app.getPath('userData'), 'session-snapshots.json')
}

function projectSessionsDir(projectDir: string): string {
  const encoded = projectDir.replace(/[^a-zA-Z0-9]/g, '-')
  return path.join(CLAUDE_PATHS.projectsDir, encoded)
}

function codexSessionsDir(): string {
  return path.join(os.homedir(), '.codex', 'sessions')
}

function normalizeDirForCompare(dir: string): string {
  const normalized = path.resolve(dir).replace(/\\/g, '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

async function listFilesRecursive(root: string): Promise<string[]> {
  const out: string[] = []
  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true })
    await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
        return
      }
      if (entry.isFile()) out.push(fullPath)
    }))
  }
  await walk(root)
  return out
}

async function listCodexSessionFiles(): Promise<string[]> {
  try {
    const files = await listFilesRecursive(codexSessionsDir())
    return files.filter((f) => f.endsWith('.jsonl'))
  } catch {
    return []
  }
}

async function readFirstLine(filePath: string, maxBytes = 8192): Promise<string> {
  const handle = await fs.open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(maxBytes)
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0)
    if (bytesRead <= 0) return ''
    const chunk = buffer.toString('utf8', 0, bytesRead)
    const newline = chunk.indexOf('\n')
    return (newline >= 0 ? chunk.slice(0, newline) : chunk).trim()
  } finally {
    await handle.close()
  }
}

async function readCodexSessionMeta(filePath: string): Promise<{ id: string; cwd: string } | null> {
  try {
    const firstLine = await readFirstLine(filePath)
    if (!firstLine) return null
    const obj = JSON.parse(firstLine) as {
      type?: string
      payload?: { id?: string; cwd?: string }
    }
    if (obj.type !== 'session_meta') return null
    const id = obj.payload?.id
    const cwd = obj.payload?.cwd
    if (!id || !cwd) return null
    return { id, cwd }
  } catch {
    return null
  }
}

async function hasCodexSessionJsonlById(sessionId: string): Promise<boolean> {
  const files = await listCodexSessionFiles()
  return files.some((f) => f.endsWith(`${sessionId}.jsonl`))
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

function isCliSessionScanSupported(cliId: CliId): boolean {
  return cliId === 'claude' || cliId === 'codex'
}

export async function listSnapshots(projectDir: string, cliId: CliId = DEFAULT_CLI_ID): Promise<SessionSnapshot[]> {
  const store = await loadStore()
  const list = store[toScopeKey(projectDir, cliId)] ?? []
  return [...list].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

export async function saveSnapshot(
  projectDir: string,
  name: string,
  description: string,
  cliId: CliId = DEFAULT_CLI_ID
): Promise<SessionSnapshot> {
  const id = await getCurrentSessionId(projectDir, cliId)
  if (!id) throw new Error('当前没有可暂存的会话')

  const snapshot: SessionSnapshot = {
    id,
    name,
    description,
    savedAt: new Date().toISOString(),
  }

  const store = await loadStore()
  const scopeKey = toScopeKey(projectDir, cliId)
  const list = store[scopeKey] ?? []
  store[scopeKey] = [...list.filter((s) => s.id !== id), snapshot]
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .slice(0, 9)
  await saveStore(store)
  return snapshot
}

export async function deleteSnapshot(projectDir: string, snapshotId: string, cliId: CliId = DEFAULT_CLI_ID): Promise<void> {
  const store = await loadStore()
  const scopeKey = toScopeKey(projectDir, cliId)
  const list = store[scopeKey] ?? []
  store[scopeKey] = list.filter((s) => s.id !== snapshotId)
  await saveStore(store)
}

export function setActiveSessionId(projectDir: string, sessionId: string, cliId: CliId = DEFAULT_CLI_ID): void {
  activeSessionByScope.set(toScopeKey(projectDir, cliId), sessionId)
}

export function clearActiveSessionId(projectDir: string, cliId?: CliId): void {
  if (cliId) {
    activeSessionByScope.delete(toScopeKey(projectDir, cliId))
    return
  }

  activeSessionByScope.delete(toScopeKey(projectDir, 'claude'))
  activeSessionByScope.delete(toScopeKey(projectDir, 'codex'))
}

export async function hasSessionJsonl(
  projectDir: string,
  sessionId: string,
  cliId: CliId = DEFAULT_CLI_ID
): Promise<boolean> {
  if (!isCliSessionScanSupported(cliId)) return false

  if (cliId === 'codex') {
    return hasCodexSessionJsonlById(sessionId)
  }

  try {
    await fs.stat(path.join(projectSessionsDir(projectDir), `${sessionId}.jsonl`))
    return true
  } catch {
    return false
  }
}

/**
 * Resolve current session id with source metadata for diagnostics.
 */
export async function getCurrentSession(
  projectDir: string,
  cliId: CliId = DEFAULT_CLI_ID
): Promise<CurrentSessionInfo> {
  if (!isCliSessionScanSupported(cliId)) {
    return { id: null, source: 'none' }
  }

  const t0 = Date.now()
  const scopeKey = toScopeKey(projectDir, cliId)
  const activeId = activeSessionByScope.get(scopeKey)
  if (activeId) {
    if (await hasSessionJsonl(projectDir, activeId, cliId)) {
      console.debug('[snapshot-service] current-id:active-hit', {
        cliId,
        dir: path.basename(projectDir),
        ms: Date.now() - t0,
      })
      return { id: activeId, source: 'active' }
    }

    activeSessionByScope.delete(scopeKey)
    console.debug('[snapshot-service] current-id:active-stale', {
      cliId,
      dir: path.basename(projectDir),
      ms: Date.now() - t0,
      activeId,
    })
  }

  if (cliId === 'codex') {
    const expectedDir = normalizeDirForCompare(projectDir)
    const files = await listCodexSessionFiles()
    const withStats = await Promise.all(files.map(async (filePath) => ({
      filePath,
      mtime: (await fs.stat(filePath)).mtimeMs,
    })))
    withStats.sort((a, b) => b.mtime - a.mtime)

    for (const file of withStats) {
      const meta = await readCodexSessionMeta(file.filePath)
      if (!meta) continue
      if (normalizeDirForCompare(meta.cwd) !== expectedDir) continue
      console.debug('[snapshot-service] current-id:scanned', {
        cliId,
        dir: path.basename(projectDir),
        ms: Date.now() - t0,
        files: files.length,
        id: meta.id,
      })
      return { id: meta.id, source: 'scan' }
    }

    console.debug('[snapshot-service] current-id:none', {
      cliId,
      dir: path.basename(projectDir),
      ms: Date.now() - t0,
    })
    return { id: null, source: 'none' }
  }

  const dirPath = projectSessionsDir(projectDir)
  try {
    const entries = await fs.readdir(dirPath)
    const jsonlFiles = entries.filter((f) => f.endsWith('.jsonl'))
    if (jsonlFiles.length === 0) {
      console.debug('[snapshot-service] current-id:none', {
        cliId,
        dir: path.basename(projectDir),
        ms: Date.now() - t0,
      })
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
      cliId,
      dir: path.basename(projectDir),
      ms: Date.now() - t0,
      files: jsonlFiles.length,
      id,
    })
    return { id, source: 'scan' }
  } catch {
    console.debug('[snapshot-service] current-id:error', {
      cliId,
      dir: path.basename(projectDir),
      ms: Date.now() - t0,
    })
    return { id: null, source: 'error' }
  }
}

export async function getCurrentSessionId(projectDir: string, cliId: CliId = DEFAULT_CLI_ID): Promise<string | null> {
  const current = await getCurrentSession(projectDir, cliId)
  return current.id
}
