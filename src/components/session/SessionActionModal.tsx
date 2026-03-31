import { useState } from 'react'
import { X } from 'lucide-react'

interface SessionActionModalProps {
  title: string
  onConfirm: (saveSnapshot: { name: string; description: string } | null) => Promise<void>
  onCancel: () => void
}

export function SessionActionModal({ title, onConfirm, onCancel }: SessionActionModalProps) {
  const [wantSave, setWantSave] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async (withSave: boolean) => {
    if (withSave && !name.trim()) {
      setError('请填写会话名称')
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-96 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button
            onClick={onCancel}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {/* Toggle: save current session */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={wantSave}
              onChange={(e) => setWantSave(e.target.checked)}
              className="w-3.5 h-3.5 accent-orange-500"
            />
            <span className="text-xs text-gray-700 dark:text-gray-300">存档当前会话</span>
          </label>

          {/* Save form (only shown when checkbox is checked) */}
          {wantSave && (
            <div className="space-y-2 pl-6">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="会话名称（必填）"
                className="w-full text-xs bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 focus:border-orange-500 rounded-md px-3 py-1.5 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 outline-none"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简要描述（选填）"
                rows={2}
                className="w-full text-xs bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 focus:border-orange-500 rounded-md px-3 py-1.5 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 outline-none resize-none"
              />
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40 rounded-md transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => handleConfirm(wantSave)}
            disabled={loading || (wantSave && !name.trim())}
            className="px-3 py-1.5 text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-md font-medium transition-colors"
          >
            {loading ? '…' : wantSave ? '存档并继续' : '直接继续'}
          </button>
        </div>
      </div>
    </div>
  )
}
