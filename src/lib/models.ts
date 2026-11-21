import { z } from "zod";

export type Model = "nano" | "gpt";
export type Resolution = "1K" | "2K" | "4K";
export const nanoRatios = [
  "8:1",
  "4:1",
  "21:9",
  "16:9",
  "3:2",
  "4:3",
  "5:4",
  "1:1",
  "4:5",
  "3:4",
  "2:3",
  "9:16",
  "1:4",
  "1:8",
  "auto",
];
const gptRatios = [
  "auto",
  "1:1",
  "3:2",
  "2:3",
  "4:3",
  "3:4",
  "5:4",
  "4:5",
  "16:9",
  "9:16",
  "2:1",
  "1:2",
  "3:1",
  "1:3",
  "21:9",
  "9:21",
];
export function allowedRatios(model: Model, resolution: Resolution): string[] {
  if (model === "nano") return nanoRatios;
  const excluded =
    resolution === "2K"
      ? ["5:4", "4:5", "3:1", "1:3", "9:21"]
      : resolution === "4K"
        ? ["3:1", "1:3", "9:21"]
        : [];
  return gptRatios.filter((r) => !excluded.includes(r));
}
export const generationSchema = z
  .object({
    projectId: z.uuid(),
    requestKey: z.uuid(),
    prompt: z.string().trim().min(1).max(20000),
    model: z.enum(["nano", "gpt"]),
    resolution: z.enum(["1K", "2K", "4K"]),
    ratio: z.string(),
    background: z.enum(["auto", "opaque", "transparent"]).optional(),
    referenceAssetId: z.uuid().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!allowedRatios(value.model, value.resolution).includes(value.ratio))
      ctx.addIssue({
        code: "custom",
        path: ["ratio"],
        message: "当前模型与分辨率不支持该比例",
      });
    if (
      value.background &&
      (value.model !== "gpt" || value.resolution !== "1K")
    )
      ctx.addIssue({
        code: "custom",
        path: ["background"],
        message: "仅 GPT Image2 1K 支持背景配置",
      });
  });
export type GenerationInput = z.infer<typeof generationSchema>;
export const agentRatios = [
  "auto",
  "1:1",
  "3:2",
  "2:3",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "27:16",
  "16:27",
  "9:8",
  "8:9",
] as const;
export const agentGenerationSchema = z
  .object({
    projectId: z.uuid(),
    requestKey: z.uuid(),
    prompt: z.string().trim().min(1).max(20000),
    model: z.literal("gpt25"),
    resolution: z.enum(["1K", "2K", "4K"]),
    ratio: z.enum(agentRatios),
    referenceAssetIds: z.array(z.uuid()).max(16).default([]),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.referenceAssetIds).size !== v.referenceAssetIds.length)
      ctx.addIssue({
        code: "custom",
        path: ["referenceAssetIds"],
        message: "参考图不能重复",
      });
    if (
      v.resolution !== "1K" &&
      ["27:16", "16:27", "9:8", "8:9"].includes(v.ratio)
    )
      ctx.addIssue({
        code: "custom",
        path: ["ratio"],
        message: "该比例仅支持 1K",
      });
  });
export type AgentGenerationInput = z.infer<typeof agentGenerationSchema>;
export function toKieInput(
  value: GenerationInput | AgentGenerationInput,
  referenceUrls?: string | string[],
) {
  const urls =
    typeof referenceUrls === "string" ? [referenceUrls] : referenceUrls || [];
  if (value.model === "gpt25")
    return {
      model: urls.length
        ? "gpt-image-2-5-flare-image-to-image"
        : "gpt-image-2-5-flare-text-to-image",
      input: {
        prompt: value.prompt,
        aspect_ratio: value.ratio,
        resolution: value.resolution,
        ...(urls.length ? { input_urls: urls } : {}),
      } as Record<string, unknown>,
    };
  const referenceUrl = urls[0];
  const input: Record<string, unknown> = {
    prompt: value.prompt,
    aspect_ratio: value.ratio,
    resolution: value.resolution,
  };
  if (value.model === "nano") {
    input.output_format = "png";
    if (referenceUrl) input.image_input = [referenceUrl];
    return { model: "nano-banana-2", input };
  }
  if (referenceUrl) input.input_urls = [referenceUrl];
  if (value.resolution === "1K" && value.background)
    input.background = value.background;
  return {
    model: referenceUrl
      ? "gpt-image-2-image-to-image"
      : "gpt-image-2-text-to-image",
    input,
  };
}
