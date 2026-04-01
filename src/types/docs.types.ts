export interface DocFile {
  path: string         // 相对项目根目录的路径
  title: string        // H1 标题，无则用文件名
  summary: string      // 前 3 行非空内容（跳过 frontmatter 和 H1）
  lastModified: string // ISO 时间字符串
  tags: string[]       // 从 YAML frontmatter 解析
  source: 'root' | 'docs'
}

export interface DocsIndex {
  generatedAt: string
  projectPath: string
  docs: DocFile[]
}
