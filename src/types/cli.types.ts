export type CliId = 'claude' | 'codex'

export const DEFAULT_CLI_ID: CliId = 'claude'

export function normalizeCliId(value: unknown): CliId {
  return value === 'codex' ? 'codex' : DEFAULT_CLI_ID
}

export function toScopeKey(projectDir: string, cliId?: unknown): string {
  return `${normalizeCliId(cliId)}::${projectDir}`
}

export function parseScopeKey(rawKey: string): { projectDir: string; cliId: CliId } {
  if (rawKey.startsWith('claude::')) {
    return { cliId: 'claude', projectDir: rawKey.slice('claude::'.length) }
  }
  if (rawKey.startsWith('codex::')) {
    return { cliId: 'codex', projectDir: rawKey.slice('codex::'.length) }
  }
  return { cliId: DEFAULT_CLI_ID, projectDir: rawKey }
}
