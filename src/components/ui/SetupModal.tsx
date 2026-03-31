import { useState, useEffect } from 'react'
import { CheckCircle2, Download, AlertCircle, Loader2, Terminal, SkipForward, ExternalLink, RefreshCw, ArrowRight } from 'lucide-react'

type Step = 'checking' | 'ready' | 'no-node' | 'no-claude' | 'installing' | 'verifying' | 'error'

const CMD = 'npm install -g @anthropic-ai/claude-code'

// Numbered step indicator
function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
      done ? 'bg-green-500 text-white' : active ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-500'
    }`}>
      {done ? <CheckCircle2 size={14} /> : n}
    </div>
  )
}

export default function SetupModal({ onDismiss }: { onDismiss: () => void }) {
  const [step, setStep] = useState<Step>('checking')
  const [output, setOutput] = useState('')

  useEffect(() => { detect() }, [])

  const detect = async () => {
    setStep('checking')
    const claude = await window.electronAPI.shell.run("bash -lc 'claude --version 2>&1'")
    if (claude.success) {
      setStep('ready')
      setTimeout(onDismiss, 800)
      return
    }
    const node = await window.electronAPI.shell.run("bash -lc 'which node 2>&1'")
    setStep(node.success ? 'no-claude' : 'no-node')
  }

  const openNodeJs = () => window.electronAPI.skills.openUrl('https://nodejs.org')

  const install = async () => {
    setStep('installing')
    setOutput('')
    const r = await window.electronAPI.shell.run(`bash -lc '${CMD} 2>&1'`)
    setOutput(r.output)
    if (r.success) {
      setStep('verifying')
      const verify = await window.electronAPI.shell.run("bash -lc 'claude --version 2>&1'")
      setStep(verify.success ? 'ready' : 'error')
      if (verify.success) setTimeout(onDismiss, 1000)
    } else {
      setStep('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/95 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-8 pt-8 pb-5 text-center border-b border-gray-800">
          <div className="flex justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="w-14 h-14 rounded-2xl">
              <rect width="512" height="512" rx="108" fill="#0d1520"/>
              <ellipse cx="256" cy="378" rx="150" ry="134" fill="#f9a8c4"/>
              <ellipse cx="206" cy="214" rx="55" ry="65" fill="#f9a8c4"/>
              <ellipse cx="306" cy="214" rx="55" ry="65" fill="#f9a8c4"/>
              <ellipse cx="130" cy="256" rx="45" ry="55" fill="#f9a8c4"/>
              <ellipse cx="382" cy="256" rx="45" ry="55" fill="#f9a8c4"/>
              <ellipse cx="256" cy="366" rx="95" ry="85" fill="#fce7f3"/>
              <ellipse cx="206" cy="208" rx="32" ry="39" fill="#fce7f3"/>
              <ellipse cx="306" cy="208" rx="32" ry="39" fill="#fce7f3"/>
              <ellipse cx="130" cy="250" rx="26" ry="32" fill="#fce7f3"/>
              <ellipse cx="382" cy="250" rx="26" ry="32" fill="#fce7f3"/>
            </svg>
          </div>
          <h1 className="text-base font-semibold text-gray-100">CC Paw</h1>
          <p className="mt-0.5 text-xs text-gray-500">Claude Code 配置管理工具</p>
        </div>

        {/* Body */}
        <div className="px-8 py-6 space-y-4 min-h-[160px]">

          {/* Checking */}
          {step === 'checking' && (
            <div className="flex flex-col items-center gap-3 py-6 text-gray-400">
              <Loader2 size={22} className="animate-spin text-orange-400" />
              <p className="text-sm">正在检测 Claude Code…</p>
            </div>
          )}

          {/* Ready */}
          {(step === 'ready' || step === 'verifying') && (
            <div className="flex flex-col items-center gap-3 py-6">
              {step === 'verifying'
                ? <Loader2 size={22} className="animate-spin text-orange-400" />
                : <CheckCircle2 size={22} className="text-green-400" />
              }
              <p className="text-sm text-green-400">
                {step === 'verifying' ? '正在验证安装…' : 'Claude Code 已就绪，正在启动…'}
              </p>
            </div>
          )}

          {/* No Node.js – guided steps */}
          {step === 'no-node' && (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <AlertCircle size={15} className="text-amber-400 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-300">未检测到 Node.js，需要先安装</p>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <StepDot n={1} active done={false} />
                  <div className="flex-1">
                    <p className="text-sm text-gray-200 font-medium">安装 Node.js</p>
                    <p className="text-xs text-gray-500 mt-0.5">前往 nodejs.org 下载 LTS 版本并安装</p>
                    <button
                      onClick={openNodeJs}
                      className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-400 text-xs rounded-lg transition-colors"
                    >
                      <ExternalLink size={11} /> 打开 nodejs.org
                    </button>
                  </div>
                </div>
                <div className="flex items-start gap-3 opacity-50">
                  <StepDot n={2} active={false} done={false} />
                  <div className="flex-1">
                    <p className="text-sm text-gray-300 font-medium">安装 Claude Code</p>
                    <div className="mt-1.5 flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-lg font-mono text-xs text-gray-400">
                      <Terminal size={11} className="shrink-0 text-gray-600" />
                      {CMD}
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-600">安装 Node.js 并重启 App 后点击"重新检测"</p>
            </div>
          )}

          {/* No Claude – can auto-install */}
          {step === 'no-claude' && (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <AlertCircle size={15} className="text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-amber-300 font-medium">未检测到 Claude Code</p>
                  <p className="text-xs text-amber-400/70 mt-0.5">已检测到 npm，可以一键安装</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <StepDot n={1} active done={false} />
                  <div className="flex-1">
                    <p className="text-sm text-gray-200 font-medium">安装 Claude Code CLI</p>
                    <div className="mt-1.5 flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-lg font-mono text-xs text-gray-300">
                      <Terminal size={11} className="shrink-0 text-gray-500" />
                      {CMD}
                    </div>
                    <p className="text-xs text-gray-600 mt-1.5">点击下方按钮自动执行，或手动在终端运行</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 opacity-50">
                  <StepDot n={2} active={false} done={false} />
                  <p className="text-sm text-gray-300 pt-0.5">验证安装并启动</p>
                </div>
              </div>
            </div>
          )}

          {/* Installing */}
          {step === 'installing' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-blue-400">
                <Loader2 size={14} className="animate-spin" />
                正在安装 Claude Code…
              </div>
              <div className="h-28 overflow-y-auto bg-gray-800/60 rounded-lg p-3 font-mono text-xs text-gray-400 leading-relaxed whitespace-pre-wrap">
                {output || <span className="text-gray-600">等待输出…</span>}
              </div>
            </div>
          )}

          {/* Error */}
          {step === 'error' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-sm text-red-400">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                安装失败，请查看输出或手动安装
              </div>
              <div className="h-28 overflow-y-auto bg-gray-800/60 rounded-lg p-3 font-mono text-xs text-red-400/80 leading-relaxed whitespace-pre-wrap">
                {output}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 flex flex-col gap-2">
          {step === 'no-claude' && (
            <button
              onClick={install}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Download size={15} />
              一键安装 Claude Code
            </button>
          )}

          {step === 'no-node' && (
            <button
              onClick={detect}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium rounded-lg transition-colors"
            >
              <RefreshCw size={14} />
              重新检测
            </button>
          )}

          {step === 'error' && (
            <button
              onClick={install}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <RefreshCw size={14} />
              重试安装
            </button>
          )}

          {(step === 'no-claude' || step === 'no-node' || step === 'error') && (
            <button
              onClick={onDismiss}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-400 text-sm transition-colors"
            >
              <ArrowRight size={14} />
              跳过，稍后手动安装
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
