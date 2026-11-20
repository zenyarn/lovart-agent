import Link from "next/link";
import { z } from "zod";
import { pageOwner } from "@/lib/auth";
import { projectDetail } from "@/lib/projects";
import { CanvasWorkspace } from "@/components/canvas-workspace";
export default async function Canvas({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const { projectId } = await searchParams;
  const user = await pageOwner(`/canvas?projectId=${projectId || ""}`);
  if (!z.uuid().safeParse(projectId).success) return <Missing />;
  let detail;
  try {
    detail = await projectDetail(user.id, projectId!);
  } catch {
    return <Missing />;
  }
  return <CanvasWorkspace key={projectId} initial={detail} />;
}
function Missing() {
  return (
    <main className="empty-error">
      <h1>项目不存在或无权访问</h1>
      <Link className="primary" href="/projects">
        回到项目列表
      </Link>
    </main>
  );
}
