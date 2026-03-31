import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Trash2, RotateCcw, AlertCircle, BookOpen, Eye, Pencil, Plus, X } from 'lucide-react'
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
import { listSnapshots, saveSnapshot, deleteSnapshot } from '../api/snapshot'
import { SessionActionModal } from '../components/session/SessionActionModal'
import { SnapshotDropdown } from '../components/session/SnapshotDropdown'

// ─── CLAUDE.md panel ──────────────────────────────────────────────────────────

export function ClaudeMdPanel({ projectDir }: { projectDir: string }) {
  const monacoTheme = useMonacoTheme()
  const [content, setContent] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedOk, setSavedOk] = useState(false)

  useEffect(() => {
    setContent(null); setIsEditing(false)
    readProjectClaudeMd(projectDir).then((c) => { setContent(c ?? ''); setEditContent(c ?? '') }).catch(() => {})
  }, [projectDir])

  const handleSave = useCallback(async () => {
    setSaving(true); setError(null); setSavedOk(false)
    try {
      await writeProjectClaudeMd(projectDir, editContent)
      setContent(editContent)
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2000)
    } catch (e) { setError(String(e)) } finally { setSaving(false) }
  }, [projectDir, editContent])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800 shrink-0">
        {/* 编辑/预览切换 */}
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
  const navigate = useNavigate()
  const { removeProject } = useAppSettingsStore()
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

  const loadSnapshots = useCallback(async () => {
    if (!projectDir) return
    const list = await listSnapshots(projectDir).catch(() => [] as SessionSnapshot[])
    setSnapshots(list)
  }, [projectDir])

  useEffect(() => {
    loadSnapshots()
  }, [loadSnapshots])

  // Shared logic: optionally save snapshot, kill session, start new or resume
  const handleModalConfirm = useCallback(
    async (
      saveData: { name: string; description: string } | null,
      nextResumeId?: string
    ) => {
      if (!projectDir) return
      if (saveData) {
        await saveSnapshot(projectDir, saveData.name, saveData.description)
        await loadSnapshots()
      }
      await window.electronAPI.pty.kill(projectDir)
      if (!nextResumeId) {
        await window.electronAPI.pty.clearSession(projectDir)
      }
      setResumeId(nextResumeId)
      setSessionKey((k) => k + 1)
      setModal(null)
    },
    [projectDir, loadSnapshots]
  )

  const handleDeleteSnapshot = useCallback(
    async (snapshot: SessionSnapshot) => {
      if (!projectDir) return
      await deleteSnapshot(projectDir, snapshot.id).catch(() => {})
      await loadSnapshots()
    },
    [projectDir, loadSnapshots]
  )

  const handleCloseDropdown = useCallback(() => setShowDropdown(false), [])

  if (!projectDir) return null

  const projectName = projectDir.split(/[/\\]/).pop() ?? projectDir

  const handleRemove = async () => {
    if (!confirm(`从列表中移除项目 "${projectName}"？\n（不会删除本地文件）`)) return
    await window.electronAPI.pty.kill(projectDir)
    await removeProject(projectDir)
    navigate('/')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">{projectName}</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate">{projectDir}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* 会话存档 dropdown */}
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
                onRestore={(s) => { setShowDropdown(false); setModal({ type: 'restore', snapshot: s }) }}
                onDelete={handleDeleteSnapshot}
                onClose={handleCloseDropdown}
              />
            )}
          </div>

          {/* 新会话 */}
          <button
            onClick={() => setModal({ type: 'new-session' })}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-orange-400 hover:bg-orange-400/10 rounded-md transition-colors"
            title="开始新会话"
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
          key={`${projectDir}-${sessionKey}`}
          projectDir={projectDir}
          newSession={sessionKey > 0 && !resumeId}
          resumeId={resumeId}
        />
      </div>

      {/* Modals */}
      {modal?.type === 'new-session' && (
        <SessionActionModal
          title="开始新会话"
          onConfirm={(saveData) => handleModalConfirm(saveData, undefined)}
          onCancel={() => setModal(null)}
        />
      )}
      {modal?.type === 'restore' && (
        <SessionActionModal
          title={`恢复会话：${modal.snapshot.name}`}
          onConfirm={(saveData) => handleModalConfirm(saveData, modal.snapshot.id)}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  )
}
