import { useState } from 'react'
import { X, Sparkles } from 'lucide-react'
import type { SessionSnapshot } from '../../types/snapshot.types'
import { summarizeSession } from '../../api/snapshot'

interface SessionActionModalProps {
  mode: 'new-session' | 'restore'
  projectDir: string
  snapshot?: SessionSnapshot       // required when mode === 'restore'
  existingSnapshot?: SessionSnapshot  // current session's existing archive, if any
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

export function SessionActionModal({ mode, projectDir, snapshot, existingSnapshot, onConfirm, onCancel }: SessionActionModalProps) {
  const [step, setStep] = useState<Step>(mode === 'restore' ? 'detail' : 'save-choice')
  const [name, setName] = useState(existingSnapshot?.name ?? '')
  const [description, setDescription] = useState(existingSnapshot?.description ?? '')
  const [loading, setLoading] = useState(false)
  const [summarizing, setSummarizing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSummarize = async () => {
    setSummarizing(true)
    setError(null)
    try {
      const summary = await summarizeSession(projectDir)
      setDescription(summary)
    } catch (e) {
      setError(String(e))
    } finally {
      setSummarizing(false)
    }
  }

  const actionWord = mode === 'restore' ? '恢复' : '开始'
  const isUpdate = existingSnapshot !== undefined

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
    : isUpdate ? '更新会话存档' : '存档当前会话'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[480px] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">

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
            {isUpdate ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                继续之前，可更新当前会话的存档信息。
                <span className="block mt-1 text-orange-400 font-medium">现有存档：{existingSnapshot!.name}</span>
              </p>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                继续之前，可将当前会话存档以便日后找回。
              </p>
            )}
            {error && <p className="text-[11px] text-red-400 mt-2">{error}</p>}
          </div>
        )}

        {step === 'save-form' && (
          <div className="px-6 py-5 space-y-3">
            {isUpdate && (
              <p className="text-[11px] text-orange-400">
                将覆盖现有存档「{existingSnapshot!.name}」
              </p>
            )}
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="存档名称（必填）"
              className="w-full text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:border-orange-400 rounded-lg px-3 py-2 text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 outline-none transition-colors"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400 dark:text-gray-500">描述（选填）</span>
              <button
                type="button"
                onClick={handleSummarize}
                disabled={summarizing || loading}
                className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-orange-400 disabled:opacity-40 transition-colors"
              >
                {summarizing ? (
                  <span className="animate-spin inline-block w-2.5 h-2.5 border border-current border-t-transparent rounded-full" />
                ) : (
                  <Sparkles size={10} />
                )}
              </button>
            </div>
            <div className="relative">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简要描述本次会话的内容…"
                rows={5}
                maxLength={512}
                className="w-full text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:border-orange-400 rounded-lg px-3 py-2 pb-5 text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 outline-none resize-none transition-colors"
              />
              <span className={`absolute bottom-1.5 right-2 text-[10px] tabular-nums ${description.length >= 512 ? 'text-red-400' : description.length >= 460 ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`}>
                {description.length}/512
              </span>
            </div>
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
                {isUpdate ? '更新存档' : '存档'}
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
                {loading ? '…' : isUpdate ? `更新并${actionWord}` : `存档并${actionWord}`}
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
