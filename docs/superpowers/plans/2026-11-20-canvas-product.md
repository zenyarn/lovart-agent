# 画布生图产品实施计划

> 执行方式：superpowers:executing-plans，由当前会话连续执行，完成后独立审核。

**Goal:** 完成个人自用的 Next.js + Supabase 画布生图产品。
**Architecture:** Next.js App Router 提供页面与同源后端；Supabase 承担邮箱认证、项目/生成/画布持久化和私有图片存储。KIE 请求仅从服务端发起；本地采用可恢复轮询，状态更新与结果搬运使用数据库原子锁。
**Tech Stack:** TypeScript、pnpm、Next.js、React、@xyflow/react、@lobehub/icons、Supabase SSR、Zod、Vitest。
**Spec:** docs/prd.md、docs/api/integration-plan.md、docs/api/supabase-setup.md。

## 全局约束
- 个人自用、所有者准入；密钥仅服务端；参考图 1 张/10 MiB；右面板 320–620px。
- 使用已有 Supabase 项目；已执行的 Storage 基线不得重复执行。
- 不增加收费测试任务，除非确有验证必要；优先使用本轮真实任务记录与可控 mock。

## Review Focus
- 重复提交/提交结果未知不得重复收费。
- 跨用户、外部 URL、伪造任务状态不可绕过鉴权。
- 生成已成功但结果保存失败，应只重试保存。
- 页面刷新恢复状态，跨标签保存冲突必须可见。
- 上传文件 MIME、大小、签名地址和结果下载网络边界必须验证。

## Task 1：环境、数据库和认证
**Files:** package.json、src/lib/supabase/*、src/lib/auth.ts、src/app/login/*、src/app/auth/callback/*、supabase/migrations/20261120085234_app.sql。
**Interfaces:** requireOwner() 返回已验证用户；数据库 projects/assets/generations/outputs/canvas_nodes；RPC 原子创建生成、抢占同步和保存画布。
- [x] 安装框架及库并建立类型检查/测试命令。
- [x] 写所有者准入/参数校验失败测试，观察失败后实现。
- [x] 创建业务表及 RLS/权限/RPC，通过 Dashboard 应用并 SQL 核验。
- [x] 实现登录回调、退出、个人所有者配置引导；未绑定时 fail-closed。

## Task 2：模型适配与受控上传
**Files:** src/lib/models.ts、src/lib/kie.ts、src/lib/assets.ts、src/app/api/assets/route.ts、src/lib/__tests__/*。
**Interfaces:** validateGeneration(input)、createKieTask(input)、queryKieTask(id)、storeReference(file,user)、signedAsset(assetId,user)。
- [x] 测试非法比例/分辨率、空提示词、多参考图、MIME伪造、超大文件。
- [x] 实现服务端上传、图片元数据解析、私有签名 URL；不用任意客户端 URL。
- [x] 实现 KIE 三模型路由、错误响应和不重提创建请求规则。

## Task 3：项目与生成后端
**Files:** src/app/api/projects/*、src/app/api/generations/*、src/lib/generations.ts、src/lib/download.ts。
**Interfaces:** POST projects、GET projects、GET/PATCH project、PUT project/canvas、POST generations、POST generation/sync。
- [x] 测试幂等、并发限制、unknown、保存失败重试和非法下载地址。
- [x] 实现带资产归属校验的任务创建和刷新恢复；结果下载拒绝内网/非 HTTPS/超限。
- [x] 实现只读历史快照、签名图片输出和 version 乐观锁。

## Task 4：首页、项目列表和画布
**Files:** src/app/protected/*、src/app/projects/*、src/app/canvas/*、src/components/*、src/app/globals.css。
**Interfaces:** 统一 Composer、项目卡片、模型配置、生成历史、React Flow image nodes。
- [x] 还原截图的白灰视觉、提示词输入、参考图选择与模型配置弹框。
- [x] 首页创建并受理任务后跳转；项目分页、重命名、封面。
- [x] 画布平移缩放、拖动保存、侧栏宽度调整、单图参考与下载。
- [x] 生成占位、成功、失败、同步异常、重试、自动保存冲突 UI。

## Task 5：验收与交付
**Files:** docs/api/app-api.md、docs/development.md、docs/verification.md、README.md。
- [x] pnpm test、typecheck、lint、build；修复发现的问题。
- [x] 浏览器检查三页布局、配置和状态流程；记录真实验证和未验证边界。
- [x] 独立审核后修复重要问题，更新实施记录与启动说明。

## 执行记录
- 已有三次 1K API 测试成功状态，正在归档图片与积分消耗。
- 用户已批准按现有 PRD 完整开发并授权常规决策，不重新请求技术方案批准。

### 开发进度 2026-11-20
- 模型与权限校验 13 项测试通过；业务数据库 7 项测试通过。
- 已创建服务端会话、白名单登录、回调和退出接口，类型检查持续进行。
- 远端五张业务表/RLS/原子 RPC 已应用并核验；迁移由 CLI 生成文件后通过 Dashboard 执行。
- Ruling: 使用两个白名单邮箱并按 UID 隔离 — 用户明确提供两个邮箱 — 如需共享项目需另行设计。
- Ruling: 使用现有工作目录连续开发而不隔离 worktree — 已有大量本轮文档未提交且用户期望此目录推进 — 最终提交前需仔细审阅差异。

- 后端首轮实现检查：6 个测试文件/24 项通过，类型检查通过；后端 lint 0 error。完整登录与生成端到端验证尚未完成。

### 验收记录 2026-11-20 18:04
- Task 1–4 实现及各层验证：46/46 单元/集成测试、4/4 浏览器测试，类型检查及 lint 通过；真实全链路与远端隔离证据见 docs/verification.md。
- Ruling: 增补一次 Nano 私有参考图真实生成 — 原三次 API 测试未证明签名参考图可被上游访问及应用完整提交路径 — 新增 8 credits，累计 28，未自动重提。
- 最终独立审核与修复后回归尚未完成，不以首轮通过代替最终交付。

### 最终审核修复
- Final: fixed 5 项 Important — 草稿恢复、编辑锁、远端快照、条件删除草稿、非法重定向均 RED→GREEN，全套 53/53，生产浏览器 4/4。完整裁定及暂缓小问题转录见 docs/review.md。
- Final: minor (deferred): 暂时加载失败仍使用统一缺失页。
- Final: minor (deferred): GPT 历史摘要尚未显示背景字段；快照已保存该字段。
