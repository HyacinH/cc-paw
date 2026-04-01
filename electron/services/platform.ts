import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'
import os from 'os'

export const isWin = process.platform === 'win32'

// 启动时通过 login shell 捕获的完整环境变量，初始值先用 process.env 兜底
let _shellEnv: NodeJS.ProcessEnv = { ...process.env }

/**
 * 在 app.whenReady() 早期调用一次。
 *
 * macOS / Linux：执行 `$SHELL -l -c env` 捕获 login shell 的完整环境（包含
 * ~/.zshrc、nvm、pyenv、homebrew 等写入的 PATH 和自定义变量）。
 *
 * Windows：环境变量由 OS 从注册表向所有进程提供，process.env 已经包含用户
 * 通过「系统属性→环境变量」设置的内容，无需特殊处理。
 */
export async function initShellEnv(): Promise<void> {
  if (isWin) {
    _shellEnv = { ...process.env }
    return
  }

  const shell = process.env.SHELL ?? '/bin/zsh'

  try {
    // -l (login shell)：source ~/.zprofile 等 login 配置
    // -i (interactive)：同时 source ~/.zshrc，nvm / pyenv / homebrew 等通常写在这里
    const result = spawnSync(shell, ['-l', '-i', '-c', 'env'], {
      encoding: 'utf8',
      timeout: 5000,
    })

    if (result.status === 0 && result.stdout) {
      const env: NodeJS.ProcessEnv = { ...process.env }
      for (const line of result.stdout.split('\n')) {
        const i = line.indexOf('=')
        // 跳过空行；split on 第一个 '=' 以正确处理值中含 '=' 的情况（如 PATH）
        if (i > 0) env[line.slice(0, i)] = line.slice(i + 1)
      }
      _shellEnv = env
    }
  } catch {
    // 解析失败时静默降级，维持 process.env，不影响应用启动
  }
}

/** 返回已解析的完整 shell 环境变量（需先调用 initShellEnv） */
export function getShellEnv(): NodeJS.ProcessEnv {
  return _shellEnv
}

/**
 * 在已解析的环境变量中定位 claude 可执行文件路径。
 * 先检查常见固定路径，找不到再回落到 which / where。
 */
export function findClaude(): string {
  const env = _shellEnv

  const candidates = isWin
    ? [
        path.join(process.env.APPDATA ?? '', 'npm', 'claude.cmd'),
        path.join(process.env.APPDATA ?? '', 'npm', 'claude'),
        `${os.homedir()}/.claude/local/claude.cmd`,
      ]
    : [
        '/usr/local/bin/claude',
        '/opt/homebrew/bin/claude',
        `${os.homedir()}/.claude/local/claude`,
      ]

  for (const c of candidates) {
    if (existsSync(c)) return c
  }

  try {
    const r = spawnSync(isWin ? 'where' : 'which', ['claude'], {
      encoding: 'utf8',
      env: env as Record<string, string>,
      timeout: 3000,
    })
    if (r.status === 0 && r.stdout) {
      const lines = r.stdout.trim().split('\n').map(l => l.trim()).filter(Boolean)
      // On Windows, prefer .cmd over other variants (avoids Error 193 from bash scripts)
      return isWin ? (lines.find(l => l.endsWith('.cmd')) ?? lines[0]) : lines[0]
    }
  } catch { /* ignore */ }

  return 'claude'
}
