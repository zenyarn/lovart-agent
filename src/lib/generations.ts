import "server-only";
import { adminClient } from "./supabase/admin";
import { AppError } from "./auth";
import { signedAsset, bucket } from "./assets";
import { createTask, queryTask, ProviderRejection } from "./kie-client";
import { toKieInput, type GenerationInput } from "./models";
import { downloadImage } from "./download";
import { inspectImage, OUTPUT_LIMIT } from "./image-validation";

function key() {
  if (!process.env.KIE_API_KEY) throw new AppError(503, "生图服务未配置");
  return process.env.KIE_API_KEY;
}
export async function submitGeneration(
  owner: string,
  input: GenerationInput,
  newProject = false,
) {
  const apiKey = key(),
    client = adminClient();
  const reference = input.referenceAssetId
    ? await signedAsset(owner, input.referenceAssetId)
    : undefined;
  if (
    reference &&
    reference.project_id &&
    reference.project_id !== input.projectId
  )
    throw new AppError(400, "参考图不属于当前项目");
  const config = {
    resolution: input.resolution,
    ratio: input.ratio,
    ...(input.background ? { background: input.background } : {}),
  };
  const { data, error } = await client.rpc("begin_generation", {
    p_owner: owner,
    p_project: input.projectId,
    p_request: input.requestKey,
    p_prompt: input.prompt,
    p_model: input.model,
    p_config: config,
    p_reference: input.referenceAssetId || null,
    p_new_project: newProject,
  });
  if (error) {
    const reason = error.message;
    throw new AppError(
      reason.includes("ACTIVE_GENERATION") ||
        reason.includes("IDEMPOTENCY_CONFLICT")
        ? 409
        : 400,
      reason.includes("ACTIVE_GENERATION")
        ? "已有任务处理中，请等待完成或核实待确认任务"
        : reason.includes("IDEMPOTENCY_CONFLICT")
          ? "该请求已受理，不能修改后重复提交"
          : "无法创建生成任务",
    );
  }
  const generation = data.generation;
  if (!data.is_new)
    return {
      projectId: input.projectId,
      generationId: generation.id,
      status: generation.status,
    };
  try {
    const taskId = await createTask(apiKey, toKieInput(input, reference?.url));
    const { error: saveError } = await client
      .from("generations")
      .update({
        provider_task_id: taskId,
        status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", generation.id)
      .eq("owner_id", owner);
    if (saveError) {
      // Retrying persistence is safe; never retry the charged provider request.
      const { error: retryError } = await client
        .from("generations")
        .update({
          provider_task_id: taskId,
          status: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", generation.id)
        .eq("owner_id", owner);
      if (retryError) throw new Error("任务标识保存失败");
    }
    return {
      projectId: input.projectId,
      generationId: generation.id,
      status: "pending",
    };
  } catch (error) {
    const status =
      error instanceof ProviderRejection ? "failed" : "submission_unknown";
    await client
      .from("generations")
      .update({
        status,
        error:
          status === "failed"
            ? "上游拒绝生成请求，请检查额度或参数"
            : "上游受理结果待核实，请勿重复提交",
        updated_at: new Date().toISOString(),
      })
      .eq("id", generation.id)
      .eq("owner_id", owner);
    return { projectId: input.projectId, generationId: generation.id, status };
  }
}
export async function syncGeneration(owner: string, id: string) {
  const client = adminClient();
  const { data: g, error } = await client
    .from("generations")
    .select("*")
    .eq("id", id)
    .eq("owner_id", owner)
    .maybeSingle();
  if (error || !g) throw new AppError(404, "任务不存在或无权访问");
  if (
    g.status === "submitting" &&
    Date.now() - Date.parse(g.created_at) > 120000
  ) {
    await client
      .from("generations")
      .update({
        status: "submission_unknown",
        error: "受理结果待核实，请勿重复提交",
      })
      .eq("id", id)
      .eq("status", "submitting");
    return;
  }
  if (!["pending", "running", "persisting"].includes(g.status)) return;
  const token = crypto.randomUUID();
  const { data: claimed, error: claimError } = await client.rpc(
    "claim_generation_sync",
    { p_owner: owner, p_generation: id, p_token: token },
  );
  if (claimError) throw new AppError(503, "状态同步暂时不可用");
  if (!claimed) return;
  let persisting = g.status === "persisting";
  try {
    let urls: string[] = g.result_urls || [];
    if (!persisting) {
      const result = await queryTask(key(), g.provider_task_id);
      if (result.state === "fail") {
        await client
          .from("generations")
          .update({
            status: "failed",
            provider_state: result.state,
            error: "上游生成失败，可手动重新生成",
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("sync_token", token);
        return;
      }
      if (result.state !== "success") {
        await client
          .from("generations")
          .update({
            status: result.state === "generating" ? "running" : "pending",
            provider_state: result.state,
            error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("sync_token", token);
        return;
      }
      urls = result.urls;
      const { error: saveError } = await client
        .from("generations")
        .update({
          status: "persisting",
          provider_state: "success",
          result_urls: urls,
          credits: result.creditsConsumed,
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("sync_token", token);
      if (saveError) throw saveError;
      persisting = true;
    }
    const outputs = [];
    for (let ordinal = 0; ordinal < urls.length; ordinal++) {
      const bytes = await downloadImage(urls[ordinal]),
        meta = await inspectImage(bytes, OUTPUT_LIMIT);
      const path = `${owner}/${g.project_id}/generated/${id}-${ordinal}.${meta.extension}`;
      const { error: uploadError } = await client.storage
        .from(bucket())
        .upload(path, bytes, { contentType: meta.mime, upsert: true });
      if (uploadError) throw uploadError;
      outputs.push({
        id: crypto.randomUUID(),
        bucket: bucket(),
        object_path: path,
        mime: meta.mime,
        width: meta.width,
        height: meta.height,
        bytes: meta.bytes,
      });
    }
    const { data: completed, error: completeError } = await client.rpc(
      "complete_generation",
      { p_owner: owner, p_generation: id, p_token: token, p_outputs: outputs },
    );
    if (completeError || !completed) throw new Error("结果入库失败");
  } catch {
    await client
      .from("generations")
      .update({
        error: persisting
          ? "结果保存失败，请重试保存（不会再次生图）"
          : "状态查询暂时失败，正在等待重试",
      })
      .eq("id", id)
      .eq("sync_token", token);
  } finally {
    await client
      .from("generations")
      .update({ sync_token: null, sync_until: null })
      .eq("id", id)
      .eq("sync_token", token);
  }
}
