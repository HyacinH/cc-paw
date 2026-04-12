import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import ClaudeMdPage from './pages/ClaudeMdPage'
import SkillsPage from './pages/SkillsPage'
import McpPage from './pages/McpPage'
import PluginsPage from './pages/PluginsPage'
import ProjectPage from './pages/ProjectPage'
import ProjectClaudeMdPage from './pages/ProjectClaudeMdPage'
import ProjectDocsPage from './pages/ProjectDocsPage'
import SettingsPage from './pages/SettingsPage'
import UsagePage from './pages/UsagePage'
import SetupModal from './components/ui/SetupModal'
import { useThemeStore } from './store/theme.store'
import { usePtyStore } from './store/pty.store'
import { useAppSettingsStore } from './store/appSettings.store'
import { DEFAULT_CLI_ID } from './types/cli.types'

export default function App() {
  const [showSetup, setShowSetup] = useState(false)
  const { theme } = useThemeStore()
  const { setProjectState } = usePtyStore()
  const activeCli = useAppSettingsStore((s) => s.defaultCli ?? DEFAULT_CLI_ID)
  const electronAPI = window.electronAPI

  // Apply dark/light class to <html>
  useEffect(() => {
    const html = document.documentElement
    if (theme === 'dark') {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
  }, [theme])

  useEffect(() => {
    if (!electronAPI) return
    electronAPI.shell.run('claude --version').then((r) => {
      if (!r.success) setShowSetup(true)
    })
  }, [electronAPI])

  // Global PTY state listener — drives sidebar glow indicators
  useEffect(() => {
    if (!electronAPI) return
    return electronAPI.pty.onPtyState((projectDir, state, cliId) => {
      setProjectState(projectDir, state, cliId)
    })
  }, [electronAPI, setProjectState])

  if (!electronAPI) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#faf6ef] text-[#2d2218] dark:bg-gray-950 dark:text-gray-100">
        <div className="max-w-xl rounded-lg border border-red-300 bg-red-50 p-4 text-sm">
          Preload 初始化失败：`window.electronAPI` 不可用，请重启开发进程后重试。
        </div>
      </div>
    )
  }

  return (
    <>
      {showSetup && <SetupModal onDismiss={() => setShowSetup(false)} />}
      <AppShell>
        <Routes>
          <Route path="/" element={<ClaudeMdPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/mcp" element={<McpPage />} />
          <Route path="/plugins" element={activeCli === 'claude' ? <PluginsPage /> : <Navigate to="/skills" replace />} />
          <Route path="/project/:encodedPath" element={<ProjectPage />} />
          <Route path="/project/:encodedPath/claude-md" element={<ProjectClaudeMdPage />} />
          <Route path="/project/:encodedPath/docs" element={<ProjectDocsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/usage" element={<UsagePage />} />
        </Routes>
      </AppShell>
    </>
  )
}
