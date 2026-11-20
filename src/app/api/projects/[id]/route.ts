import {
  requireOwner,
  assertSameOrigin,
  errorResponse,
  AppError,
} from "@/lib/auth";
import { projectDetail, ownedProject } from "@/lib/projects";
import { adminClient } from "@/lib/supabase/admin";
import { z } from "zod";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireOwner(),
      { id } = await params;
    if (!z.uuid().safeParse(id).success)
      throw new AppError(404, "项目不存在或无权访问");
    return Response.json(await projectDetail(user.id, id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireOwner(),
      { id } = await params;
    await ownedProject(user.id, id);
    const { name } = z
      .object({ name: z.string().trim().min(1).max(120) })
      .strict()
      .parse(await request.json());
    const { error } = await adminClient()
      .from("projects")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner_id", user.id);
    if (error) throw new AppError(503, "重命名失败");
    return Response.json({ name });
  } catch (error) {
    return errorResponse(error);
  }
}
