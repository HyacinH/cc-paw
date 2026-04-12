import type { MCPConfig } from './mcp.types'
import type { IPCResult } from './ipc.types'
import type { SkillFile } from './skill.types'
import type { DocFile, DocsIndex } from './docs.types'
import type { SessionSnapshot, CurrentSessionInfo } from './snapshot.types'
import type { EditCommandId } from './edit-command.types'
import type { CliId } from './cli.types'

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
  byHour: Record<string, {
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

export interface ProjectEntry {
  dir: string       // absolute path — immutable, used as key everywhere
  alias?: string    // user-defined display name, optional
}

export interface AppSettings {
  projects?: ProjectEntry[]
  model?: string
  notifyOnDone?: boolean
  defaultCli?: CliId
}

export interface CliSettingsView {
  apiKey: string
  baseUrl: string
  defaultModel: string
  defaultSonnetModel: string
  defaultOpusModel: string
  defaultHaikuModel: string
}

interface ElectronAPI {
  platform: string
  windowsPty?: {
    backend: 'conpty' | 'winpty'
    buildNumber?: number
  }
  claudeMd: {
    readGlobal: (cliId?: CliId) => Promise<IPCResult<string | null>>
    writeGlobal: (content: string, cliId?: CliId) => Promise<IPCResult<void>>
    readProject: (projectPath: string, cliId?: CliId) => Promise<IPCResult<string | null>>
    writeProject: (projectPath: string, content: string, cliId?: CliId) => Promise<IPCResult<void>>
  }
  skills: {
    list: (cliId?: CliId) => Promise<IPCResult<SkillFile[]>>
    read: (name: string, cliId?: CliId) => Promise<IPCResult<string | null>>
    write: (name: string, content: string, cliId?: CliId) => Promise<IPCResult<void>>
    delete: (name: string, cliId?: CliId) => Promise<IPCResult<void>>
    rename: (oldName: string, newName: string, cliId?: CliId) => Promise<IPCResult<void>>
    fetchUrl: (url: string) => Promise<IPCResult<string>>
    openUrl: (url: string) => Promise<IPCResult<void>>
    listPluginSkills: (cliId?: CliId) => Promise<IPCResult<PluginSkillEntry[]>>
  }
  mcp: {
    read: (cliId?: CliId) => Promise<IPCResult<MCPConfig>>
    write: (config: MCPConfig, cliId?: CliId) => Promise<IPCResult<void>>
  }
  dialog: {
    openDirectory: () => Promise<IPCResult<string | null>>
  }
  appSettings: {
    read: () => Promise<IPCResult<AppSettings>>
    write: (settings: AppSettings) => Promise<IPCResult<void>>
  }
  cliSettings: {
    read: (cliId?: CliId) => Promise<IPCResult<CliSettingsView>>
    write: (patch: Partial<CliSettingsView>, cliId?: CliId) => Promise<IPCResult<void>>
  }
  windowControls: {
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<boolean>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    appIcon: () => Promise<string | null>
  }
  menu: {
    invoke: (commandId: EditCommandId) => Promise<boolean>
  }
  pty: {
    create: (projectDir: string, newSession: boolean, resumeId?: string, cliId?: CliId) => Promise<IPCResult<void>>
    write: (projectDir: string, data: string, cliId?: CliId) => Promise<IPCResult<void>>
    resize: (projectDir: string, cols: number, rows: number, cliId?: CliId) => Promise<IPCResult<void>>
    kill: (projectDir: string, cliId?: CliId) => Promise<IPCResult<void>>
    getBuffer: (projectDir: string, cliId?: CliId) => Promise<IPCResult<string>>
    clearSession: (projectDir: string, cliId?: CliId) => Promise<IPCResult<void>>
    hasSession: (projectDir: string, cliId?: CliId) => Promise<IPCResult<boolean>>
    onData: (projectDir: string, callback: (data: string) => void, cliId?: CliId) => () => void
    onExit: (projectDir: string, callback: (code: number) => void, cliId?: CliId) => () => void
    onPtyState: (callback: (projectDir: string, state: 'running' | 'waiting-input' | 'done' | 'exited', cliId?: CliId) => void) => () => void
  }
  docs: {
    list: (projectDir: string) => Promise<IPCResult<DocFile[]>>
    read: (projectDir: string, relativePath: string) => Promise<IPCResult<string | null>>
    write: (projectDir: string, relativePath: string, content: string) => Promise<IPCResult<void>>
    generateIndex: (projectDir: string) => Promise<IPCResult<DocsIndex>>
  }
  usage: {
    getStats: (range?: { startDate: string; endDate: string; startTime?: string; endTime?: string }) => Promise<IPCResult<UsageStats>>
  }
  onFileChanged: (callback: (event: { path: string; type: string }) => void) => () => void
  shell: {
    run: (command: string) => Promise<{ success: boolean; output: string; exitCode: number }>
    findClaude: () => Promise<IPCResult<string>>
    findCodex: () => Promise<IPCResult<string>>
  }
  plugins: {
    listInstalled: () => Promise<IPCResult<InstalledPluginInfo[]>>
    setEnabled: (pluginKey: string, enabled: boolean) => Promise<IPCResult<void>>
    getAuthStatus: () => Promise<IPCResult<Record<string, { timestamp: number }>>>
  }
  debug: {
    timing: (scope: string, label: string, detail?: Record<string, unknown>) => void
  }
  snapshot: {
    list: (projectDir: string, cliId?: CliId) => Promise<IPCResult<SessionSnapshot[]>>
    save: (projectDir: string, name: string, description: string, cliId?: CliId) => Promise<IPCResult<SessionSnapshot>>
    delete: (projectDir: string, snapshotId: string, cliId?: CliId) => Promise<IPCResult<void>>
    currentId: (projectDir: string, cliId?: CliId) => Promise<IPCResult<CurrentSessionInfo>>
    summarize: (projectDir: string, cliId?: CliId) => Promise<IPCResult<string>>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
