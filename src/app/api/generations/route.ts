import {
  requireOwner,
  assertSameOrigin,
  errorResponse,
  AppError,
} from "@/lib/auth";
import { generationSchema } from "@/lib/models";
import { submitGeneration } from "@/lib/generations";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireOwner();
    const raw = await request.json();
    const newProject = raw.newProject === true;
    const { newProject: ignored, ...input } = raw;
    void ignored;
    const parsed = generationSchema.safeParse(input);
    if (!parsed.success)
      throw new AppError(400, parsed.error.issues[0]?.message || "参数无效");
    return Response.json(
      await submitGeneration(user.id, parsed.data, newProject),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
