<div align="center">
  <img src="resources/icon.png" alt="CC Paw" width="120" />

  # CC Paw

  English | [中文](README.zh.md)

  **A desktop GUI for managing your entire [Claude Code](https://claude.ai/code) workflow.**

  [![Version](https://img.shields.io/badge/version-0.11.5-blue.svg)](package.json)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
  [![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgray.svg)](#platform-support)
  [![Electron](https://img.shields.io/badge/Electron-33-47848F.svg)](https://electronjs.org/)
  [![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6.svg)](https://www.typescriptlang.org/)
</div>

---

CC Paw is built for people who run Claude Code across many projects and want one clear, visual workspace instead of scattered terminals and config files. It gives each project a persistent session, real-time status, and timely notifications so you can focus on decisions instead of process.

It also turns Claude Code setup into a visual workflow: system prompts (`CLAUDE.md`), skills, MCP servers, plugins, project docs, and usage analytics are all managed from the UI. Whether you are non-technical or highly technical, CC Paw makes project management and vibecoding with Claude Code faster, clearer, and easier to sustain.

## Get the app

- **Installers (recommended):** download the latest **DMG** (macOS) or **Setup .exe** (Windows) from [GitHub Releases](https://github.com/HyacinH/cc-paw/releases).
- **macOS install tip (Gatekeeper):** if macOS shows "`CC Paw` is damaged and can't be opened", install to `Applications` first, then run:

```bash
sudo xattr -rd com.apple.quarantine "/Applications/CC Paw.app"
```

- **Run from source:** clone the repo, run `npm install`, then `npm run dev` (see [Quick Start](#quick-start) for details). You need the **Claude Code** CLI and a populated `~/.claude/` directory to use the app meaningfully.
- **Build an installer locally:** `npm run package` outputs platform-specific artifacts under `release/` (host OS only).

## Core features

### Project workspace (multi-project, sessions, docs, settings)

Core project-facing workflows are centralized in one workspace (screenshot below):

- **Multi-project sessions:** one persistent Claude terminal per project, so switching projects never drops context.
- **Session lifecycle:** start a new chat when needed and reopen archived conversations for follow-up work.
- **Project organization:** rename projects, switch quickly in the sidebar, and track state with per-project status indicators.
- **Project Docs (`docs/`):** edit Markdown with live preview and autosave, then keep project references in one place.
- **Project settings:** edit shared Claude Code settings (`~/.claude/settings.json`) directly from the UI.

![Project workspace: sessions, docs, and settings](resources/images/image_project.png)

### Plugin marketplace

Plugin workflows are grouped in one place (screenshot below):

- Discover/filter official marketplace plugins
- One-click install with live terminal output
- Install scope selection: **user** (`~/.claude`) or **project**
- Manage installed plugins (enable/disable/uninstall)
- Run `claude plugin` and `npx skills` commands from the app

![Plugin marketplace and plugin management](resources/images/image_plugin.png)

### Token usage analytics

Usage and cost insights are shown in a dedicated dashboard (screenshot below):

- Reads Claude Code JSONL logs from `~/.claude/projects/`
- Aggregated totals (input/output/cache) with estimated cost
- Custom date-range filtering
- Bar charts by hour, day, week, or month
- Per-project breakdown with expandable details

![Token usage dashboard with breakdowns](resources/images/image_usage.png)

### System prompts & settings

Maintain global and project-level `CLAUDE.md` instructions in Monaco Editor.

### Skills manager

Manage skill files in `~/.claude/skills/`, including URL import.

### MCP server configuration

Edit and validate `mcpServers` in `~/.claude.json` before saving.

---

## Platform Support


| Platform    | Status            | Notes                                                    |
| ----------- | ----------------- | -------------------------------------------------------- |
| **macOS**   | ✅ Fully supported | Native `hiddenInset` title bar, login-shell PATH capture |
| **Windows** | ✅ Supported       | Native system title bar, ConPTY terminal, NSIS installer |
| Linux       | 🔧 Untested       | Likely works; PTY and file paths are cross-platform      |


### Prerequisites

**All platforms:**

- **Node.js** 18+
- **npm** 9+
- **Claude Code** CLI installed (`~/.claude/` must exist)

**Windows only** — `node-pty` is a native C++ module and requires a compiler toolchain. Run the following in an **Administrator** PowerShell:

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools
winget install Python.Python.3.11
```

After installing Build Tools, open **Visual Studio Installer → Modify**:

- **Workloads** tab: check **Desktop development with C++**
- **Individual components** tab: search `Spectre` and check **MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs**

> The Spectre-mitigated libs are **not selected by default** but are required by `node-gyp`. Without them, `npm install` will fail with a Spectre or `node-gyp` error.

Then run in **CMD or PowerShell** (not Git Bash — path handling differs):

```cmd
npm install
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
