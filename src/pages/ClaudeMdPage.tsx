import { useState, useEffect, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Save, AlertCircle, Eye, Pencil } from 'lucide-react'
import { readGlobalClaudeMd, writeGlobalClaudeMd } from '../api/claudeMd'
import { useMonacoTheme } from '../hooks/useMonacoTheme'
import { useAppSettingsStore } from '../store/appSettings.store'
import { DEFAULT_CLI_ID } from '../types/cli.types'

export default function ClaudeMdPage() {
  const monacoTheme = useMonacoTheme()
  const { defaultCli } = useAppSettingsStore()
  const activeCli = defaultCli ?? DEFAULT_CLI_ID
  const instructionPath = activeCli === 'codex' ? '~/.codex/AGENTS.md' : '~/.claude/CLAUDE.md'
  const cliName = activeCli === 'codex' ? 'Codex' : 'Claude Code'
  const [content, setContent] = useState<string | null>(null) // null = loading
  const [editContent, setEditContent] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedOk, setSavedOk] = useState(false)

  useEffect(() => {
    setContent(null)
    readGlobalClaudeMd(activeCli)
      .then((c) => { setContent(c ?? ''); setEditContent(c ?? '') })
      .catch((e) => { setError(String(e)); setContent(''); setEditContent('') })
  }, [activeCli])

  const handleSave = useCallback(async () => {
    setSaving(true); setError(null); setSavedOk(false)
    try {
      await writeGlobalClaudeMd(editContent, activeCli)
      setContent(editContent)
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2000)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }, [editContent, activeCli])

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5 pb-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">设定</h1>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
              当前 CLI：
              <span className="inline-flex items-center rounded-md border border-orange-500/40 bg-orange-500/10 px-1.5 py-0.5 ml-1 text-[11px] text-orange-600 dark:text-orange-400 font-medium">{cliName}</span>
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5 font-mono">{instructionPath}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* 编辑/预览切换 */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-md p-0.5">
              <button
                onClick={() => setIsEditing(false)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors ${!isEditing ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 shadow-sm' : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
              >
                <Eye size={12} /> 预览
              </button>
              <button
                onClick={() => { setIsEditing(true); setEditContent(content ?? '') }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors ${isEditing ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 shadow-sm' : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
              >
                <Pencil size={12} /> 编辑
              </button>
            </div>
            {savedOk && <span className="text-xs text-green-400">已保存</span>}
            {error && (
              <span className="flex items-center gap-1 text-xs text-red-400">
                <AlertCircle size={12} /> {error}
              </span>
            )}
            {isEditing && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Save size={14} />
                {saving ? '保存中…' : '保存'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={`flex-1 overflow-hidden ${isEditing ? '' : 'overflow-y-auto'}`}>
        {content === null ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-400 dark:text-gray-600">读取中…</div>
        ) : isEditing ? (
          <Editor
            height="100%"
            defaultLanguage="markdown"
            value={editContent}
            onChange={(v) => setEditContent(v ?? '')}
            theme={monacoTheme}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              padding: { top: 16, bottom: 16 },
            }}
          />
        ) : (
          <div className="max-w-2xl px-6 py-6 text-sm">
            {content === '' ? (
              <p className="text-gray-400 dark:text-gray-600 italic">文件为空，点击「编辑」开始编写。</p>
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3 pb-2 border-b border-gray-300 dark:border-gray-700">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mt-5 mb-2">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-4 mb-1">{children}</h3>,
                  p: ({ children }) => <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-3">{children}</p>,
                  a: ({ href, children }) => <a href={href} className="text-orange-400 hover:underline">{children}</a>,
                  code: ({ inline, children, ...props }: { inline?: boolean; children?: React.ReactNode }) =>
                    inline
                      ? <code className="bg-gray-100 dark:bg-gray-800 text-orange-300 px-1 py-0.5 rounded text-[12px] font-mono" {...props}>{children}</code>
                      : <code className="block bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 p-3 rounded-md text-[12px] font-mono overflow-x-auto mb-3 leading-relaxed" {...props}>{children}</code>,
                  pre: ({ children }) => <>{children}</>,
                  ul: ({ children }) => <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 mb-3 space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside text-gray-700 dark:text-gray-300 mb-3 space-y-1">{children}</ol>,
                  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                  blockquote: ({ children }) => <blockquote className="border-l-2 border-orange-500/50 pl-3 text-gray-500 dark:text-gray-400 italic mb-3">{children}</blockquote>,
                  table: ({ children }) => <div className="overflow-x-auto mb-3"><table className="text-xs text-gray-700 dark:text-gray-300 border-collapse w-full">{children}</table></div>,
                  th: ({ children }) => <th className="border border-gray-300 dark:border-gray-700 px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-left">{children}</th>,
                  td: ({ children }) => <td className="border border-gray-300 dark:border-gray-700 px-2 py-1">{children}</td>,
                  hr: () => <hr className="border-gray-300 dark:border-gray-700 my-4" />,
                  strong: ({ children }) => <strong className="text-gray-900 dark:text-gray-100 font-semibold">{children}</strong>,
                }}
              >
                {content}
              </ReactMarkdown>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
