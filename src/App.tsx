import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
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

export default function App() {
  const [showSetup, setShowSetup] = useState(false)
  const { theme } = useThemeStore()
  const { setProjectState } = usePtyStore()

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
    window.electronAPI.shell.run('claude --version').then((r) => {
      if (!r.success) setShowSetup(true)
    })
  }, [])

  // Global PTY state listener — drives sidebar glow indicators
  useEffect(() => {
    return window.electronAPI.pty.onPtyState((projectDir, state) => {
      setProjectState(projectDir, state)
    })
  }, [setProjectState])

  return (
    <>
      {showSetup && <SetupModal onDismiss={() => setShowSetup(false)} />}
      <AppShell>
        <Routes>
          <Route path="/" element={<ClaudeMdPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/mcp" element={<McpPage />} />
          <Route path="/plugins" element={<PluginsPage />} />
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
