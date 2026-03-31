import fs from 'fs/promises'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { CLAUDE_PATHS } from './claude-paths'
import { getCurrentSessionId } from './snapshot.service'

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

  const client = new Anthropic()  // reads ANTHROPIC_API_KEY from env
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    messages: [
      {
        role: 'user',
        content: `以下是一段 Claude Code 的对话记录，请用简短的文字（不超过100个中文字）概括本次会话的主要工作内容和结果。直接输出总结，不要加任何前缀或解释：\n\n${contextText}`,
      },
    ],
  })

  const summary = response.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map((c) => c.text)
    .join('')
    .trim()

  if (!summary) throw new Error('总结生成失败')
  return summary.slice(0, 200)
}
