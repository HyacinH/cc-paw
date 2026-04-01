import { create } from 'zustand'
import { readAppSettings, writeAppSettings } from '../api/appSettings'
import type { AppSettings, ProjectEntry } from '../types/electron'

interface AppSettingsState {
  projects: ProjectEntry[]
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
  model: undefined,
  notifyOnDone: true,
  loaded: false,

  load: async () => {
    if (get().loaded) return
    const s = await readAppSettings()
    // Migrate old format: projects used to be string[], now ProjectEntry[]
    const rawProjects: unknown[] = (s.projects as unknown[]) ?? []
    const needsMigration = rawProjects.some((p) => typeof p === 'string')
    const projects: ProjectEntry[] = rawProjects.map((p) =>
      typeof p === 'string' ? { dir: p } : (p as ProjectEntry)
    )
    if (needsMigration) {
      await writeAppSettings({ ...s, projects })
    }
    set({ projects, model: s.model, notifyOnDone: s.notifyOnDone !== false, loaded: true })
  },

  save: async (patch) => {
    const current = await readAppSettings()
    const next = { ...current, ...patch }
    await writeAppSettings(next)
    set({ projects: next.projects ?? [], model: next.model, notifyOnDone: next.notifyOnDone !== false })
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
