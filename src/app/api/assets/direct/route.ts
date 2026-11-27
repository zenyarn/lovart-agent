import { z } from "zod";
import {
  requireOwner,
  assertSameOrigin,
  AppError,
  errorResponse,
} from "@/lib/auth";
import { uploadReference } from "@/lib/assets";
import { adminClient } from "@/lib/supabase/admin";
import { ownedProject } from "@/lib/projects";
import { REFERENCE_LIMIT } from "@/lib/image-validation";
import { uploadStagingBucket } from "@/lib/upload-staging";
export const maxDuration = 60;
const projectSchema = z.object({ projectId: z.uuid().optional() }).strict();
// Direct uploads bypass the function payload limit; promotion still validates
// actual bytes and project ownership on the server before creating an asset.
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireOwner();
    const { projectId } = projectSchema.parse(await request.json());
    if (projectId) await ownedProject(user.id, projectId);
    const path = `${user.id}/uploads/${crypto.randomUUID()}`;
    const { data, error } = await adminClient()
      .storage.from(uploadStagingBucket())
      .createSignedUploadUrl(path);
    if (error || !data) throw new AppError(503, "无法准备图片上传，请重试");
    return Response.json(
      { path, signedUrl: data.signedUrl },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireOwner();
    const { path, projectId } = projectSchema
      .extend({ path: z.string().max(200) })
      .parse(await request.json());
    const prefix = `${user.id}/uploads/`;
    if (
      !path.startsWith(prefix) ||
      !z.uuid().safeParse(path.slice(prefix.length)).success
    )
      throw new AppError(403, "上传文件不属于当前账户");
    if (projectId) await ownedProject(user.id, projectId);
    const storage = adminClient().storage.from(uploadStagingBucket());
    try {
      const { data, error } = await storage.download(path);
      if (error || !data) throw new AppError(400, "上传文件不存在，请重新上传");
      if (data.size > REFERENCE_LIMIT)
        throw new AppError(413, "参考图最大 10 MiB");
      const asset = await uploadReference(
        user.id,
        Buffer.from(await data.arrayBuffer()),
        projectId,
      );
      return Response.json({ asset });
    } finally {
      await storage.remove([path]);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
