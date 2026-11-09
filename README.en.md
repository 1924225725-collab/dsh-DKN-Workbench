# DSH Workbench

DSH Workbench (formerly DKN Agent) is an integrated workbench plugin for DeepSeek Harness on Windows. Current preview: `1.9.6`, targeting DSH `0.2.2-rc.1`. Includes native Codex projects/conversations, domestic and international CodeBuddy CLI model providers, a ZCode CLI app-server model provider, and an embedded collaboration core extracted from Agent Hub. No gateway, remote cluster or DSH desktop distribution is included.

[Latest release](https://github.com/1924225725-collab/dsh-workbench/releases/latest) · [Standalone CodeBuddy CLI (China)](https://github.com/1924225725-collab/dsh-codebuddy-cli-cn) · [简体中文](README.md)

## Use

Download `dsh-dkn-agent-1.9.6.tgz` from [GitHub Releases](https://github.com/1924225725-collab/dsh-workbench/releases/tag/v1.9.6) and install it in DSH's plugin manager. Open the plugin settings to connect the installed official Codex runtime and configure optional CLI paths. The Codex CLI page also supports executable checks, an explicit model probe, model lists, a default working directory, timeout and reasoning defaults. If the sidebar patch is staged, fully quit DSH, wait approximately 15 seconds, then reopen. Closing to the tray does not release the archive lock.

DSH workspaces and Codex projects share one scrolling area, separated by a divider and Codex heading. Opening a conversation imports its history and continues the same thread in DSH's native conversation view. Menus support projects, thread rename, archive/restore, reassignment and native sections.

Open **项目协作** from a native workspace or Codex project/options menu. The DSH Settings panel now has separate DKN CodeBuddy and DKN Agent · Codex entries; the project sidebar remains focused on workspaces and conversations. Collaboration includes projects, members, responsibilities/models/directories/permissions, targeted and @mention messages, approved handoffs and assistance proposals, dependent tasks, independent review, human acceptance, bounded discussions, stepwise/automatic workflows, artifacts, audit and backup merge/recovery. Overlapping directories serialize inside collaboration; independent worktrees can run concurrently.

Runtimes: official Codex app-server, ZCode CLI app-server, in-process DSH Session Controller, optional official Claude Code CLI. Claude lists only plugin-registered sessions and supports binding a known UUID; it does not scan external history or control desktop windows. CodeBuddy, Codex CLI and ZCode CLI remain DSH model providers rather than complete external desktop Agent adapters.

See the [main documentation](README.md) and [collaboration guide](docs/agent-hub/README.md) for details. CodeBuddy retains its [domestic](docs/codebuddy/cn/使用与故障处理指南.md) and [international](docs/codebuddy/intl/使用与故障处理指南.md) guides.

## Boundaries

- Imported DSH history is a snapshot. Later external Codex messages are not automatically backfilled. Renaming/archiving the DSH copy does not update Codex; Codex project-section operations do. Full bidirectional synchronization remains incomplete.
- Import includes text, command output and changed paths, not reasoning, attachments or complete diffs. Codex receives the latest text and manages its own tools/permissions.
- Some project/section APIs are experimental. Unsupported operations fail rather than editing native databases. Directory fallback includes unassigned conversations at exact project roots without modifying ownership.
- Directory scheduling covers plugin collaboration only. External apps may still edit files. Use independent worktrees for parallel editing. Claude tool restrictions are not an OS sandbox; official CLI policies apply.
- Acknowledgement, runtime completion and acceptance are separate. Uncertain submissions are never retried automatically; reconcile native history first. Stopping scheduling does not itself stop a running native turn.
- The version-specific adapter backs up and patches matching DSH app.asar. A helper waits for full exit when locked. Unknown versions/layouts, changed digests and unwritable directories fail closed. DSH upgrades may require a plugin update.

Own data lives at `%LOCALAPPDATA%\dsh-dkn-agent`. The hub subdirectory and exported backups contain collaboration messages, paths, evidence and registered Claude history. No original Agent Hub workspace is automatically imported. Backup import merges records, retains existing IDs, saves a pre-import copy, disables new members' permissions and never resumes work automatically.

## Validation

41 core tests with optional real ASAR enabled, 223 regional CLI tests, isolated official Codex protocol checks with zero model requests, and native-component browser checks with synthetic collaboration replies passed. No real conversations, models or installed DSH were touched. Real-account execution, actual desktop exit patching and live cross-client behavior still require acceptance testing.

Requires Windows 10/11, DSH `0.2.2-rc.1`, and Node.js `24.9+` for build/CLI environment. Install and sign in to official runtimes separately. The plugin does not install Agent software or manage credentials.








