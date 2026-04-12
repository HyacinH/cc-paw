import { registerClaudeMdHandlers } from './claude-md.handler'
import { registerSkillsHandlers } from './skills.handler'
import { registerMcpHandlers } from './mcp.handler'
import { registerDialogHandlers } from './dialog.handler'
import { registerAppSettingsHandlers } from './app-settings.handler'
import { registerCliSettingsHandlers } from './cli-settings.handler'
import { registerPtyHandlers, cleanupPty } from './pty.handler'
import type { BrowserWindow } from 'electron'
import { registerDocsHandlers } from './docs.handler'
import { registerShellHandlers } from './shell.handler'
import { registerPluginsHandlers } from './plugins.handler'
import { registerUsageHandlers } from './usage.handler'
import { registerSnapshotHandlers } from './snapshot.handler'

export { cleanupPty }

export function registerAllHandlers(getMainWindow: () => BrowserWindow | null): void {
  registerClaudeMdHandlers()
  registerSkillsHandlers()
  registerMcpHandlers()
  registerDialogHandlers()
  registerAppSettingsHandlers()
  registerCliSettingsHandlers()
  registerPtyHandlers(getMainWindow)
  registerDocsHandlers()
  registerShellHandlers()
  registerPluginsHandlers()
  registerUsageHandlers()
  registerSnapshotHandlers()
}
