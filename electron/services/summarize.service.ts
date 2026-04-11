import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import Anthropic from '@anthropic-ai/sdk'
import { CLAUDE_PATHS } from './claude-paths'
import { getCurrentSessionId } from './snapshot.service'
import type { CliId } from '../../src/types/cli.types'
import { DEFAULT_CLI_ID } from './cli-scope'

const execAsync = promisify(exec)

const CODEX_DIR = path.join(os.homedir(), '.codex')
const CODEX_AUTH_JSON = path.join(CODEX_DIR, 'auth.json')
const CODEX_CONFIG_TOML = path.join(CODEX_DIR, 'config.toml')

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseTomlQuotedValue(content: string, key: string): string {
  const m = content.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*"([^"]*)"\\s*$`, 'm'))
  return m?.[1] ?? ''
}

function parseSectionTomlQuotedValue(content: string, section: string, key: string): string {
  const sectionRe = new RegExp(`^\\s*\\[${escapeRegExp(section)}\\]\\s*$([\\s\\S]*?)(?=^\\s*\\[|$)`, 'm')
  const sectionBody = content.match(sectionRe)?.[1] ?? ''
  const keyRe = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*"([^"]*)"\\s*$`, 'm')
  return sectionBody.match(keyRe)?.[1] ?? ''
}

interface AnthropicCredentials {
  apiKey: string
  baseURL?: string
  proxyAuthToken?: string
  model: string
}

interface CodexRuntime {
  apiKey: string
  baseURL: string
  model: string
}

interface ClaudeSettings {
  apiKeyHelper?: string
  env?: {
    ANTHROPIC_API_KEY?: string
    ANTHROPIC_BASE_URL?: string
    ANTHROPIC_PROXY_AUTH_TOKEN?: string
    ANTHROPIC_DEFAULT_HAIKU_MODEL?: string
  }
}

/**
 * Resolve Anthropic credentials from the environment or ~/.claude/settings.json,
 * mirroring how Claude Code CLI itself resolves them at runtime.
 *
 * - apiKey:         process.env.ANTHROPIC_API_KEY -> settings.env.ANTHROPIC_API_KEY -> apiKeyHelper command
 * - baseURL:        process.env.ANTHROPIC_BASE_URL -> settings.env.ANTHROPIC_BASE_URL
 * - proxyAuthToken: process.env.ANTHROPIC_PROXY_AUTH_TOKEN -> settings.env.ANTHROPIC_PROXY_AUTH_TOKEN
 * - model:          process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL -> settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL -> claude-haiku-4-5
 */
async function resolveClaudeCredentials(): Promise<AnthropicCredentials> {
  let settings: ClaudeSettings = {}
  try {
    const raw = await fs.readFile(CLAUDE_PATHS.settingsJson, 'utf-8')
    settings = JSON.parse(raw)
  } catch { /* file missing or malformed */ }

  const baseURL =
    process.env.ANTHROPIC_BASE_URL ||
    settings.env?.ANTHROPIC_BASE_URL ||
    undefined

  const model =
    process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL ||
    settings.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL ||
    'claude-haiku-4-5'

  let apiKey = process.env.ANTHROPIC_API_KEY || settings.env?.ANTHROPIC_API_KEY || ''
  if (!apiKey) {
    const helper = settings.apiKeyHelper
    if (typeof helper === 'string' && helper.trim()) {
      try {
        const { stdout } = await execAsync(helper, { timeout: 5000, shell: true })
        apiKey = stdout.trim()
      } catch { /* command failed */ }
    }
  }
  if (!apiKey && baseURL) {
    apiKey = 'proxy-managed-key'
  }
  if (!apiKey) {
    throw new Error('未找到 Anthropic API Key。请设置 ANTHROPIC_API_KEY，或在 Claude Code 设置中保存 API Key（env.ANTHROPIC_API_KEY）/配置 apiKeyHelper；若使用代理托管，请同时配置 ANTHROPIC_BASE_URL。')
  }

  const proxyAuthToken =
    process.env.ANTHROPIC_PROXY_AUTH_TOKEN ||
    settings.env?.ANTHROPIC_PROXY_AUTH_TOKEN ||
    undefined

  return { apiKey, baseURL, proxyAuthToken, model }
}

async function resolveCodexRuntime(): Promise<CodexRuntime> {
  let auth: Record<string, unknown> = {}
  try {
    const raw = await fs.readFile(CODEX_AUTH_JSON, 'utf-8')
    auth = JSON.parse(raw) as Record<string, unknown>
  } catch { /* file missing or malformed */ }

  let toml = ''
  try {
    toml = await fs.readFile(CODEX_CONFIG_TOML, 'utf-8')
  } catch { /* file missing */ }

  const provider = parseTomlQuotedValue(toml, 'model_provider') || 'aicodemirror'
  const baseURL =
    process.env.OPENAI_BASE_URL ||
    parseSectionTomlQuotedValue(toml, `model_providers.${provider}`, 'base_url')

  const apiKey =
    process.env.OPENAI_API_KEY ||
    (typeof auth.OPENAI_API_KEY === 'string' ? auth.OPENAI_API_KEY : '')

  const model =
    process.env.OPENAI_MODEL ||
    parseTomlQuotedValue(toml, 'model') ||
    'gpt-5'

  if (!baseURL) {
    throw new Error('未找到 Codex base_url。请在设置页填写 base_url，或在 ~/.codex/config.toml 中配置 model_providers.<provider>.base_url。')
  }
  if (!apiKey) {
    throw new Error('未找到 Codex API Key。请在设置页填写 API Key，或在 ~/.codex/auth.json 中配置 OPENAI_API_KEY。')
  }

  return { apiKey, baseURL, model }
}

interface ContentBlock {
  type: string
  text?: string
}

/** Extract only plain-text blocks, skipping tool_use / tool_result noise. */
function extractTextBlocks(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return (content as ContentBlock[])
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text!)
    .join('\n')
    .trim()
}

function extractCodexMessageText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return (content as Array<{ type?: string; text?: string }>)
    .filter((c) => (c.type === 'input_text' || c.type === 'output_text') && typeof c.text === 'string')
    .map((c) => c.text!)
    .join('\n')
    .trim()
}

interface Turn {
  role: 'user' | 'assistant'
  text: string
}

async function listFilesRecursive(root: string): Promise<string[]> {
  const out: string[] = []
  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true })
    await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
        return
      }
      if (entry.isFile()) out.push(fullPath)
    }))
  }
  await walk(root)
  return out
}

function codexSessionsDir(): string {
  return path.join(os.homedir(), '.codex', 'sessions')
}

async function listCodexSessionFiles(): Promise<string[]> {
  try {
    const files = await listFilesRecursive(codexSessionsDir())
    return files.filter((f) => f.endsWith('.jsonl'))
  } catch {
    return []
  }
}

async function readCodexSessionMeta(filePath: string): Promise<{ id: string } | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    const firstLine = raw.split('\n', 1)[0]
    if (!firstLine) return null
    const obj = JSON.parse(firstLine) as {
      type?: string
      payload?: { id?: string }
    }
    if (obj.type !== 'session_meta') return null
    const id = obj.payload?.id
    if (!id) return null
    return { id }
  } catch {
    return null
  }
}

async function resolveSessionFilePath(projectDir: string, sessionId: string, cliId: CliId): Promise<string> {
  if (cliId === 'claude') {
    const encoded = projectDir.replace(/[^a-zA-Z0-9]/g, '-')
    return path.join(CLAUDE_PATHS.projectsDir, encoded, `${sessionId}.jsonl`)
  }

  if (cliId === 'codex') {
    const files = await listCodexSessionFiles()
    for (const filePath of files) {
      if (!filePath.endsWith('.jsonl')) continue
      const meta = await readCodexSessionMeta(filePath)
      if (!meta || meta.id !== sessionId) continue
      return filePath
    }
    throw new Error('未找到当前 Codex 会话文件')
  }

  throw new Error('当前 CLI 暂不支持会话摘要')
}

function parseClaudeTurns(lines: string[]): Turn[] {
  const turns: Turn[] = []
  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as { type?: string; message?: { content?: unknown } }
      if (obj.type !== 'user' && obj.type !== 'assistant') continue
      const text = extractTextBlocks(obj.message?.content)
      if (!text) continue
      turns.push({ role: obj.type as 'user' | 'assistant', text })
    } catch { /* skip malformed lines */ }
  }
  return turns
}

function parseCodexTurns(lines: string[]): Turn[] {
  const turns: Turn[] = []

  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as {
        type?: string
        payload?: {
          type?: string
          message?: string
          role?: string
          content?: unknown
        }
      }

      if (obj.type === 'event_msg') {
        if (obj.payload?.type === 'user_message' && typeof obj.payload.message === 'string' && obj.payload.message.trim()) {
          turns.push({ role: 'user', text: obj.payload.message.trim() })
          continue
        }
        if (obj.payload?.type === 'agent_message' && typeof obj.payload.message === 'string' && obj.payload.message.trim()) {
          turns.push({ role: 'assistant', text: obj.payload.message.trim() })
          continue
        }
      }

      if (obj.type === 'response_item' && obj.payload?.type === 'message') {
        const role = obj.payload.role === 'user' ? 'user' : (obj.payload.role === 'assistant' ? 'assistant' : null)
        if (!role) continue
        const text = extractCodexMessageText(obj.payload.content)
        if (!text) continue
        turns.push({ role, text })
      }
    } catch { /* skip malformed lines */ }
  }

  // Deduplicate adjacent duplicates because Codex logs may record both event_msg and response_item for the same turn.
  return turns.filter((turn, idx) => {
    if (idx === 0) return true
    const prev = turns[idx - 1]
    return !(prev.role === turn.role && prev.text === turn.text)
  })
}

function parseTurns(lines: string[], cliId: CliId): Turn[] {
  if (cliId === 'claude') return parseClaudeTurns(lines)
  if (cliId === 'codex') return parseCodexTurns(lines)
  return []
}

export async function summarizeCurrentSession(projectDir: string, cliId: CliId = DEFAULT_CLI_ID): Promise<string> {
  if (cliId !== 'claude' && cliId !== 'codex') {
    throw new Error('当前 CLI 暂不支持会话摘要')
  }

  const sessionId = await getCurrentSessionId(projectDir, cliId)
  if (!sessionId) throw new Error('当前没有活跃会话')

  const filePath = await resolveSessionFilePath(projectDir, sessionId, cliId)
  const raw = await fs.readFile(filePath, 'utf-8')
  const lines = raw.trim().split('\n').filter(Boolean)

  const allTurns = parseTurns(lines, cliId)
  if (allTurns.length === 0) throw new Error('会话内容为空，无法生成总结')

  // Build a representative context:
  //   • First user message  -> captures the original intent
  //   • Last 20 turns       -> captures what was actually done
  const firstUser = allTurns.find((t) => t.role === 'user')
  const recent = allTurns.slice(-20)

  const contextTurns: Turn[] = []
  if (firstUser && !recent.includes(firstUser)) {
    contextTurns.push(firstUser)
  }
  contextTurns.push(...recent)

  const contextText = contextTurns
    .map((t) => `[${t.role === 'user' ? '用户' : '助手'}]: ${t.text.slice(0, 800)}`)
    .join('\n\n')

  const summarizePrompt = `以下是一段编程助手对话记录。请输出结构化总结，必须严格遵循：
1) 第一行：一句简要标题（不超过18字）
2) 后续用 3-5 条项目符号（每条以“- ”开头），分别覆盖：目标、主要修改、结果/状态、待办（如有）
3) 总长度不超过 180 个中文字
4) 直接输出结果，不要加“总结：”等前缀

${contextText}`

  let summary = ''

  if (cliId === 'claude') {
    const { apiKey, baseURL, proxyAuthToken, model } = await resolveClaudeCredentials()
    const client = new Anthropic({
      apiKey,
      baseURL,
      ...(proxyAuthToken ? { defaultHeaders: { Authorization: `Bearer ${proxyAuthToken}` } } : {}),
    })

    const response = await client.messages.create({
      model,
      max_tokens: 260,
      messages: [
        {
          role: 'user',
          content: summarizePrompt,
        },
      ],
    })

    summary = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('')
      .trim()
  } else {
    const { apiKey, baseURL, model } = await resolveCodexRuntime()
    const response = await fetch(`${baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: summarizePrompt }],
        max_tokens: 260,
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(`Codex summarize 请求失败（${response.status}）：${errText || '请检查模型与 base_url 是否匹配'}`)
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
    }
    summary = data.choices?.[0]?.message?.content?.trim() ?? ''
  }

  if (!summary) throw new Error('总结生成失败，请检查当前模型与 base_url 配置是否可用')
  return summary.slice(0, 512)
}
