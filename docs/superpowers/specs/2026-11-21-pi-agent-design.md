# Pi Agent 画布接入设计

依据：用户 2026-11-21 完整目标。范围是 Agent 接入，不包含教程第二步 Skill 管理。

## 已确认体验
- 原右侧消息区和输入框共用 Agent / 生图模式；底部工具栏最左侧下拉，向上展开，键盘、Esc、外部点击关闭；上传与生成中禁用，窄屏换行保留发送按钮。
- Agent 模式显示“Agent自动规划”，普通生图保留现有模型配置和链路。
- 统一附件支持图片、Markdown、拖放和文件粘贴；私有 Bucket；图片缩略图，文件卡片至多 240px，预览下载；Markdown 服务端读取全文。
- 画布点击图片形成有序参考；真实看图后生图。上传图片进画布；拖动、等比缩放、复制粘贴、删除并持久化，编辑文本不误删，删节点保留文件。
- 流式回复、可展示思考、工具参数/结果/错误；安全 Markdown 渲染；用户消息靠右紧凑；发送立即清空草稿但保留消息附件。
- Agent 使用 Kimi + Pi，KIE GPT Image 2.5 Flare 文生图/图生图；保存完整引用和参数，重试保持模型。复用生成记录、素材和画布。
- 用户与项目双重归属校验；密钥仅服务端；真实 Chrome 验收。

## 实现决策
直接扩展现有 Next.js API、Supabase 表与 React Flow。相比独立 Agent 页面/服务，此方案符合用户指定的共用 UI 和存储约束。
新增 Agent 会话/运行记录管理历史与工具事件；不把 Pi 运行时内存当作持久化。服务端 Pi Agent 使用五个工具：list_assets/view_image/generate_image/place_on_canvas/read_canvas。Kimi 模型地址从 KIMI_BASE_URL 读取。
扩展现有 assets 支持 Markdown，canvas_nodes 支持无 generation 的素材节点，generation config 保存有序参考与 provider 模型快照。数据库事务和 revision 锁防止工具动作与画布自动保存相互覆盖。
Agent 生图继续使用现有 submit/sync 流程，维持请求幂等、未知受理不自动重提、保存失败只重试保存。一次运行限制工具步数/收费调用次数与超时。

## 验收证据
自动测试覆盖参数、归属、事务、重试模型、流事件和组件交互；Chrome 验证真实上传、看图、Kimi 工具调用、GPT 2.5 文生图及图生图、刷新恢复和窄屏。仅测试通过不等于真实链路通过。
