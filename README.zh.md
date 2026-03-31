<div align="center">
  <img src="resources/icon.png" alt="CC Paw" width="120" />

  # CC Paw

  **管理 [Claude Code](https://claude.ai/code) 全套工作流的桌面 GUI 应用。**

  [![Version](https://img.shields.io/badge/版本-0.10.6-blue.svg)](package.json)
  [![License](https://img.shields.io/badge/协议-MIT-green.svg)](LICENSE)
  [![Platform](https://img.shields.io/badge/平台-macOS%20%7C%20Windows-lightgray.svg)](#平台支持)
  [![Electron](https://img.shields.io/badge/Electron-33-47848F.svg)](https://electronjs.org/)
  [![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6.svg)](https://www.typescriptlang.org/)
</div>

---

同时在多个项目里用 Claude Code 工作，意味着要不断在终端窗口间切换，还得盯着看 Claude 有没有回复。CC Paw 为每个项目提供独立持久的 Claude Code 会话，配合实时状态指示和后台通知——你可以去做别的事，通知到了再切回来。

此外，它把所有 Claude Code 配置都汇聚到一个可视化界面：CLAUDE.md 知识库、Skills、MCP 服务器、插件市场——无需手动编辑 JSON，无需在隐藏目录间翻找。

## 功能

### 多项目并行 Claude 会话
同时为多个项目运行独立的 Claude Code 会话，每个项目都有自己的持久化终端。

- **侧边栏添加任意目录**作为项目，点击即可在项目间瞬间切换
- **会话跨页面持久保持**——离开项目页面再回来，上下文完整保留
- **一键开始新会话**，清空当前对话
- **侧边栏实时状态指示**，一眼掌握每个项目的运行状态：
  - 橙色发光 — Claude 正在工作
  - 蓝色发光 — Claude 等待你的输入
  - 暗环 — 会话空闲
- **系统通知**：Claude 完成响应或需要输入时，即使 CC Paw 不在前台也会推送通知——你可以去做别的事，通知到了再切回来

### 知识库（CLAUDE.md）
编辑 Claude Code 启动时读取的 Markdown 指令文件，支持两个层级独立管理：
- **全局** — `~/.claude/CLAUDE.md`，对所有项目生效
- **项目级** — `<project>/CLAUDE.md`，仅对当前仓库生效

均使用 Monaco Editor（VS Code 同款编辑器）编辑，支持语法高亮与自动换行。

### Skills 管理
Skills 是存放在 `~/.claude/skills/` 的 Markdown 提示词模板，在 Claude Code 中通过 `/skill-name` 触发。CC Paw 支持：
- 创建、编辑、重命名、删除 skill 文件
- 直接从 URL（如 GitHub raw 链接）导入 skill
- 浏览已安装插件提供的 skill（只读）

### MCP 服务器配置
`~/.claude.json` 中 `mcpServers` 字段的可视化编辑器（这是 Claude Code CLI 唯一实际读取的 MCP 配置位置）。每台服务器可以：
- 添加、编辑、删除
- 一键启用或禁用
- 配置 command、args 和环境变量
- 查看插件托管服务器的授权状态
- 保存前自动进行 JSON 校验，防止配置文件损坏

### 插件市场
在应用内浏览并安装来自 Anthropic 官方市场的 Claude Code 插件：
- 按分类筛选，按名称或描述搜索
- 一键安装，实时显示终端输出
- 选择安装范围：**用户**（`~/.claude`，所有项目可用）或 **项目**（当前目录）
- 管理已安装插件：启用/禁用、卸载
- 内置命令运行器，支持任意 `claude plugin` 或 `npx skills` 命令

### 项目文档（Docs）
管理项目内的 `docs/` 文件夹，维护结构化的参考文档：
- 新建、编辑 Markdown 文件，支持实时预览渲染
- 输入时自动保存（800ms 防抖）
- 一键生成 `docs/index.json` 摘要索引，可在 `CLAUDE.md` 中引用作为知识库

### Token 用量统计
读取 Claude Code 在 `~/.claude/projects/` 写入的 JSONL 会话日志，可视化 API 用量：
- 汇总 token 数（输入、输出、cache 读写）和估算费用
- 近 30 天每日用量柱状图
- 按项目拆分，点击展开查看详细数据

### 设置
直接编辑 `~/.claude/settings.json`，与 Claude Code CLI 共享同一配置：
- `apiKeyHelper` — 获取 API Key 的 shell 命令，stdout 作为 key 使用
- `ANTHROPIC_BASE_URL` — 自定义 API 地址或代理
- 各档位具体 model ID（Sonnet / Opus / Haiku），如 `claude-sonnet-4-6`
- **通知开关** — 控制 Claude 完成响应时是否发送系统通知

---

## 平台支持

| 平台 | 状态 | 说明 |
|---|---|---|
| **macOS** | ✅ 完整支持 | 原生 `hiddenInset` 标题栏，login shell PATH 捕获 |
| **Windows** | ✅ 支持 | 系统原生标题栏，ConPTY 终端，NSIS 安装包 |
| Linux | 🔧 未测试 | 理论上可用；PTY 和文件路径均已跨平台处理 |

### 环境要求

**所有平台：**
- **Node.js** 18+
- **npm** 9+
- 已安装 **Claude Code** CLI（需要 `~/.claude/` 目录存在）

**仅 Windows** — `node-pty` 是 C++ 原生模块，需要编译器支持：

```powershell
# 以管理员身份运行
winget install Microsoft.VisualStudio.2022.BuildTools   # 勾选"使用 C++ 的桌面开发"
winget install Python.Python.3.11
npm config set msvs_version 2022
```

> **最低 Windows 版本：** Windows 10 版本 1903（Build 18362）或更高 — ConPTY 所需。

---

## 快速开始

```bash
# 克隆仓库
git clone <repo-url>
cd cc-paw

# 安装依赖（同时编译 node-pty 原生模块）
npm install

# 以开发模式启动（支持热重载）
npm run dev
```

应用打开后，点击侧边栏的 **+** 添加项目目录，再点击项目名称即可打开 Claude Code 会话。

## 构建与打包

```bash
npm run build      # 编译 TypeScript 并打包所有资源

npm run package    # 打包为平台原生安装包：
                   #   macOS   → release/CC Paw-x.x.x.dmg
                   #   Windows → release/CC Paw Setup x.x.x.exe
```

> `npm run package` 仅为当前主机平台构建，不支持交叉编译。

---

## 架构

CC Paw 是标准的 Electron 应用，严格分离进程职责。所有文件系统和 shell 操作在**主进程**中运行；**渲染进程**（React）是纯 UI 层，无法直接访问 Node.js API。

```
┌──────────────────────────────────────────────────────────────────────┐
│  渲染进程（React + TypeScript，运行在 Chromium 沙箱中）               │
│                                                                      │
│   Pages / Components  →  src/api/*  →  window.electronAPI.*         │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │  contextBridge（仅白名单 API）
┌────────────────────────────────▼─────────────────────────────────────┐
│  Preload 脚本（electron/preload.ts）                                 │
│  contextIsolation=true · nodeIntegration=false                       │
└────────────────────────────────┬─────────────────────────────────────┘
                     ┌───────────┴────────────┐
              invoke（请求/响应）          on/send（推送事件）
                     │                         │
┌────────────────────▼─────────────────────────▼───────────────────────┐
│  主进程（Node.js，electron/ipc/*.handler.ts）                         │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐              │
│  │  文件 I/O    │  │   node-pty   │  │  shell 运行器 │              │
│  │  (~/.claude) │  │  （终端会话）│  │ （插件/skills）│             │
│  └──────────────┘  └──────────────┘  └───────────────┘              │
└──────────────────────────────────────────────────────────────────────┘
```

所有 IPC channel 名称遵循 `domain:action` 规范（如 `skills:write`、`mcp:read`）。每个 handler 返回统一的结果结构——`{ success: true; data: T }` 或 `{ success: false; error: string }`——由 `src/api/` 层解包，页面直接获得 `data` 或抛出错误。平台差异逻辑（PATH 解析、shell 检测、二进制路径定位）统一收在 `electron/services/platform.ts`。

---

## 开源协议

[MIT](LICENSE)
