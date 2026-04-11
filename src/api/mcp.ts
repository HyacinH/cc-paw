import type { MCPConfig } from '../types/mcp.types'
import type { CliId } from '../types/cli.types'

export async function readMcpConfig(cliId?: CliId): Promise<MCPConfig> {
  const result = await window.electronAPI.mcp.read(cliId)
  if (!result.success) throw new Error(result.error)
  return result.data
}

export async function writeMcpConfig(config: MCPConfig, cliId?: CliId): Promise<void> {
  const result = await window.electronAPI.mcp.write(config, cliId)
  if (!result.success) throw new Error(result.error)
}
