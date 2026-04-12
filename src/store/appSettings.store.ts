import { create } from 'zustand'
import { readAppSettings, writeAppSettings } from '../api/appSettings'
import type { AppSettings, ProjectEntry } from '../types/electron'
import { DEFAULT_CLI_ID, normalizeCliId } from '../types/cli.types'

function normalizeProjectEntry(input: unknown): ProjectEntry | null {
  if (typeof input === 'string') {
    return { dir: input }
  }
  if (!input || typeof input !== 'object') return null
  const maybe = input as Partial<ProjectEntry>
  if (!maybe.dir || typeof maybe.dir !== 'string') return null
  return {
    dir: maybe.dir,
    alias: typeof maybe.alias === 'string' ? maybe.alias : undefined,
  }
}

interface AppSettingsState {
  projects: ProjectEntry[]
  defaultCli: AppSettings['defaultCli']
  model: string | undefined
  notifyOnDone: boolean
  loaded: boolean
  load: () => Promise<void>
  save: (patch: Partial<AppSettings>) => Promise<void>
  addProject: (dir: string) => Promise<void>
  removeProject: (dir: string) => Promise<void>
  setAlias: (dir: string, alias: string | undefined) => Promise<void>
}

export const useAppSettingsStore = create<AppSettingsState>((set, get) => ({
  projects: [],
  defaultCli: DEFAULT_CLI_ID,
  model: undefined,
  notifyOnDone: true,
  loaded: false,

  load: async () => {
    if (get().loaded) return
    const s = await readAppSettings()
    const normalizedDefaultCli = normalizeCliId(s.defaultCli)
    // Migrate old format and normalize missing/invalid cliId values.
    const rawProjects: unknown[] = (s.projects as unknown[]) ?? []
    const projects: ProjectEntry[] = rawProjects
      .map((p) => normalizeProjectEntry(p))
      .filter((p): p is ProjectEntry => p !== null)
    const needsMigration = rawProjects.length !== projects.length
      || rawProjects.some((p) => {
        if (typeof p === 'string') return true
        if (!p || typeof p !== 'object') return true
        const entry = p as Record<string, unknown>
        return 'cliId' in entry
      })
    const defaultCliNeedsMigration = s.defaultCli !== normalizedDefaultCli
    if (needsMigration) {
      await writeAppSettings({ ...s, projects, defaultCli: normalizedDefaultCli })
    } else if (defaultCliNeedsMigration) {
      await writeAppSettings({ ...s, defaultCli: normalizedDefaultCli })
    }
    set({
      projects,
      defaultCli: normalizedDefaultCli,
      model: s.model,
      notifyOnDone: s.notifyOnDone !== false,
      loaded: true,
    })
  },

  save: async (patch) => {
    const current = await readAppSettings()
    const projectsInput = patch.projects ?? current.projects
    const nextDefaultCli = normalizeCliId(patch.defaultCli ?? current.defaultCli)
    const mergedProjects = projectsInput === undefined
      ? undefined
      : projectsInput
        .map((p) => normalizeProjectEntry(p))
        .filter((p): p is ProjectEntry => p !== null)
    const next = mergedProjects === undefined
      ? { ...current, ...patch, defaultCli: nextDefaultCli }
      : { ...current, ...patch, projects: mergedProjects, defaultCli: nextDefaultCli }
    await writeAppSettings(next)
    set({
      projects: next.projects ?? [],
      defaultCli: next.defaultCli ?? DEFAULT_CLI_ID,
      model: next.model,
      notifyOnDone: next.notifyOnDone !== false,
    })
  },

  addProject: async (dir) => {
    const { projects, save } = get()
    if (projects.some((p) => p.dir === dir)) return
    await save({ projects: [...projects, { dir }] })
  },

  removeProject: async (dir) => {
    const { projects, save } = get()
    await save({ projects: projects.filter((p) => p.dir !== dir) })
  },

  setAlias: async (dir, alias) => {
    const { projects, save } = get()
    const updated = projects.map((p) => {
      if (p.dir !== dir) return p
      return alias ? { ...p, alias } : { dir: p.dir }
    })
    await save({ projects: updated })
  },
}))
