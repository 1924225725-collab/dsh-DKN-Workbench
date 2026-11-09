# DSH 0.2.2-rc.1 侧栏适配

`dsh-0.2.2-rc.1-sidebar-addon.patch` 是声明 `sidebar.workspaces.after` 的基础源码补丁。

插件 1.2.8 的自动适配器使用 v3 契约，除基础扩展位外，还通过 owner 的 `nativeAppearance` 传递 DSH 本身的 `ProjectRowItem`、WorkspaceBrowser/Rows CSS Modules 和 UI primitives。插件直接使用原生项目行、菜单、弹窗、图标，会话行使用同一份 Rows 样式。CSS 类名不在插件内复制或硬编码。

v3 将扩展位放入原生 listArea 内，原生工作区和 Codex 共用带 `data-dkn-workspace-scroll` 标记的滚动容器，内层列表不再独立滚动。基础源码补丁只描述扩展位，共享滚动重排由自动适配器完成。

自动识别并升级 v1 的 `{ wide }` 和 v2 原生样式扩展位，无需重新安装 DSH。未知布局不替换。Windows 锁定时在完全退出后替换，关闭到托盘无效，辅助进程最多等待 15 分钟。

浏览器使用本地参考源码编译的原生组件与合成数据，对比尺寸、字体、间距、圆角、图标、悬停操作，并检查鼠标在两类项目上滚动均推动同一个容器。不启动已安装 DSH、不读取真实会话。合成归档测试不代表真实桌面退出后的替换周期已验收。
