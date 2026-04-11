import type { CliId } from '../../../src/types/cli.types'
import type { CliProvider } from './types'
import { claudeProvider } from './claude.provider'
import { codexProvider } from './codex.provider'

const DEFAULT_CLI_ID: CliId = 'claude'

function normalizeCliId(value: unknown): CliId {
  return value === 'codex' ? 'codex' : 'claude'
}

const providers: Record<CliId, CliProvider> = {
  claude: claudeProvider,
  codex: codexProvider,
}

export interface ResolvedCliProvider {
  requestedCliId: CliId
  provider: CliProvider
  effectiveCliId: CliId
  fellBack: boolean
}

export function resolveCliProvider(rawCliId: unknown): ResolvedCliProvider {
  const requestedCliId = normalizeCliId(rawCliId)
  const provider = providers[requestedCliId] ?? providers[DEFAULT_CLI_ID] ?? claudeProvider
  const effectiveCliId = provider.id

  return {
    requestedCliId,
    provider,
    effectiveCliId,
    fellBack: effectiveCliId !== requestedCliId,
  }
}
