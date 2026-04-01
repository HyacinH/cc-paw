export async function readGlobalClaudeMd(): Promise<string | null> {
  const result = await window.electronAPI.claudeMd.readGlobal()
  if (!result.success) throw new Error(result.error)
  return result.data
}

export async function writeGlobalClaudeMd(content: string): Promise<void> {
  const result = await window.electronAPI.claudeMd.writeGlobal(content)
  if (!result.success) throw new Error(result.error)
}

export async function readProjectClaudeMd(projectPath: string): Promise<string | null> {
  const result = await window.electronAPI.claudeMd.readProject(projectPath)
  if (!result.success) throw new Error(result.error)
  return result.data
}

export async function writeProjectClaudeMd(projectPath: string, content: string): Promise<void> {
  const result = await window.electronAPI.claudeMd.writeProject(projectPath, content)
  if (!result.success) throw new Error(result.error)
}
