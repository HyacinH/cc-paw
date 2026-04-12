import { ipcMain } from 'electron'
import { spawn } from 'child_process'
import { getShellEnv, findClaude, findCodex, isWin } from '../services/platform'

export interface ShellRunResult {
  success: boolean
  output: string
  exitCode: number
}

export function registerShellHandlers(): void {
  // 运行任意 shell 命令，合并 stdout+stderr 返回
  ipcMain.handle('shell:run', (_event, command: string): Promise<ShellRunResult> => {
    return new Promise((resolve) => {
      const env = getShellEnv()
      const [sh, flag] = isWin ? ['cmd', '/c'] : ['sh', '-c']

      const proc = spawn(sh, [flag, command], {
        env: env as Record<string, string>,
        cwd: env[isWin ? 'USERPROFILE' : 'HOME'],
      })

      let output = ''
      proc.stdout.on('data', (data: Buffer) => { output += data.toString() })
      proc.stderr.on('data', (data: Buffer) => { output += data.toString() })

      proc.on('close', (code) => {
        resolve({ success: code === 0, output: output.trim(), exitCode: code ?? -1 })
      })
      proc.on('error', (err) => {
        resolve({ success: false, output: String(err), exitCode: -1 })
      })
    })
  })

  // 返回 claude 可执行文件路径
  ipcMain.handle('shell:find-claude', () => {
    return { success: true, data: findClaude() }
  })

  // 返回 codex 可执行文件路径
  ipcMain.handle('shell:find-codex', () => {
    return { success: true, data: findCodex() }
  })
}
