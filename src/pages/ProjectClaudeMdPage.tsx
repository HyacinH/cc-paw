import { ClaudeMdPanel, useProjectDir } from './ProjectPage'
import { useAppSettingsStore } from '../store/appSettings.store'
import { DEFAULT_CLI_ID } from '../types/cli.types'

export default function ProjectClaudeMdPage() {
  const projectDir = useProjectDir()
  const { defaultCli } = useAppSettingsStore()
  const activeCli = defaultCli ?? DEFAULT_CLI_ID
  const fileName = activeCli === 'codex' ? 'AGENTS.md' : 'CLAUDE.md'
  const cliName = activeCli === 'codex' ? 'Codex' : 'Claude Code'
  const targetPath = `${projectDir}/${fileName}`
  if (!projectDir) return null
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">项目设定</p>
          <span className="inline-flex items-center rounded-md border border-orange-500/40 bg-orange-500/10 px-1.5 py-0.5 text-[11px] text-orange-600 dark:text-orange-400 font-medium">{cliName}</span>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate mt-1">{targetPath}</p>
      </div>
      <div className="flex-1 overflow-hidden">
        <ClaudeMdPanel projectDir={projectDir} />
      </div>
    </div>
  )
}
