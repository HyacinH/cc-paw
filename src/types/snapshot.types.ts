export interface SessionSnapshot {
  id: string           // Claude conversation UUID (JSONL filename without .jsonl)
  name: string         // User-provided name (required)
  description: string  // User-provided description (optional, may be empty string)
  savedAt: string      // ISO 8601 timestamp
}

export type SnapshotStore = Record<string, SessionSnapshot[]>

export type CurrentSessionSource = 'active' | 'scan' | 'none' | 'error'

export interface CurrentSessionInfo {
  id: string | null
  source: CurrentSessionSource
}
