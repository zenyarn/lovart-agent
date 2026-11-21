import "server-only";
import { adminClient } from "../supabase/admin";
/** The runtime is bounded at 15 minutes; leave five minutes for delayed persistence. */
export async function expireAbandonedRuns(owner: string, project: string) {
  const { error } = await adminClient()
    .from("agent_runs")
    .update({
      status: "failed",
      error: "运行已中断。已提交的生图任务仍保留在画布，请确认结果后继续。",
      updated_at: new Date().toISOString(),
    })
    .eq("owner_id", owner)
    .eq("project_id", project)
    .eq("status", "running")
    .lt("updated_at", new Date(Date.now() - 20 * 60 * 1000).toISOString());
  if (error) throw Error("会话状态恢复失败");
}
