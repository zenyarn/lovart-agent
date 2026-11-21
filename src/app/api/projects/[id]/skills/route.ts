import {
  requireOwner,
  assertSameOrigin,
  errorResponse,
  AppError,
} from "@/lib/auth";
import { ownedProject } from "@/lib/projects";
import { adminClient } from "@/lib/supabase/admin";
import { parseSkill, SKILL_LIMIT } from "@/lib/skills-parser";
import { readLimitedBody } from "@/lib/request-body";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, { params }: Context) {
  try {
    const user = await requireOwner();
    const { id } = await params;
    await ownedProject(user.id, id);
    const { data, error } = await adminClient()
      .from("project_skills")
      .select("id,name,description")
      .eq("owner_id", user.id)
      .eq("project_id", id)
      .order("name");
    if (error) throw new AppError(503, "技能列表加载失败");
    return Response.json(
      { skills: data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireOwner();
    const { id } = await params;
    await ownedProject(user.id, id);
    let parsed;
    try {
      parsed = parseSkill(await readLimitedBody(request.body, SKILL_LIMIT));
    } catch (e) {
      throw new AppError(400, e instanceof Error ? e.message : "SKILL.md 无效");
    }
    const { data, error } = await adminClient()
      .from("project_skills")
      .insert({ owner_id: user.id, project_id: id, ...parsed })
      .select("id,name,description")
      .single();
    if (error)
      throw new AppError(
        error.code === "23505" ? 409 : 503,
        error.code === "23505"
          ? "已有同名技能，请移除旧版后上传"
          : "技能保存失败",
      );
    return Response.json({ skill: data }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
