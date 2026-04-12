import { create } from 'zustand'
import type { CliId } from '../types/cli.types'
import { toScopeKey } from '../types/cli.types'

export type PtySessionState = 'running' | 'waiting-input' | 'done'

interface PtyStore {
  states: Record<string, PtySessionState>
  setProjectState: (projectDir: string, state: PtySessionState | 'exited', cliId?: CliId) => void
}

export const usePtyStore = create<PtyStore>((set) => ({
  states: {},
  setProjectState: (projectDir, state, cliId) => {
    const scopeKey = toScopeKey(projectDir, cliId)
    set((store) => {
      const next = { ...store.states }
      if (state === 'exited') {
        delete next[scopeKey]
      } else {
        next[scopeKey] = state
      }
      return { states: next }
    })
  },
}))
