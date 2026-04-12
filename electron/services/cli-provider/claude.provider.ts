import { findClaude } from '../platform'
import type { CliProvider, CliLaunchPlan } from './types'

export const claudeProvider: CliProvider = {
  id: 'claude',
  displayName: 'Claude Code',

  resolveLaunchPlan: async (ctx): Promise<CliLaunchPlan> => {
    const binary = findClaude()
    const sessionIntent = ctx.resumeId ? 'restore' : (ctx.newSession ? 'new' : 'auto')

    if (ctx.resumeId) {
      return {
        binary,
        args: ['--resume', ctx.resumeId],
        launchResumeId: ctx.resumeId,
        sessionIntent,
        idSource: 'explicit',
      }
    }

    if (!ctx.newSession) {
      const current = await ctx.getCurrentSession(ctx.projectDir)
      if (current.id) {
        return {
          binary,
          args: ['--resume', current.id],
          launchResumeId: current.id,
          sessionIntent,
          idSource: current.source,
        }
      }

      await ctx.clearPersistedSession(ctx.projectDir)
      return {
        binary,
        args: [],
        sessionIntent,
        idSource: current.source,
      }
    }

    return {
      binary,
      args: [],
      sessionIntent,
      idSource: 'none',
    }
  },
}

