import path from 'path'
import os from 'os'

const HOME = os.homedir()
const CLAUDE_DIR = path.join(HOME, '.claude')

export const CLAUDE_PATHS = {
  dir: CLAUDE_DIR,
  globalClaudeMd: path.join(CLAUDE_DIR, 'CLAUDE.md'),
  skillsDir: path.join(CLAUDE_DIR, 'skills'),
  settingsJson: path.join(CLAUDE_DIR, 'settings.json'),
  /** Claude Code CLI's actual user config — mcpServers lives here */
  claudeJson: path.join(HOME, '.claude.json'),
  projectsDir: path.join(CLAUDE_DIR, 'projects'),
  pluginsDir: path.join(CLAUDE_DIR, 'plugins'),
  pluginsInstalledJson: path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json'),
} as const

/** 解码 Claude Code 的项目目录名为可读路径 */
export function decodeProjectKey(key: string): string {
  // Claude Code 将绝对路径的 / 替换为 - 生成目录名
  // e.g. "-Users-hyacin-he-ClaudeProj" -> "/Users/hyacin.he/ClaudeProj"
  // 注意：含连字符的路径段会产生歧义，这里优先展示原始 key
  return key
}

/** 获取某项目的 CLAUDE.md 路径 */
export function projectClaudeMdPath(projectDir: string): string {
  return path.join(projectDir, 'CLAUDE.md')
}
