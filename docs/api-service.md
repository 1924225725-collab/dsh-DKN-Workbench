# API 服务

在「DKN Agent → API 服务」或 DSH 设置的「API 服务」中启用。对外统一提供一个本机地址、一个 API Key、一个模型名（默认 `dkn`）。实际调用的平台及模型在插件的「模型路由」中选择。开启「退出 DSH 后继续运行」后，后台在 DSH 退出后仍保持 API；默认随插件退出而停止。详见[独立后台](background-service.md)。

1. 生成 API Key，立即复制保存。服务端仅保存哈希；离开页面后不再显示原密钥。
2. 读取模型目录，单选实际调用的模型，点击「保存模型路由」。对外模型名可以自定义。可以对具体模型发送短提示验证。ZCode 只有在当前后台运行期间验证成功后才能使用，有效期 30 分钟，后台重启后需重新验证。
3. 点击「保存并启动」，复制 Base URL。默认 `http://127.0.0.1:18789/v1`，端口可在停服时修改。
4. 在调用软件中选择 OpenAI 兼容方式，填写同一个 Base URL 和 Key，模型名填写 `dkn`（或已保存的自定义名称）。以后只需在插件里切换目标模型，调用软件无需修改。`GET /models` 和 JSON/SSE 回复都只显示这个对外名称，不暴露内部模型 ID。

升级到 2.2.1 时保留地址、Key 和原选择的第一个模型作为后台目标；旧的平台/模型 ID 不再接受，请在调用软件中将模型名改为 `dkn`。切换目标会取消旧目标上的在途请求，不会自动重发。目标不可用或 ZCode 验证失效时返回明确错误，不自动切换到其他平台；此时 `/models` 返回空列表。

接口：`GET /v1/models`、`POST /v1/chat/completions`。均要求 `Authorization: Bearer <API Key>`。默认仅本机使用，不开放局域网或公网，也不接受浏览器跨域请求。

2.2.2 起，单次 JSON 请求体上限由 128 KiB 提升到 **16 MiB**（按 UTF-8 字节计算，包含全部历史、上下文和协议字段）。超限返回明确的 HTTP 413，不静默截断消息；这个接入上限不代表实际模型的上下文容量，提供方仍有自身限制。

PowerShell 调用示例（请替换密钥和模型 ID）：

```powershell
$apiKey = '<刚复制的 API Key>'
$body = @{
  model = 'dkn'
  messages = @(@{ role = 'user'; content = '你好' })
  stream = $false
} | ConvertTo-Json -Depth 6
Invoke-RestMethod -Uri 'http://127.0.0.1:18789/v1/chat/completions' `
  -Method Post -Headers @{ Authorization = "Bearer $apiKey" } `
  -ContentType 'application/json; charset=utf-8' `
  -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
```

`stream: true` 返回 SSE，成功结束包含 `finish_reason: stop` 和 `[DONE]`。部分 CLI（包括当前 Codex 命令模式、CodeBuddy 结构化适配）先生成完整回复再返回；不会通过拆字伪造上游流式。流式中途失败会返回 error 事件，没有成功 stop，客户端必须检查 error，不能仅以 HTTP 200 或 `[DONE]` 判断成功。

首版范围：文本 system/user/assistant 消息，JSON/SSE，一次返回一条回复。最后一条需为非空 user 消息。图片、文件、自定义工具调用以及 temperature 等未兼容参数会明确报错，不静默忽略；不伪造 Token 用量和费用。提供方仍使用自己的 CLI 登录态和套餐，不会导出官方账号凭据。Codex 遵循只读沙箱；本入口不执行 API 自定义工具。

可配置最大并发 1–4（默认 1）、超时 1–300 秒（默认 90 秒）。最多另排队 8 条请求，队满返回 429。客户端断开、停止服务、更换 Key 或移除导出模型会取消相关请求。取消不保证平台不计费，不会自动重发。API 请求使用独立会话和临时工作目录，不续接现有项目对话；请求结束后清理工作目录。

「随后台自动启动 API」默认关闭，需保存才生效。停止服务是停止本次监听，自动启动选项保持用户选择；下次后台启动是否监听取决于该选项。ZCode 尚未重新验证时不会出现在导出目录；如果只有这类模型，自动启动会提示需要验证。

更换 Key 后旧 Key 立即失效，当前请求取消，请同步更新调用软件。最近请求只保存本次进程内的模型、状态和耗时（最多 20 条），不记录提示词、回复和 Key；上游 CLI 仍可能有自身日志。本机 API 设置保存在插件数据目录的 `api-export/settings.json`，密钥只保存 SHA-256 哈希，不可从文件恢复明文。

验证的模型不会自动代表同平台全部模型可用；账号、额度和网络变化仍可能导致上游错误。请使用配置页的真实文字验证。

API 专用的 Codex 请求使用 `--ephemeral`，避免写入正常 Codex 会话历史；需要支持该参数的 Codex CLI。普通 DSH 对话不受这项设置影响。

## WorkBuddy 国内版兼容

WorkBuddy 的测试连接会固定发送 max_tokens: 1。2.2.0 起接受正整数 max_tokens 或 max_completion_tokens（只能选一个，1–131072）。该预算会传递给适配器；对于不能精确控制生成 Token 的 CLI，网关按同值的 UTF-8 字节上限保守截断输出，保持 Unicode 完整，触及预算时取消上游并返回 finish_reason: length。它不代表精确 Token 计数，不保证约束上游已生成的 Token 或费用；短探测可能仅收到一个字母，仍是实际模型返回内容，不会伪造 OK。

WorkBuddy 的自定义模型供应商选择 OpenAI 兼容方式，URL 填 API 服务的 Base URL，Key 填生成的密钥，模型名填 `dkn`（或已保存的自定义名称）。首版请不要开启工具调用或图片能力。被拒绝的请求记录 HTTP 状态及错误分类，便于区别密钥、模型路由和参数问题，不记录请求内容或 Key。
