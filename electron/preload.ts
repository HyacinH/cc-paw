import { contextBridge, ipcRenderer } from 'electron'
import type { MCPConfig } from '../src/types/mcp.types'
import type { AppSettings } from './ipc/app-settings.handler'
import type { CliSettingsView } from './ipc/cli-settings.handler'
import type { SessionSnapshot } from '../src/types/snapshot.types'
import type { CliId } from '../src/types/cli.types'

const isWin = process.platform === 'win32'
const windowsPty = isWin
  ? {
      // Avoid Node 'os' dependency in preload so injection stays stable.
      // Keep xterm backend hint aligned with node-pty(useConpty: true).
      backend: 'conpty' as const,
    }
  : undefined

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  windowsPty,
  claudeMd: {
    readGlobal: (cliId?: CliId) => ipcRenderer.invoke('claude-md:read-global', cliId),
    writeGlobal: (content: string, cliId?: CliId) => ipcRenderer.invoke('claude-md:write-global', content, cliId),
    readProject: (projectPath: string, cliId?: CliId) => ipcRenderer.invoke('claude-md:read-project', projectPath, cliId),
    writeProject: (projectPath: string, content: string, cliId?: CliId) =>
      ipcRenderer.invoke('claude-md:write-project', projectPath, content, cliId),
  },
  skills: {
    list: (cliId?: CliId) => ipcRenderer.invoke('skills:list', cliId),
    read: (name: string, cliId?: CliId) => ipcRenderer.invoke('skills:read', name, cliId),
    write: (name: string, content: string, cliId?: CliId) => ipcRenderer.invoke('skills:write', name, content, cliId),
    delete: (name: string, cliId?: CliId) => ipcRenderer.invoke('skills:delete', name, cliId),
    rename: (oldName: string, newName: string, cliId?: CliId) => ipcRenderer.invoke('skills:rename', oldName, newName, cliId),
    fetchUrl: (url: string) => ipcRenderer.invoke('skills:fetch-url', url),
    openUrl: (url: string) => ipcRenderer.invoke('skills:open-url', url),
    listPluginSkills: (cliId?: CliId) => ipcRenderer.invoke('skills:list-plugin-skills', cliId),
  },
  mcp: {
    read: (cliId?: CliId) => ipcRenderer.invoke('mcp:read', cliId),
    write: (config: MCPConfig, cliId?: CliId) => ipcRenderer.invoke('mcp:write', config, cliId),
  },
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
  },
  appSettings: {
    read: () => ipcRenderer.invoke('app-settings:read'),
    write: (settings: AppSettings) => ipcRenderer.invoke('app-settings:write', settings),
  },
  cliSettings: {
    read: (cliId?: CliId) => ipcRenderer.invoke('cli-settings:read', cliId),
    write: (patch: Partial<CliSettingsView>, cliId?: CliId) => ipcRenderer.invoke('cli-settings:write', patch, cliId),
  },
  windowControls: {
    minimize: () => ipcRenderer.invoke('window-controls:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window-controls:toggle-maximize'),
    close: () => ipcRenderer.invoke('window-controls:close'),
    isMaximized: () => ipcRenderer.invoke('window-controls:is-maximized'),
    appIcon: () => ipcRenderer.invoke('window-controls:app-icon'),
  },
  menu: {
    invoke: (commandId: string) => ipcRenderer.invoke('app-menu:invoke', commandId),
  },
  pty: {
    create: (projectDir: string, newSession: boolean, resumeId?: string, cliId?: CliId) =>
      ipcRenderer.invoke('pty:create', projectDir, newSession, resumeId, cliId),
    write: (projectDir: string, data: string, cliId?: CliId) => ipcRenderer.invoke('pty:write', projectDir, data, cliId),
    resize: (projectDir: string, cols: number, rows: number, cliId?: CliId) => ipcRenderer.invoke('pty:resize', projectDir, cols, rows, cliId),
    kill: (projectDir: string, cliId?: CliId) => ipcRenderer.invoke('pty:kill', projectDir, cliId),
    getBuffer: (projectDir: string, cliId?: CliId) => ipcRenderer.invoke('pty:get-buffer', projectDir, cliId),
    clearSession: (projectDir: string, cliId?: CliId) => ipcRenderer.invoke('pty:clear-session', projectDir, cliId),
    hasSession: (projectDir: string, cliId?: CliId) => ipcRenderer.invoke('pty:has-session', projectDir, cliId),
    onData: (projectDir: string, callback: (data: string) => void, cliId?: CliId) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: { projectDir: string; data: string; cliId?: CliId }) => {
        if (payload.projectDir === projectDir && (!cliId || payload.cliId === cliId)) callback(payload.data)
      }
      ipcRenderer.on('pty:data', handler)
      return () => ipcRenderer.removeListener('pty:data', handler)
    },
    onExit: (projectDir: string, callback: (code: number) => void, cliId?: CliId) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: { projectDir: string; code: number; cliId?: CliId }) => {
        if (payload.projectDir === projectDir && (!cliId || payload.cliId === cliId)) callback(payload.code)
      }
      ipcRenderer.on('pty:exit', handler)
      return () => ipcRenderer.removeListener('pty:exit', handler)
    },
    onPtyState: (callback: (projectDir: string, state: 'running' | 'waiting-input' | 'done' | 'exited', cliId?: CliId) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: { projectDir: string; state: 'running' | 'waiting-input' | 'done' | 'exited'; cliId?: CliId }) => {
        callback(payload.projectDir, payload.state, payload.cliId)
      }
      ipcRenderer.on('pty:state', handler)
      return () => ipcRenderer.removeListener('pty:state', handler)
    },
  },
  docs: {
    list: (projectDir: string) => ipcRenderer.invoke('docs:list', projectDir),
    read: (projectDir: string, relativePath: string) =>
      ipcRenderer.invoke('docs:read', projectDir, relativePath),
    write: (projectDir: string, relativePath: string, content: string) =>
      ipcRenderer.invoke('docs:write', projectDir, relativePath, content),
    generateIndex: (projectDir: string) => ipcRenderer.invoke('docs:generate-index', projectDir),
  },
  usage: {
    getStats: (range?: { startDate: string; endDate: string; startTime?: string; endTime?: string }) => ipcRenderer.invoke('usage:get-stats', range),
  },
  onFileChanged: (callback: (event: { path: string; type: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { path: string; type: string }) =>
      callback(data)
    ipcRenderer.on('file:changed', handler)
    return () => ipcRenderer.removeListener('file:changed', handler)
  },
  shell: {
    run: (command: string) => ipcRenderer.invoke('shell:run', command),
    findClaude: () => ipcRenderer.invoke('shell:find-claude'),
    findCodex: () => ipcRenderer.invoke('shell:find-codex'),
  },
  plugins: {
    listInstalled: () => ipcRenderer.invoke('plugins:list-installed'),
    setEnabled: (pluginKey: string, enabled: boolean) =>
      ipcRenderer.invoke('plugins:set-enabled', pluginKey, enabled),
    getAuthStatus: () => ipcRenderer.invoke('plugins:get-auth-status'),
  },
  debug: {
    timing: (scope: string, label: string, detail?: Record<string, unknown>) =>
      ipcRenderer.send('debug:timing', { scope, label, detail }),
  },
  snapshot: {
    list: (projectDir: string, cliId?: CliId) => ipcRenderer.invoke('snapshot:list', projectDir, cliId),
    save: (projectDir: string, name: string, description: string, cliId?: CliId) =>
      ipcRenderer.invoke('snapshot:save', projectDir, name, description, cliId),
    delete: (projectDir: string, snapshotId: string, cliId?: CliId) =>
      ipcRenderer.invoke('snapshot:delete', projectDir, snapshotId, cliId),
    currentId: (projectDir: string, cliId?: CliId) => ipcRenderer.invoke('snapshot:current-id', projectDir, cliId),
    summarize: (projectDir: string, cliId?: CliId) => ipcRenderer.invoke('snapshot:summarize', projectDir, cliId),
  },
})
