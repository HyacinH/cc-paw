import { useState } from 'react'
import { X } from 'lucide-react'
import type { SessionSnapshot } from '../../types/snapshot.types'

interface SessionActionModalProps {
  mode: 'new-session' | 'restore'
  snapshot?: SessionSnapshot  // required when mode === 'restore'
  onConfirm: (saveData: { name: string; description: string } | null) => Promise<void>
  onCancel: () => void
}

type Step = 'detail' | 'save-choice' | 'save-form'

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

export function SessionActionModal({ mode, snapshot, onConfirm, onCancel }: SessionActionModalProps) {
  const [step, setStep] = useState<Step>(mode === 'restore' ? 'detail' : 'save-choice')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const actionWord = mode === 'restore' ? '恢复' : '开始'

  const run = async (withSave: boolean) => {
    setLoading(true)
    setError(null)
    try {
      await onConfirm(withSave ? { name: name.trim(), description: description.trim() } : null)
    } catch (e) {
      setError(String(e))
      setLoading(false)
    }
  }

  const headerTitle =
    step === 'detail' ? snapshot!.name
    : step === 'save-choice' ? '是否存档当前会话？'
    : '存档当前会话'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-96 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate pr-4">
            {headerTitle}
          </h2>
          <button
            onClick={onCancel}
            disabled={loading}
            className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        {step === 'detail' && snapshot && (
          <div className="px-5 py-4 space-y-2">
            {snapshot.description ? (
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                {snapshot.description}
              </p>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-600 italic">无描述</p>
            )}
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              存档于 {relativeTime(snapshot.savedAt)}
            </p>
          </div>
        )}

        {step === 'save-choice' && (
          <div className="px-5 py-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              继续之前，可将当前会话存档以便日后找回。
            </p>
            {error && <p className="text-[11px] text-red-400 mt-2">{error}</p>}
          </div>
        )}

        {step === 'save-form' && (
          <div className="px-5 py-4 space-y-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="存档名称（必填）"
              className="w-full text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:border-orange-400 rounded-lg px-3 py-2 text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 outline-none transition-colors"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要描述（选填）"
              rows={2}
              className="w-full text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:border-orange-400 rounded-lg px-3 py-2 text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 outline-none resize-none transition-colors"
            />
            {error && <p className="text-[11px] text-red-400">{error}</p>}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-800">
          {step === 'detail' && (
            <>
              <button
                onClick={onCancel}
                className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => setStep('save-choice')}
                className="px-3 py-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors"
              >
                恢复此会话 →
              </button>
            </>
          )}

          {step === 'save-choice' && (
            <>
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
                {loading ? '…' : `直接${actionWord}`}
              </button>
              <button
                onClick={() => setStep('save-form')}
                disabled={loading}
                className="px-3 py-1.5 text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-lg font-medium transition-colors"
              >
                存档
              </button>
            </>
          )}

          {step === 'save-form' && (
            <>
              <button
                onClick={() => setStep('save-choice')}
                disabled={loading}
                className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40 transition-colors"
              >
                ← 返回
              </button>
              <button
                onClick={() => run(true)}
                disabled={loading || !name.trim()}
                className="px-3 py-1.5 text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-lg font-medium transition-colors"
              >
                {loading ? '…' : `存档并${actionWord}`}
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
