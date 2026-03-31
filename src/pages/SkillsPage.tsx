import { useState, useEffect, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import {
  Plus, Trash2, PenLine, Save, AlertCircle, Download, ExternalLink,
  X, Loader2, Package, RotateCcw, Zap,
} from 'lucide-react'
import {
  listSkills, readSkill, writeSkill, deleteSkill, renameSkill,
  fetchSkillFromUrl, openExternalUrl, listPluginSkills,
} from '../api/skills'
import type { SkillFile } from '../types/skill.types'
import type { PluginSkillEntry } from '../types/electron'
import { useMonacoTheme } from '../hooks/useMonacoTheme'

// ─── Constants ────────────────────────────────────────────────────────────────
const SKILL_NAME_RE = /^[a-zA-Z0-9_-]+$/

const RESOURCE_LINKS = [
  { label: '官方插件市场', desc: 'Anthropic 插件（含 Skills）', url: 'https://claude.com/plugins' },
  { label: 'Skills 官方文档', desc: '创建和使用 Skills 指南', url: 'https://docs.anthropic.com/en/claude-code/skills' },
  { label: 'awesome-claude-code', desc: '社区精选 Skills 合集', url: 'https://github.com/hesreallyhim/awesome-claude-code' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function nameFromUrl(url: string): string {
  try {
    const seg = new URL(url).pathname.split('/').pop() ?? ''
    return seg.replace(/\.md$/i, '').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  } catch { return '' }
}

// ─── LocalSidebar ─────────────────────────────────────────────────────────────
function LocalSidebar({
  skills, pluginSkills, selected, selectedPluginSkill,
  renameTarget, renameName, showNewInput, newSkillName, createError, reloading,
  onSelect, onSelectPlugin,
  onRenameStart, onRenameChange, onRenameConfirm, onRenameCancel,
  onDelete, onNewInputShow, onNewNameChange, onCreate, onNewCancel, onImport, onReload,
}: {
  skills: SkillFile[]
  pluginSkills: PluginSkillEntry[]
  selected: string | null
  selectedPluginSkill: PluginSkillEntry | null
  renameTarget: string | null
  renameName: string
  showNewInput: boolean
  newSkillName: string
  createError: string | null
  reloading: boolean
  onSelect: (name: string) => void
  onSelectPlugin: (entry: PluginSkillEntry) => void
  onRenameStart: (name: string) => void
  onRenameChange: (v: string) => void
  onRenameConfirm: (old: string) => void
  onRenameCancel: () => void
  onDelete: (name: string) => void
  onNewInputShow: () => void
  onNewNameChange: (v: string) => void
  onCreate: () => void
  onNewCancel: () => void
  onImport: () => void
  onReload: () => void
}) {
  return (
    <>
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 dark:border-gray-800">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Skills</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onReload}
            disabled={reloading}
            className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded disabled:opacity-50"
            title="刷新列表（安装插件后点此更新）"
          >
            <RotateCcw size={12} className={reloading ? 'animate-spin' : ''} />
          </button>
          <button onClick={onImport} className="p-1 text-gray-400 dark:text-gray-500 hover:text-orange-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="从 URL 导入">
            <Download size={13} />
          </button>
          <button onClick={onNewInputShow} className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="新建">
            <Plus size={13} />
          </button>
        </div>
      </div>

      {showNewInput && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800">
          <input
            autoFocus
            value={newSkillName}
            onChange={(e) => onNewNameChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onCreate(); if (e.key === 'Escape') onNewCancel() }}
            placeholder="skill-name"
            className={`w-full text-xs bg-gray-100 dark:bg-gray-800 border rounded px-2 py-1 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none ${createError ? 'border-red-500' : 'border-gray-300 dark:border-gray-700 focus:border-orange-500'}`}
          />
          {createError && <p className="text-[10px] text-red-400 mt-1">{createError}</p>}
          <div className="flex gap-1 mt-1.5">
            <button onClick={onCreate} className="text-xs px-2 py-0.5 bg-orange-500 text-white rounded hover:bg-orange-600">创建</button>
            <button onClick={onNewCancel} className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600">取消</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1">
        {skills.length === 0 && pluginSkills.length === 0 && (
          <p className="px-3 py-6 text-xs text-gray-400 dark:text-gray-600 text-center">
            暂无 Skill<br />
            <span className="text-[10px]">点击 + 新建，或从插件市场安装插件</span>
          </p>
        )}

        {/* 本地 .md Skills */}
        {skills.length > 0 && (
          <div className="pb-1">
            {skills.map((s) => (
              <div
                key={s.name}
                className={`group flex items-center gap-1 px-3 py-2 cursor-pointer transition-colors ${selected === s.name ? 'bg-orange-500/20 text-orange-400' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
              >
                {renameTarget === s.name ? (
                  <input
                    autoFocus
                    value={renameName}
                    onChange={(e) => onRenameChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onRenameConfirm(s.name); if (e.key === 'Escape') onRenameCancel() }}
                    className="flex-1 text-xs bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 text-gray-800 dark:text-gray-200 focus:outline-none focus:border-orange-500"
                  />
                ) : (
                  <span className="flex-1 text-sm truncate" onClick={() => onSelect(s.name)}>{s.name}</span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onRenameStart(s.name); onRenameChange(s.name) }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  title="重命名"
                >
                  <PenLine size={11} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(s.name) }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 dark:text-gray-500 hover:text-red-400"
                  title="删除"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 来自插件的 Skills */}
        {pluginSkills.length > 0 && (
          <>
            <div className="flex items-center gap-2 px-3 pt-2 pb-1">
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
              <span className="text-[10px] text-gray-400 dark:text-gray-600 font-medium whitespace-nowrap">
                来自插件 ({pluginSkills.length})
              </span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
            </div>
            {pluginSkills.map((entry) => {
              const key = `${entry.pluginKey}::${entry.skillName}`
              const isActive =
                selectedPluginSkill?.skillName === entry.skillName &&
                selectedPluginSkill?.pluginKey === entry.pluginKey
              return (
                <div
                  key={key}
                  onClick={() => onSelectPlugin(entry)}
                  className={`px-3 py-2 cursor-pointer transition-colors ${isActive ? 'bg-blue-500/20' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                >
                  <div className="flex items-center gap-1.5">
                    <Package size={10} className={isActive ? 'text-blue-400' : 'text-gray-400 dark:text-gray-600'} />
                    <span className={`text-sm truncate ${isActive ? 'text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>
                      {entry.skillName}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-600 pl-[19px] truncate">{entry.pluginName}</p>
                </div>
              )
            })}
          </>
        )}
      </div>
    </>
  )
}

// ─── ImportUrlPanel ────────────────────────────────────────────────────────────
function ImportUrlPanel({
  url, name, preview, fetching, saving, error, skills,
  onUrlChange, onNameChange, onFetch, onSave, onClose,
}: {
  url: string; name: string; preview: string | null; fetching: boolean
  saving: boolean; error: string | null; skills: SkillFile[]
  onUrlChange: (v: string) => void; onNameChange: (v: string) => void
  onFetch: () => void; onSave: () => void; onClose: () => void
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">从 URL 导入 Skill</span>
        <button onClick={onClose} className="text-gray-400 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-300"><X size={14} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider block mb-1.5">Skill 文件 URL</label>
          <div className="flex gap-2">
            <input
              autoFocus
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onFetch() }}
              placeholder="https://raw.githubusercontent.com/..."
              className="flex-1 text-xs bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-2.5 py-1.5 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-orange-500 font-mono"
            />
            <button
              onClick={onFetch}
              disabled={fetching || !url.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 text-gray-800 dark:text-gray-200 text-xs rounded shrink-0"
            >
              {fetching ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
              获取
            </button>
          </div>
          {error && <p className="flex items-center gap-1 text-xs text-red-400 mt-1.5"><AlertCircle size={11} />{error}</p>}
        </div>

        {preview !== null && (
          <div>
            <div className="p-2.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-700 max-h-40 overflow-y-auto mb-3">
              <pre className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">
                {preview.slice(0, 1000)}{preview.length > 1000 ? '\n…' : ''}
              </pre>
            </div>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="skill-name"
                className="flex-1 text-xs bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-2.5 py-1.5 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-orange-500"
              />
              <button
                onClick={onSave}
                disabled={saving || !name.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-medium rounded shrink-0"
              >
                <Save size={11} />
                {saving ? '导入中…' : '导入'}
              </button>
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <p className="text-[10px] text-gray-400 dark:text-gray-600 uppercase tracking-wider mb-2">外部资源</p>
          <div className="space-y-1.5">
            {RESOURCE_LINKS.map((link) => (
              <button
                key={link.url}
                onClick={() => openExternalUrl(link.url)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors group text-left"
              >
                <div>
                  <p className="text-xs text-gray-700 dark:text-gray-300 group-hover:text-white">{link.label}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-600">{link.desc}</p>
                </div>
                <ExternalLink size={10} className="text-gray-400 dark:text-gray-600 group-hover:text-orange-400 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SkillsPage() {
  const monacoTheme = useMonacoTheme()
  // ── State ─────────────────────────────────────────────────────────────────────
  const [skills, setSkills] = useState<SkillFile[]>([])
  const [pluginSkills, setPluginSkills] = useState<PluginSkillEntry[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [selectedPluginSkill, setSelectedPluginSkill] = useState<PluginSkillEntry | null>(null)
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedOk, setSavedOk] = useState(false)
  const [reloading, setReloading] = useState(false)

  const [showNewInput, setShowNewInput] = useState(false)
  const [newSkillName, setNewSkillName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')

  const [showImportUrl, setShowImportUrl] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importName, setImportName] = useState('')
  const [importPreview, setImportPreview] = useState<string | null>(null)
  const [importFetching, setImportFetching] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSaving, setImportSaving] = useState(false)

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    setReloading(true)
    try {
      const [list, pluginList] = await Promise.all([
        listSkills(),
        listPluginSkills().catch((e) => {
          console.error('[SkillsPage] listPluginSkills failed:', e)
          return [] as PluginSkillEntry[]
        }),
      ])
      setSkills(list)
      setPluginSkills(pluginList)
    } catch (e) {
      console.error('[SkillsPage] reload failed:', e)
    } finally {
      setReloading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const handleSelect = useCallback(async (name: string) => {
    setSelected(name)
    setSelectedPluginSkill(null)
    setShowImportUrl(false)
    setError(null)
    setSavedOk(false)
    const c = await readSkill(name)
    setContent(c ?? '')
  }, [])

  const handleSelectPlugin = useCallback((entry: PluginSkillEntry) => {
    setSelectedPluginSkill(entry)
    setSelected(null)
    setShowImportUrl(false)
    setError(null)
  }, [])

  const handleSave = useCallback(async () => {
    if (!selected) return
    setSaving(true); setError(null); setSavedOk(false)
    try {
      await writeSkill(selected, content)
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2000)
    } catch (e) { setError(String(e)) }
    finally { setSaving(false) }
  }, [selected, content])

  const handleCreate = useCallback(async () => {
    const name = newSkillName.trim()
    if (!name) { setCreateError('名称不能为空'); return }
    if (!SKILL_NAME_RE.test(name)) { setCreateError('只允许字母、数字、连字符、下划线'); return }
    if (skills.some((s) => s.name === name)) { setCreateError('Skill 已存在'); return }
    try {
      await writeSkill(name, `# ${name}\n\n`)
      setNewSkillName(''); setShowNewInput(false); setCreateError(null)
      await reload()
      await handleSelect(name)
    } catch (e) { setCreateError(String(e)) }
  }, [newSkillName, skills, reload, handleSelect])

  const handleDelete = useCallback(async (name: string) => {
    if (!confirm(`删除 Skill "${name}"？`)) return
    await deleteSkill(name)
    if (selected === name) { setSelected(null); setContent('') }
    await reload()
  }, [selected, reload])

  const handleRename = useCallback(async (oldName: string) => {
    const newName = renameName.trim()
    if (!SKILL_NAME_RE.test(newName)) { setError('名称只允许字母、数字、连字符、下划线'); return }
    await renameSkill(oldName, newName)
    if (selected === oldName) setSelected(newName)
    setRenameTarget(null); setRenameName(''); setError(null)
    await reload()
  }, [renameName, selected, reload])

  const handleFetchUrl = useCallback(async () => {
    const url = importUrl.trim()
    if (!url) return
    setImportFetching(true); setImportError(null); setImportPreview(null)
    try {
      const text = await fetchSkillFromUrl(url)
      setImportPreview(text)
      if (!importName) setImportName(nameFromUrl(url))
    } catch (e) { setImportError(String(e)) }
    finally { setImportFetching(false) }
  }, [importUrl, importName])

  const handleImportSave = useCallback(async () => {
    if (!importPreview) return
    const name = importName.trim()
    if (!name) { setImportError('请填写 Skill 名称'); return }
    if (!SKILL_NAME_RE.test(name)) { setImportError('名称只允许字母、数字、连字符、下划线'); return }
    if (skills.some((s) => s.name === name)) { setImportError('Skill 已存在'); return }
    setImportSaving(true)
    try {
      await writeSkill(name, importPreview)
      await reload()
      await handleSelect(name)
      setShowImportUrl(false)
      setImportUrl(''); setImportName(''); setImportPreview(null); setImportError(null)
    } catch (e) { setImportError(String(e)) }
    finally { setImportSaving(false) }
  }, [importPreview, importName, skills, reload, handleSelect])

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-56 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col shrink-0">
        <LocalSidebar
          skills={skills}
          pluginSkills={pluginSkills}
          selected={selected}
          selectedPluginSkill={selectedPluginSkill}
          renameTarget={renameTarget}
          renameName={renameName}
          showNewInput={showNewInput}
          newSkillName={newSkillName}
          createError={createError}
          reloading={reloading}
          onSelect={handleSelect}
          onSelectPlugin={handleSelectPlugin}
          onRenameStart={(name) => setRenameTarget(name)}
          onRenameChange={setRenameName}
          onRenameConfirm={handleRename}
          onRenameCancel={() => { setRenameTarget(null); setRenameName('') }}
          onDelete={handleDelete}
          onNewInputShow={() => { setShowNewInput(true); setError(null) }}
          onNewNameChange={(v) => { setNewSkillName(v); setCreateError(null) }}
          onCreate={handleCreate}
          onNewCancel={() => { setShowNewInput(false); setCreateError(null) }}
          onImport={() => { setShowImportUrl(true); setSelected(null); setSelectedPluginSkill(null) }}
          onReload={reload}
        />
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {showImportUrl ? (
          <ImportUrlPanel
            url={importUrl}
            name={importName}
            preview={importPreview}
            fetching={importFetching}
            saving={importSaving}
            error={importError}
            skills={skills}
            onUrlChange={(v) => { setImportUrl(v); setImportPreview(null); setImportError(null) }}
            onNameChange={setImportName}
            onFetch={handleFetchUrl}
            onSave={handleImportSave}
            onClose={() => { setShowImportUrl(false) }}
          />
        ) : selectedPluginSkill ? (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Package size={13} className="text-blue-400 shrink-0" />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200 font-mono">/{selectedPluginSkill.skillName}</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded border border-blue-500/30 shrink-0">
                  {selectedPluginSkill.pluginName} @ {selectedPluginSkill.marketplace} v{selectedPluginSkill.version}
                </span>
                {selectedPluginSkill.referencesCount > 0 && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 rounded border border-gray-200 dark:border-gray-700 shrink-0"
                    title="Claude Code CLI 调用此 Skill 时会自动注入这些参考文件作为上下文"
                  >
                    +{selectedPluginSkill.referencesCount} 参考文件
                  </span>
                )}
              </div>
              <span className="text-[11px] text-gray-400 dark:text-gray-600 shrink-0">只读</span>
            </div>
            <div className="flex-1 overflow-hidden">
              <Editor
                key={`${selectedPluginSkill.pluginKey}::${selectedPluginSkill.skillName}`}
                height="100%"
                defaultLanguage="markdown"
                value={selectedPluginSkill.content}
                theme={monacoTheme}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  wordWrap: 'on',
                  scrollBeyondLastLine: false,
                  padding: { top: 12, bottom: 12 },
                }}
              />
            </div>
          </div>
        ) : selected ? (
          <>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200 font-mono">/{selected}</span>
                {error && <span className="flex items-center gap-1 text-xs text-red-400"><AlertCircle size={11} />{error}</span>}
                {savedOk && <span className="text-xs text-green-400">已保存</span>}
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-medium rounded transition-colors"
              >
                <Save size={12} />
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <Editor
                key={selected}
                height="100%"
                defaultLanguage="markdown"
                value={content}
                onChange={(v) => setContent(v ?? '')}
                theme={monacoTheme}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  wordWrap: 'on',
                  scrollBeyondLastLine: false,
                  padding: { top: 12, bottom: 12 },
                }}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 dark:text-gray-600">
            <Zap size={28} className="text-gray-500 dark:text-gray-700" />
            <p className="text-sm">选择一个 Skill 进行编辑</p>
            <p className="text-xs text-gray-500 dark:text-gray-700">或点击左上角 ↓ 从 URL 导入</p>
          </div>
        )}
      </div>
    </div>
  )
}
