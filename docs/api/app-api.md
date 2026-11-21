# 应用接口契约

所有业务请求使用 Supabase SSR Cookie，会话经 `getUser()` 验证、邮箱必须已确认且位于服务端 `APP_OWNER_EMAILS`。写请求同时校验 Origin 与 `APP_URL` 一致。浏览器不提交 owner_id、上游 taskId 或任意参考图 URL。

## 统一响应

成功返回 JSON；失败为 `{ "error": "可展示的中文提示" }`。

- 400：请求格式或参数无效。
- 401：未登录/会话失效，客户端转到登录页，保留站内回跳地址。
- 403：非授权邮箱或跨站写入。
- 404：项目/素材/任务不存在或无权访问，不区分两者。
- 409：并发任务、幂等输入冲突、画布版本冲突。
- 413：上传过大。
- 503：上游或存储暂不可用。

## 认证

| 接口 | 输入 | 行为 |
| --- | --- | --- |
| POST `/api/auth/login` | email、password、action=`login` 或 `signup`、next（可选） | 仅白名单；signup 创建需邮箱确认的个人账户，login 返回 redirect |
| GET `/auth/callback?code=...` | Supabase PKCE code | 交换会话并复查白名单，拒绝外站回跳 |
| POST `/api/auth/logout` | 无 | 注销会话 |

## 项目

| 接口 | 输入 | 输出 |
| --- | --- | --- |
| GET `/api/projects?offset=0&limit=20` | limit 支持 4（首页）或 20 | projects、hasMore；按 updated_at/id 倒序 |
| POST `/api/projects` | id（客户端 UUID） | projectId；同 UUID 重试不会重复创建 |
| GET `/api/projects/{id}` | 项目 UUID | project、generations、nodes、assets（签名地址映射） |
| PATCH `/api/projects/{id}` | name，去空白后 1–120 字 | name |
| PUT `/api/projects/{id}/canvas` | revision、nodes=[{id,x,y}]、viewport={x,y,zoom}、settings={nano?,gpt?} | 新 revision；版本不匹配返回 409 |

## 图片

- POST `/api/assets`：multipart，单个 file，projectId 可选。服务端流式读取限额、实际图片格式解码，最大 10 MiB，仅静态 PNG/JPEG/WebP。返回 `{asset}`。
- GET `/api/assets/{id}`：重新签名，返回 `{asset}`。签名默认一小时，不作为持久 URL 保存。
- GET `/api/assets/{id}?download=1`：验证归属后跳转至带下载参数的短期签名地址。
- POST `/api/assets/cleanup`：清理当前用户超过 24 小时且未绑定项目/历史的临时上传。先按条件删除无引用 DB 行，外键防并发引用；失败的对象删除由后续 orphan 扫描恢复。首页每小时最多触发一次，离线期间不承诺定时执行。

## 生成

POST `/api/generations`：

```json
{
  "projectId": "uuid",
  "requestKey": "uuid",
  "prompt": "白色背景上的蓝色陶瓷杯",
  "model": "nano",
  "resolution": "1K",
  "ratio": "1:1",
  "referenceAssetId": "optional-uuid",
  "newProject": false
}
```

GPT 1K 可额外传 background=`auto|opaque|transparent`。不支持 quality、n 或多张参考图。newProject=true 在数据库事务中创建首页项目及生成记录。返回 projectId、generationId、status。

- requestKey 按用户唯一，相同输入重复请求返回原任务；改变输入时拒绝复用同 key。
- 每用户最多一个活跃任务，数据库原子锁与部分唯一索引共同约束。
- KIE createTask 不自动重试。上游响应不明进入 submission_unknown，保留并发占用，须人工核实，不盲目再生成。
- POST `/api/generations/{id}/sync`：认领同步锁，查询可信上游状态并搬运结果；客户端只触发本应用接口，不直接访问 KIE。
- 已 success 的结果搬运失败保留 persisting/error，重试只下载保存，不再次 createTask。
- 浏览器关闭后保留任务；再次打开后恢复查询。本地版不需要公网 Webhook。

## 数据访问

浏览器只有表级/列级 SELECT + owner RLS，业务写入只能通过已鉴权的服务端。RPC 仅授予 service_role，使用 security invoker 和空 search_path。Storage 私有，客户端只允许读取自己 UID 目录；上传由服务端控制。结果下载拒绝内网、非 HTTPS、超限响应及无效图片；重定向再次校验，TLS 连接固定已校验 IP。

## Pi Agent 扩展

- `POST /api/projects/:id/agent`：`{requestKey,prompt,attachmentIds}`，UUID 幂等键、最多20个有序当前项目附件。返回安全的运行摘要，后台执行 Pi 循环；完整模型 transcript 不返回浏览器。
- `GET /api/projects/:id/agent`：当前项目会话历史。加 `?stream=1` 返回 SSE，`data` 为 `{runs}` 持久快照；断线可重连，保留已有事件。
- `POST /api/assets`：现有 multipart 接口新增 `.md/.markdown`，必须指定项目；UTF-8、非空、最大256KiB。图片仍按原10MiB上限和实际像素验证。
- `GET /api/assets/:id?preview=1`：Markdown 返回 text/plain、nosniff、CSP sandbox；图片跳转私有签名预览。`?download=1` 保留原文件名下载。
- `POST /api/projects/:id/canvas`：`{assetId,nodeId,x?,y?}`，把本项目已有图片放入画布；nodeId 重复请求幂等。
- `PUT /api/projects/:id/canvas`：节点快照新增 width/height；删除快照中缺失的成图节点，保留素材。revision 校验与等比约束由事务执行。
- `POST /api/generations`：新增 `model=gpt25` 的项目内重新生成契约，`referenceAssetIds` 为有序数组；有图走 Flare 图生图并传 input_urls，无图走文生图。旧 nano/gpt 契约保持不变。

所有接口复用认证和 owner/project 归属检查；写接口保留同源检查。仅服务端持有 Kimi、KIE 与 Supabase secret key。
