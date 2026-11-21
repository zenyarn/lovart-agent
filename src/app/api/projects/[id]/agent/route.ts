import { agentEventStream } from "@/lib/agent/event-stream";
import { after } from "next/server";
import { z } from "zod";
import {
  requireOwner,
  assertSameOrigin,
  errorResponse,
  AppError,
} from "@/lib/auth";
import { ownedProject } from "@/lib/projects";
import { adminClient } from "@/lib/supabase/admin";
import { kimiConfiguration } from "@/lib/agent/config";
import { expireAbandonedRuns } from "@/lib/agent/recovery";
import { executeAgentRun } from "@/lib/agent/runtime";
import type { AgentRun } from "@/lib/agent/types";
export const runtime = "nodejs";
export const maxDuration = 900;
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireOwner();
    const { id } = await params;
    await ownedProject(user.id, id);
    await expireAbandonedRuns(user.id, id);
    let recoveredAt = Date.now();
    const load = async () => {
      if (Date.now() - recoveredAt > 60000) {
        await expireAbandonedRuns(user.id, id);
        recoveredAt = Date.now();
      }
      const { data, error } = await adminClient()
        .from("agent_runs")
        .select("id,prompt,attachment_ids,status,events,error,created_at")
        .eq("owner_id", user.id)
        .eq("project_id", id)
        .order("created_at");
      if (error) throw new AppError(503, "对话加载失败");
      return { runs: data };
    };
    if (new URL(request.url).searchParams.has("stream")) {
      return new Response(agentEventStream(load, request.signal), {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "private, no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    }
    const data = await load();
    return Response.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireOwner();
    const { id } = await params;
    await ownedProject(user.id, id);
    await expireAbandonedRuns(user.id, id);
    try {
      kimiConfiguration();
    } catch {
      throw new AppError(503, "Kimi 配置无效或缺失");
    }
    const v = z
      .object({
        requestKey: z.uuid(),
        prompt: z.string().trim().min(1).max(20000),
        attachmentIds: z
          .array(z.uuid())
          .max(20)
          .refine((ids) => new Set(ids).size === ids.length),
      })
      .strict()
      .parse(await request.json());
    const { data, error } = await adminClient().rpc("begin_agent_run", {
      p_owner: user.id,
      p_project: id,
      p_request: v.requestKey,
      p_prompt: v.prompt,
      p_attachments: v.attachmentIds,
    });
    if (error)
      throw new AppError(
        409,
        error.message.includes("ACTIVE_AGENT_RUN")
          ? "Agent 正在处理上一条消息"
          : "消息提交失败，请检查素材归属或重复请求",
      );
    if (data.is_new)
      after(() => executeAgentRun(user.id, id, data as AgentRun));
    const {
      id: runId,
      prompt,
      attachment_ids,
      status,
      events,
      error: runError,
      created_at,
    } = data;
    return Response.json({
      run: {
        id: runId,
        prompt,
        attachment_ids,
        status,
        events,
        error: runError,
        created_at,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
