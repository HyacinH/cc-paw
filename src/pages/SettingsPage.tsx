import { useState, useEffect } from 'react'
import { Save, Eye, EyeOff, Bell } from 'lucide-react'
import { useAppSettingsStore } from '../store/appSettings.store'
import { usePtyStore } from '../store/pty.store'
import type { CliId } from '../types/cli.types'
import { DEFAULT_CLI_ID, toScopeKey } from '../types/cli.types'

export default function SettingsPage() {
  const { projects, notifyOnDone, defaultCli, load: loadApp, save: saveApp } = useAppSettingsStore()
  const { states: ptyStates } = usePtyStore()

  const activeCli = defaultCli ?? DEFAULT_CLI_ID
  const isClaude = activeCli === 'claude'

  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [defaultModel, setDefaultModel] = useState('')
  const [sonnetModel, setSonnetModel] = useState('')
  const [opusModel, setOpusModel] = useState('')
  const [haikuModel, setHaikuModel] = useState('')
  const [showHelper, setShowHelper] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [switchingCli, setSwitchingCli] = useState<CliId | null>(null)
  const [cliSavedOk, setCliSavedOk] = useState(false)
  const [cliError, setCliError] = useState<string | null>(null)

  useEffect(() => {
    loadApp()
  }, [loadApp])

  useEffect(() => {
    let cancelled = false
    window.electronAPI.cliSettings.read(activeCli).then((r) => {
      if (cancelled || !r.success || !r.data) return
      setApiKey(r.data.apiKey)
      setBaseUrl(r.data.baseUrl)
      setDefaultModel(r.data.defaultModel)
      setSonnetModel(r.data.defaultSonnetModel)
      setOpusModel(r.data.defaultOpusModel)
      setHaikuModel(r.data.defaultHaikuModel)
    })
    return () => { cancelled = true }
  }, [activeCli])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const patch = isClaude
        ? {
            apiKey: apiKey.trim(),
            baseUrl: baseUrl.trim(),
            defaultSonnetModel: sonnetModel.trim(),
            defaultOpusModel: opusModel.trim(),
            defaultHaikuModel: haikuModel.trim(),
          }
        : {
            apiKey: apiKey.trim(),
            baseUrl: baseUrl.trim(),
            defaultModel: defaultModel.trim(),
          }
      const result = await window.electronAPI.cliSettings.write(patch, activeCli)
      if (!result.success) throw new Error(result.error)
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2000)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleSelectDefaultCli = async (cliId: CliId) => {
    const currentCli = defaultCli ?? DEFAULT_CLI_ID
    if (currentCli === cliId) return

    const runningProjects = projects
      .filter((p) => {
        const state = ptyStates[toScopeKey(p.dir, currentCli)]
        return state === 'running' || state === 'waiting-input'
      })
      .map((p) => p.alias ?? p.dir.split(/[/\\]/).pop() ?? p.dir)

    const confirmMessage = [
      `确认切换默认 CLI 到 ${cliId === 'claude' ? 'Claude Code' : 'Codex'}？`,
      '',
      '切换后将停止当前默认 CLI 的会话。',
      runningProjects.length > 0
        ? `检测到进行中的会话：${runningProjects.join('、')}`
        : '当前没有检测到进行中的会话。',
    ].join('\n')

    if (!window.confirm(confirmMessage)) return

    setCliError(null)
    setCliSavedOk(false)
    setSwitchingCli(cliId)

    try {
      const findResult = cliId === 'codex'
        ? await window.electronAPI.shell.findCodex()
        : await window.electronAPI.shell.findClaude()
      if (!findResult.success || !findResult.data?.trim()) {
        throw new Error(`${cliId} CLI 未安装或不可执行，请先安装并确保在 PATH 中可用`)
      }

      await Promise.allSettled(
        projects.map((p) => window.electronAPI.pty.kill(p.dir, currentCli))
      )

      await saveApp({ defaultCli: cliId })

      setCliSavedOk(true)
      setTimeout(() => setCliSavedOk(false), 2000)
    } catch (e) {
      setCliError(String(e))
    } finally {
      setSwitchingCli(null)
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1">设置</h1>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          当前 CLI：{isClaude ? 'Claude Code' : 'Codex'} · 下方认证/模型配置与当前 CLI 绑定
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Default CLI</h2>
        <p className="text-xs text-gray-400 dark:text-gray-600">
          全局生效。切换后 Skills / Settings / 终端会按新 CLI 即时工作。
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={() => handleSelectDefaultCli('claude')}
            disabled={switchingCli !== null}
            className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors disabled:opacity-60 ${
              activeCli === 'claude'
                ? 'border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400'
                : 'border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-700'
            }`}
          >
            Claude Code
          </button>
          <button
            onClick={() => handleSelectDefaultCli('codex')}
            disabled={switchingCli !== null}
            className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors disabled:opacity-60 ${
              activeCli === 'codex'
                ? 'border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400'
                : 'border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-700'
            }`}
          >
            Codex
          </button>
        </div>
        {switchingCli && <p className="text-xs text-gray-400 dark:text-gray-600">切换中，正在检查 CLI 并清理旧会话…</p>}
        {cliSavedOk && <p className="text-xs text-green-400">Default CLI 已切换，当前页面配置已自动切到新 CLI</p>}
        {cliError && <p className="text-xs text-red-400">{cliError}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">认证</h2>

        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
            API Key
            <span className="ml-2 text-gray-400 dark:text-gray-600 font-normal">
              — {isClaude ? 'Anthropic API 密钥' : 'OpenAI 兼容 API 密钥'}
            </span>
          </label>
          <div className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3">
            <input
              type={showHelper ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isClaude ? 'sk-ant-...' : 'sk-...'}
              className="flex-1 text-sm bg-transparent py-2.5 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none font-mono"
            />
            <button onClick={() => setShowHelper((v) => !v)} className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-1 shrink-0">
              {showHelper ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-600">
            {isClaude
              ? <>保存到 <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">~/.claude/settings.json</code> 的 <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">env.ANTHROPIC_API_KEY</code></>
              : <>保存到 <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">~/.codex/auth.json</code> 的 <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">OPENAI_API_KEY</code></>}
          </p>
        </div>

        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
            {isClaude ? 'ANTHROPIC_BASE_URL' : 'base_url'}
            <span className="ml-2 text-gray-400 dark:text-gray-600 font-normal">— 代理地址</span>
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={isClaude ? 'https://api.anthropic.com' : 'https://api.openai.com/v1'}
            className="w-full text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2.5 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-orange-500 font-mono"
          />
        </div>
      </section>

      {isClaude ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">模型版本</h2>
          <p className="text-xs text-gray-400 dark:text-gray-600">对应 ~/.claude/settings.json 的 ANTHROPIC_DEFAULT_*_MODEL</p>
          {[
            { label: 'Sonnet', key: 'ANTHROPIC_DEFAULT_SONNET_MODEL', value: sonnetModel, set: setSonnetModel, placeholder: 'claude-sonnet-4-6' },
            { label: 'Opus', key: 'ANTHROPIC_DEFAULT_OPUS_MODEL', value: opusModel, set: setOpusModel, placeholder: 'claude-opus-4-6' },
            { label: 'Haiku', key: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', value: haikuModel, set: setHaikuModel, placeholder: 'claude-haiku-4-5' },
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
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">模型版本</h2>
          <p className="text-xs text-gray-400 dark:text-gray-600">对应 ~/.codex/config.toml 的 <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">model</code></p>
          <input
            type="text"
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            placeholder="gpt-5"
            className="w-full text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2.5 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-orange-500 font-mono"
          />
        </section>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || switchingCli !== null}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Save size={14} /> {saving ? '保存中…' : '保存'}
        </button>
        {savedOk && (
          <span className="text-xs text-green-400">
            已保存到 {isClaude ? '~/.claude/settings.json' : '~/.codex/auth.json + ~/.codex/config.toml'}
          </span>
        )}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">通知</h2>
        <label className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg cursor-pointer hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
          <div className="flex items-center gap-2.5">
            <Bell size={14} className="text-gray-400 dark:text-gray-500 shrink-0" />
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">CLI 完成时通知</p>
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
