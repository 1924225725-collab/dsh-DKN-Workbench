# dsh-DKN-Workbench

DKN Workbench for DSH (formerly DKN Agent) is an integrated workbench plugin for DeepSeek Harness on Windows. Current: `2.1.4`, targeting DSH `0.2.2-rc.1`. Includes native Codex projects/conversations, domestic and international CodeBuddy CLI model providers, a ZCode CLI app-server model provider, and an embedded collaboration core extracted from Agent Hub. No gateway, remote cluster or DSH desktop distribution is included.

[Latest release](https://github.com/1924225725-collab/dsh-DKN-Workbench/releases/latest) · [Standalone CodeBuddy CLI (China)](https://github.com/1924225725-collab/dsh-codebuddy-cli-cn) · [简体中文](README.md)

## Use

### Supported platforms

| Platform | Models and conversations | Quotas and daily rewards |
| --- | --- | --- |
| CodeBuddy China / International | Official CLI models, isolated account pool and account-bound model routing | Official credit balance; manual daily check-in for China |
| Codex | CLI model provider and full app-server native project/conversation mode | Connected-account rate-limit windows; no check-in |
| Qoder | Official CLI ACP model catalog and DSH conversations | CLI plan/add-on quotas; manual daily rewards for the Windows International desktop account |
| ZCode | App-server catalog and streaming, with Coding Plan / Start Plan settings | Corresponding account quotas; promotional claims are not enabled |

Install and sign in to the required official runtimes locally. No platform accounts or free credits are bundled. Project collaboration uses existing DSH workspaces and conversations.

Download `dsh-dkn-agent-2.1.4.tgz` from [GitHub Releases](https://github.com/1924225725-collab/dsh-DKN-Workbench/releases) and install it in DSH's plugin manager. Open the plugin settings to connect the installed official Codex runtime and configure optional CLI paths. The Codex CLI page also supports executable checks, an explicit model probe, model lists, a default working directory, timeout and reasoning defaults. If the sidebar patch is staged, fully quit DSH, wait approximately 15 seconds, then reopen. Closing to the tray does not release the archive lock.

DSH workspaces and Codex projects share one scrolling area, separated by a divider and Codex heading. Opening a conversation imports its history and continues the same thread in DSH's native conversation view. Menus support projects, thread rename, archive/restore, reassignment and native sections.

Open **项目协作** from a native workspace or Codex project/options menu. The DSH Settings panel now has separate DKN CodeBuddy and DKN Agent · Codex entries; the project sidebar remains focused on workspaces and conversations. Collaboration includes projects, members, responsibilities/models/directories/permissions, targeted and @mention messages, approved handoffs and assistance proposals, dependent tasks, independent review, human acceptance, bounded discussions, stepwise/automatic workflows, artifacts, audit and backup merge/recovery. Overlapping directories serialize inside collaboration; independent worktrees can run concurrently.

Runtimes include official Codex app-server, CodeBuddy CLI, Codex CLI, Qoder CLI ACP and ZCode CLI app-server. Collaboration routes through the in-process DSH Session Controller and existing DSH conversations; it does not require separately connecting external Agent applications.

See the [main documentation](README.md) and [collaboration guide](docs/agent-hub/README.md) for details. CodeBuddy retains its [domestic](docs/codebuddy/cn/使用与故障处理指南.md) and [international](docs/codebuddy/intl/使用与故障处理指南.md) guides.

## Boundaries

- Imported DSH history is a snapshot. Later external Codex messages are not automatically backfilled. Renaming/archiving the DSH copy does not update Codex; Codex project-section operations do. Full bidirectional synchronization remains incomplete.
- Import includes text, command output and changed paths, not reasoning, attachments or complete diffs. Codex receives the latest text and manages its own tools/permissions.
- Some project/section APIs are experimental. Unsupported operations fail rather than editing native databases. Directory fallback includes unassigned conversations at exact project roots without modifying ownership.
- Directory scheduling covers plugin collaboration only. External apps may still edit files. Use independent worktrees for parallel editing. Claude tool restrictions are not an OS sandbox; official CLI policies apply.
- Acknowledgement, runtime completion and acceptance are separate. Uncertain submissions are never retried automatically; reconcile native history first. Stopping scheduling does not itself stop a running native turn.
- The version-specific adapter backs up and patches matching DSH app.asar. A helper waits for full exit when locked. Unknown versions/layouts, changed digests and unwritable directories fail closed. DSH upgrades may require a plugin update.
- Codex project sessions list only Codex Agent models (taken from the local model cache, with their reasoning levels); ordinary sessions hide that provider, and already-mapped sessions keep a fallback.

Own data lives at `%LOCALAPPDATA%\dsh-dkn-agent`. The hub subdirectory and exported backups contain collaboration messages, paths, evidence and DSH project/session collaboration mappings. Usage figures come from the native runtimes with no unified billing; ZCode reports cached input inside its prompt count, so the plugin subtracts it to stop DSH's disjoint buckets counting the same tokens twice. No original Agent Hub workspace is automatically imported. Backup import merges records, retains existing IDs, saves a pre-import copy, disables new members' permissions and never resumes work automatically.

## Validation

On 2026-11-10 the core suite passed 48 tests with 1 skipped, covering ZCode per-turn usage normalization (cached input counted once) and the Codex project-mode model list with `model`/`effort` forwarding; the built client bundle was verified to carry the per-session model-visibility patch. 41 core tests with optional real ASAR enabled, 223 regional CLI tests, isolated official Codex protocol checks with zero model requests, and native-component browser checks with synthetic collaboration replies passed. No real conversations, models or installed DSH were touched. Real-account execution, actual desktop exit patching and live cross-client behavior still require acceptance testing.

Requires Windows 10/11, DSH `0.2.2-rc.1`, and Node.js `24.9+` for build/CLI environment. Install and sign in to official runtimes separately. The plugin does not install Agent software or manage credentials.









## Qoder ACP

Version 2.0.3 adds the official Qoder CLI ACP transport. Open Model Configuration → Qoder (ACP) to inspect the executable, negotiate ACP, read account models, and test a real reply. Text only; each request creates a new session with DSH text history. New tool permission requests are rejected. See [Qoder ACP](docs/qoder-acp.md).

Hub mirrors DSH workspaces and their conversations directly. Each conversation is a member, using its current DSH model. Create and move projects/conversations in DSH; Hub only manages roles, instructions, collaboration permissions, tasks and workflows. Standalone project/member creation and external Agent connections are removed.

## 2.1.4 top-level check-in status

Settings home, model settings and usage pages show a check-in summary at the top. One click checks and claims daily rewards sequentially for the current CodeBuddy China default account and the Qoder International desktop account. Claimed or absent rewards are skipped; one provider failing does not prevent the other from being checked. Other account-pool profiles retain independent controls.

Individual settings also expose status above configuration controls, with a single-click action instead of a second confirmation. Nothing is claimed on startup, and uncertain mutations are never retried automatically.

## 2.1.3 manual daily rewards

CodeBuddy China and Qoder International settings/usage pages now show daily reward status and an explicit confirmed claim action. CodeBuddy isolated profiles have independent claim controls. Qoder uses the current Windows international desktop login, which may differ from its CLI login; only the daily 100-Credits campaign is eligible. No automatic claims, token refresh, device-identity generation or other gift claims are performed.

Qoder cycles reset at 10:00 Beijing time. Missing campaigns, eligibility restrictions, claimed rewards and uncertain outcomes remain distinct. In-flight claims coalesce; failed or uncertain mutations are never retried automatically. Live read-only queries passed; actual claims were tested with simulated upstream responses only, not real reward mutations or installed DSH acceptance.

## 2.1.2 verification and update notices

Settings include a permanent Star link and a dismissible thank-you shown once per frontend lifecycle. Provider entries offer explicit short model probes and numeric quota summaries. DeepSeek API balances stay out of the model launcher; usage pages/tooltips format those balances to two decimals. No model probe runs automatically.

Collaboration overview and chat expose member exchange and automatic workflow handoff directly, retaining permission checks and bounded execution. On startup the sidebar footer checks the original repository's latest stable GitHub Release once. Only a newer numeric version prompts an update; network failures do not interrupt startup. Downloads and installation remain manual.

## 2.1.1 collaboration and account pool

Collaboration now groups overview, attention items, conversations, members, tasks, workflows, execution records, files/artifacts, issues, and audit. Adds handoff summaries, task trees/filters, a visual workflow editor, run management, artifact image previews/downloads, avatars, and prompt analysis through existing DSH members. See the [feature map](docs/agent-hub/功能对照.md).

The CodeBuddy account pool displays per-profile official credit balances with direct default selection and collapsed login details. Existing account-bound conversations retain their account. Windows official npm/Node stable 2.x releases from 2.174 are eligible; newer releases must pass required capability checks. Native executables and 3.x are not supported for isolated accounts. Official 2.177.0 and 2.181.0 version/help probes passed; live multi-account sign-in, refresh and billing on 2.181.0 remain unverified.

Provider entries show availability without conflating executable discovery with a successful model reply. Local browser tests use synthetic DSH/model fixtures; installed-host acceptance remains necessary.

## 2.1.0 settings update

Compact icon/name provider entries, shared settings headers and controls, and a clickable themed usage icon. Codex project settings remain separate from the model-settings launcher. DeepSeek reuses the native DSH account balance service. CodeBuddy reads current CLI account resource packages, Qoder uses official CLI account queries, and ZCode reads Coding Plan or Start Plan quota. Read-only live probes returned CodeBuddy/Qoder quotas and an empty ZCode Start Plan. Local browser fixtures cover provider routes, scoped usage, light/dark themes and narrow windows. This release was not live-tested inside the installed DSH.
