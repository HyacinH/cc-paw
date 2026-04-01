export interface MCPServerConfig {
  // command-based (local)
  command?: string
  args?: string[]
  env?: Record<string, string>
  // type is set by Claude Code CLI; 'stdio' for command-based, 'http'/'sse' for remote
  type?: 'stdio' | 'http' | 'sse'
  url?: string
  headers?: Record<string, string>
  // common
  disabled?: boolean
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>
}
