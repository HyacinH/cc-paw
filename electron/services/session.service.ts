import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'

// PTY session 标记：记录每个项目是否有可续接的历史 session
type PtySessionStore = Record<string, boolean>

function ptySessionsPath(): string {
  return path.join(app.getPath('userData'), 'pty-sessions.json')
}

async function loadPtySessions(): Promise<PtySessionStore> {
  try {
    const data = await fs.readFile(ptySessionsPath(), 'utf-8')
    return JSON.parse(data) as PtySessionStore
  } catch {
    return {}
  }
}

async function savePtySessions(store: PtySessionStore): Promise<void> {
  await fs.writeFile(ptySessionsPath(), JSON.stringify(store, null, 2), 'utf-8')
}

export async function hasPreviousSession(projectDir: string): Promise<boolean> {
  const store = await loadPtySessions()
  return store[projectDir] === true
}

export async function markSessionExists(projectDir: string): Promise<void> {
  const store = await loadPtySessions()
  store[projectDir] = true
  await savePtySessions(store)
}

export async function clearPtySession(projectDir: string): Promise<void> {
  const store = await loadPtySessions()
  delete store[projectDir]
  await savePtySessions(store)
}
