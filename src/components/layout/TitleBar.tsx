import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { PanelLeftClose, PanelLeft, Minus, Square, X } from 'lucide-react'
import { useAppSettingsStore } from '../../store/appSettings.store'
import type { EditCommandId } from '../../types/edit-command.types'

interface TitleBarProps {
  sidebarOpen: boolean
  onToggle: () => void
}

type MenuGroup = 'file' | 'edit' | null

export default function TitleBar({ sidebarOpen, onToggle }: TitleBarProps) {
  const location = useLocation()
  const projects = useAppSettingsStore((s) => s.projects)
  const platform = window.electronAPI?.platform
  const isMac = platform === 'darwin'
  const isWin = platform === 'win32'

  const projectName = useMemo(() => {
    const match = location.pathname.match(/^\/project\/([^/]+)/)
    if (!match) return ''
    const projectDir = decodeURIComponent(match[1])
    const entry = projects.find((p) => p.dir === projectDir)
    const folderName = projectDir.split(/[/\\]/).pop() ?? ''
    return entry?.alias?.trim() || folderName
  }, [location.pathname, projects])

  const [openMenu, setOpenMenu] = useState<MenuGroup>(null)
  const [isMaximized, setIsMaximized] = useState(false)
  const [appIcon, setAppIcon] = useState<string | null>(null)
  const menuWrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isWin) return
    window.electronAPI.windowControls.isMaximized().then(setIsMaximized).catch(() => {})
    window.electronAPI.windowControls.appIcon().then(setAppIcon).catch(() => {})
  }, [isWin])

  useEffect(() => {
    if (!openMenu) return
    const onPointerDown = (event: MouseEvent) => {
      if (!menuWrapRef.current?.contains(event.target as Node)) {
        setOpenMenu(null)
      }
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [openMenu])

  const invokeMenu = async (commandId: EditCommandId) => {
    await window.electronAPI.menu.invoke(commandId)
    setOpenMenu(null)
  }

  const toggleMaximize = async () => {
    const maximized = await window.electronAPI.windowControls.toggleMaximize()
    setIsMaximized(maximized)
  }

  const onTitleBarDoubleClick: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (!isWin) return
    const target = event.target as HTMLElement
    if (target.closest('[data-no-dbl-max="true"]')) return
    toggleMaximize().catch(() => {})
  }

  return (
    <div
      className="h-9 flex items-center px-2 shrink-0 bg-[#f0ebe0] dark:bg-gray-900 border-b border-[#e2d9c8] dark:border-gray-800"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      onDoubleClick={onTitleBarDoubleClick}
    >
      {isMac && <div className="w-[72px] shrink-0" />}

      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        data-no-dbl-max="true"
      >
        {isWin && appIcon && (
          <img
            src={appIcon}
            alt="CC Paw"
            className="w-4 h-4 rounded-sm object-contain"
            draggable={false}
          />
        )}
        <button
          onClick={onToggle}
          title={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
          className="h-7 w-7 rounded-md text-[#a8967e] dark:text-gray-600 hover:text-[#2d2218] dark:hover:text-gray-300 hover:bg-[#e8dfd0] dark:hover:bg-gray-700 transition-colors flex items-center justify-center"
        >
          {sidebarOpen ? <PanelLeftClose size={13} /> : <PanelLeft size={13} />}
        </button>
      </div>

      {isWin && (
        <div
          ref={menuWrapRef}
          className="ml-2 flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          data-no-dbl-max="true"
        >
          <div className="relative">
            <button
              className="h-7 px-2 rounded text-xs text-[#5f4f3e] dark:text-gray-300 hover:bg-[#e8dfd0] dark:hover:bg-gray-700 flex items-center"
              onClick={() => setOpenMenu(openMenu === 'file' ? null : 'file')}
            >
              File
            </button>
            {openMenu === 'file' && (
              <div className="absolute left-0 top-8 w-36 rounded-md border border-[#e2d9c8] dark:border-gray-700 bg-[#faf6ef] dark:bg-gray-800 shadow-lg z-50 py-1">
                <button
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#efe5d6] dark:hover:bg-gray-700"
                  onClick={() => window.location.reload()}
                >
                  Reload
                </button>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              className="h-7 px-2 rounded text-xs text-[#5f4f3e] dark:text-gray-300 hover:bg-[#e8dfd0] dark:hover:bg-gray-700 flex items-center"
              onClick={() => setOpenMenu(openMenu === 'edit' ? null : 'edit')}
            >
              Edit
            </button>
            {openMenu === 'edit' && (
              <div className="absolute left-0 top-8 w-40 rounded-md border border-[#e2d9c8] dark:border-gray-700 bg-[#faf6ef] dark:bg-gray-800 shadow-lg z-50 py-1">
                <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#efe5d6] dark:hover:bg-gray-700" onClick={() => invokeMenu('edit:undo')}>Undo</button>
                <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#efe5d6] dark:hover:bg-gray-700" onClick={() => invokeMenu('edit:redo')}>Redo</button>
                <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#efe5d6] dark:hover:bg-gray-700" onClick={() => invokeMenu('edit:cut')}>Cut</button>
                <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#efe5d6] dark:hover:bg-gray-700" onClick={() => invokeMenu('edit:copy')}>Copy</button>
                <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#efe5d6] dark:hover:bg-gray-700" onClick={() => invokeMenu('edit:paste')}>Paste</button>
                <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#efe5d6] dark:hover:bg-gray-700" onClick={() => invokeMenu('edit:selectAll')}>Select All</button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1" />

      {projectName && (
        <div className="flex-1 min-w-0 px-3">
          <div className="text-center text-xs text-[#6b5c4b] dark:text-gray-300 truncate select-none" title={projectName}>
            {projectName}
          </div>
        </div>
      )}

      <div className="flex-1" />

      {isWin && (
        <div
          className="flex items-center gap-0.5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          data-no-dbl-max="true"
        >
          <button
            title="最小化"
            onClick={() => window.electronAPI.windowControls.minimize()}
            className="w-8 h-7 rounded text-[#6f5f4f] dark:text-gray-300 hover:bg-[#e8dfd0] dark:hover:bg-gray-700 flex items-center justify-center"
          >
            <Minus size={14} />
          </button>
          <button
            title={isMaximized ? '还原' : '最大化'}
            onClick={toggleMaximize}
            className="w-8 h-7 rounded text-[#6f5f4f] dark:text-gray-300 hover:bg-[#e8dfd0] dark:hover:bg-gray-700 flex items-center justify-center"
          >
            <Square size={12} />
          </button>
          <button
            title="关闭"
            onClick={() => window.electronAPI.windowControls.close()}
            className="w-8 h-7 rounded text-[#6f5f4f] dark:text-gray-300 hover:bg-red-500 hover:text-white flex items-center justify-center"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
