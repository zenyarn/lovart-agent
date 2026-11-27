import { cleanupStagedUploads } from "@/lib/upload-staging";
export const maxDuration = 300;
export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ removed: await cleanupStagedUploads() });
  } catch {
    return Response.json({ error: "临时上传清理失败" }, { status: 503 });
  }
}
