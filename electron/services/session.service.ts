import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import type { CliId } from '../../src/types/cli.types'
import { DEFAULT_CLI_ID, toScopeKey } from './cli-scope'

// PTY session marker: whether a project has a resumable session per CLI scope.
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

export async function hasPreviousSession(projectDir: string, cliId: CliId = DEFAULT_CLI_ID): Promise<boolean> {
  const store = await loadPtySessions()
  return store[toScopeKey(projectDir, cliId)] === true
}

export async function markSessionExists(projectDir: string, cliId: CliId = DEFAULT_CLI_ID): Promise<void> {
  const store = await loadPtySessions()
  store[toScopeKey(projectDir, cliId)] = true
  await savePtySessions(store)
}

export async function clearPtySession(projectDir: string, cliId: CliId = DEFAULT_CLI_ID): Promise<void> {
  const store = await loadPtySessions()
  delete store[toScopeKey(projectDir, cliId)]
  await savePtySessions(store)
}
