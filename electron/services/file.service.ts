import fs from 'fs/promises'
import path from 'path'

export type IPCResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string }

export async function readFile(filePath: string): Promise<IPCResult<string | null>> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return { success: true, data: content }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { success: true, data: null }
    }
    return { success: false, error: String(err), code: 'READ_ERROR' }
  }
}

export async function writeFile(filePath: string, content: string): Promise<IPCResult<void>> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: String(err), code: 'WRITE_ERROR' }
  }
}

export async function deleteFile(filePath: string): Promise<IPCResult<void>> {
  try {
    await fs.unlink(filePath)
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: String(err), code: 'DELETE_ERROR' }
  }
}

export async function listDir(dirPath: string): Promise<IPCResult<string[]>> {
  try {
    await fs.mkdir(dirPath, { recursive: true })
    const entries = await fs.readdir(dirPath)
    return { success: true, data: entries }
  } catch (err) {
    return { success: false, error: String(err), code: 'LIST_ERROR' }
  }
}
