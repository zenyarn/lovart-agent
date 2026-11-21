import { readLimitedBody } from "@/lib/request-body";
import {
  requireOwner,
  assertSameOrigin,
  errorResponse,
  AppError,
} from "@/lib/auth";
import { uploadReference, uploadMarkdown } from "@/lib/assets";
import { REFERENCE_LIMIT } from "@/lib/image-validation";
import { z } from "zod";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireOwner();
    if (
      Number(request.headers.get("content-length") || 0) >
      REFERENCE_LIMIT + 65536
    )
      throw new AppError(413, "参考图最大 10 MiB");
    let body: Uint8Array<ArrayBuffer>;
    try {
      body = await readLimitedBody(request.body, REFERENCE_LIMIT + 65536);
    } catch {
      throw new AppError(413, "参考图最大 10 MiB");
    }
    const form = await new Response(body, {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
    const files = form.getAll("file"),
      project = form.get("projectId");
    if (files.length !== 1 || !(files[0] instanceof File))
      throw new AppError(400, "请选择一个文件");
    if (files[0].size > REFERENCE_LIMIT)
      throw new AppError(413, "参考图最大 10 MiB");
    if (project && !z.uuid().safeParse(project).success)
      throw new AppError(400, "项目标识无效");
    if (/\.(md|markdown)$/i.test(files[0].name)) {
      if(!project) throw new AppError(400,'请先进入项目再上传 Markdown');
      const asset=await uploadMarkdown(user.id,String(project),files[0].name,Buffer.from(await files[0].arrayBuffer()));
      return Response.json({asset});
    }
    const asset = await uploadReference(
      user.id,
      Buffer.from(await files[0].arrayBuffer()),
      project ? String(project) : undefined,
    );
    return Response.json({ asset });
  } catch (error) {
    return errorResponse(error);
  }
}
