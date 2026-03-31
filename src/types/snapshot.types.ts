export interface SessionSnapshot {
  uid: string          // Unique per-record identifier (crypto.randomUUID)
  id: string           // Claude conversation UUID (JSONL filename without .jsonl)
  name: string         // User-provided name (required)
  description: string  // User-provided description (optional, may be empty string)
  savedAt: string      // ISO 8601 timestamp
}

export type SnapshotStore = Record<string, SessionSnapshot[]>
