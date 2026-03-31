import { useEffect } from 'react'
import { version } from '../../../package.json'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  FileText, Zap, Server, Package, Settings, Plus,
  BookOpen, Sun, Moon, BarChart2, PanelLeftClose, PanelLeft,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAppSettingsStore } from '../../store/appSettings.store'
import { useThemeStore } from '../../store/theme.store'
import { usePtyStore, type PtySessionState } from '../../store/pty.store'

// 根据项目名称生成确定性颜色
const AVATAR_COLORS = [
  '#f97316', '#3b82f6', '#22c55e', '#a855f7',
  '#ec4899', '#06b6d4', '#eab308', '#ef4444',
]
function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function ProjectAvatar({ name, size, ptyState }: {
  name: string
  size: 'sm' | 'lg'
  ptyState?: PtySessionState
}) {
  const letter = (name[0] ?? '?').toUpperCase()
  const color = avatarColor(name)
  const cls = size === 'lg'
    ? 'w-7 h-7 rounded-md text-sm font-bold'
    : 'w-5 h-5 rounded text-[11px] font-bold'

  const glowCls = ptyState === 'waiting-input'
    ? 'animate-glow-blue'
    : ptyState === 'running'
    ? 'animate-glow-orange'
    : ''

  // 'done': constant dim ring — session alive but idle
  const doneStyle = ptyState === 'done'
    ? { boxShadow: `0 0 0 2px ${color}55` }
    : undefined

  return (
    <div
      className={`${cls} ${glowCls} flex items-center justify-center text-white shrink-0 transition-shadow`}
      style={{ backgroundColor: color, ...doneStyle }}
    >
      {letter}
    </div>
  )
}

function NavItem({ to, icon: Icon, label, end }: {
  to: string; icon: React.ComponentType<{ size?: number }>; label: string; end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          isActive
            ? 'bg-orange-500/20 text-orange-600 dark:text-orange-400'
            : 'text-[#6b5a47] dark:text-gray-400 hover:bg-[#e8dfd0] dark:hover:bg-gray-800 hover:text-[#2d2218] dark:hover:text-gray-200'
        )
      }
    >
      <Icon size={15} />
      {label}
    </NavLink>
  )
}

function IconNavItem({ to, icon: Icon, label, end }: {
  to: string; icon: React.ComponentType<{ size?: number }>; label: string; end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      className={({ isActive }) =>
        clsx(
          'flex items-center justify-center w-9 h-9 rounded-lg transition-colors',
          isActive
            ? 'bg-orange-500/20 text-orange-600 dark:text-orange-400'
            : 'text-[#8a7560] dark:text-gray-500 hover:bg-[#e8dfd0] dark:hover:bg-gray-800 hover:text-[#2d2218] dark:hover:text-gray-200'
        )
      }
    >
      <Icon size={16} />
    </NavLink>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600 select-none flex items-center gap-1.5">
      <span className="text-orange-400/60">·</span>
      {children}
    </p>
  )
}

export default function Sidebar({ open, onToggle, isMac }: { open: boolean; onToggle: () => void; isMac: boolean }) {
  const { projects, loaded, load, addProject } = useAppSettingsStore()
  const { theme, toggle } = useThemeStore()
  const { states: ptyStates } = usePtyStore()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => { load() }, [load])

  const activeEncoded = (() => {
    const m = /^\/project\/([^/]+)/.exec(location.pathname)
    return m ? m[1] : null
  })()

  const handleAddProject = async () => {
    const result = await window.electronAPI.dialog.openDirectory()
    if (result.success && result.data) {
      await addProject(result.data)
      navigate(`/project/${encodeURIComponent(result.data)}`)
    }
  }

  return (
    <aside className={clsx(
      'flex flex-col shrink-0 transition-[width] duration-200 overflow-hidden',
      'bg-[#f0ebe0] dark:bg-gray-900 border-r border-[#e2d9c8] dark:border-gray-800',
      open ? 'w-52' : 'w-12',
    )}>

      {/* ── 展开状态 ── */}
      {open ? (
        <>
          {!isMac && (
            <div className="flex items-center justify-between px-3 h-9 shrink-0 border-b border-[#e2d9c8] dark:border-gray-800">
              <span className="text-sm font-semibold text-[#2d2218] dark:text-gray-100">CC Paw</span>
              <button
                onClick={onToggle}
                title="收起侧边栏"
                className="p-1.5 rounded-md text-[#a8967e] dark:text-gray-600 hover:text-[#2d2218] dark:hover:text-gray-300 hover:bg-[#e8dfd0] dark:hover:bg-gray-700 transition-colors"
              >
                <PanelLeftClose size={14} />
              </button>
            </div>
          )}
          <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
            <NavItem to="/" icon={FileText} label="设定" end />
            <NavItem to="/skills" icon={Zap} label="Skills" />
            <NavItem to="/mcp" icon={Server} label="MCP" />
            <NavItem to="/plugins" icon={Package} label="插件" />
            <NavItem to="/usage" icon={BarChart2} label="用量" />

            <SectionLabel>项目</SectionLabel>

            {loaded && projects.map((entry) => {
              const folderName = entry.dir.split(/[/\\]/).pop() ?? entry.dir
              const name = entry.alias ?? folderName
              const encoded = encodeURIComponent(entry.dir)
              const isExpanded = activeEncoded === encoded

              return (
                <div key={entry.dir}>
                  <NavLink
                    to={`/project/${encoded}`}
                    end
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                        isActive || isExpanded
                          ? 'bg-orange-500/20 text-orange-600 dark:text-orange-400'
                          : 'text-[#6b5a47] dark:text-gray-400 hover:bg-[#e8dfd0] dark:hover:bg-gray-800 hover:text-[#2d2218] dark:hover:text-gray-200'
                      )
                    }
                    title={entry.dir}
                  >
                    <ProjectAvatar name={name} size="sm" ptyState={ptyStates[entry.dir]} />
                    <span className="flex-1 truncate">{name}</span>
                  </NavLink>

                  {isExpanded && (
                    <div className="ml-4 mt-0.5 space-y-0.5">
                      <NavLink
                        to={`/project/${encoded}/claude-md`}
                        className={({ isActive }) =>
                          clsx(
                            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                            isActive
                              ? 'text-orange-500 dark:text-orange-400 bg-orange-500/10'
                              : 'text-[#7a6550] dark:text-gray-500 hover:text-[#2d2218] dark:hover:text-gray-300 hover:bg-[#e8dfd0] dark:hover:bg-gray-800'
                          )
                        }
                      >
                        <FileText size={12} className="shrink-0" />
                        项目设定
                      </NavLink>
                      <NavLink
                        to={`/project/${encoded}/docs`}
                        className={({ isActive }) =>
                          clsx(
                            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                            isActive
                              ? 'text-orange-500 dark:text-orange-400 bg-orange-500/10'
                              : 'text-[#7a6550] dark:text-gray-500 hover:text-[#2d2218] dark:hover:text-gray-300 hover:bg-[#e8dfd0] dark:hover:bg-gray-800'
                          )
                        }
                      >
                        <BookOpen size={12} className="shrink-0" />
                        Docs
                      </NavLink>
                    </div>
                  )}
                </div>
              )
            })}

            {loaded && projects.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-600 italic">
                ᓚᘏᗢ 还没有项目
              </p>
            )}

            <button
              onClick={handleAddProject}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-[#8a7560] dark:text-gray-600 hover:text-[#2d2218] dark:hover:text-gray-300 hover:bg-[#e8dfd0] dark:hover:bg-gray-800 transition-colors"
            >
              <Plus size={14} />
              添加项目
            </button>
          </nav>

          <div className="px-2 pb-2 pt-1 border-t border-[#e2d9c8] dark:border-gray-800">
            <NavItem to="/settings" icon={Settings} label="设置" />
            <div className="flex items-center justify-between px-3 pt-1 pb-0.5">
              <p className="text-xs text-[#b8a898] dark:text-gray-700">v{version}</p>
              <button
                onClick={toggle}
                title={theme === 'dark' ? '切换日间模式' : '切换夜间模式'}
                className="p-1 rounded-md text-[#a8967e] dark:text-gray-600 hover:text-orange-500 dark:hover:text-orange-400 hover:bg-[#e8dfd0] dark:hover:bg-gray-800 transition-colors"
              >
                {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
              </button>
            </div>
          </div>
        </>
      ) : (
        /* ── 收起状态：图标栏 ── */
        <div className="flex flex-col items-center flex-1 py-2 gap-0.5">
          {!isMac && (
            <button
              onClick={onToggle}
              title="展开侧边栏"
              className="flex items-center justify-center w-9 h-9 rounded-lg text-[#a8967e] dark:text-gray-600 hover:text-[#2d2218] dark:hover:text-gray-300 hover:bg-[#e8dfd0] dark:hover:bg-gray-800 transition-colors"
            >
              <PanelLeft size={16} />
            </button>
          )}
          <IconNavItem to="/" icon={FileText} label="设定" end />
          <IconNavItem to="/skills" icon={Zap} label="Skills" />
          <IconNavItem to="/mcp" icon={Server} label="MCP" />
          <IconNavItem to="/plugins" icon={Package} label="插件" />
          <IconNavItem to="/usage" icon={BarChart2} label="用量" />

          <div className="w-6 border-t border-[#e2d9c8] dark:border-gray-700 my-1" />

          {loaded && projects.map((entry) => {
            const folderName = entry.dir.split(/[/\\]/).pop() ?? entry.dir
            const name = entry.alias ?? folderName
            return (
              <NavLink
                key={entry.dir}
                to={`/project/${encodeURIComponent(entry.dir)}`}
                title={name}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center justify-center w-9 h-9 rounded-lg transition-colors',
                    isActive ? 'bg-orange-500/20' : 'hover:bg-[#e8dfd0] dark:hover:bg-gray-800'
                  )
                }
              >
                <ProjectAvatar name={name} size="lg" ptyState={ptyStates[entry.dir]} />
              </NavLink>
            )
          })}

          <button
            onClick={handleAddProject}
            title="添加项目"
            className="flex items-center justify-center w-9 h-9 rounded-lg text-[#a8967e] dark:text-gray-600 hover:text-[#2d2218] dark:hover:text-gray-300 hover:bg-[#e8dfd0] dark:hover:bg-gray-700 transition-colors"
          >
            <Plus size={15} />
          </button>

          <div className="flex-1" />

          <IconNavItem to="/settings" icon={Settings} label="设置" />
          <button
            onClick={toggle}
            title={theme === 'dark' ? '切换日间模式' : '切换夜间模式'}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-[#a8967e] dark:text-gray-600 hover:text-orange-500 dark:hover:text-orange-400 hover:bg-[#e8dfd0] dark:hover:bg-gray-800 transition-colors mb-1"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      )}
    </aside>
  )
}
