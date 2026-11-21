import "server-only";
import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import sharp from "sharp";
import { adminClient } from "../supabase/admin";
import { projectAsset, readAssetBytes } from "../assets";
import { ownedProject } from "../projects";
import { agentGenerationSchema, agentRatios } from "../models";
import { submitGeneration, syncGeneration } from "../generations";
const result = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
  details: value,
});
export function createCanvasTools(owner: string, project: string) {
  const seen = new Set<string>();
  let generations = 0;
  let unresolvedGeneration = false;
  const tools: AgentTool[] = [
    {
      name: "list_assets",
      label: "列出素材",
      description:
        "列出当前项目素材。图片须调用 view_image 真正查看后才能作参考图。",
      parameters: Type.Object({}),
      execute: async () => {
        await ownedProject(owner, project);
        const { data, error } = await adminClient()
          .from("assets")
          .select("id,name,mime,width,height")
          .eq("owner_id", owner)
          .eq("project_id", project)
          .order("created_at");
        if (error) throw Error("素材列表读取失败");
        return result(data);
      },
    },
    {
      name: "view_image",
      label: "查看图片",
      description: "读取真实图片像素供视觉理解。必须先查看所有拟用参考图。",
      parameters: Type.Object({ assetId: Type.String({ format: "uuid" }) }),
      execute: async (_id, args) => {
        const { assetId } = args as { assetId: string };
        const { asset, bytes } = await readAssetBytes(owner, project, assetId);
        if (!asset.mime.startsWith("image/")) throw Error("该素材不是图片");
        const image = await sharp(bytes)
          .resize({
            width: 1600,
            height: 1600,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 80 })
          .toBuffer();
        seen.add(assetId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                assetId,
                width: asset.width,
                height: asset.height,
              }),
            },
            {
              type: "image",
              data: image.toString("base64"),
              mimeType: "image/jpeg",
            },
          ],
          details: { assetId, width: asset.width, height: asset.height },
        };
      },
    },
    {
      name: "read_canvas",
      label: "读取画布",
      description: "查看画布图片节点、位置、尺寸和素材 ID。",
      parameters: Type.Object({}),
      execute: async () => {
        await ownedProject(owner, project);
        const { data, error } = await adminClient()
          .from("canvas_nodes")
          .select("id,asset_id,x,y,width,height")
          .eq("owner_id", owner)
          .eq("project_id", project);
        if (error) throw Error("画布读取失败");
        return result(data);
      },
    },
    {
      name: "place_on_canvas",
      label: "放入画布",
      description:
        "将当前项目已有图片放入画布。生成结果已自动入画布，不要重复放置。",
      parameters: Type.Object({
        assetId: Type.String({ format: "uuid" }),
        x: Type.Optional(Type.Number({ minimum: -1e7, maximum: 1e7 })),
        y: Type.Optional(Type.Number({ minimum: -1e7, maximum: 1e7 })),
      }),
      execute: async (_id, args) => {
        const v = args as { assetId: string; x?: number; y?: number };
        await projectAsset(owner, project, v.assetId);
        const { data, error } = await adminClient().rpc("place_canvas_asset", {
          p_owner: owner,
          p_project: project,
          p_asset: v.assetId,
          p_node: crypto.randomUUID(),
          p_x: v.x ?? null,
          p_y: v.y ?? 0,
        });
        if (error) throw Error("放入画布失败");
        return result(data);
      },
    },
    {
      name: "generate_image",
      label: "生成图片",
      description:
        "使用 GPT Image 2.5 Flare 生成一张图片并保存到素材库与画布。referenceAssetIds 顺序对应图一图二，必须先 view_image。一次请求最多四张。状态未知时不得重提。",
      parameters: Type.Object({
        prompt: Type.String({ minLength: 1, maxLength: 20000 }),
        referenceAssetIds: Type.Array(Type.String({ format: "uuid" }), {
          maxItems: 16,
        }),
        ratio: Type.Union(agentRatios.map((r) => Type.Literal(r))),
        resolution: Type.Union([
          Type.Literal("1K"),
          Type.Literal("2K"),
          Type.Literal("4K"),
        ]),
      }),
      execute: async (_call, args, signal) => {
        if (unresolvedGeneration)
          throw Error("已有生图任务尚未确认，请先查看生成记录，不可重复提交");
        if (generations >= 4)
          throw Error("本轮最多生成四张图片，请在下一条消息中继续");
        const input = agentGenerationSchema.parse({
          ...(args as Record<string, unknown>),
          projectId: project,
          requestKey: crypto.randomUUID(),
          model: "gpt25",
        });
        if (input.referenceAssetIds.some((id) => !seen.has(id)))
          throw Error("请先使用 view_image 查看每一张参考图");
        signal?.throwIfAborted();
        generations++;
        const accepted = await submitGeneration(owner, input);
        const deadline = Date.now() + 7 * 60 * 1000;
        while (Date.now() < deadline) {
          signal?.throwIfAborted();
          await syncGeneration(owner, accepted.generationId);
          const { data: g, error } = await adminClient()
            .from("generations")
            .select("id,status,error")
            .eq("id", accepted.generationId)
            .eq("owner_id", owner)
            .eq("project_id", project)
            .single();
          if (error) throw Error("任务状态读取失败，不要重复提交");
          if (g.status === "succeeded") {
            const { data: outputs, error: oe } = await adminClient()
              .from("generation_outputs")
              .select("asset_id,ordinal")
              .eq("generation_id", g.id)
              .eq("owner_id", owner)
              .order("ordinal");
            if (oe) throw Error("已生成，但结果记录读取失败");
            return result({ generationId: g.id, status: g.status, outputs });
          }
          if (["failed", "submission_unknown"].includes(g.status)) {
            unresolvedGeneration = g.status === "submission_unknown";
            return {
              ...result({
                generationId: g.id,
                status: g.status,
                error: g.error,
              }),
              isError: true,
            };
          }
          if (g.status === "persisting" && g.error) {
            unresolvedGeneration = true;
            return {
              ...result({
                generationId: g.id,
                status: g.status,
                error: g.error,
                instruction: "结果已生成，只能重试保存，不能再次生图",
              }),
              isError: true,
            };
          }
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
              signal?.removeEventListener("abort", abort);
              resolve();
            }, 2000);
            function abort() {
              clearTimeout(timer);
              reject(Error("运行已结束，已有生图任务可在画布继续查询"));
            }
            signal?.addEventListener("abort", abort, { once: true });
          });
        }
        unresolvedGeneration = true;
        return {
          ...result({
            generationId: accepted.generationId,
            status: "pending",
            instruction: "任务仍在处理，画布会继续查询，请勿重复生图",
          }),
          isError: true,
        };
      },
    },
  ];
  return tools;
}
