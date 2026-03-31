import type { MCPConfig } from './mcp.types'
import type { IPCResult } from './ipc.types'
import type { SkillFile } from './skill.types'
import type { DocFile, DocsIndex } from './docs.types'
import type { SessionSnapshot } from './snapshot.types'

export interface InstalledPluginInfo {
  pluginKey: string
  pluginName: string
  marketplace: string
  version: string
  installPath: string
  scope: string
  enabled: boolean
  skillsCount: number
  mcpServer: {
    name?: string
    title?: string
    description?: string
    type: 'remote' | 'local'
    url?: string
    command?: string
    repositoryUrl?: string
  } | null
}

export interface PluginSkillEntry {
  skillName: string
  description: string
  pluginKey: string
  pluginName: string
  marketplace: string
  version: string
  content: string
  filePath: string
  referencesCount: number
}

export interface UsageStats {
  byProject: Record<string, {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    sessionCount: number
    messageCount: number
    estimatedCost: number
  }>
  byDate: Record<string, {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
  }>
  totals: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    sessionCount: number
    messageCount: number
    estimatedCost: number
  }
}

export interface AppSettings {
  projects?: string[]
  model?: string
  notifyOnDone?: boolean
}

export interface ClaudeCodeSettingsView {
  apiKeyHelper: string
  baseUrl: string
  defaultSonnetModel: string
  defaultOpusModel: string
  defaultHaikuModel: string
}

interface ElectronAPI {
  platform: string
  claudeMd: {
    readGlobal: () => Promise<IPCResult<string | null>>
    writeGlobal: (content: string) => Promise<IPCResult<void>>
    readProject: (projectPath: string) => Promise<IPCResult<string | null>>
    writeProject: (projectPath: string, content: string) => Promise<IPCResult<void>>
  }
  skills: {
    list: () => Promise<IPCResult<SkillFile[]>>
    read: (name: string) => Promise<IPCResult<string | null>>
    write: (name: string, content: string) => Promise<IPCResult<void>>
    delete: (name: string) => Promise<IPCResult<void>>
    rename: (oldName: string, newName: string) => Promise<IPCResult<void>>
    fetchUrl: (url: string) => Promise<IPCResult<string>>
    openUrl: (url: string) => Promise<IPCResult<void>>
    listPluginSkills: () => Promise<IPCResult<PluginSkillEntry[]>>
  }
  mcp: {
    read: () => Promise<IPCResult<MCPConfig>>
    write: (config: MCPConfig) => Promise<IPCResult<void>>
  }
  dialog: {
    openDirectory: () => Promise<IPCResult<string | null>>
  }
  appSettings: {
    read: () => Promise<IPCResult<AppSettings>>
    write: (settings: AppSettings) => Promise<IPCResult<void>>
  }
  claudeSettings: {
    read: () => Promise<IPCResult<ClaudeCodeSettingsView>>
    write: (patch: Partial<ClaudeCodeSettingsView>) => Promise<IPCResult<void>>
  }
  pty: {
    create: (projectDir: string, newSession: boolean, resumeId?: string) => Promise<IPCResult<void>>
    write: (projectDir: string, data: string) => Promise<IPCResult<void>>
    resize: (projectDir: string, cols: number, rows: number) => Promise<IPCResult<void>>
    kill: (projectDir: string) => Promise<IPCResult<void>>
    getBuffer: (projectDir: string) => Promise<IPCResult<string>>
    clearSession: (projectDir: string) => Promise<IPCResult<void>>
    hasSession: (projectDir: string) => Promise<IPCResult<boolean>>
    onData: (projectDir: string, callback: (data: string) => void) => () => void
    onExit: (projectDir: string, callback: (code: number) => void) => () => void
    onPtyState: (callback: (projectDir: string, state: 'running' | 'waiting-input' | 'done' | 'exited') => void) => () => void
  }
  docs: {
    list: (projectDir: string) => Promise<IPCResult<DocFile[]>>
    read: (projectDir: string, relativePath: string) => Promise<IPCResult<string | null>>
    write: (projectDir: string, relativePath: string, content: string) => Promise<IPCResult<void>>
    generateIndex: (projectDir: string) => Promise<IPCResult<DocsIndex>>
  }
  usage: {
    getStats: () => Promise<IPCResult<UsageStats>>
  }
  onFileChanged: (callback: (event: { path: string; type: string }) => void) => () => void
  shell: {
    run: (command: string) => Promise<{ success: boolean; output: string; exitCode: number }>
    findClaude: () => Promise<IPCResult<string>>
  }
  plugins: {
    listInstalled: () => Promise<IPCResult<InstalledPluginInfo[]>>
    setEnabled: (pluginKey: string, enabled: boolean) => Promise<IPCResult<void>>
    getAuthStatus: () => Promise<IPCResult<Record<string, { timestamp: number }>>>
  }
  snapshot: {
    list: (projectDir: string) => Promise<IPCResult<SessionSnapshot[]>>
    save: (projectDir: string, name: string, description: string) => Promise<IPCResult<SessionSnapshot>>
    delete: (projectDir: string, snapshotId: string) => Promise<IPCResult<void>>
    currentId: (projectDir: string) => Promise<IPCResult<string | null>>
    summarize: (projectDir: string) => Promise<IPCResult<string>>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
