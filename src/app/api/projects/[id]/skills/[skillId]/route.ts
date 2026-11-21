import {
  requireOwner,
  assertSameOrigin,
  errorResponse,
  AppError,
} from "@/lib/auth";
import { ownedProject } from "@/lib/projects";
import { adminClient } from "@/lib/supabase/admin";
import { z } from "zod";
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; skillId: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireOwner();
    const { id, skillId } = await params;
    z.uuid().parse(skillId);
    await ownedProject(user.id, id);
    const { data, error } = await adminClient()
      .from("project_skills")
      .delete()
      .eq("id", skillId)
      .eq("owner_id", user.id)
      .eq("project_id", id)
      .select("id");
    if (error) throw new AppError(503, "移除技能失败");
    if (!data?.length) throw new AppError(404, "技能不存在");
    return Response.json({ removed: true });
  } catch (e) {
    return errorResponse(e);
  }
}
