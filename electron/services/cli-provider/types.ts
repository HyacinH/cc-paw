import type { CurrentSessionInfo } from '../../../src/types/snapshot.types'
import type { CliId } from '../../../src/types/cli.types'

export type SessionIntent = 'new' | 'restore' | 'auto'
export type SessionIdSource = 'explicit' | 'active' | 'scan' | 'none' | 'error'

export interface CliLaunchContext {
  projectDir: string
  newSession: boolean
  resumeId?: string
  getCurrentSession: (projectDir: string) => Promise<CurrentSessionInfo>
  clearPersistedSession: (projectDir: string) => Promise<void>
}

export interface CliLaunchPlan {
  binary: string
  args: string[]
  launchResumeId?: string
  sessionIntent: SessionIntent
  idSource: SessionIdSource
}

export interface CliProvider {
  id: CliId
  displayName: string
  resolveLaunchPlan: (ctx: CliLaunchContext) => Promise<CliLaunchPlan>
}

