# KIE API 实测记录

测试日期：2026-11-20。用户授权真实调用，配置均为 1K、1:1，每个场景仅提交一次。

| 场景 | 状态 | 上游 costTime | creditsConsumed | taskId |
| --- | --- | --- | --- | --- |
| Nano Banana 2 文生图 | success | 15 | 8.0 | `45d0028aef661f2dd9df6d0134215132` |
| GPT Image2 文生图 | success | 61 | 6.0 | `7a48226e670e50d438205085ca32dd6d` |
| GPT Image2 图生图 | success | 72 | 6.0 | `61d73269bd24b7c5bc2c9d7a83ea2d95` |

总计 20 KIE credits（按任务结果字段统计，不换算货币）。三张图片均成功下载并人工视觉检查：文生图为白底蓝杯，图生图将 GPT 生成的蓝杯变为红杯，保留构图。

一次状态查询遇到网络超时，随后仅恢复原 taskId 查询，没有重复提交。尝试本地 7890 代理时连接被拒绝，恢复直接网络后成功。

Supabase `/auth/v1/settings` 和服务端 `/storage/v1/bucket/project-assets` 均返回 HTTP 200，Bucket 为 private。尚未测试实际用户登录与完整应用链路。

原始请求响应与图片保存在 Git 忽略的 `.local/kie-smoke/`，不在文档中暴露密钥或临时远程 URL。Nano Banana 2 有参考图、2K/4K 和回调模式未测试，本轮不据此推断这些场景已通过。

## 应用阶段补充测试

2026-11-20 18:02：为验证 KIE 可读取私有 Bucket 的签名参考图，新增一次 Nano Banana 2、1K、1:1 图生图任务，通过真实首页 UI 提交，成功生成绿色杯子并搬运回私有 Storage。项目 `0f454621-a951-4a90-8a47-fc1de066fb98`，生成记录 `6b12f967-9f6f-47fd-b3c8-dcdde1a3672a`，消耗 **8 credits**。原三任务 20 credits + 本次 8 credits = **累计 28 credits**。没有自动重提。截图见 [应用完成态](../images/setup/app-live-done.png)。
