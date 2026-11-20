import { requireOwner, assertSameOrigin, errorResponse } from "@/lib/auth";
import { cleanupStaging } from "@/lib/cleanup";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireOwner();
    return Response.json(await cleanupStaging(user.id));
  } catch (error) {
    return errorResponse(error);
  }
}
