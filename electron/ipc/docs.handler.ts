import { ipcMain } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import type { DocFile, DocsIndex } from '../../src/types/docs.types'

// ── 元数据解析工具 ─────────────────────────────────────────────────────────────

function parseFrontmatter(content: string): { tags: string[]; body: string } {
  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content)
  if (!fmMatch) return { tags: [], body: content }

  const fm = fmMatch[1]
  const body = content.slice(fmMatch[0].length)

  const tagsMatch = /^tags\s*:\s*\[([^\]]*)\]/m.exec(fm)
    ?? /^tags\s*:\s*(.*)/m.exec(fm)
  let tags: string[] = []
  if (tagsMatch) {
    tags = tagsMatch[1]
      .split(',')
      .map((t) => t.replace(/['"[\]\s]/g, '').trim())
      .filter(Boolean)
  }

  return { tags, body }
}

function extractTitle(body: string): string {
  for (const line of body.split('\n')) {
    const m = /^#\s+(.+)/.exec(line.trim())
    if (m) return m[1].trim()
  }
  return ''
}

function extractSummary(body: string): string {
  const lines = body.split('\n')
  const result: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || /^#{1,6}\s/.test(trimmed)) continue
    result.push(trimmed)
    if (result.length >= 3) break
  }
  return result.join(' ')
}

async function parseDocFile(
  absPath: string,
  projectDir: string,
  source: 'root' | 'docs',
): Promise<DocFile> {
  const stat = await fs.stat(absPath)
  let content = ''
  try {
    content = await fs.readFile(absPath, 'utf-8')
  } catch { /* 读取失败时降级 */ }

  const { tags, body } = parseFrontmatter(content)
  const relPath = path.relative(projectDir, absPath)
  const title = extractTitle(body) || path.basename(absPath, '.md')
  const summary = extractSummary(body)

  return {
    path: relPath,
    title,
    summary,
    lastModified: stat.mtime.toISOString(),
    tags,
    source,
  }
}

// ── 扫描逻辑 ───────────────────────────────────────────────────────────────────

async function scanRootMd(projectDir: string): Promise<DocFile[]> {
  try {
    const entries = await fs.readdir(projectDir, { withFileTypes: true })
    const files = entries
      .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'CLAUDE.md')
      .map((e) => path.join(projectDir, e.name))

    return Promise.all(files.map((f) => parseDocFile(f, projectDir, 'root')))
  } catch {
    return []
  }
}

async function scanDocsDirRecursive(dir: string, projectDir: string): Promise<DocFile[]> {
  const results: DocFile[] = []
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...(await scanDocsDirRecursive(full, projectDir)))
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(await parseDocFile(full, projectDir, 'docs'))
      }
    }
  } catch { /* docs/ 不存在时忽略 */ }
  return results
}

async function collectDocs(projectDir: string): Promise<DocFile[]> {
  const [rootDocs, subDocs] = await Promise.all([
    scanRootMd(projectDir),
    scanDocsDirRecursive(path.join(projectDir, 'docs'), projectDir),
  ])
  return [...rootDocs, ...subDocs]
}

// ── IPC 注册 ───────────────────────────────────────────────────────────────────

export function registerDocsHandlers(): void {
  ipcMain.handle('docs:list', async (_event, projectDir: string) => {
    try {
      const docs = await collectDocs(projectDir)
      return { success: true, data: docs }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('docs:read', async (_event, projectDir: string, relativePath: string) => {
    try {
      const absPath = path.join(projectDir, relativePath)
      const content = await fs.readFile(absPath, 'utf-8')
      return { success: true, data: content }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { success: true, data: null }
      }
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('docs:write', async (_event, projectDir: string, relativePath: string, content: string) => {
    try {
      const absPath = path.join(projectDir, relativePath)
      await fs.mkdir(path.dirname(absPath), { recursive: true })
      await fs.writeFile(absPath, content, 'utf-8')
      return { success: true, data: undefined }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('docs:generate-index', async (_event, projectDir: string) => {
    try {
      const docs = await collectDocs(projectDir)
      const index: DocsIndex = {
        generatedAt: new Date().toISOString(),
        projectPath: projectDir,
        docs,
      }
      const docsDir = path.join(projectDir, 'docs')
      await fs.mkdir(docsDir, { recursive: true })
      await fs.writeFile(
        path.join(docsDir, 'index.json'),
        JSON.stringify(index, null, 2),
        'utf-8',
      )
      return { success: true, data: index }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
}
