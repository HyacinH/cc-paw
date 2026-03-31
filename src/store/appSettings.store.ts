import { create } from 'zustand'
import { readAppSettings, writeAppSettings } from '../api/appSettings'
import type { AppSettings } from '../types/electron'

interface AppSettingsState {
  projects: string[]
  model: string | undefined
  notifyOnDone: boolean
  loaded: boolean
  load: () => Promise<void>
  save: (patch: Partial<AppSettings>) => Promise<void>
  addProject: (dir: string) => Promise<void>
  removeProject: (dir: string) => Promise<void>
}

export const useAppSettingsStore = create<AppSettingsState>((set, get) => ({
  projects: [],
  model: undefined,
  notifyOnDone: true,
  loaded: false,

  load: async () => {
    if (get().loaded) return
    const s = await readAppSettings()
    set({ projects: s.projects ?? [], model: s.model, notifyOnDone: s.notifyOnDone !== false, loaded: true })
  },

  save: async (patch) => {
    const current = await readAppSettings()
    const next = { ...current, ...patch }
    await writeAppSettings(next)
    set({ projects: next.projects ?? [], model: next.model, notifyOnDone: next.notifyOnDone !== false })
  },

  addProject: async (dir) => {
    const { projects, save } = get()
    if (projects.includes(dir)) return
    await save({ projects: [...projects, dir] })
  },

  removeProject: async (dir) => {
    const { projects, save } = get()
    await save({ projects: projects.filter((p) => p !== dir) })
  },
}))
