import { errorResponse, requireOwner, AppError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
export async function GET() {
  try {
    const user = await requireOwner();
    const { data, error } = await adminClient().rpc("ensure_credit_account", { p_owner: user.id });
    if (error || typeof data !== "number") throw new AppError(503, "积分暂时无法读取");
    return Response.json({ balance: data, imageCost: 1 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
