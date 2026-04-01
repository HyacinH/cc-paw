import { useState, type ReactNode } from 'react'
import TitleBar from './TitleBar'
import Sidebar from './Sidebar'

export default function AppShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const isMac = window.electronAPI.platform === 'darwin'

  return (
    <div className="flex flex-col h-screen bg-[#faf6ef] dark:bg-gray-950 text-[#2d2218] dark:text-gray-100">
      {isMac && <TitleBar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} isMac={isMac} />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
