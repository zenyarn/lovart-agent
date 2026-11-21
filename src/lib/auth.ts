import "server-only";
import { ZodError } from "zod";
import { sessionClient } from "./supabase/server";
import { redirect } from "next/navigation";

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function requireOwner() {
  const client = await sessionClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new AppError(401, "请先登录");
  if (!user.email || !user.email_confirmed_at)
    throw new AppError(403, "请先完成邮箱验证");
  return user;
}
export async function pageOwner(next: string) {
  try {
    return await requireOwner();
  } catch {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.APP_URL || "http://localhost:3000")
    .origin;
  if (origin !== expected) throw new AppError(403, "请求来源无效");
}
export function errorResponse(error: unknown) {
  if (error instanceof ZodError || error instanceof SyntaxError)
    return Response.json({ error: "请求格式或参数无效" }, { status: 400 });
  if (error instanceof AppError)
    return Response.json({ error: error.message }, { status: error.status });
  return Response.json(
    { error: "服务暂时不可用，请稍后重试" },
    { status: 500 },
  );
}
