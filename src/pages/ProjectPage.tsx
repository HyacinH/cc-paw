import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Trash2, RotateCcw, AlertCircle, BookOpen, Eye, Pencil, Plus, X, Save } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Editor from '@monaco-editor/react'
import { useAppSettingsStore } from '../store/appSettings.store'
import { useMonacoTheme } from '../hooks/useMonacoTheme'
import { readProjectClaudeMd, writeProjectClaudeMd } from '../api/claudeMd'
import { listDocs, readDoc, writeDoc, generateDocsIndex } from '../api/docs'
import type { DocFile } from '../types/docs.types'
import { TerminalPanel } from '../components/terminal/TerminalPanel'
import type { SessionSnapshot } from '../types/snapshot.types'
import { listSnapshots, saveSnapshot, deleteSnapshot, getCurrentSessionId, getCurrentSession } from '../api/snapshot'
import { SessionActionModal } from '../components/session/SessionActionModal'
import { SnapshotDropdown } from '../components/session/SnapshotDropdown'
import { DEFAULT_CLI_ID } from '../types/cli.types'

export function ClaudeMdPanel({ projectDir }: { projectDir: string }) {
  const { defaultCli } = useAppSettingsStore()
  const activeCli = defaultCli ?? DEFAULT_CLI_ID
  const monacoTheme = useMonacoTheme()
  const [content, setContent] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedOk, setSavedOk] = useState(false)

  useEffect(() => {
    setContent(null); setIsEditing(false)
    readProjectClaudeMd(projectDir, activeCli).then((c) => { setContent(c ?? ''); setEditContent(c ?? '') }).catch(() => {})
  }, [projectDir, activeCli])

  const handleSave = useCallback(async () => {
    setSaving(true); setError(null); setSavedOk(false)
    try {
      await writeProjectClaudeMd(projectDir, editContent, activeCli)
      setContent(editContent)
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2000)
    } catch (e) { setError(String(e)) } finally { setSaving(false) }
  }, [projectDir, editContent, activeCli])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-md p-0.5">
          <button
            onClick={() => setIsEditing(false)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${!isEditing ? 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >
            <Eye size={10} /> 预览
          </button>
          <button
            onClick={() => { setIsEditing(true); setEditContent(content ?? '') }}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${isEditing ? 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >
            <Pencil size={10} /> 编辑
          </button>
        </div>
        {/* 保存按钮（仅编辑模式） */}
        <div className="flex items-center gap-2 min-w-0">
          {savedOk && <span className="text-[11px] text-green-400 shrink-0">已保存</span>}
          {error && (
            <span className="flex items-center gap-1 text-[11px] text-red-400 truncate">
              <AlertCircle size={10} className="shrink-0" /> {error}
            </span>
          )}
          {isEditing && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 px-2.5 py-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-medium rounded-md transition-colors shrink-0"
            >
              <Save size={11} />
              {saving ? '…' : '保存'}
            </button>
          )}
        </div>
      </div>
      <div className={`flex-1 overflow-hidden ${isEditing ? '' : 'overflow-y-auto'}`}>
        {content === null ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400 dark:text-gray-600">读取中…</div>
        ) : isEditing ? (
          <Editor
            key={projectDir}
            height="100%"
            defaultLanguage="markdown"
            value={editContent}
            onChange={(v) => setEditContent(v ?? '')}
            theme={monacoTheme}
            options={{ minimap: { enabled: false }, fontSize: 12, wordWrap: 'on', scrollBeyondLastLine: false, padding: { top: 8, bottom: 8 }, lineNumbers: 'off' }}
          />
        ) : content === '' ? (
          <p className="px-4 py-4 text-xs text-gray-400 dark:text-gray-600 italic">文件为空，点击「编辑」开始编写。</p>
        ) : (
          <div className="px-4 py-3 text-xs">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <h1 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3 pb-2 border-b border-gray-300 dark:border-gray-700">{children}</h1>,
                h2: ({ children }) => <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-2">{children}</h2>,
                h3: ({ children }) => <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-3 mb-1">{children}</h3>,
                p: ({ children }) => <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-2">{children}</p>,
                a: ({ href, children }) => <a href={href} className="text-orange-400 hover:underline">{children}</a>,
                code: ({ inline, children, ...props }: { inline?: boolean; children?: React.ReactNode }) =>
                  inline
                    ? <code className="bg-gray-100 dark:bg-gray-800 text-orange-300 px-1 py-0.5 rounded text-[11px] font-mono" {...props}>{children}</code>
                    : <code className="block bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 p-3 rounded-md text-[11px] font-mono overflow-x-auto mb-2 leading-relaxed" {...props}>{children}</code>,
                pre: ({ children }) => <>{children}</>,
                ul: ({ children }) => <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 mb-2 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside text-gray-700 dark:text-gray-300 mb-2 space-y-1">{children}</ol>,
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                blockquote: ({ children }) => <blockquote className="border-l-2 border-orange-500/50 pl-3 text-gray-500 dark:text-gray-400 italic mb-2">{children}</blockquote>,
                table: ({ children }) => <div className="overflow-x-auto mb-2"><table className="text-[11px] text-gray-700 dark:text-gray-300 border-collapse w-full">{children}</table></div>,
                th: ({ children }) => <th className="border border-gray-300 dark:border-gray-700 px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-left">{children}</th>,
                td: ({ children }) => <td className="border border-gray-300 dark:border-gray-700 px-2 py-1">{children}</td>,
                hr: () => <hr className="border-gray-300 dark:border-gray-700 my-3" />,
                strong: ({ children }) => <strong className="text-gray-900 dark:text-gray-100 font-semibold">{children}</strong>,
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Docs panel ───────────────────────────────────────────────────────────────

export function DocsPanel({ projectDir }: { projectDir: string }) {
  const monacoTheme = useMonacoTheme()
  const [docs, setDocs] = useState<DocFile[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [editContent, setEditContent] = useState<string>('')
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [autoSaving, setAutoSaving] = useState(false)
  const [autoSavedOk, setAutoSavedOk] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showNewDoc, setShowNewDoc] = useState(false)
  const [newDocName, setNewDocName] = useState('')
  const [creating, setCreating] = useState(false)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadDocs = useCallback(() => {
    setLoading(true)
    listDocs(projectDir)
      .then((d) => {
        setDocs(d)
        setLoading(false)
        generateDocsIndex(projectDir).catch(() => {})
      })
      .catch((e) => { setError(String(e)); setLoading(false) })
  }, [projectDir])

  useEffect(() => {
    setDocs([]); setSelected(null); setContent(null); setIsEditing(false); setError(null)
    loadDocs()
  }, [loadDocs])

  // Auto-save with 800ms debounce when editContent changes
  useEffect(() => {
    if (!isEditing || !selected || editContent === content) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      setAutoSaving(true)
      try {
        await writeDoc(projectDir, selected, editContent)
        setContent(editContent)
        setAutoSavedOk(true)
        setTimeout(() => setAutoSavedOk(false), 1500)
        generateDocsIndex(projectDir).catch(() => {})
      } catch { /* ignore */ } finally { setAutoSaving(false) }
    }, 800)
  }, [editContent, isEditing, selected, projectDir, content])

  const handleSelect = useCallback(async (doc: DocFile) => {
    setSelected(doc.path); setContent(null); setIsEditing(false)
    try {
      const c = await readDoc(projectDir, doc.path)
      setContent(c ?? '')
      setEditContent(c ?? '')
    } catch { /* ignore */ }
  }, [projectDir])

  const handleCreateDoc = useCallback(async () => {
    const name = newDocName.trim().replace(/\.md$/, '')
    if (!name) return
    setCreating(true); setError(null)
    try {
      const relativePath = `docs/${name}.md`
      await writeDoc(projectDir, relativePath, `# ${name}\n\n`)
      setShowNewDoc(false); setNewDocName('')
      loadDocs()
      handleSelect({ path: relativePath, title: name, summary: '', lastModified: new Date().toISOString(), tags: [], source: 'docs' })
    } catch (e) { setError(String(e)) } finally { setCreating(false) }
  }, [projectDir, newDocName, loadDocs, handleSelect])

  const rootDocs = docs.filter((d) => d.source === 'root')
  const subDocs = docs.filter((d) => d.source === 'docs')

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })

  return (
    <div className="flex flex-col h-full text-xs">

      {/* 主体：左列表 + 右内容区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 文件列表 */}
        <div className="w-52 shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden">
          {/* 新建按钮 */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800 shrink-0">
            <span className="text-[10px] text-gray-400 dark:text-gray-600 uppercase tracking-widest font-semibold">文档</span>
            <button
              onClick={() => { setShowNewDoc(true); setNewDocName('') }}
              className="p-0.5 text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              title="新建文档"
            >
              <Plus size={12} />
            </button>
          </div>

          {/* 新建输入框 */}
          {showNewDoc && (
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-200 dark:border-gray-800 shrink-0">
              <input
                autoFocus
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateDoc(); if (e.key === 'Escape') setShowNewDoc(false) }}
                placeholder="文件名（不含 .md）"
                className="flex-1 min-w-0 text-[11px] bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 focus:border-orange-500 rounded px-2 py-1 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 outline-none"
              />
              <button onClick={handleCreateDoc} disabled={creating || !newDocName.trim()}
                className="text-[10px] px-1.5 py-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded shrink-0">
                {creating ? '…' : '创建'}
              </button>
              <button onClick={() => setShowNewDoc(false)} className="text-gray-400 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 shrink-0">
                <X size={11} />
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-3 text-gray-400 dark:text-gray-600 text-center">加载中…</p>
            ) : docs.length === 0 ? (
              <p className="px-3 py-3 text-gray-400 dark:text-gray-600 text-center">暂无文档，点击 + 新建</p>
            ) : (
              <>
                {rootDocs.length > 0 && (
                  <>
                    <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600 select-none">根目录</p>
                    {rootDocs.map((doc) => (
                      <button key={doc.path} onClick={() => handleSelect(doc)} title={doc.path}
                        className={`w-full text-left px-3 py-1.5 border-b border-gray-200/40 dark:border-gray-800/40 transition-colors ${selected === doc.path ? 'bg-orange-500/20 text-orange-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                        <p className="truncate font-medium">{doc.title}</p>
                        <p className="text-gray-400 dark:text-gray-600 mt-0.5 font-mono truncate">{doc.path.split(/[/\\]/).pop()}</p>
                      </button>
                    ))}
                  </>
                )}
                {subDocs.length > 0 && (
                  <>
                    <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600 select-none">docs/</p>
                    {subDocs.map((doc) => (
                      <button key={doc.path} onClick={() => handleSelect(doc)} title={doc.path}
                        className={`w-full text-left px-3 py-1.5 border-b border-gray-200/40 dark:border-gray-800/40 transition-colors ${selected === doc.path ? 'bg-orange-500/20 text-orange-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                        <p className="truncate font-medium">{doc.title}</p>
                        <p className="text-gray-400 dark:text-gray-600 mt-0.5 font-mono truncate">{doc.path.split(/[/\\]/).pop()}</p>
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* 右侧内容区 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 编辑/预览工具栏 */}
          {selected && content !== null && (
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 dark:border-gray-800 shrink-0">
              {/* 模式切换 */}
              <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-md p-0.5">
                <button
                  onClick={() => setIsEditing(false)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${!isEditing ? 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                >
                  <Eye size={10} /> 预览
                </button>
                <button
                  onClick={() => { setIsEditing(true); setEditContent(content) }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${isEditing ? 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                >
                  <Pencil size={10} /> 编辑
                </button>
              </div>
              {/* 自动保存状态 */}
              {isEditing && (
                <span className={`text-[10px] transition-opacity ${autoSaving ? 'text-gray-400 dark:text-gray-500 opacity-100' : autoSavedOk ? 'text-green-400 opacity-100' : 'opacity-0'}`}>
                  {autoSaving ? '保存中…' : '已保存'}
                </span>
              )}
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="flex items-center gap-1 px-3 py-1.5 text-red-400 bg-red-500/5 border-b border-red-500/15 shrink-0">
              <AlertCircle size={10} className="shrink-0" />{error}
            </div>
          )}

          {/* 内容 */}
          <div className={`flex-1 overflow-hidden ${isEditing ? '' : 'overflow-y-auto p-4'}`}>
            {!selected ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400 dark:text-gray-600">
                <BookOpen size={20} className="opacity-30" />
                <p>选择文档预览</p>
              </div>
            ) : content === null ? (
              <p className="text-gray-400 dark:text-gray-500 p-4">加载中…</p>
            ) : isEditing ? (
              <Editor
                key={selected}
                height="100%"
                defaultLanguage="markdown"
                value={editContent}
                onChange={(v) => setEditContent(v ?? '')}
                theme={monacoTheme}
                options={{ minimap: { enabled: false }, fontSize: 12, wordWrap: 'on', scrollBeyondLastLine: false, padding: { top: 8, bottom: 8 }, lineNumbers: 'off' }}
              />
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
                      ? <code className="bg-gray-100 dark:bg-gray-800 text-orange-300 px-1 py-0.5 rounded text-[11px] font-mono" {...props}>{children}</code>
                      : <code className="block bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 p-3 rounded-md text-[11px] font-mono overflow-x-auto mb-3 leading-relaxed" {...props}>{children}</code>,
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
        </div>
      </div>
    </div>
  )
}

export function useProjectDir() {
  const { encodedPath } = useParams<{ encodedPath: string }>()
  return decodeURIComponent(encodedPath ?? '')
}

export default function ProjectPage() {
  const projectDir = useProjectDir()
  const projectName = projectDir.split(/[/\\]/).pop() ?? projectDir
  const navigate = useNavigate()
  const { projects, defaultCli, removeProject, setAlias, load: loadSettings } = useAppSettingsStore()
  const currentEntry = projects.find((p) => p.dir === projectDir)
  const alias = currentEntry?.alias
  const projectCliId = defaultCli ?? DEFAULT_CLI_ID
  const supportsSnapshots = projectCliId === 'claude' || projectCliId === 'codex'
  const displayName = alias ?? projectName

  const [editingAlias, setEditingAlias] = useState(false)
  const [aliasInput, setAliasInput] = useState('')
  const aliasKeyHandled = useRef(false)

  const startEdit = () => {
    aliasKeyHandled.current = false
    setAliasInput(alias ?? '')
    setEditingAlias(true)
  }

  const commitEdit = async () => {
    const trimmed = aliasInput.trim()
    try {
      await setAlias(projectDir, trimmed || undefined)
    } finally {
      setEditingAlias(false)
    }
  }

  const cancelEdit = () => setEditingAlias(false)
  const [sessionKey, setSessionKey] = useState(0)
  const [resumeId, setResumeId] = useState<string | undefined>(undefined)

  // Modal state: null = closed, 'new-session' or 'restore' with snapshot
  const [modal, setModal] = useState<
    | { type: 'new-session' }
    | { type: 'restore'; snapshot: SessionSnapshot }
    | null
  >(null)

  // Dropdown state
  const [showDropdown, setShowDropdown] = useState(false)
  const [snapshots, setSnapshots] = useState<SessionSnapshot[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [isSwitchingToNewSession, setIsSwitchingToNewSession] = useState(false)
  const pendingPreviousSessionIdRef = useRef<string | null>(null)

  // Route param changes reuse the same component instance, so reset per-project
  // session-control state to avoid carrying "new/restore" intent across projects.
  useEffect(() => {
    setSessionKey(0)
    setResumeId(undefined)
    setModal(null)
    setShowDropdown(false)
    setSnapshots([])
    setCurrentSessionId(null)
    setIsSwitchingToNewSession(false)
    pendingPreviousSessionIdRef.current = null
  }, [projectDir, projectCliId])

  useEffect(() => { loadSettings() }, [loadSettings])

  const loadSnapshots = useCallback(async () => {
    if (!projectDir) return
    const [list, sessionId] = await Promise.all([
      listSnapshots(projectDir, projectCliId).catch(() => [] as SessionSnapshot[]),
      getCurrentSessionId(projectDir, projectCliId).catch(() => null),
    ])

    const pendingPreviousSessionId = pendingPreviousSessionIdRef.current
    let shouldHideCurrentSession = false
    if (pendingPreviousSessionId && sessionId && sessionId !== pendingPreviousSessionId) {
      pendingPreviousSessionIdRef.current = null
      setIsSwitchingToNewSession(false)
    }
    if (pendingPreviousSessionId && sessionId === pendingPreviousSessionId) {
      shouldHideCurrentSession = true
    }

    setSnapshots(list)
    setCurrentSessionId(shouldHideCurrentSession ? null : sessionId)
  }, [projectDir, projectCliId])

  useEffect(() => {
    loadSnapshots()
  }, [loadSnapshots])

  // On first open of a project, current session JSONL may appear a bit later.
  // Poll briefly so the header snapshot label updates as soon as session id is available.
  useEffect(() => {
    if (!projectDir || currentSessionId) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let attempts = 0

    const poll = async () => {
      if (cancelled) return
      if (attempts++ >= 12) return

      const id = await getCurrentSessionId(projectDir, projectCliId).catch(() => null)
      if (cancelled) return

      const pendingPreviousSessionId = pendingPreviousSessionIdRef.current
      if (pendingPreviousSessionId && id === pendingPreviousSessionId) {
        timer = setTimeout(poll, 600)
        return
      }

      if (id) {
        pendingPreviousSessionIdRef.current = null
        setCurrentSessionId(id)
        await loadSnapshots()
        return
      }

      timer = setTimeout(poll, 600)
    }

    timer = setTimeout(poll, 300)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [projectDir, projectCliId, currentSessionId, loadSnapshots])

  // Shared logic: optionally save snapshot, kill session, start new or resume
  const handleModalConfirm = useCallback(
    async (
      saveData: { name: string; description: string } | null,
      nextResumeId?: string
    ) => {
      const t0 = performance.now()
      const log = (msg: string, extra?: Record<string, unknown>) => {
        const elapsedMs = Math.round(performance.now() - t0)
        const detail = {
          projectDir: projectDir.split(/[\\/]/).pop(),
          ...extra,
        }
        console.log(`[ProjectPage +${elapsedMs}ms] ${msg}`, detail)
        window.electronAPI.debug.timing('ProjectPage', `+${elapsedMs}ms ${msg}`, detail)
      }

      if (!projectDir) return
      log('modal confirm begin', { hasSaveData: !!saveData, nextResumeId })
      if (saveData) {
        await saveSnapshot(projectDir, saveData.name, saveData.description, projectCliId)
        log('saveSnapshot done')
        await loadSnapshots()
        log('loadSnapshots after save done')
      }
      await window.electronAPI.pty.kill(projectDir, projectCliId)
      log('pty.kill done')
      if (nextResumeId) {
        // Restore: session ID is known immediately
        pendingPreviousSessionIdRef.current = null
        setIsSwitchingToNewSession(false)
        setCurrentSessionId(nextResumeId)
        log('restore setCurrentSessionId')
      } else {
        // New session: clear stale name right away, then poll for a different current ID.
        const previousSessionId = currentSessionId
        pendingPreviousSessionIdRef.current = previousSessionId
        setIsSwitchingToNewSession(true)
        await window.electronAPI.pty.clearSession(projectDir, projectCliId)
        log('pty.clearSession done', { previousSessionId })
        setCurrentSessionId(null)
        let attempts = 0
        const poll = async () => {
          if (attempts++ >= 6) {
            setIsSwitchingToNewSession(false)
            log('new-session id poll timeout', { attempts })
            return
          }
          try {
            const current = await getCurrentSession(projectDir, projectCliId)
            log('new-session id poll tick', { attempts, id: current.id, source: current.source, previousSessionId })
            if (current.id && current.id !== previousSessionId) {
              pendingPreviousSessionIdRef.current = null
              setIsSwitchingToNewSession(false)
              setCurrentSessionId(current.id)
              log('new-session id updated', { id: current.id, source: current.source })
              return
            }
          } catch {
            log('new-session id poll error', { attempts })
          }
          setTimeout(poll, 500)
        }
        setTimeout(poll, 300)
      }
      setResumeId(nextResumeId)
      setSessionKey((k) => k + 1)
      setModal(null)
      log('modal confirm end')
    },
    [projectDir, projectCliId, loadSnapshots]
  )

  const handleDeleteSnapshot = useCallback(
    async (snapshot: SessionSnapshot) => {
      if (!projectDir) return
      await deleteSnapshot(projectDir, snapshot.id, projectCliId).catch(() => {})
      await loadSnapshots()
    },
    [projectDir, projectCliId, loadSnapshots]
  )

  const handleCloseDropdown = useCallback(() => setShowDropdown(false), [])

  if (!projectDir) return null

  const currentSnapshot = isSwitchingToNewSession
    ? null
    : (snapshots.find((s) => s.id === currentSessionId) ?? null)

  const handleRemove = async () => {
    if (!confirm(`从列表中移除项目 "${displayName}"？\n（不会删除本地文件）`)) return
    await window.electronAPI.pty.kill(projectDir, projectCliId)
    await removeProject(projectDir)
    navigate('/')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5 min-w-0">
            {editingAlias ? (
              <input
                autoFocus
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { aliasKeyHandled.current = true; commitEdit() }
                  if (e.key === 'Escape') { aliasKeyHandled.current = true; cancelEdit() }
                }}
                onBlur={() => { if (!aliasKeyHandled.current) commitEdit() }}
                placeholder={projectName}
                className="text-base font-semibold text-gray-900 dark:text-gray-100 bg-transparent border-b border-orange-400 focus:outline-none min-w-0 w-48 max-w-xs"
              />
            ) : (
              <button
                onClick={startEdit}
                title={`${displayName}（点击设置别名）`}
                className="group flex items-center gap-1 min-w-0"
              >
                <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{displayName}</h1>
                <Pencil size={11} className="shrink-0 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
            {currentSnapshot && (
              <span className="shrink-0 text-xs text-orange-400/80 font-medium truncate max-w-[180px]">· {currentSnapshot.name}</span>
            )}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate">{projectDir}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">

          {/* 会话存档 dropdown */}
          {supportsSnapshots && (
            <div className="relative">
              <button
                onClick={() => {
                  loadSnapshots()
                  setShowDropdown((v) => !v)
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-orange-400 hover:bg-orange-400/10 rounded-md transition-colors"
                title="查看会话存档"
              >
                会话存档 ▾
              </button>
              {showDropdown && (
                <SnapshotDropdown
                  snapshots={snapshots}
                  currentSessionId={currentSessionId ?? undefined}
                  onRestore={(s) => { setShowDropdown(false); setModal({ type: 'restore', snapshot: s }) }}
                  onDelete={handleDeleteSnapshot}
                  onClose={handleCloseDropdown}
                />
              )}
            </div>
          )}

          {/* 新会话 */}
          <button
            onClick={() => {
              if (supportsSnapshots) {
                setModal({ type: 'new-session' })
                return
              }
              void handleModalConfirm(null, undefined)
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-orange-400 hover:bg-orange-400/10 rounded-md transition-colors"
            title={supportsSnapshots ? '开始新会话' : '重启当前会话'}
          >
            <RotateCcw size={12} />
            新会话
          </button>

          <button
            onClick={handleRemove}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
            title="从列表中移除此项目"
          >
            <Trash2 size={12} />
            移除项目
          </button>
        </div>
      </div>

      {/* Terminal */}
      <div className="flex-1 overflow-hidden bg-[#faf6ef] dark:bg-[#030712]">
        <TerminalPanel
          key={`${projectDir}-${projectCliId}-${sessionKey}`}
          projectDir={projectDir}
          newSession={sessionKey > 0 && !resumeId}
          resumeId={resumeId}
          cliId={projectCliId}
        />
      </div>

      {/* Modals */}
      {modal?.type === 'new-session' && (
        <SessionActionModal
          mode="new-session"
          projectDir={projectDir}
          cliId={projectCliId}
          existingSnapshot={currentSnapshot ?? undefined}
          onConfirm={(saveData) => handleModalConfirm(saveData, undefined)}
          onCancel={() => setModal(null)}
        />
      )}
      {modal?.type === 'restore' && (
        <SessionActionModal
          mode="restore"
          projectDir={projectDir}
          cliId={projectCliId}
          snapshot={modal.snapshot}
          existingSnapshot={currentSnapshot ?? undefined}
          onConfirm={(saveData) => handleModalConfirm(saveData, modal.snapshot.id)}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  )
}
