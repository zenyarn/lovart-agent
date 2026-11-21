import {
  requireOwner,
  assertSameOrigin,
  errorResponse,
  AppError,
} from "@/lib/auth";
import { generationSchema,agentGenerationSchema } from "@/lib/models";
import { submitGeneration } from "@/lib/generations";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireOwner();
    const raw = await request.json();
    const newProject = raw.newProject === true;
    const { newProject: ignored, ...input } = raw;
    void ignored;
    const parsed = input.model==='gpt25'?agentGenerationSchema.safeParse(input):generationSchema.safeParse(input);
    if(input.model==='gpt25'&&newProject)throw new AppError(400,'请在现有项目中重新生成');
    if (!parsed.success)
      throw new AppError(400, parsed.error.issues[0]?.message || "参数无效");
    return Response.json(
      await submitGeneration(user.id, parsed.data, newProject),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
