import type { DocFile, DocsIndex } from '../types/docs.types'

export async function listDocs(projectDir: string): Promise<DocFile[]> {
  const result = await window.electronAPI.docs.list(projectDir)
  if (!result.success) throw new Error(result.error)
  return result.data
}

export async function readDoc(projectDir: string, relativePath: string): Promise<string | null> {
  const result = await window.electronAPI.docs.read(projectDir, relativePath)
  if (!result.success) throw new Error(result.error)
  return result.data
}

export async function writeDoc(projectDir: string, relativePath: string, content: string): Promise<void> {
  const result = await window.electronAPI.docs.write(projectDir, relativePath, content)
  if (!result.success) throw new Error(result.error)
}

export async function generateDocsIndex(projectDir: string): Promise<DocsIndex> {
  const result = await window.electronAPI.docs.generateIndex(projectDir)
  if (!result.success) throw new Error(result.error)
  return result.data
}
