import "server-only";
import { adminClient } from "./supabase/admin";
export const uploadStagingBucket = () =>
  `${process.env.SUPABASE_STORAGE_BUCKET || "project-assets"}-uploads`;
/** Tickets expire after two hours; allow one additional hour before deletion. */
export async function cleanupStagedUploads(now = Date.now()) {
  const storage = adminClient().storage.from(uploadStagingBucket());
  let removed = 0;
  const ownerNames: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data: owners, error } = await storage.list("", {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    ownerNames.push(...(owners || []).map((owner) => owner.name));
    if ((owners?.length || 0) < 100) break;
  }
  for (const owner of ownerNames) {
    const prefix = `${owner}/uploads`;
    // Collect before deleting so offset pagination cannot skip objects.
    const expired: string[] = [];
    for (let fileOffset = 0; ; fileOffset += 100) {
      const { data: files, error: listError } = await storage.list(prefix, {
        limit: 100,
        offset: fileOffset,
        sortBy: { column: "name", order: "asc" },
      });
      if (listError) throw listError;
      for (const file of files || [])
        if (
          file.id &&
          file.created_at &&
          new Date(file.created_at).getTime() < now - 3 * 3600_000
        )
          expired.push(`${prefix}/${file.name}`);
      if ((files?.length || 0) < 100) break;
    }
    for (let i = 0; i < expired.length; i += 100) {
      const { error: deleteError } = await storage.remove(
        expired.slice(i, i + 100),
      );
      if (deleteError) throw deleteError;
      removed += Math.min(100, expired.length - i);
    }
  }
  return removed;
}
