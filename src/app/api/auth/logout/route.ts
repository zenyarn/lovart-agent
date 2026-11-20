import { assertSameOrigin, errorResponse } from "@/lib/auth";
import { sessionClient } from "@/lib/supabase/server";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const client = await sessionClient();
    await client.auth.signOut();
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
