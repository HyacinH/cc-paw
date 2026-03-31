<div align="center">
  <img src="resources/icon.png" alt="CC Paw" width="120" />

  # CC Paw

  **A desktop GUI for managing your entire [Claude Code](https://claude.ai/code) workflow.**

  [![Version](https://img.shields.io/badge/version-0.10.6-blue.svg)](package.json)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
  [![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgray.svg)](#platform-support)
  [![Electron](https://img.shields.io/badge/Electron-33-47848F.svg)](https://electronjs.org/)
  [![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6.svg)](https://www.typescriptlang.org/)
</div>

---

Working with Claude Code across multiple projects means juggling terminal windows and guessing when Claude has finished. CC Paw gives each project its own persistent Claude Code session with real-time status indicators and background notifications — so you can switch to other work and come back exactly when needed.

On top of that, it brings all Claude Code configuration into one visual interface: CLAUDE.md knowledge bases, Skills, MCP servers, and plugins — no JSON editing, no hunting through hidden directories.

## Features

### Multi-Project Claude Sessions
Run independent Claude Code sessions for multiple projects simultaneously — each in its own persistent terminal.

- **Add any directory** as a project via the sidebar; switch between projects instantly
- **Sessions persist** across navigation — leave a project page and come back without losing context
- **Start a new conversation** with one click, clearing the current session
- **Per-project status indicators** in the sidebar show each session's state at a glance:
  - Orange glow — Claude is actively working
  - Blue glow — Claude is waiting for your input
  - Dim ring — session is idle
- **System notifications** when Claude finishes or needs input, even when CC Paw is in the background — so you can work in other apps and return exactly when needed

### Knowledge Base (CLAUDE.md)
Edit the Markdown instructions that Claude Code reads at startup. CC Paw manages two layers independently:
- **Global** — `~/.claude/CLAUDE.md`, applies to every project
- **Per-project** — `<project>/CLAUDE.md`, scoped to a single repository

Both are edited in Monaco Editor (the same engine used by VS Code) with syntax highlighting and word wrap.

### Skills Manager
Skills are Markdown prompt templates stored in `~/.claude/skills/` and triggered via `/skill-name` in Claude Code. CC Paw lets you:
- Create, edit, rename, and delete skill files
- Import a skill directly from a URL (e.g. a raw GitHub link)
- Browse skills contributed by installed plugins (read-only)

### MCP Server Configuration
Visual editor for the `mcpServers` field in `~/.claude.json` — the only location Claude Code CLI actually reads. For each server you can:
- Add, edit, and remove servers
- Toggle enabled/disabled with a single click
- Configure command, args, and environment variables
- View auth status for plugin-managed servers
- Validates JSON before writing to prevent config corruption

### Plugin Marketplace
Browse and install Claude Code plugins from the official Anthropic marketplace without leaving the app:
- Filter by category and search by name/description
- One-click install with live terminal output
- Choose install scope: **user** (`~/.claude`, all projects) or **project** (current directory)
- Manage installed plugins: enable/disable, uninstall
- Run arbitrary `claude plugin` or `npx skills` commands from a built-in command runner

### Project Docs
Manage a `docs/` folder inside each project for structured reference documents:
- Create and edit Markdown files with live preview rendering
- Auto-saves while you type (800 ms debounce)
- Generate a `docs/index.json` summary that can be referenced from `CLAUDE.md` as a knowledge index

### Token Usage Dashboard
Reads Claude Code's JSONL session logs from `~/.claude/projects/` and visualises your API consumption:
- Total tokens (input, output, cache read/write) and estimated cost
- 30-day bar chart of daily token usage
- Per-project breakdown with expandable detail rows

### Settings
Directly edits `~/.claude/settings.json`, shared with Claude Code CLI:
- `apiKeyHelper` — shell command whose stdout is used as the API key
- `ANTHROPIC_BASE_URL` — custom API endpoint or proxy address
- Specific model IDs for each tier (Sonnet / Opus / Haiku), e.g. `claude-sonnet-4-6`
- **Notification toggle** — enable or disable system notifications when Claude finishes responding

---

## Platform Support

| Platform | Status | Notes |
|---|---|---|
| **macOS** | ✅ Fully supported | Native `hiddenInset` title bar, login-shell PATH capture |
| **Windows** | ✅ Supported | Native system title bar, ConPTY terminal, NSIS installer |
| Linux | 🔧 Untested | Likely works; PTY and file paths are cross-platform |

### Prerequisites

**All platforms:**
- **Node.js** 18+
- **npm** 9+
- **Claude Code** CLI installed (`~/.claude/` must exist)

**Windows only** — `node-pty` is a native C++ module and requires a compiler:

```powershell
# Run as Administrator
winget install Microsoft.VisualStudio.2022.BuildTools   # check "Desktop development with C++"
winget install Python.Python.3.11
npm config set msvs_version 2022
```

> **Minimum Windows version:** Windows 10 1903 (Build 18362) or later — required for ConPTY.

---

## Quick Start

```bash
# Clone the repository
git clone <repo-url>
cd cc-paw

# Install dependencies (also compiles the node-pty native module)
npm install

# Launch in development mode with hot reload
npm run dev
```

Once the app opens, click **+** in the sidebar to add a project directory, then click its name to open a Claude Code session.

## Building & Packaging

```bash
npm run build      # Compile TypeScript + bundle all assets

npm run package    # Package as a platform-native installer:
                   #   macOS  → release/CC Paw-x.x.x.dmg
                   #   Windows → release/CC Paw Setup x.x.x.exe
```

> `npm run package` builds for the current host platform. Cross-compilation is not supported.

---

## Architecture

CC Paw is a standard Electron app with strict process separation. All file system and shell access lives in the **main process**; the **renderer process** (React) is a pure UI layer with no direct Node.js access.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Renderer Process  (React + TypeScript, Chromium sandbox)            │
│                                                                      │
│   Pages / Components  →  src/api/*  →  window.electronAPI.*         │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │  contextBridge (allowlist only)
┌────────────────────────────────▼─────────────────────────────────────┐
│  Preload Script  (electron/preload.ts)                               │
│  contextIsolation=true · nodeIntegration=false                       │
└────────────────────────────────┬─────────────────────────────────────┘
                     ┌───────────┴────────────┐
              invoke (request/response)    on/send (push events)
                     │                         │
┌────────────────────▼─────────────────────────▼───────────────────────┐
│  Main Process  (Node.js, electron/ipc/*.handler.ts)                  │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐              │
│  │  File I/O    │  │  node-pty    │  │  shell runner │              │
│  │  (~/.claude) │  │  (terminal)  │  │  (plugins,    │              │
│  └──────────────┘  └──────────────┘  │   skills)     │              │
│                                      └───────────────┘              │
└──────────────────────────────────────────────────────────────────────┘
```

All IPC channel names follow the `domain:action` convention (`skills:write`, `mcp:read`, etc.). Every handler returns a typed result envelope — `{ success: true; data: T }` or `{ success: false; error: string }` — which the `src/api/` layer unwraps so pages receive `data` directly or throw on error. Platform-specific logic (PATH resolution, shell detection, binary lookup) is centralised in `electron/services/platform.ts`.

---

## License

[MIT](LICENSE)
