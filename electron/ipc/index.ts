import { registerClaudeMdHandlers } from './claude-md.handler'
import { registerSkillsHandlers } from './skills.handler'
import { registerMcpHandlers } from './mcp.handler'
import { registerDialogHandlers } from './dialog.handler'
import { registerAppSettingsHandlers } from './app-settings.handler'
import { registerClaudeSettingsHandlers } from './claude-settings.handler'
import { registerPtyHandlers, cleanupPty } from './pty.handler'
import type { BrowserWindow } from 'electron'
import { registerDocsHandlers } from './docs.handler'
import { registerShellHandlers } from './shell.handler'
import { registerPluginsHandlers } from './plugins.handler'
import { registerUsageHandlers } from './usage.handler'

export { cleanupPty }

export function registerAllHandlers(getMainWindow: () => BrowserWindow | null): void {
  registerClaudeMdHandlers()
  registerSkillsHandlers()
  registerMcpHandlers()
  registerDialogHandlers()
  registerAppSettingsHandlers()
  registerClaudeSettingsHandlers()
  registerPtyHandlers(getMainWindow)
  registerDocsHandlers()
  registerShellHandlers()
  registerPluginsHandlers()
  registerUsageHandlers()
}
