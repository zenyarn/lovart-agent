import {
  requireOwner,
  assertSameOrigin,
  errorResponse,
  AppError,
} from "@/lib/auth";
import { syncGeneration } from "@/lib/generations";
import { z } from "zod";
export const maxDuration = 180;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireOwner(),
      { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new AppError(404, "任务不存在");
    await syncGeneration(user.id, id);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
