import { z } from "zod";
import { assertSameOrigin, AppError, errorResponse } from "@/lib/auth";
import { isOwnerEmail, safeReturnPath } from "@/lib/security";
import { sessionClient } from "@/lib/supabase/server";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = z
      .object({
        email: z.email(),
        password: z.string().min(8).max(128),
        action: z.enum(["login", "signup"]),
        next: z.string().optional(),
      })
      .strict()
      .safeParse(await request.json());
    if (!parsed.success)
      throw new AppError(400, "请填写有效邮箱和至少 8 位密码");
    const { email, password, action, next } = parsed.data;
    if (!isOwnerEmail(email, process.env.APP_OWNER_EMAILS))
      throw new AppError(403, "该邮箱未获授权");
    const client = await sessionClient();
    if (action === "signup") {
      const callback = new URL(
        "/auth/callback",
        process.env.APP_URL || "http://localhost:3000",
      );
      callback.searchParams.set("next", safeReturnPath(next));
      const { error } = await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: callback.toString() },
      });
      if (error)
        throw new AppError(400, "账户创建失败，请稍后重试；已有账户请直接登录");
      return Response.json({ message: "请在邮箱中确认账户，然后返回登录。" });
    }
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.user.email_confirmed_at)
      throw new AppError(401, "登录失败，请检查邮箱、密码及邮箱验证状态");
    return Response.json({ redirect: safeReturnPath(next) });
  } catch (error) {
    return errorResponse(error);
  }
}
