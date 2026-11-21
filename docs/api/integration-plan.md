# 技术对接与配置审查

审查日期：2026-11-20。应用处于开发与联调中；Supabase 基础配置及业务表已完成，见 [部署配置记录](supabase-setup.md)。

## 当前状态

- 仓库已建立 Next.js 应用、业务表迁移、模型适配及上传/生成接口；界面与完整链路正在联调。
- 本地 `.env` 已配置 KIE_API_KEY、Supabase URL、publishable/secret 密钥、Bucket 名和本地 APP_URL；KIE 三个接口已完成真实调用验证，结果见 kie-verification.md。
- 当前会话未提供可用的 Supabase MCP 工具；已按用户授权通过 Chrome Dashboard 创建配置并核验 Bucket、存储策略和 Auth URL。
- `.env.example` 仅包含空值示例；真实 `.env` 已保存连接参数并设置权限 600，受 Git 忽略。应用连接与登录上传联调尚未执行。

## 环境变量

| 变量 | 用途 | 当前状态 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 浏览器和服务端连接 Supabase | 已配置 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 公开客户端密钥，配合用户会话及 RLS | 已配置，使用新 publishable key |
| `SUPABASE_SECRET_KEY` | 服务端后台任务处理和结果入库 | 已配置新 secret key；仅限后台，不能代替用户请求的权限校验 |
| `KIE_API_KEY` | KIE Bearer 认证 | 已验证三个接口，共消耗 20 credits |
| `SUPABASE_STORAGE_BUCKET` | 应用自定义 Bucket 名配置 | `project-assets` 私有 Bucket 已创建 |
| `APP_URL` | 应用自定义站点地址配置 | 本地默认 `http://localhost:3000`，上线后替换为公网 HTTPS 地址 |
| `KIE_WEBHOOK_HMAC_KEY` | 应用自定义 KIE 回调验签配置 | 回调模式启用前需要填写；本地轮询不需要 |

通过 KIE 使用这两个模型，不需要额外的 OpenAI 或 Google API Key。数据库密码不是当前网页运行所必需的环境变量；只有选定直接连接数据库的迁移方式后才考虑独立迁移凭据。登录供应商的 OAuth 密钥应在 Supabase 对应设置中配置，不能凭空列为当前必填项。

## 模型参数映射与差异

| 场景 | KIE model | 参考图字段 |
| --- | --- | --- |
| Nano Banana 2 文生图/图生图 | `nano-banana-2` | `input.image_input`，零张或一张 |
| GPT Image2 无参考图 | `gpt-image-2-text-to-image` | 不传参考图字段 |
| GPT Image2 有参考图 | `gpt-image-2-image-to-image` | `input.input_urls`，一张 |

- 所有任务通过 `POST https://api.kie.ai/api/v1/jobs/createTask` 创建，由服务端传入 Bearer Token。
- Nano Banana 2 分辨率仅有 1K/2K/4K，没有截图中的 512。应用默认 output_format=png。
- GPT Image2 当前文档列出 prompt、aspect_ratio、resolution、background，以及图生图的 input_urls；没有 quality 或生成张数参数，不能把截图的“中”“1 img”直接映射为请求字段。
- GPT Image2 的 2K 不支持 5:4、4:5、3:1、1:3、9:21；4K 不支持 3:1、1:3、9:21。background 仅在 1K 发送。前端禁用无效组合，服务端再次校验，不能静默改用户参数。
- 切换分辨率导致比例不合法时，提示用户重新选择并暂时禁用发送。
- 两种模型使用各自枚举，不能共用同一个比例白名单；完整列表以本目录三份官方文档为准。

## 异步生成与结果保存

1. 通过用户会话验证项目归属，校验参数、参考资产归属和请求幂等标识，先写本地 generation 记录。
2. 调用 KIE 后保存 taskId；创建接口返回成功只代表受理，不代表图片已生成。上游提交超时不能盲目重试创建。
3. 本地开发：前端请求本应用任务查询接口，服务端查询 KIE，采用退避轮询；刷新后恢复查询。浏览器关闭期间不承诺主动同步，重新打开时补查。
4. 生产：回调触发服务端更新，另设定时补查处理中任务作为兜底。需要在选定部署平台后落实定时任务和执行时限。
5. KIE 回调签名只覆盖 taskId 和时间戳，不覆盖整个请求体。验证 HMAC、时间窗口并匹配已知任务后，再主动查询任务详情获取可信结果；重复和乱序回调不得回退终态。
6. 状态至少区分 submitting、pending、running、persisting、succeeded、failed、submission_unknown；保留上游原始状态。上游结果地址解析后由后台下载并保存到私有 Bucket，保存完成才标记完整成功。
7. 下载结果时限制 URL 协议、目标网络地址、响应大小、实际 MIME 和超时，防止任意 URL 抓取；KIE 密钥不能转发到图片下载域名。
8. 私有参考图使用有限期签名 URL 供 KIE 获取；数据库存 bucket/object_path，不把会过期的签名 URL 当永久资产地址。每次提交重新签名，同画布引用不重复上传。有效期需覆盖模型取图等待时间并在联调验证。

## 数据模型与应用接口草案

- projects：id、owner_id、name、cover_asset_id、viewport、model_settings、created_at、updated_at。
- assets：id、owner_id、project_id（首页上传时可为空）、bucket、object_path、mime、width、height、created_at。
- generations：id、owner_id、project_id、request_key、provider_task_id、prompt、model、config、reference_asset_id、status、error、timestamps。request_key 按用户唯一，provider_task_id 唯一。
- generation_outputs：generation_id、asset_id、ordinal；保留上游返回的结果列表，不假定响应永远只有一个 URL。
- canvas_nodes：id、project_id、asset_id/generation_id、position、size；生成占位与结果复用节点。
- 第一版历史面板由 generations 及其 outputs 构成；若确认加入语言模型对话，再增加消息与会话模型。
- 所有表的 RLS 以 auth.uid() 和项目所有者校验，关联资源须同属一用户/项目。Storage 对象路径为 owner_id/project_id/uuid；首页临时上传用 owner_id/staging/uuid，绑定后禁止跨用户引用并定期清理未引用资产。
- 应用接口：项目列表/创建/重命名、项目详情、画布保存、上传授权与完成校验、创建生成、查询生成、资产签名下载、KIE 回调。任何 ID 参数均需服务端校验归属。
- Storage SQL 基线已归档；开发时补齐业务表、外键、索引、唯一约束和表级 RLS 的迁移，并先协调远端迁移历史。五类业务表及原子 RPC 已部署，详见 supabase-setup.md。

## 上线前必须补充的验证

- 登录、跨用户项目/资产不可访问，上传限制及签名地址失效后刷新。
- 两模型各自文生图/图生图链路、非法参数拒绝、重复发送不重复建任务。
- 刷新恢复、上游失败、提交结果不明、重复回调、保存失败仅重试保存。
- 真实配置弹框与接口一致、面板宽度边界、参考图单图限制、生成结果和历史一致。
- 部署平台的上传/执行限制、定时补查、Auth 重定向地址，以及个人账户的费用监控方式。

## 补充官方文档

- [任务状态查询](kie-get-task-detail.md)：来源 https://docs.kie.ai/market/common/get-task-detail ，2026-11-20 获取。
- [Webhook 验签](kie-webhook-verification.md)：来源 https://docs.kie.ai/common-api/webhook-verification ，2026-11-20 获取。

## 本轮补充的工程约束

- 本地直连生图流程的六项运行配置均已非空；连接与 KIE 三个接口已验证；完整应用联调继续进行。
- 第一版采用 Next.js App Router、TypeScript、pnpm；页面和 API Route Handler 共用服务端参数校验。模型选项与标签来自单一配置映射，避免界面字段与请求字段漂移。
- 浏览器仅提交 assetId，由服务端验证归属并签名；不接收任意外部 referenceUrl。签名 URL 不写入持久历史或日志。
- 当前 Storage INSERT 策略只限制 UID 目录，不能强制应用的 10 MiB 上限；应用上传授权、完成校验和生成前校验均检查尺寸/MIME，验证后才将资产标记可用。若需要严格防止绕过客户端直接占用存储，开发时改为服务端受控上传并收紧 INSERT 策略。
- 不授予客户端修改生成状态、provider_task_id、费用相关字段的权限；后台使用 secret key 写入前，必须已完成用户与项目归属校验。
- 请求幂等依赖数据库唯一约束和原子状态迁移，不能只靠禁用按钮。每用户活跃任务限额需数据库锁或唯一约束支持；未知提交状态保留占用，核实后才能释放。
- 首页提交生成在服务端统一受理并返回项目/任务标识；画布只恢复查询，不因挂载页面再次提交。不能把收费任务提交实现为可重复触发的页面挂载副作用。
- 自动保存需 revision 乐观锁；资产关联需复合外键或等效约束保证项目与 owner 一致。后台写入不应只依赖被绕过的 RLS。

### 开发时应落地的文档与文件

| 交付物 | 必须覆盖 | 当前状态 |
| --- | --- | --- |
| 业务数据库迁移 | 五类业务表、关联约束、索引、RLS、最小 grants、幂等与并发约束 | 待开发；Storage 基线已有 |
| 应用 API 契约 | 项目、上传、画布保存、创建/查询生成的请求响应、错误码、授权和幂等 | 待开发；本文件已有接口清单 |
| 验收记录 | 四种模型场景、刷新恢复、错误重试、跨用户拒绝、重复请求、10 MiB 边界 | 待实际联调填写，不能预写通过 |
| 部署运行手册 | 域名、Auth URL、SMTP、回调、任务补查、结果搬运时限及日志脱敏 | 部署阶段补充 |

公开内测前核验 Supabase 邮件投递与 SMTP 限制，并配置准入和用户额度。部署选择决定是否需要调度鉴权 secret 等额外变量，当前不将其列为必填。KIE_WEBHOOK_HMAC_KEY 仅线上回调模式必需；本地轮询模式无需填写。

## 个人账号白名单

服务端使用 `APP_OWNER_EMAILS`，以英文逗号分隔允许登录的邮箱，比较时去除首尾空格并忽略大小写。业务请求必须验证 Supabase 用户身份及已验证邮箱，再检查白名单；白名单为空时拒绝访问。已确认两个邮箱记录在 PRD 中，本地环境已配置。项目、任务和素材仍按用户 ID 隔离。

## 本地 TUN 网络与结果下载

2026-11-20 联调发现本机 DNS 将 `tempfile.aiquickdraw.com` 映射至 `198.18.0.247`（代理 Fake-IP），因此原下载器按非公网地址拒绝。修复保留原有内网拦截：仅当域名解析全部为 RFC 2544 的 `198.18.0.0/15` 地址时，使用固定 `https://dns.google/resolve` 查询真实 A 记录，再次检查公网地址，并把已校验 IP 固定到 HTTPS 连接；不允许任意 DNS 服务，不放行保留 IP 字面量，不透传 KIE 密钥。

已复用之前成功任务验证：下载、实际 PNG 解码、Storage 保存、结果入库与原占位节点替换全部成功，没有再次调用收费创建接口。Next.js Proxy 的请求体缓存设为 11 MiB，应用自身仍严格执行 10 MiB 参考图上限。

## Pi Agent 接入（2026-11-21）
- Pi 实际安装版本 1.5.2，使用 createModels + provider 注册 + Agent；非旧版 getModel 全局 API。
- KIMI_BASE_URL 覆盖实际请求地址。coding 路径默认 kimi-for-coding；Moonshot 默认 kimi-k3.1-pro，可用 KIMI_MODEL 指定。真实配置的 models 端点确认提供 kimi-k3.1-pro/kimi-k3，前者已返回正常 OK。
- GPT 2.5 Flare 使用官方文生图/图生图接口，参考图字段 input_urls，有序保存素材 ID；详情见 https://docs.kie.ai/43283988e0 和 https://docs.kie.ai/43285205e0 。
- 私有 Bucket 新增 text/markdown MIME，保持私有；Markdown 最大 256 KiB、UTF-8，预览以 text/plain + CSP sandbox 返回。
- 20261121041922_pi_agent.sql 已通过本地 PGlite 测试并在目标项目 SQL Editor 执行成功；Data API agent_runs 查询通过。MCP 不可用且 CLI 未登录，因此本次使用已有 Dashboard 会话执行。
- Agent 事件通过 SSE 返回，断线后读取持久事件快照；完整模型上下文只在服务端使用。
- KIMI_REQUEST_INTERVAL_MS 默认21000，适配低额度账户3 RPM；这是单进程共享节流，多实例需共享限流。Agent 单轮最多4次生图、24轮模型请求、15分钟运行；超过20分钟无心跳的遗留运行可恢复为失败。
- 真实验收与已知部署边界见 [Agent验收记录](../agent-verification.md)。
