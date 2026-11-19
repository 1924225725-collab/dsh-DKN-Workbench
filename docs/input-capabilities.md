# 输入能力（2.3.3）

文字连接通过不代表图片验证通过。图片仍取决于账号、所选模型和上游服务。

| 平台 | 图片通道 | 本次真实验证 |
| --- | --- | --- |
| CodeBuddy 国内 | 原生图片块，按实时模型目录启用 | 识别蓝色三角形及红色圆形通过 |
| CodeBuddy 国际 | 原生图片块，按实时模型目录启用 | 本次未完成真实识图验收 |
| Qoder ACP | 按 ACP image 能力声明，发送 Base64 原生块 | 识图通过 |
| Codex CLI | CLI --image，临时文件在调用结束清理 | 识图通过 |
| Codex 项目 | app-server turn/start 原生图片块 | 识图通过；新建线程首次发送不再预读不存在的 rollout |
| Antigravity ACP | 按 ACP image 能力声明，发送原生图片块 | 官方账号资格校验拒绝，未通过识图验收 |
| ZCode | 已有原生读取图片链路 | 本次上游返回 Select a model before continuing，未通过识图验收 |
| TRAE CN | 当前只开放文字 | 目录声明多模态，但远程 query/媒体块实测未识别图片，未发布失败的试验适配 |

DSH 图片使用附件服务读取，不把路径、网址或 Base64 文字冒充图片。复用5张、单张2 MiB、最长边1920像素、Base64合计8 MiB预算。保留图片与文字历史对应关系；卸载后的原图不再转发，不猜测其内容。文件、音频和视频二进制没有统一输入通道；请通过 DSH 工具读取文字或转成标准图片附件。

统一 API 仍只有一个对外模型名（默认 dkn）。支持 user 内容中的 OpenAI image_url，url 必须是 PNG/JPEG 的 Base64 data URL。最多5张、单张2 MiB、最长边1920像素，Base64合计8 MiB；完整请求体最大16 MiB。不会下载网络图片或读取本地路径，后台目标必须声明图片能力。图片数据仅存于当前请求内存，Codex CLI 临时文件调用后清理；不写入 API 调用日志。

协议依据：[ACP v1 schema](https://github.com/agentclientprotocol/agent-client-protocol/blob/main/schema/v1/schema.json)。TRAE 试验参考 [Trae2api-cn](https://github.com/autumnsentiment/Trae2api-cn)，没有把未通过的协议试验发布为可用能力。
