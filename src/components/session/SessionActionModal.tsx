import { useState } from 'react'
import { X } from 'lucide-react'

interface SessionActionModalProps {
  title: string
  onConfirm: (saveSnapshot: { name: string; description: string } | null) => Promise<void>
  onCancel: () => void
}

export function SessionActionModal({ title, onConfirm, onCancel }: SessionActionModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState(false)

  const run = async (withSave: boolean) => {
    if (withSave && !name.trim()) {
      setNameError(true)
      return
    }
    setLoading(true)
    setError(null)
    try {
      await onConfirm(withSave ? { name: name.trim(), description: description.trim() } : null)
    } catch (e) {
      setError(String(e))
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-88 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button
            onClick={onCancel}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body — save form always visible */}
        <div className="px-5 pt-4 pb-3 space-y-2">
          <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">
            存档当前会话（选填）
          </p>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setNameError(false) }}
            placeholder="存档名称"
            className={`w-full text-xs bg-gray-50 dark:bg-gray-800 border ${
              nameError ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'
            } focus:border-orange-400 rounded-lg px-3 py-2 text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 outline-none transition-colors`}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="简要描述（选填）"
            rows={2}
            className="w-full text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:border-orange-400 rounded-lg px-3 py-2 text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 outline-none resize-none transition-colors"
          />
          {nameError && <p className="text-[11px] text-red-400">请填写存档名称</p>}
          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40 transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => run(false)}
            disabled={loading}
            className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 rounded-lg transition-colors"
          >
            {loading ? '…' : '直接继续'}
          </button>
          <button
            onClick={() => run(true)}
            disabled={loading}
            className="px-3 py-1.5 text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-lg font-medium transition-colors"
          >
            {loading ? '…' : '存档并继续'}
          </button>
        </div>
      </div>
    </div>
  )
}
