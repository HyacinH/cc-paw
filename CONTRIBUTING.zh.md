# 参与贡献（CC Paw）

感谢你有意愿参与贡献。本文是简短的入门说明；功能与平台细节仍以 [README.zh.md](README.zh.md) 为准。

**English:** [CONTRIBUTING.md](CONTRIBUTING.md)

## 环境要求

- **Node.js** 18+、**npm** 9+
- 已安装 **Claude Code** CLI（完整体验需要 `~/.claude/`）
- **Windows**：请按中文 README 中的 Visual Studio Build Tools + Spectre 组件说明配置，以便 `npm install` 时编译 `node-pty`。

## 本地开发

```bash
git clone <repo-url>
cd cc-paw
npm install
npm run dev
```

- `npm run dev` 以热重载方式启动（electron-vite）。
- Windows 上请用 **CMD 或 PowerShell** 执行安装与脚本（勿用 Git Bash），原因见 README。

## 构建与打包

```bash
npm run build    # 编译与打包资源
npm run package  # 生成当前系统对应的安装包，输出在 release/
```

打包仅针对**当前主机系统**，不支持交叉编译。

## 代码结构（概览）

- `electron/` — 主进程、preload、IPC、平台相关逻辑
- `src/` — React 界面与 `src/api/` 对 `window.electronAPI` 的封装
- `resources/` — 图标与静态资源

IPC 采用 `domain:action` 命名；handler 返回 `{ success, data | error }` 形式的结果。

## Pull Request

- 尽量**小而聚焦**，说明行为变化与验证方式。
- 若影响用户可见行为，请酌情同步更新 **README.md** 与 **README.zh.md**。
- UI 改动建议写明已手动验证的步骤，便于评审。

## 疑问

欢迎在仓库中开启 [讨论](https://github.com/HyacinH/cc-paw/discussions) 或提交 issue；若常见卡点出现，我们会据此补充本文。
