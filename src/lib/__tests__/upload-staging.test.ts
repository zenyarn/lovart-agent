import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  list: vi.fn(),
  remove: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock("../supabase/admin", () => ({
  adminClient: () => ({ storage: { from: () => m } }),
}));
import { cleanupStagedUploads } from "../upload-staging";
it("cleans expired staging objects while retaining active upload tickets", async () => {
  const now = Date.now();
  m.list
    .mockResolvedValueOnce({ data: [{ name: "owner" }], error: null })
    .mockResolvedValueOnce({
      data: [
        {
          id: "a",
          name: "old",
          created_at: new Date(now - 4 * 3600000).toISOString(),
        },
        {
          id: "b",
          name: "active",
          created_at: new Date(now - 3600000).toISOString(),
        },
      ],
      error: null,
    });
  expect(await cleanupStagedUploads(now)).toBe(1);
  expect(m.remove).toHaveBeenCalledWith(["owner/uploads/old"]);
});
