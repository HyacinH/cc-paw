import fs from 'fs/promises'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { CLAUDE_PATHS } from './claude-paths'
import { getCurrentSessionId } from './snapshot.service'

interface ContentBlock {
  type: string
  text?: string
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return (content as ContentBlock[])
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text!)
      .join(' ')
  }
  return ''
}

export async function summarizeCurrentSession(projectDir: string): Promise<string> {
  const sessionId = await getCurrentSessionId(projectDir)
  if (!sessionId) throw new Error('当前没有活跃会话')

  const encoded = projectDir.replace(/[^a-zA-Z0-9]/g, '-')
  const filePath = path.join(CLAUDE_PATHS.projectsDir, encoded, `${sessionId}.jsonl`)

  const data = await fs.readFile(filePath, 'utf-8')
  const lines = data.trim().split('\n').filter(Boolean)

  const turns: string[] = []
  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as { type?: string; message?: { content?: unknown } }
      if (obj.type !== 'user' && obj.type !== 'assistant') continue
      const text = extractText(obj.message?.content).trim()
      if (!text) continue
      const label = obj.type === 'user' ? 'User' : 'Assistant'
      turns.push(`${label}: ${text.slice(0, 400)}`)
    } catch { /* skip malformed lines */ }
  }

  if (turns.length === 0) throw new Error('会话内容为空，无法生成总结')

  const context = turns.join('\n').slice(0, 6000)

  const client = new Anthropic()  // reads ANTHROPIC_API_KEY from env
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    messages: [
      {
        role: 'user',
        content: `以下是一段对话记录，请用简短的文字（不超过100个中文字）概括对话的主要内容。直接输出总结，不要加任何前缀或解释：\n\n${context}`,
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
