import { contextBridge, ipcRenderer } from 'electron'
import type { MCPConfig } from '../src/types/mcp.types'
import type { AppSettings } from './ipc/app-settings.handler'
import type { ClaudeCodeSettingsView } from './ipc/claude-settings.handler'
import type { SessionSnapshot } from '../src/types/snapshot.types'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  claudeMd: {
    readGlobal: () => ipcRenderer.invoke('claude-md:read-global'),
    writeGlobal: (content: string) => ipcRenderer.invoke('claude-md:write-global', content),
    readProject: (projectPath: string) => ipcRenderer.invoke('claude-md:read-project', projectPath),
    writeProject: (projectPath: string, content: string) =>
      ipcRenderer.invoke('claude-md:write-project', projectPath, content),
  },
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    read: (name: string) => ipcRenderer.invoke('skills:read', name),
    write: (name: string, content: string) => ipcRenderer.invoke('skills:write', name, content),
    delete: (name: string) => ipcRenderer.invoke('skills:delete', name),
    rename: (oldName: string, newName: string) => ipcRenderer.invoke('skills:rename', oldName, newName),
    fetchUrl: (url: string) => ipcRenderer.invoke('skills:fetch-url', url),
    openUrl: (url: string) => ipcRenderer.invoke('skills:open-url', url),
    listPluginSkills: () => ipcRenderer.invoke('skills:list-plugin-skills'),
  },
  mcp: {
    read: () => ipcRenderer.invoke('mcp:read'),
    write: (config: MCPConfig) => ipcRenderer.invoke('mcp:write', config),
  },
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
  },
  appSettings: {
    read: () => ipcRenderer.invoke('app-settings:read'),
    write: (settings: AppSettings) => ipcRenderer.invoke('app-settings:write', settings),
  },
  claudeSettings: {
    read: () => ipcRenderer.invoke('claude-settings:read'),
    write: (patch: Partial<ClaudeCodeSettingsView>) => ipcRenderer.invoke('claude-settings:write', patch),
  },
  pty: {
    create: (projectDir: string, newSession: boolean, resumeId?: string) =>
      ipcRenderer.invoke('pty:create', projectDir, newSession, resumeId),
    write: (projectDir: string, data: string) => ipcRenderer.invoke('pty:write', projectDir, data),
    resize: (projectDir: string, cols: number, rows: number) => ipcRenderer.invoke('pty:resize', projectDir, cols, rows),
    kill: (projectDir: string) => ipcRenderer.invoke('pty:kill', projectDir),
    getBuffer: (projectDir: string) => ipcRenderer.invoke('pty:get-buffer', projectDir),
    clearSession: (projectDir: string) => ipcRenderer.invoke('pty:clear-session', projectDir),
    hasSession: (projectDir: string) => ipcRenderer.invoke('pty:has-session', projectDir),
    onData: (projectDir: string, callback: (data: string) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: { projectDir: string; data: string }) => {
        if (payload.projectDir === projectDir) callback(payload.data)
      }
      ipcRenderer.on('pty:data', handler)
      return () => ipcRenderer.removeListener('pty:data', handler)
    },
    onExit: (projectDir: string, callback: (code: number) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: { projectDir: string; code: number }) => {
        if (payload.projectDir === projectDir) callback(payload.code)
      }
      ipcRenderer.on('pty:exit', handler)
      return () => ipcRenderer.removeListener('pty:exit', handler)
    },
    onPtyState: (callback: (projectDir: string, state: 'running' | 'waiting-input' | 'done' | 'exited') => void) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: { projectDir: string; state: 'running' | 'waiting-input' | 'done' | 'exited' }) => {
        callback(payload.projectDir, payload.state)
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
    getStats: () => ipcRenderer.invoke('usage:get-stats'),
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
  },
  plugins: {
    listInstalled: () => ipcRenderer.invoke('plugins:list-installed'),
    setEnabled: (pluginKey: string, enabled: boolean) =>
      ipcRenderer.invoke('plugins:set-enabled', pluginKey, enabled),
    getAuthStatus: () => ipcRenderer.invoke('plugins:get-auth-status'),
  },
  snapshot: {
    list: (projectDir: string) => ipcRenderer.invoke('snapshot:list', projectDir),
    save: (projectDir: string, name: string, description: string) =>
      ipcRenderer.invoke('snapshot:save', projectDir, name, description),
    delete: (projectDir: string, snapshotId: string) =>
      ipcRenderer.invoke('snapshot:delete', projectDir, snapshotId),
    currentId: (projectDir: string) => ipcRenderer.invoke('snapshot:current-id', projectDir),
  },
})
