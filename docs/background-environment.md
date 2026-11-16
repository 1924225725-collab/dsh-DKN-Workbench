# 后台运行环境

后台需要独立 Node.js 24.9 或更新版本。DSH 自带 Electron 的 Node 能力不能直接当成独立后台可执行文件。

插件会优先检测已配置路径、插件私有运行时、本机 `Programs/dkn-node`、`Programs/nodejs`、Program Files 和 PATH 中的独立 Node。找到后显示实际路径与版本并自动复用，不要求重复安装。

找不到时，在「模型配置」或「API 服务」的后台区点击「复制 AI 部署提示词」，发给自己可操作电脑的 AI。提示词会包含本机准确的配置文件位置，指导 AI 复用已有版本或从 Node.js 官方源部署便携版本、核对 SHA-256，并保留 API Key、登录态与签到记录。插件本版不直接下载安装包；选择的是通过 AI 部署的方案。

部署后的路径记录在 `%LOCALAPPDATA%\dsh-dkn-agent\background-node.json`，格式为 UTF-8 JSON：

```json
{"path":"C:\\Users\\你的用户名\\AppData\\Local\\Programs\\nodejs\\node.exe"}
```

回到页面点击「重新检测环境」，显示「已找到 Node.js」后启动后台。不需要重装 DSH，不要把 DSH.exe 复制或改名为 node.exe。Node 路径必须通过实际版本检测，`process.versions.electron` 需不存在，版本至少 24.9。

运行环境缺失时，API 页面仍显示已保存的地址、Key 掩码和模型路由；启动、保存和密钥变更按钮暂不可用，原文件保持不变。签到显示「等待后台就绪」，不把环境问题当作账号登录或额度失败。
