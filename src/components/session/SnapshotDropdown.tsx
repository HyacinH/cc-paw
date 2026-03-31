import { useEffect, useRef } from 'react'
import { Trash2, RotateCcw } from 'lucide-react'
import type { SessionSnapshot } from '../../types/snapshot.types'

interface SnapshotDropdownProps {
  snapshots: SessionSnapshot[]
  onRestore: (snapshot: SessionSnapshot) => void
  onDelete: (snapshot: SessionSnapshot) => void
  onClose: () => void
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

export function SnapshotDropdown({ snapshots, onRestore, onDelete, onClose }: SnapshotDropdownProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-40 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600">
          暂存会话
        </span>
      </div>

      {snapshots.length === 0 ? (
        <p className="px-4 py-4 text-xs text-gray-400 dark:text-gray-600 text-center">
          暂无暂存会话
        </p>
      ) : (
        <ul className="max-h-72 overflow-y-auto">
          {snapshots.map((s) => (
            <li
              key={s.id}
              className="flex items-start gap-2 px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{s.name}</p>
                {s.description && (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 line-clamp-2 mt-0.5">
                    {s.description}
                  </p>
                )}
                <p className="text-[10px] text-gray-300 dark:text-gray-700 mt-0.5">{relativeTime(s.savedAt)}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0 pt-0.5">
                <button
                  onClick={() => onRestore(s)}
                  title="恢复此会话"
                  className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-gray-400 hover:text-orange-400 hover:bg-orange-400/10 rounded transition-colors"
                >
                  <RotateCcw size={10} />
                  恢复
                </button>
                <button
                  onClick={() => onDelete(s)}
                  title="删除快照"
                  className="p-1 text-gray-300 dark:text-gray-700 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
