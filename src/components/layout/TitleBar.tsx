import { PanelLeftClose, PanelLeft } from 'lucide-react'

interface TitleBarProps {
  sidebarOpen: boolean
  onToggle: () => void
}

export default function TitleBar({ sidebarOpen, onToggle }: TitleBarProps) {
  return (
    <div
      className="h-9 flex items-center px-2 shrink-0 bg-[#f0ebe0] dark:bg-gray-900 border-b border-[#e2d9c8] dark:border-gray-800"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* macOS traffic lights 占位（约 72px） */}
      <div className="w-[72px] shrink-0" />

      {/* 侧边栏收折按钮 */}
      <button
        onClick={onToggle}
        title={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        className="mt-1 p-1.5 rounded-md text-[#a8967e] dark:text-gray-600 hover:text-[#2d2218] dark:hover:text-gray-300 hover:bg-[#e8dfd0] dark:hover:bg-gray-700 transition-colors"
      >
        {sidebarOpen ? <PanelLeftClose size={13} /> : <PanelLeft size={13} />}
      </button>
    </div>
  )
}
