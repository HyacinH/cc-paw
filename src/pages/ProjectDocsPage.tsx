import { DocsPanel, useProjectDir } from './ProjectPage'

export default function ProjectDocsPage() {
  const projectDir = useProjectDir()
  if (!projectDir) return null
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Docs</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate">{projectDir}</p>
      </div>
      <div className="flex-1 overflow-hidden">
        <DocsPanel projectDir={projectDir} />
      </div>
    </div>
  )
}
