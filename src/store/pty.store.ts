import { create } from 'zustand'

export type PtySessionState = 'running' | 'waiting-input' | 'done'

interface PtyStore {
  states: Record<string, PtySessionState>
  setProjectState: (projectDir: string, state: PtySessionState | 'exited') => void  // 'done' is part of PtySessionState
}

export const usePtyStore = create<PtyStore>((set) => ({
  states: {},
  setProjectState: (projectDir, state) => {
    set((store) => {
      const next = { ...store.states }
      if (state === 'exited') {
        delete next[projectDir]
      } else {
        next[projectDir] = state
      }
      return { states: next }
    })
  },
}))
