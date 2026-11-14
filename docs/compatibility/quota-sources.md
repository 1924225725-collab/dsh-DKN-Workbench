# 余额和套餐来源（2.1.0）

| 平台 | 数据来源 | 显示口径 |
| --- | --- | --- |
| DeepSeek | DSH 的 `deepseekAccount.getBalance`，与“账号与余额”设置页同一个服务 | 充值钱包与赠金钱包分别显示，保留金额精度。服务存在时不改用其他 API Key 账号 |
| CodeBuddy | 当前 CLI 登录凭据对应官网的 `/v2/billing/meter/get-user-resource` | 国内与国际区域分别读取；支持插件选中的独立账号环境。周期包使用本周期剩余字段，排除过期包 |
| Qoder | 官方 CLI SDK daemon v2 的 `daemon.get_usage_info` | 套餐、加量包、组织额度保留各自单位，不启动 Agent 会话、不发送提示词 |
| ZCode | BigModel Coding Plan 的 `/api/monitor/usage/quota/limit` 与 ZCode `/api/v1/zcode-plan/billing/balance` | 依据当前登录家族和配置通道查询，分别展示次数、时长或 Token；套餐授权不等于数字余额 |
| Codex | 已连接 app-server 的 `account/rateLimits/read` | 显示限额窗口、剩余比例与重置时间；运行时尚未连接时显示原因 |

提供方的失败互不覆盖。不把缺少字段、网络失败或未登录当成余额 0。CodeBuddy 的国内和国际 CLI 登录区域不匹配时分别提示；不会为了查询去切换账号、刷新令牌或领取奖励。CodeBuddy 的备用官方网页入口仍保留。

本地聚合查询合并并发请求并短暂缓存，可从额度页点击“刷新额度”重新读取。账号令牌仅在 Host/官方 CLI 内使用，页面只接收余额字段。

实现参考：

- [Qoder 官方 SDK 用量说明](https://docs.qoder.com/cli/sdk/cost-usage)
- [CodeBuddy 官方用量说明](https://www.codebuddy.cn/docs/ide/Account/usage)
- [CreditDaddy 协议实现](https://github.com/techysy/CreditDaddy/tree/033246083728e6713d272c33ebb50adf58ac762f/src)，MIT 许可见本目录 `CreditDaddy-LICENSE`。

2026-11-13 本机真实只读验证：CodeBuddy 国内接口返回积分包及余额；Qoder 官方 CLI 返回套餐和加量包额度；ZCode 官方余额端点返回当前账号无有效 Start Plan。DSH 登录账号余额的显示需安装本版后在宿主中核验，本地回归使用与 DSH 源码相同的数据结构验证。
