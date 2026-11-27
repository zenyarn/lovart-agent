import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  download: vi.fn(),
  remove: vi.fn().mockResolvedValue({ error: null }),
  sign: vi.fn(),
  upload: vi.fn(),
  owned: vi.fn(),
}));
vi.mock("../auth", () => ({
  requireOwner: async () => ({ id: "owner-a" }),
  assertSameOrigin: () => {},
  AppError: class extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
  errorResponse: (e: Error & { status?: number }) =>
    Response.json({ error: e.message }, { status: e.status || 400 }),
}));
vi.mock("../supabase/admin", () => ({
  adminClient: () => ({
    storage: {
      from: () => ({
        download: m.download,
        remove: m.remove,
        createSignedUploadUrl: m.sign,
      }),
    },
  }),
}));
vi.mock("../assets", () => ({
  bucket: () => "private",
  uploadReference: m.upload,
}));
vi.mock("../projects", () => ({ ownedProject: m.owned }));
import { POST, PUT } from "../../app/api/assets/direct/route";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const req = (body: unknown) =>
  new Request("http://localhost/api/assets/direct", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => vi.clearAllMocks());
it("rejects another owner upload path before accessing storage", async () => {
  const r = await PUT(req({ path: `owner-b/uploads/${id}` }));
  expect(r.status).toBe(403);
  expect(m.download).not.toHaveBeenCalled();
});
it("checks project ownership before issuing an upload capability", async () => {
  m.owned.mockRejectedValueOnce(new Error("not owned"));
  expect((await POST(req({ projectId: id }))).status).toBe(400);
  expect(m.sign).not.toHaveBeenCalled();
});
it("rejects oversized actual bytes and removes the staging object", async () => {
  m.download.mockResolvedValue({
    data: new Blob([new Uint8Array(10 * 1024 * 1024 + 1)]),
    error: null,
  });
  const path = `owner-a/uploads/${id}`;
  expect((await PUT(req({ path }))).status).toBe(413);
  expect(m.upload).not.toHaveBeenCalled();
  expect(m.remove).toHaveBeenCalledWith([path]);
});
it("validates and promotes uploaded bytes through the existing image validator", async () => {
  m.download.mockResolvedValue({ data: new Blob(["pixels"]), error: null });
  m.upload.mockResolvedValue({ id: "asset" });
  expect((await PUT(req({ path: `owner-a/uploads/${id}` }))).status).toBe(200);
  expect(m.upload).toHaveBeenCalledWith(
    "owner-a",
    Buffer.from("pixels"),
    undefined,
  );
});
