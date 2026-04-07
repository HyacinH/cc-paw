# Contributing to CC Paw

Thanks for your interest in contributing. This document is a short onboarding guide; the [README](README.md) remains the source of truth for features and platform notes.

**中文：** [CONTRIBUTING.zh.md](CONTRIBUTING.zh.md)

## Prerequisites

- **Node.js** 18+ and **npm** 9+
- **Claude Code** CLI installed (you need `~/.claude/` for realistic testing)
- **Windows**: follow the Visual Studio Build Tools + Spectre libs steps in the README so `node-pty` can compile during `npm install`.

## Local development

```bash
git clone <repo-url>
cd cc-paw
npm install
npm run dev
```

- `npm run dev` starts the app with hot reload (electron-vite).
- Use **CMD or PowerShell** on Windows for installs and scripts (not Git Bash), as noted in the README.

## Build and package

```bash
npm run build    # compile and bundle
npm run package  # platform-native installer under release/
```

Packaging targets the **current host OS** only; cross-compilation is not supported.

## Project layout (high level)

- `electron/` — main process, preload, IPC handlers, platform services
- `src/` — React UI and `src/api/` wrappers around `window.electronAPI`
- `resources/` — icons and static assets

IPC uses a `domain:action` naming style; handlers return a typed `{ success, data | error }` envelope.

## Pull requests

- Prefer **small, focused changes** with a clear description of behaviour and testing.
- If you change user-visible behaviour, update **README.md** and **README.zh.md** when it matters to users or contributors.
- For UI changes, a short note on what you verified (manual steps) helps reviewers.

## Questions

Open a [discussion](https://github.com/HyacinH/cc-paw/discussions) or an issue on the repository if something is unclear; we can extend this document based on real friction points.
