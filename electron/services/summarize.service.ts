import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import Anthropic from '@anthropic-ai/sdk'
import { CLAUDE_PATHS } from './claude-paths'
import { getCurrentSessionId } from './snapshot.service'

const execAsync = promisify(exec)

interface AnthropicCredentials {
  apiKey: string
  baseURL?: string
}

interface ClaudeSettings {
  apiKeyHelper?: string
  env?: {
    ANTHROPIC_API_KEY?: string
    ANTHROPIC_BASE_URL?: string
    ANTHROPIC_PROXY_AUTH_TOKEN?: string
  }
}

interface ResolvedProxyAuth {
  token?: string
}

/**
 * Resolve Anthropic credentials from the environment or ~/.claude/settings.json,
 * mirroring how Claude Code CLI itself resolves them at runtime.
 *
 * - apiKey:  process.env.ANTHROPIC_API_KEY → settings.env.ANTHROPIC_API_KEY → apiKeyHelper command
 * - baseURL: process.env.ANTHROPIC_BASE_URL → settings.env.ANTHROPIC_BASE_URL
 */
async function resolveCredentials(): Promise<AnthropicCredentials> {
  let settings: ClaudeSettings = {}
  try {
    const raw = await fs.readFile(CLAUDE_PATHS.settingsJson, 'utf-8')
    settings = JSON.parse(raw)
  } catch { /* file missing or malformed */ }

  // --- Base URL ---
  const baseURL =
    process.env.ANTHROPIC_BASE_URL ||
    settings.env?.ANTHROPIC_BASE_URL ||
    undefined

  // --- API key ---
  // Priority: explicit env key -> settings env key -> apiKeyHelper command
  // For proxy-hosted gateways, allow fallback dummy key if baseURL is set.
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

  return { apiKey, baseURL }
}

function resolveProxyAuth(): ResolvedProxyAuth {
  const token = process.env.ANTHROPIC_PROXY_AUTH_TOKEN
  return token ? { token } : {}
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

interface Turn {
  role: 'user' | 'assistant'
  text: string
}

export async function summarizeCurrentSession(projectDir: string): Promise<string> {
  const sessionId = await getCurrentSessionId(projectDir)
  if (!sessionId) throw new Error('当前没有活跃会话')

  const encoded = projectDir.replace(/[^a-zA-Z0-9]/g, '-')
  const filePath = path.join(CLAUDE_PATHS.projectsDir, encoded, `${sessionId}.jsonl`)

  const raw = await fs.readFile(filePath, 'utf-8')
  const lines = raw.trim().split('\n').filter(Boolean)

  // Parse all turns, keeping only text-bearing user/assistant messages.
  // tool_use and tool_result blocks are discarded — they're noisy and unhelpful for summarization.
  const allTurns: Turn[] = []
  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as { type?: string; message?: { content?: unknown } }
      if (obj.type !== 'user' && obj.type !== 'assistant') continue
      const text = extractTextBlocks(obj.message?.content)
      if (!text) continue
      allTurns.push({ role: obj.type as 'user' | 'assistant', text })
    } catch { /* skip malformed lines */ }
  }

  if (allTurns.length === 0) throw new Error('会话内容为空，无法生成总结')

  // Build a representative context:
  //   • First user message  → captures the original intent
  //   • Last 20 turns       → captures what was actually done
  // This avoids the problem of early tool noise dominating the context.
  const firstUser = allTurns.find((t) => t.role === 'user')
  const recent = allTurns.slice(-20)

  // Deduplicate: if firstUser is already in recent, don't add it twice
  const contextTurns: Turn[] = []
  if (firstUser && !recent.includes(firstUser)) {
    contextTurns.push(firstUser)
  }
  contextTurns.push(...recent)

  // Format and cap each turn to avoid runaway lengths
  const contextText = contextTurns
    .map((t) => `[${t.role === 'user' ? '用户' : '助手'}]: ${t.text.slice(0, 800)}`)
    .join('\n\n')

  const { apiKey, baseURL } = await resolveCredentials()
  const { token: proxyToken } = resolveProxyAuth()
  const client = new Anthropic({
    apiKey,
    baseURL,
    ...(proxyToken ? { defaultHeaders: { Authorization: `Bearer ${proxyToken}` } } : {}),
  })
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `以下是一段 Claude Code 的对话记录，请按以下格式生成会话描述（总长不超过120个中文字，直接输出，不要加前缀）：\n目标：一句话说明本次会话要做什么。\n完成：简述实际完成的工作和关键结果。\n\n${contextText}`,
      },
    ],
  })

  const summary = response.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map((c) => c.text)
    .join('')
    .trim()

  if (!summary) throw new Error('总结生成失败')
  return summary.slice(0, 256)
}
