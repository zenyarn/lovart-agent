import "server-only";
import { adminClient } from "./supabase/admin";
import { bucket } from "./assets";
/** Delete only unbound references older than 24h. Foreign keys and the conditional DELETE protect racing submissions. */
export async function cleanupStaging(owner: string) {
  const client = adminClient(),
    cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await client
    .from("assets")
    .select("id,object_path,bucket")
    .eq("owner_id", owner)
    .is("project_id", null)
    .lt("created_at", cutoff)
    .limit(100);
  if (error) throw error;
  let removed = 0;
  for (const asset of rows) {
    const { data: deleted, error: deleteError } = await client
      .from("assets")
      .delete()
      .eq("id", asset.id)
      .eq("owner_id", owner)
      .is("project_id", null)
      .lt("created_at", cutoff)
      .select("id");
    if (deleteError || !deleted?.length) continue;
    await client.storage.from(asset.bucket).remove([asset.object_path]);
    removed++;
  }
  // Also recover orphaned staging objects from a prior failed DB insert or Storage delete.
  const prefix = `${owner}/staging`;
  const { data: objects } = await client.storage
    .from(bucket())
    .list(prefix, {
      limit: 100,
      sortBy: { column: "created_at", order: "asc" },
    });
  for (const object of objects || []) {
    if (!object.id || !object.created_at || object.created_at >= cutoff)
      continue;
    const path = `${prefix}/${object.name}`;
    const { data: asset, error: lookupError } = await client
      .from("assets")
      .select("id")
      .eq("object_path", path)
      .maybeSingle();
    if (!lookupError && !asset)
      await client.storage.from(bucket()).remove([path]);
  }
  return { removed };
}
