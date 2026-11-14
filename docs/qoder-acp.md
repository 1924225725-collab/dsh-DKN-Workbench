# Qoder ACP

本插件通过官方 Qoder CLI 的 `--acp` 标准输入输出接口连接，使用 ACP v1。实现依据：

- https://docs.qoder.com/cli/acp
- https://github.com/QoderAI/qoder-acp-demos
- https://agentclientprotocol.com/protocol/v1/session-setup

安装插件后，进入「DKN Agent → 模型配置 → Qoder（ACP）」。

1. 按官方 https://docs.qoder.com/cli/installation 安装 CLI。
2. 在终端执行 `qoder login` 完成登录。
3. 填写 CLI 完整路径或留空自动发现。支持原生可执行文件、JS 入口，以及标准 npm 启动器。
4. 点击「检测 ACP 连接」：执行 initialize、session/new，不发送模型请求。成功后显示账号返回的可选模型。
5. 点击「发送测试」：真实发送提示，显示回复。只有收到文本且 stopReason 为 end_turn，才显示「已收到真实回复」。

第一版范围：文本输入、文本流式输出、账号模型选择、调用超时、取消及进程清理。普通 DSH 会话可以选择 Qoder；Codex 项目会话继续仅显示 Codex Agent。未发现 CLI 时不向模型菜单放入不可用的 Qoder 条目。

每次调用创建独立 ACP 会话，将 DSH 的文本历史按角色附带给 Qoder，不复用外部 Qoder 会话。Qoder 使用自己的 Agent 工具；此入口不向 DSH 交付工具调用，也不把 DSH 工具列表伪装成 Qoder 原生工具。插件不广告客户端文件读写、终端或表单能力，收到新的权限请求时选择拒绝。CLI 自身已配置的工具规则仍会生效。

当前不支持附件、原生会话导入、ACP 人工审批界面或用量/余额映射。不伪造模型清单和 token 数量；模型窗口暂使用 DSH 兼容预算 200K，并非 Qoder 的真实窗口声明。CLI 未返回模型清单时仅有账号默认项。模型请求关闭 DSH 自动重试，避免任务已执行但回执丢失时重复发送。

配置字段：qoderPath、qoderEnabled、qoderModel、qoderCwd、qoderTimeoutMs。

CLI 的协议握手、账号权限和真实回复应分别验收。自动化测试中的 ACP 进程夹具仅验证协议实现，不能证明某个真实账号已经可用。

2.0.4 修复跨模型旧对话的内容兼容：历史 assistant reasoning 不发送给 Qoder；工具调用、结果及工具目录变更投影为带类型的历史文本。图片和文件附件仍明确拒绝，未知类型单独报告，不再将所有非文本块误报成附件。
