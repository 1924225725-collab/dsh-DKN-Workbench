# DKN Agent for DSH

DKN Agent 是 DeepSeek Harness（DSH）的 Windows 插件。在 DSH 中浏览和继续本机 Codex 项目对话，使用 Codex、CodeBuddy 和 ZCode 的 CLI 模型，并按项目组织 Agent 协作。当前为 `1.9.6` 预览版，适配 DSH `0.2.2-rc.1`。

[下载最新版](https://github.com/1924225725-collab/dsh-dkn-agent/releases/latest) · [独立 CodeBuddy 版（国内 CLI）](https://github.com/1924225725-collab/dsh-codebuddy-cli-cn) · [English](README.en.md)

## 安装与入口

1. 从 [GitHub Releases](https://github.com/1924225725-collab/dsh-dkn-agent/releases/tag/v1.9.6) 下载 `dsh-dkn-agent-1.9.6.tgz`。在 DSH 插件管理中选择本地安装包并启用；已有旧版可更新同名插件。
2. 打开“DKN Agent · Codex”设置入口，按需填写官方 Codex CLI 路径；自动发现正常时留空。进入“模型配置 → Codex CLI”后可检测 CLI 版本、发送测试请求、配置模型清单、默认工作目录、调用超时和默认推理强度。模型配置中还提供 ZCode CLI，填写或自动发现 zcode.cjs 后即可使用 ZCode 已登录账号的动态模型目录。
3. 如果提示侧栏补丁已准备，从应用菜单**完全退出 DSH**，等待约 15 秒再打开。关闭到托盘不会释放归档锁。补丁只支持已核对的 DSH 版本，失败原因显示在设置页。
4. 工作区与 Codex 项目在**同一滚动区域**：向下滚动，经过分界线和 Codex 标题继续浏览。展开项目并打开对话，使用 DSH 原生对话界面继续。
5. 右键原生工作区，选择**项目协作**。Codex 项目菜单和标题的整理菜单也有此入口。在 DSH 总设置中，DKN CodeBuddy 与 DKN Agent · Codex 各自拥有独立设置页；项目侧栏只保留工作区与 Codex 对话。

需要 Windows 10/11、DSH `0.2.2-rc.1`，构建和 CLI 环境使用 Node.js `24.9+`。需要哪个运行时，请先自行安装并完成其官方登录。插件不代办登录、不复制凭据、不安装 Agent 软件。

## 基础能力

| 功能 | 当前行为 |
| --- | --- |
| Codex 整理 | 原生项目行与菜单；新建、改名、目录、排序、移除项目；对话改名、归档／恢复、项目归属、分区管理 |
| 旧对话归属 | 合并正式项目归属与未分配但目录完全匹配的历史对话；目录匹配仅用于显示，不修改归属 |
| 原生对话 | 首次导入文字、命令输出、文件变更路径；随后在 DSH 继续同一个 Codex 线程 |
| CodeBuddy CLI | 国内／国际通道提供 DSH 模型输出，与完整 Codex Agent 分开，不做网关互转 |
| Codex CLI | 本机 CLI 模型提供方；配置页支持版本检测、真实调用测试、模型清单和运行参数 |
| ZCode CLI | 通过 ZCode 常驻 app-server 提供动态模型目录、真流式、图片输入和会话复用；账号由本机 ZCode CLI 管理 |
| 项目与成员 | 职责、指令、模型、推理强度、会话、目录及逐项权限；绑定已有会话或新建独立会话 |
| 通信与交接 | 指定成员、群聊与精确 @成员、单成员消息视图、人工批准交接、协助提议与审批 |
| 任务与验收 | 执行者、独立审查者、依赖、重试；执行结束与验收通过分开；人工验收记录证据 |
| 工作流 | 开发→独立审查→人工收口模板；逐步确认或自动交接、暂停、继续、停止与人工介入 |
| 并行与冲突 | 不同目录可并行；同目录及父子目录在插件协作执行中排队；不自动创建 Git worktree |
| 产物与恢复 | 项目文件只读预览、产物登记／检查、审计、备份导出与合并恢复、不确定提交人工核对 |

协作运行时包括 Codex 官方 app-server、ZCode CLI app-server、DSH 原生 Session Controller、可选的官方 Claude Code CLI。Claude 只列出插件登记的会话，可手动绑定已知 UUID；不扫描外部历史或控制桌面窗口。详见[协作使用说明](docs/agent-hub/README.md)。

CodeBuddy 说明：[国内指南](docs/codebuddy/cn/使用与故障处理指南.md)、[国际指南](docs/codebuddy/intl/使用与故障处理指南.md)、[多账号指南](docs/codebuddy/cn/多账号使用指南.md)。

只需要 CodeBuddy 国内 CLI 的用户可以使用[独立 CodeBuddy 版](https://github.com/1924225725-collab/dsh-codebuddy-cli-cn)，安装包见[独立版 Releases](https://github.com/1924225725-collab/dsh-codebuddy-cli-cn/releases)。

ZCode CLI 的模型提供方来自 [dsh-zcode-plan-bridge](https://github.com/tangyixiao/dsh-zcode-plan-bridge)，使用前请先安装并登录本机 ZCode CLI。默认工具权限策略为拒绝，只有明确选择自动允许时才会代为响应工具授权。

## 兼容与执行边界

- 首次导入的 DSH Session 是 Codex 历史副本。之后在外部 Codex 桌面新增的消息**尚不会自动补齐到 DSH 历史**；协作页可显式同步成员历史。DSH 自身列表里的改名／归档只改变 DSH 副本，Codex 项目区菜单操作才写回 Codex；尚未实现完全双向同步。
- 导入不含推理条目、附件和完整文件差异。文件活动卡不等于提交或验收。Codex 适配器转交最新文字输入，工具和权限由 Codex 管理，不转交 DSH 工具定义或附件。
- Codex 项目／分区部分接口仍为 experimental；不支持时显示错误，不直接修改原生数据库。目录兼容查询只匹配精确项目根目录。
- 目录排队只约束本插件的协作执行。外部桌面、手动对话或编辑器仍可能同时改文件，需要并行修改时请提供独立 worktree。
- Claude 使用官方打印与流式 JSON 协议，第一次发送才实际运行。只读工具限制不是 OS 沙箱，写入和命令仍受官方 CLI 策略约束；模型和功能取决于本机版本及账号。
- 收到回执、执行结束、验收通过是不同状态。断线／回执丢失不自动重发；先同步原生历史、人工记录实际结果，再解除阻塞。停止调度与中断原生运行是两个动作。
- 侧栏补丁会备份并修改匹配版本的 DSH app.asar。锁定时由独立辅助进程等待完全退出后校验摘要并替换，最长等待 15 分钟。未知版本／布局、目录不可写或摘要变化时停止。DSH 更新后通常需要新版插件适配。

## 本机数据

数据位于 `%LOCALAPPDATA%\dsh-dkn-agent`。`operations.json` 为不含消息正文的 Codex 去重记录，`native-threads.json` 保存 DSH 与 Codex 线程映射。

`hub` 子目录保存本插件自己的项目、成员、协作消息、任务、审查、审计、回执和登记的 Claude 历史，**含协作内容与本机路径**。导出备份也包含这些内容。不会自动读取或导入原 Agent Hub 用户数据。恢复是合并，同 ID 保留现有记录；导入前另存备份，新导入成员执行权限关闭，不恢复自动运行。

文件预览限制在项目内，阻止路径／符号链接越界，排除常见认证和密钥文件。本机面板写接口检查来源与请求标记。用量采用原生运行时报告，不提供统一计费。

## 验证情况

- 43 项核心测试（启用真实 ASAR 库的合成归档测试），223 项国内／国际 CLI 自动化测试通过。
- 官方 Codex app-server 隔离协议验证通过：合成历史、旧目录归属、项目／分区、跨进程读取、归档恢复，模型请求为 0。
- 使用原生 DSH 组件检查共用滚动与项目行；协作浏览器流程覆盖权限、@路由、开发／独立审查、人工收口工作流、产物和审计。

这些检查使用隔离目录与合成回复，没有调用真实模型、读取真实对话或更改已安装 DSH。真实账号下完整执行、实际桌面退出补丁周期及跨端即时刷新仍需实际试用验收；当前为基础预览版。

## 源码与开发

第三方组件来源和许可见 [NOTICE](NOTICE.md)。安装依赖后可构建、运行核心回归和区域 CLI 测试，并在本地生成插件安装包。

```powershell
npm run build
npm test
npm run test:cli
npm run package
```

默认测试跳过可选真实 ASAR 用例；设置 `DKN_TEST_ASAR_MODULE` 和 `DKN_TEST_DSH_CLIENT` 指向本地 ASAR 库及参考编译 UI 后可启用。仓库里的集成和浏览器测试脚本依赖本地 DSH 参考组件、Playwright 或 Edge，需先准备各脚本所需的环境。








