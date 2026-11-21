import { requireOwner, errorResponse, AppError } from "@/lib/auth";
import { signedAsset, readAssetBytes } from "@/lib/assets";
import { z } from "zod";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireOwner(),
      { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new AppError(404, "图片不存在");
    const download = new URL(request.url).searchParams.has("download");
    const asset = await signedAsset(user.id, id, download);
    if (download) return Response.redirect(asset.url);
    if (
      new URL(request.url).searchParams.has("preview") &&
      asset.mime === "text/markdown"
    ) {
      const { bytes } = await readAssetBytes(user.id, asset.project_id, id);
      return new Response(bytes.toString("utf8"), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      });
    }
    if (
      new URL(request.url).searchParams.has("preview") &&
      asset.mime.startsWith("image/")
    )
      return Response.redirect(asset.url);
    return Response.json(
      { asset },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
