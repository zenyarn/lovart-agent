# 项目协作约定

## 项目背景

- 本项目是以 Lovart 为参考的设计 Agent 项目，基于 Next.js + Supabase 开发。
- 后续开发优先遵循项目已有的技术栈、目录结构和代码风格。新增实现前先查看相关代码和配置，避免引入重复或不一致的方案。
- Node.js 包管理默认使用 pnpm，除非项目已有明确的其他约定。

## 项目文档目录

以下路径均相对于本项目根目录，不是操作系统根目录。

- `/docs/`：统一存放项目相关文档。
- `/docs/prd.md`：存放项目需求文档、功能规格和已确认的产品决策。
- `/docs/images/`：存放截图、界面参考图、流程图等图片资料。
- `/docs/api/`：存放 API 文档、接口约定和第三方服务对接说明。

## 生图模型 API 文档索引

以下为 KIE 官方接口文档的本地副本。对接或修改对应模型的调用逻辑前，优先阅读相关文档，核对模型标识、请求参数、认证方式及响应结构。

- [Nano Banana 2](docs/api/nanobanana2.md)：Nano Banana 2 生图接口文档。
- [GPT Image2 文生图](docs/api/gpt-image-2-text-to-image.md)：根据文本提示词生成图片的接口文档。
- [GPT Image2 图生图](docs/api/gpt-image-2-image-to-image.md)：使用参考图与提示词生成图片的接口文档。
- [KIE 任务查询](docs/api/kie-get-task-detail.md)：查询异步生成状态与结果。
- [KIE Webhook 验签](docs/api/kie-webhook-verification.md)：回调签名验证。
- [技术对接与配置审查](docs/api/integration-plan.md)：环境变量、模型参数差异、数据模型及异步流程。
- [Supabase 基础配置记录](docs/api/supabase-setup.md)：当前项目、Bucket、存储策略、Auth URL 和迁移基线状态。

## 需求沉淀规则

- 讨论功能实现、产品需求、业务规则或交互细节时，及时将已经明确的需求整理到 `/docs/prd.md`。
- 写入 PRD 的已确认部分必须以用户已确认的信息为依据，不得将推测、调研建议或尚未确认的方案写成最终需求。
- 信息不完整时，记录为“待确认问题”或“开放问题”，明确与已确认需求区分。
- 需求变化时同步更新相关条目，保留必要的决策背景，避免文档之间相互矛盾。

## Supabase 操作规则

- 执行 Supabase 相关任务时，尽可能优先使用 Supabase MCP，包括数据库表结构查看、SQL 查询、RLS 策略检查和创建、Storage Bucket 查看和创建。
- 如果 Supabase MCP 不可用或无法完成所需操作，应说明限制，并使用适合当前项目的替代方式；不得声称已执行未实际完成的操作。
- 操作前核对目标项目与环境，避免误操作其他项目或生产数据。

## 安全和配置约定

- 不得将 Supabase service role key、数据库密码、访问令牌等敏感信息写入前端代码或提交到仓库。
- 前端只能使用以 `NEXT_PUBLIC_` 开头且确实可公开的环境变量。该前缀意味着变量可能暴露给浏览器，不能用来包装任何秘密。
- 服务端密钥仅在服务端使用，通过环境变量或部署平台的秘密配置注入；示例配置只保留占位符。
- 涉及用户数据访问时，优先考虑 RLS 策略和最小权限原则，包括数据库及 Storage 的访问控制。

## 文档维护方式

- 更新本文件或其他项目文档时，保留原有有效内容并合并更新，避免无意义覆盖。
- 项目文档默认使用中文，技术标识、代码和 API 名称保留原文。

## 进度管理与阶段提交

- `/docs/progress.md` 是项目进度的统一入口；每次阶段提交或重要状态变化时同步更新。
- 按文档与验证、数据库与后端、页面与画布、验收修复分阶段提交 Git，避免将完整项目积压到最后一次提交。
- 记录每阶段的验收标准、实际验证结果、提交短哈希和待解决问题；代码写完但未验证时标记为“验证中”。
- 实施计划的勾选项应与实际证据一致，不能提前勾选。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 公开仓库发布约定

- `origin` 为 GitHub 公开仓库 `zenyarn/lovart-agent`，日常开发在 `main` 分阶段提交并按用户授权推送。
- `archive/local-development-20261120` 与 `.local/pre-public-history.bundle` 仅为本机早期历史备份，含原始个人部署记录，不能推送到公开仓库；禁止使用 `git push --all` 或 `--mirror` 发布本仓库。
- `.local/private-records/`、真实 `.env` 和 Supabase 管理截图保留在本地。公开文档使用配置项或示例邮箱，不披露实际准入地址及部署实例标识。
