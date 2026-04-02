import { ipcMain } from 'electron'
import path from 'path'
import { listSnapshots, saveSnapshot, deleteSnapshot, getCurrentSession } from '../services/snapshot.service'
import { summarizeCurrentSession } from '../services/summarize.service'

function snapshotLog(event: string, projectDir: string, extra?: Record<string, unknown>): void {
  const uptimeMs = Math.round(process.uptime() * 1000)
  console.log(`[snapshot +${uptimeMs}ms] ${event}`, { dir: path.basename(projectDir), ...extra })
}

export function registerSnapshotHandlers(): void {
  ipcMain.handle('snapshot:list', async (_event, projectDir: string) => {
    const t0 = Date.now()
    try {
      const data = await listSnapshots(projectDir)
      snapshotLog('list:ok', projectDir, { ms: Date.now() - t0, count: data.length })
      return { success: true, data }
    } catch (err) {
      snapshotLog('list:error', projectDir, { ms: Date.now() - t0, err: String(err) })
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle(
    'snapshot:save',
    async (_event, projectDir: string, name: string, description: string) => {
      const t0 = Date.now()
      try {
        const data = await saveSnapshot(projectDir, name, description)
        snapshotLog('save:ok', projectDir, { ms: Date.now() - t0, id: data.id })
        return { success: true, data }
      } catch (err) {
        snapshotLog('save:error', projectDir, { ms: Date.now() - t0, err: String(err) })
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle(
    'snapshot:delete',
    async (_event, projectDir: string, snapshotId: string) => {
      const t0 = Date.now()
      try {
        await deleteSnapshot(projectDir, snapshotId)
        snapshotLog('delete:ok', projectDir, { ms: Date.now() - t0, snapshotId })
        return { success: true, data: undefined }
      } catch (err) {
        snapshotLog('delete:error', projectDir, { ms: Date.now() - t0, err: String(err) })
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle('snapshot:current-id', async (_event, projectDir: string) => {
    const t0 = Date.now()
    try {
      const data = await getCurrentSession(projectDir)
      snapshotLog('current-id:ok', projectDir, { ms: Date.now() - t0, hasId: !!data.id, source: data.source })
      return { success: true, data }
    } catch (err) {
      snapshotLog('current-id:error', projectDir, { ms: Date.now() - t0, err: String(err) })
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('snapshot:summarize', async (_event, projectDir: string) => {
    const t0 = Date.now()
    try {
      const data = await summarizeCurrentSession(projectDir)
      snapshotLog('summarize:ok', projectDir, { ms: Date.now() - t0 })
      return { success: true, data }
    } catch (err) {
      snapshotLog('summarize:error', projectDir, { ms: Date.now() - t0, err: String(err) })
      return { success: false, error: String(err) }
    }
  })
}
