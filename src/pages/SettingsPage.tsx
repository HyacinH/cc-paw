import { useState, useEffect } from 'react'
import { Save, Eye, EyeOff, Bell } from 'lucide-react'
import { useAppSettingsStore } from '../store/appSettings.store'

export default function SettingsPage() {
  const { notifyOnDone, load: loadApp, save: saveApp } = useAppSettingsStore()

  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [sonnetModel, setSonnetModel] = useState('')
  const [opusModel, setOpusModel] = useState('')
  const [haikuModel, setHaikuModel] = useState('')
  const [showHelper, setShowHelper] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadApp()
    window.electronAPI.claudeSettings.read().then((r) => {
      if (r.success && r.data) {
        setApiKey(r.data.apiKey)
        setBaseUrl(r.data.baseUrl)
        setSonnetModel(r.data.defaultSonnetModel)
        setOpusModel(r.data.defaultOpusModel)
        setHaikuModel(r.data.defaultHaikuModel)
      }
    })
  }, [loadApp])

  const handleSave = async () => {
    setSaving(true); setError(null)
    try {
      const result = await window.electronAPI.claudeSettings.write({
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim(),
        defaultSonnetModel: sonnetModel.trim(),
        defaultOpusModel: opusModel.trim(),
        defaultHaikuModel: haikuModel.trim(),
      })
      if (!result.success) throw new Error(result.error)
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2000)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1">设置</h1>
        <p className="text-sm text-gray-400 dark:text-gray-500">直接编辑 ~/.claude/settings.json · 与 Claude Code CLI 共享同一配置</p>
      </div>

      {/* Auth */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">认证</h2>

        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
            API Key
            <span className="ml-2 text-gray-400 dark:text-gray-600 font-normal">— Anthropic API 密钥</span>
          </label>
          <div className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3">
            <input
              type={showHelper ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="flex-1 text-sm bg-transparent py-2.5 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none font-mono"
            />
            <button onClick={() => setShowHelper((v) => !v)} className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-1 shrink-0">
              {showHelper ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-600">仅在点击保存时写入 ~/.claude/settings.json 的 <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">env.ANTHROPIC_API_KEY</code></p>
        </div>

        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
            ANTHROPIC_BASE_URL
            <span className="ml-2 text-gray-400 dark:text-gray-600 font-normal">— 代理地址</span>
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.anthropic.com"
            className="w-full text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2.5 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-orange-500 font-mono"
          />
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-600">留空则直连 Anthropic 官方 API</p>
        </div>
      </section>

      {/* Model */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">模型版本</h2>
        <p className="text-xs text-gray-400 dark:text-gray-600">对应 ~/.claude/settings.json 的 ANTHROPIC_DEFAULT_*_MODEL，由 Claude Code CLI 按任务复杂度自动选择 tier</p>
        {[
          { label: 'Sonnet', key: 'ANTHROPIC_DEFAULT_SONNET_MODEL', value: sonnetModel, set: setSonnetModel, placeholder: 'claude-sonnet-4-6' },
          { label: 'Opus',   key: 'ANTHROPIC_DEFAULT_OPUS_MODEL',   value: opusModel,   set: setOpusModel,   placeholder: 'claude-opus-4-6' },
          { label: 'Haiku',  key: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',  value: haikuModel,  set: setHaikuModel,  placeholder: 'claude-haiku-4-5' },
        ].map(({ label, key, value, set, placeholder }) => (
          <div key={key} className="flex items-center gap-3">
            <span className="text-xs text-gray-500 dark:text-gray-400 w-12 shrink-0">{label}</span>
            <input
              type="text"
              value={value}
              onChange={(e) => set(e.target.value)}
              placeholder={placeholder}
              className="flex-1 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-orange-500 font-mono"
            />
          </div>
        ))}
      </section>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Save size={14} /> {saving ? '保存中…' : '保存'}
        </button>
        {savedOk && <span className="text-xs text-green-400">已保存到 ~/.claude/settings.json</span>}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      {/* Notifications */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">通知</h2>
        <label className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg cursor-pointer hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
          <div className="flex items-center gap-2.5">
            <Bell size={14} className="text-gray-400 dark:text-gray-500 shrink-0" />
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">Claude 完成时通知</p>
              <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">10 秒无输出后，在 App 未处于前台时发送系统通知</p>
            </div>
          </div>
          <button
            role="switch"
            aria-checked={notifyOnDone}
            onClick={() => saveApp({ notifyOnDone: !notifyOnDone })}
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors focus:outline-none ${notifyOnDone ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-700'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${notifyOnDone ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </label>
      </section>
    </div>
  )
}
