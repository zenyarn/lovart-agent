import {
  requireOwner,
  assertSameOrigin,
  errorResponse,
  AppError,
} from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { z } from "zod";
const settings = z.object({
  model: z.enum(["nano", "gpt"]),
  resolution: z.enum(["1K", "2K", "4K"]),
  ratio: z.string().max(10),
  background: z.enum(["auto", "opaque", "transparent"]).optional(),
});
const schema = z.object({
  revision: z.number().int().nonnegative(),
  nodes: z
    .array(
      z.object({
        id: z.uuid(),
        x: z.number().min(-1e7).max(1e7),
        y: z.number().min(-1e7).max(1e7),
      }),
    )
    .max(10000),
  viewport: z.object({
    x: z.number().min(-1e7).max(1e7),
    y: z.number().min(-1e7).max(1e7),
    zoom: z.number().min(0.01).max(10),
  }),
  settings: z.partialRecord(z.enum(["nano", "gpt"]), settings),
});
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireOwner(),
      { id } = await params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new AppError(400, "画布数据无效");
    const v = parsed.data;
    const { data, error } = await adminClient().rpc("save_canvas", {
      p_owner: user.id,
      p_project: id,
      p_revision: v.revision,
      p_nodes: v.nodes,
      p_viewport: v.viewport,
      p_settings: v.settings,
    });
    if (error)
      throw new AppError(
        error.message.includes("REVISION_CONFLICT") ? 409 : 503,
        error.message.includes("REVISION_CONFLICT")
          ? "画布已在其他页面更新，请刷新后继续"
          : "画布保存失败",
      );
    return Response.json({ revision: data });
  } catch (error) {
    return errorResponse(error);
  }
}
