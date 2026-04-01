import { ipcMain } from 'electron'
import { listSnapshots, saveSnapshot, deleteSnapshot, getCurrentSessionId } from '../services/snapshot.service'
import { summarizeCurrentSession } from '../services/summarize.service'

export function registerSnapshotHandlers(): void {
  ipcMain.handle('snapshot:list', async (_event, projectDir: string) => {
    try {
      const data = await listSnapshots(projectDir)
      return { success: true, data }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle(
    'snapshot:save',
    async (_event, projectDir: string, name: string, description: string) => {
      try {
        const data = await saveSnapshot(projectDir, name, description)
        return { success: true, data }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle(
    'snapshot:delete',
    async (_event, projectDir: string, snapshotId: string) => {
      try {
        await deleteSnapshot(projectDir, snapshotId)
        return { success: true, data: undefined }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle('snapshot:current-id', async (_event, projectDir: string) => {
    try {
      const data = await getCurrentSessionId(projectDir)
      return { success: true, data }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('snapshot:summarize', async (_event, projectDir: string) => {
    try {
      const data = await summarizeCurrentSession(projectDir)
      return { success: true, data }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
}
