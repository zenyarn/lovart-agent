import {
  requireOwner,
  assertSameOrigin,
  errorResponse,
  AppError,
} from "@/lib/auth";
import { listProjects } from "@/lib/projects";
import { adminClient } from "@/lib/supabase/admin";
import { z } from "zod";
export async function GET(request: Request) {
  try {
    const user = await requireOwner(),
      url = new URL(request.url),
      offset = Math.max(0, Number(url.searchParams.get("offset")) || 0),
      limit = url.searchParams.get("limit") === "4" ? 4 : 20;
    return Response.json(
      await listProjects(user.id, Math.floor(offset), limit),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireOwner();
    const { id } = z
      .object({ id: z.uuid() })
      .strict()
      .parse(await request.json());
    const client = adminClient();
    const { error } = await client
      .from("projects")
      .upsert(
        { id, owner_id: user.id },
        { onConflict: "id", ignoreDuplicates: true },
      );
    if (error) throw new AppError(503, "创建项目失败");
    const { data } = await client
      .from("projects")
      .select("id")
      .eq("id", id)
      .eq("owner_id", user.id)
      .single();
    if (!data) throw new AppError(409, "项目标识冲突");
    return Response.json({ projectId: id });
  } catch (error) {
    return errorResponse(error);
  }
}
