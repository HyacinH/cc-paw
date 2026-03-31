import type { MCPConfig } from '../types/mcp.types'

export async function readMcpConfig(): Promise<MCPConfig> {
  const result = await window.electronAPI.mcp.read()
  if (!result.success) throw new Error(result.error)
  return result.data
}

export async function writeMcpConfig(config: MCPConfig): Promise<void> {
  const result = await window.electronAPI.mcp.write(config)
  if (!result.success) throw new Error(result.error)
}
