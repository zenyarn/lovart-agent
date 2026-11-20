import { NextResponse } from "next/server";
import { sessionClient } from "@/lib/supabase/server";
import { safeReturnPath, isOwnerEmail } from "@/lib/security";
export async function GET(request: Request) {
  const url = new URL(request.url),
    code = url.searchParams.get("code");
  const origin = process.env.APP_URL || "http://localhost:3000";
  if (code) {
    const client = await sessionClient();
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (
      !error &&
      data.user?.email_confirmed_at &&
      isOwnerEmail(data.user.email, process.env.APP_OWNER_EMAILS)
    )
      return NextResponse.redirect(
        new URL(safeReturnPath(url.searchParams.get("next")), origin),
      );
    await client.auth.signOut();
  }
  return NextResponse.redirect(new URL("/login?error=callback", origin));
}
