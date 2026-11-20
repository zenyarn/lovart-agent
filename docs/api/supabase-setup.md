# Supabase 配置与迁移

本项目使用 Supabase Auth、Postgres、私有 Storage。公开仓库不包含部署实例标识、邮箱白名单、密钥或管理界面截图；将自己的配置写入被 Git 忽略的 `.env`。

## 新环境初始化

1. 创建 Supabase 项目，取得 Project URL、publishable key 和服务端 secret key，填入 `.env.example` 对应字段。
2. 在 SQL Editor 按顺序执行 `supabase/migrations/202611200001_storage.sql`、`supabase/migrations/20261120085234_app.sql`。
3. Auth 启用 Email 和邮箱确认，关闭匿名登录。Site URL 设为 `http://localhost:3000`，Redirect URL 加入 `http://localhost:3000/auth/callback`。
4. 将自己的邮箱放入 `APP_OWNER_EMAILS`，首次在登录页设置密码并验证邮箱。多个白名单账号按 UID 隔离数据。
5. 配置 KIE API key 后即可本地生成。正式部署时更新 APP_URL、Auth URL 和邮件服务。

## Storage

- Bucket `project-assets` 为 private，最大 50 MiB，允许 PNG/JPEG/WebP。应用服务端额外限制参考图 10 MiB，检查实际图片格式与完整性。
- authenticated 仅能读取自身 UID 目录；业务迁移移除客户端 INSERT，上传、覆盖和清理统一由鉴权服务端处理。
- 首页临时图路径 `{uid}/staging/{uuid}`，生成结果路径 `{uid}/{projectId}/generated/{generationId}-{ordinal}.{extension}`。
- 传给 KIE 的参考图使用有限期签名 URL，客户端传资产 ID 而非任意 URL；历史有效资产不会自动删除。

## 业务表和权限

五张表：`projects`、`assets`、`generations`、`generation_outputs`、`canvas_nodes`。均启用 owner RLS。客户端仅有受限 SELECT，写入与四个原子 RPC 仅服务端可执行。

本地数据库测试覆盖幂等、并发限制、跨用户关联、保存版本冲突、同步锁和 RPC 权限。实际部署的 15 项权限测试已通过：其他用户/匿名读取隔离、禁止直接写表/上传及 RPC、私有资产不能被其他用户签名。

## 已有本地部署的迁移记录

当前开发环境的两份 SQL 已手动应用，未登记 Supabase CLI 迁移历史。后续用 CLI 管理该既有环境时，先核验实际结构并对齐历史，勿直接重复 `db push`。新建环境可按上述顺序初始化。

配置与端到端结果见 [验收记录](../verification.md)，运行边界见 [开发说明](../development.md)。
