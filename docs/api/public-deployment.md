# 公开注册与 Vercel 上线

当前功能分支：`feat/pi-agent-skills`。公开上线尚未完成，不能将本地构建成功等同于公网验收成功。

## 注册邮件：Resend + Supabase

1. 准备自己拥有、可以管理 DNS 的域名；没有域名时先自行购买。Vercel 默认的 `*.vercel.app` 地址可以用于网站，但不能拿来验证发信域名。
2. 在 [Resend](https://resend.com/) 注册并进入 Domains，添加用于发信的域名或子域名，例如 `auth.example.com`。
3. 到域名服务商的 DNS 管理中，按 Resend 页面给出的主机名、类型和值添加验证记录；等待 Resend 显示 Verified。不要删除原有邮箱的 DNS 记录。
4. 在 Resend 创建仅用于本项目发信的 API Key，保存到密码管理器，不发到聊天、不提交 Git。
5. 进入本项目 Supabase → Authentication → Email → SMTP Settings，启用自定义 SMTP，填写：

| 项目 | 值 |
| --- | --- |
| Sender name | Lovart Agent |
| Sender email | `noreply@auth.example.com`，替换成实际已验证域名 |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | 刚创建的 Resend API Key |

6. 保存，保持邮箱确认开启。正式部署后将 Supabase 的 Site URL 设置为正式 HTTPS 网址，Redirect URLs 添加同一网址的 `/auth/callback`；Vercel 环境变量 `APP_URL` 也必须一致。
7. 用自己控制的、非 Supabase 团队成员邮箱注册，确认收到邮件、链接可以回到网站，首次余额为 5，重新登录不会再次赠送。

SMTP 密钥只需保存在 Supabase，不必放入前端或 Vercel。不要使用 Resend 测试发件域名作为公开注册的正式发件人。发信额度与速率以服务商当前套餐为准。

官方说明：[Resend 与 Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp)、[域名验证](https://resend.com/docs/dashboard/domains/introduction)、[Supabase 正式邮件](https://supabase.com/docs/guides/auth/auth-smtp)。

## 积分迁移

`20261121070012_account_credits.sql` 增加账号余额、赠送/扣费/退款账本以及生成任务事务触发器。所有账号首次读取余额或首次提交新生图时获得一次性 5 分；历史生成不追溯扣费。用户只能读取自己账本，不能直接修改余额或调用赠送 RPC。

每个生成任务请求一张图片。新增任务时扣 1 分，重复请求复用已有任务；明确失败退 1 分一次。`submission_unknown` 和结果保存重试不退款，不重新提交上游任务。上游 KIE credits 与本站积分独立。

## Vercel 部署待办

网页端已验证当前工作区可访问且能发现 GitHub 仓库，插件工具仍未载入当前聊天。当前套餐为 Hobby，现有 Agent 路由 `maxDuration=900` 不适用于其 300 秒上限。须完成分段持久化执行/恢复方案及真实验收后部署，不能直接把上限改成 300 秒冒充修复。

部署还需安全注入 `.env.example` 中服务端配置，配置正式 `APP_URL` 和 Auth 回调，验证参考图/Markdown 上传大小限制、跨账号访问隔离、积分用尽、失败退款和多张图片的连续执行。确认这些条件前不标记上线完成。

## 2026-11-27 当前部署方式

用户已改为免邮件确认的邮箱+密码注册。关闭 Supabase Authentication / Sign In / Providers 的 Confirm email 后，新注册返回会话，应用直接跳转；无需先配置 SMTP。正式站点 URL 和回调白名单应对应部署域名，本地回调可保留。

- 2026-11-27 首次通过 Vercel CLI 发布功能分支；后续已按用户要求合并 main 并推送，Git 集成现在从 main 自动部署生产版本。
- 环境变量按 `.env.example` 注入生产环境；所有密钥保留在平台服务端。不要将 `.env` 或 `.local` 上传或提交。
- 同名附加临时桶 `${SUPABASE_STORAGE_BUCKET}-uploads`：private，fileSizeLimit=10485760，allowedMimeTypes=image/png,image/jpeg,image/webp；不授予客户端直接读写策略，使用服务端生成的定址签名上传票据。
- `/api/assets/direct` 发放票据并校验最终图片、用户路径和目标项目所有权。`/api/cron/uploads` 使用 CRON_SECRET，按 vercel.json 每日删除3小时前的暂存对象，正常完成即删除。
- Hobby 函数最大300秒，Agent在260秒独立保存中断状态。已提交生图任务可由原有同步接口收取结果；长批次尚不自动跨函数续跑。
- 没有 SMTP 时暂不提供邮件找回密码。免验证注册也不验证邮箱归属，5积分为每账号限制，不能阻止同一人重复注册。
