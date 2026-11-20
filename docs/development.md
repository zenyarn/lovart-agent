# 本地运行与维护

## 启动

```bash
pnpm install
cp .env.example .env  # 仅首次；已有真实配置时不要覆盖
pnpm dev
```

打开 http://localhost:3000 。本地项目已填好运行配置，真实 `.env` 不提交 Git。

- `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`：公开配置。
- `SUPABASE_SECRET_KEY`、`KIE_API_KEY`：仅服务端秘密。
- `APP_OWNER_EMAILS`：英文逗号分隔的准入邮箱；为空时拒绝业务访问。
- `SUPABASE_STORAGE_BUCKET=project-assets`：私有桶。
- `APP_URL=http://localhost:3000`：必须与浏览器访问 Origin 一致。
- `KIE_WEBHOOK_HMAC_KEY`：当前本地轮询模式不需要。

首次在登录页设置个人密码，完成邮件确认后登录。不得向开发助手或日志提供密码、会话 Cookie、验证码。两个账号的数据独立隔离。

## 检查命令

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm start
```

`pnpm dev` 与 `pnpm start` 不应同时占用 3000 端口。项目固定 pnpm 与依赖版本；TypeScript 使用 6.0.3，以兼容当前 ESLint。esbuild 的已知构建脚本在 `pnpm-workspace.yaml` 中明确允许。

## 数据库迁移注意

当前两份 SQL 已通过 Dashboard 执行，未登记 Supabase CLI 迁移历史。不要直接 `db push` 重复应用。首次使用 CLI 管理远端时，先核验远端结构并对齐 migration history；历史修复只登记已确认应用的版本。新建独立环境时按顺序应用 Storage 基线和业务迁移。

## 任务与故障恢复

- 查询失败：前端稍后重试，不重新提交。
- “结果保存失败”：点击重试保存，使用已成功任务的结果，避免重复收费。
- “待核实”：检查 KIE 控制台创建时间、提示词与 taskId。只有确认没有收费任务时，才通过受控运维把该 generation 标记 failed；如果找到了对应 taskId，将其绑定并改为 pending 后恢复同步。不要把待核实自动变失败。
- 保存冲突：本地位置草稿保留在对应 projectId 的 localStorage 中；刷新加载服务器版本，避免覆盖其他标签页结果。历史生成图片不会被自动删除。
- TUN 网络：下载器对 Fake-IP 域名使用固定 HTTPS DNS 查询公网地址并固定连接，不关闭私网保护。若网络仍不可达，保留错误并重试保存。
- 临时上传清理由首页请求触发，离线不运行；超过 24 小时且无项目/历史引用才可清理。

## 上线边界

当前按个人本地版运行。上线前还需确定域名/平台、配置 Supabase Auth Site URL 与 redirect、SMTP、服务端运行时长和定时补查。公网 Webhook 属于部署阶段工作，不能直接信任回调 body，需要验签后重新查询上游。不要把当前本地轮询描述为全天候后台队列。

## 进度与提交

查看 [进度看板](progress.md)，每阶段更新验证结果与提交。API 契约见 [app-api.md](api/app-api.md)。

## 浏览器验收

先运行本地服务，确保 `.env` 已配置且至少一个白名单账号完成邮箱验证。在 Chrome 已安装的机器执行：

```bash
E2E_PROJECT_ID=<单张成功图片的联调项目UUID> pnpm test:e2e
```

未指定 E2E_PROJECT_ID 时，读取本机忽略文件 `.local/integration-state.json` 中的 projectId。该测试依赖真实 Supabase，不能在缺少环境配置的 CI 中视为纯单元测试。测试以已确认白名单账号创建独立、内存中的短期会话，不发送邮件、不修改密码，结束只注销测试会话。会改变指定测试项目的配置、节点位置；请选择联调项目。测试不点击生图发送按钮，不产生 KIE 费用。截图写入 docs/images/setup/app-*.png，失败证据写入忽略的 .local/playwright-results。

依赖安装后若开发服务器持续热更新或报 Next 包路径失效，请停止旧进程并重新 pnpm dev；不要与 pnpm install 同时验收页面。
