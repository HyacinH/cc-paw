import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { normalizeCliId, toScopeKey, parseScopeKey } from './cli-scope'
import type { CliId } from '../../src/types/cli.types'
import type { SessionSnapshot } from '../../src/types/snapshot.types'

type PtySessionStore = Record<string, boolean>
type SnapshotStore = Record<string, SessionSnapshot[]>

interface ProjectEntryLike {
  dir: string
  alias?: string
  cliId?: CliId
}

interface AppSettingsLike {
  projects?: Array<string | ProjectEntryLike>
  defaultCli?: CliId
  notifyOnDone?: boolean
  model?: string
}

interface MigrationMeta {
  version: number
  updatedAt: string
}

interface MigrationStep {
  version: number
  name: string
  run: () => Promise<boolean>
}

const CURRENT_MIGRATION_VERSION = 3

function appSettingsPath(): string {
  return path.join(app.getPath('userData'), 'app-settings.json')
}

function ptySessionsPath(): string {
  return path.join(app.getPath('userData'), 'pty-sessions.json')
}

function snapshotsPath(): string {
  return path.join(app.getPath('userData'), 'session-snapshots.json')
}

function migrationMetaPath(): string {
  return path.join(app.getPath('userData'), 'data-migrations.json')
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content) as T
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

function normalizeProjectEntry(
  input: string | ProjectEntryLike,
  fallbackCli: CliId
): ProjectEntryLike | null {
  if (typeof input === 'string') {
    return { dir: input, cliId: fallbackCli }
  }
  if (!input || typeof input !== 'object' || typeof input.dir !== 'string') return null
  return {
    dir: input.dir,
    alias: typeof input.alias === 'string' ? input.alias : undefined,
    cliId: normalizeCliId(input.cliId),
  }
}

async function migrationV1AppSettings(): Promise<boolean> {
  const raw = await readJsonFile<AppSettingsLike>(appSettingsPath())
  if (!raw) return false

  const normalizedDefaultCli = normalizeCliId(raw.defaultCli)
  const rawProjects = Array.isArray(raw.projects) ? raw.projects : []
  const normalizedProjects = rawProjects
    .map((item) => normalizeProjectEntry(item, normalizedDefaultCli))
    .filter((item): item is ProjectEntryLike => item !== null)

  const projectsChanged = rawProjects.length !== normalizedProjects.length
    || rawProjects.some((item) => {
      if (typeof item === 'string') return true
      if (!item || typeof item !== 'object') return true
      return item.cliId !== 'claude' && item.cliId !== 'codex'
    })

  const defaultCliChanged = raw.defaultCli !== normalizedDefaultCli
  if (!projectsChanged && !defaultCliChanged) return false

  const next: AppSettingsLike = {
    ...raw,
    projects: normalizedProjects,
    defaultCli: normalizedDefaultCli,
  }
  await writeJsonFile(appSettingsPath(), next)
  return true
}

function normalizePtySessionStore(store: PtySessionStore): { next: PtySessionStore; changed: boolean } {
  const next: PtySessionStore = {}
  let changed = false

  for (const [rawKey, value] of Object.entries(store)) {
    const parsed = parseScopeKey(rawKey)
    const scopeKey = toScopeKey(parsed.projectDir, parsed.cliId)
    if (scopeKey !== rawKey) changed = true
    if (value) next[scopeKey] = true
  }

  return { next, changed }
}

async function migrationV2PtySessions(): Promise<boolean> {
  const raw = await readJsonFile<PtySessionStore>(ptySessionsPath())
  if (!raw) return false

  const normalized = normalizePtySessionStore(raw)
  if (!normalized.changed) return false

  await writeJsonFile(ptySessionsPath(), normalized.next)
  return true
}

function normalizeSnapshotStore(store: SnapshotStore): { next: SnapshotStore; changed: boolean } {
  const next: SnapshotStore = {}
  let changed = false

  for (const [rawKey, list] of Object.entries(store)) {
    const parsed = parseScopeKey(rawKey)
    const scopeKey = toScopeKey(parsed.projectDir, parsed.cliId)
    if (scopeKey !== rawKey) changed = true
    const existing = next[scopeKey] ?? []
    const merged = [...existing, ...(Array.isArray(list) ? list : [])]
    const deduped = merged.filter((item, index, arr) => arr.findIndex((x) => x.id === item.id) === index)
    next[scopeKey] = deduped
  }

  return { next, changed }
}

async function migrationV3Snapshots(): Promise<boolean> {
  const raw = await readJsonFile<SnapshotStore>(snapshotsPath())
  if (!raw) return false

  const normalized = normalizeSnapshotStore(raw)
  if (!normalized.changed) return false

  await writeJsonFile(snapshotsPath(), normalized.next)
  return true
}

async function readMigrationMetaVersion(): Promise<number> {
  const meta = await readJsonFile<MigrationMeta>(migrationMetaPath())
  if (!meta || typeof meta.version !== 'number' || !Number.isFinite(meta.version)) return 0
  return Math.max(0, Math.floor(meta.version))
}

async function writeMigrationMetaVersion(version: number): Promise<void> {
  await writeJsonFile(migrationMetaPath(), {
    version,
    updatedAt: new Date().toISOString(),
  } satisfies MigrationMeta)
}

export async function runDataMigrations(): Promise<void> {
  const steps: MigrationStep[] = [
    { version: 1, name: 'app-settings-normalize-cli', run: migrationV1AppSettings },
    { version: 2, name: 'pty-sessions-scope-keys', run: migrationV2PtySessions },
    { version: 3, name: 'snapshot-store-scope-keys', run: migrationV3Snapshots },
  ]

  let currentVersion = await readMigrationMetaVersion()
  if (currentVersion >= CURRENT_MIGRATION_VERSION) return

  console.log('[migration] start', { currentVersion, targetVersion: CURRENT_MIGRATION_VERSION })

  for (const step of steps) {
    if (step.version <= currentVersion) continue

    const t0 = Date.now()
    try {
      const changed = await step.run()
      currentVersion = step.version
      await writeMigrationMetaVersion(currentVersion)
      console.log('[migration] step:ok', {
        version: step.version,
        name: step.name,
        changed,
        ms: Date.now() - t0,
      })
    } catch (err) {
      console.warn('[migration] step:error', {
        version: step.version,
        name: step.name,
        ms: Date.now() - t0,
        err: String(err),
      })
      break
    }
  }

  console.log('[migration] done', { version: currentVersion })
}
