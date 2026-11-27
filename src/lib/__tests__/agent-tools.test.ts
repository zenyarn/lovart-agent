import { it, expect, vi } from "vitest";
import sharp from "sharp";
const state = vi.hoisted(() => ({
  read: vi.fn(),
  submit: vi.fn(),
  owned: vi.fn(),
  asset: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../assets", () => ({
  readAssetBytes: state.read,
  projectAsset: state.asset,
}));
vi.mock("../generations", () => ({
  submitGeneration: state.submit,
  syncGeneration: vi.fn(),
}));
vi.mock("../projects", () => ({ ownedProject: state.owned }));
vi.mock("../supabase/admin", () => ({ adminClient: vi.fn() }));
import { createCanvasTools } from "../agent/tools";
const ref = "44444444-4444-4444-8444-444444444444",
  project = "33333333-3333-4333-8333-333333333333";
it("blocks paid image editing before every reference is actually viewed", async () => {
  const generate = createCanvasTools("owner", project).find(
    (t) => t.name === "generate_image",
  )!;
  await expect(
    generate.execute("t", {
      prompt: "cup",
      referenceAssetIds: [ref],
      ratio: "1:1",
      resolution: "1K",
    }),
  ).rejects.toThrow("view_image");
  expect(state.submit).not.toHaveBeenCalled();
});
it("returns actual image pixels after scoped private asset access", async () => {
  const bytes = await sharp({
    create: { width: 20, height: 40, channels: 3, background: "blue" },
  })
    .png()
    .toBuffer();
  state.read.mockResolvedValueOnce({
    asset: { mime: "image/png", width: 20, height: 40 },
    bytes,
  });
  const view = createCanvasTools("owner", project).find(
    (t) => t.name === "view_image",
  )!;
  const result = await view.execute("t", { assetId: ref });
  expect(state.read).toHaveBeenCalledWith("owner", project, ref);
  const image = result.content.find((c) => c.type === "image");
  expect(image?.type).toBe("image");
  if (image?.type === "image")
    expect(
      (await sharp(Buffer.from(image.data, "base64")).metadata()).height,
    ).toBe(40);
});
it("propagates denied asset ownership without exposing pixels", async () => {
  state.read.mockRejectedValueOnce(Error("素材不存在"));
  await expect(
    createCanvasTools("other", project)
      .find((t) => t.name === "view_image")!
      .execute("t", { assetId: ref }),
  ).rejects.toThrow("素材不存在");
});
it.each([3, 4])("retries saving the same paid result before continuing a %i-image batch", async (count) => {
  const { adminClient } = await import("../supabase/admin");
  const { syncGeneration } = await import("../generations");
  vi.mocked(syncGeneration).mockClear();
  const ids = Array.from({ length: count }, (_, i) => `55555555-5555-4555-8555-${String(i + 1).padStart(12, "0")}`);
  let currentId = ids[0];
  const status = vi
    .fn()
    .mockResolvedValueOnce({
      data: { id: ids[0], status: "persisting", error: "保存暂时失败" },
      error: null,
    })
    .mockImplementation(async () => ({
      data: { id: currentId, status: "succeeded", error: null },
      error: null,
    }));
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    single: status,
    order: vi
      .fn()
      .mockResolvedValue({
        data: [{ asset_id: ref, ordinal: 0 }],
        error: null,
      }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  vi.mocked(adminClient).mockReturnValue({
    from: () => query,
  } as unknown as ReturnType<typeof adminClient>);
  state.submit.mockClear();
  state.submit.mockImplementation(async () => {
    currentId = ids[state.submit.mock.calls.length - 1];
    return { generationId: currentId };
  });
  vi.useFakeTimers();
  try {
    const tool = createCanvasTools("owner", project).find(
      (t) => t.name === "generate_image",
    )!;
    const args = {
      prompt: "cover",
      referenceAssetIds: [],
      ratio: "16:9",
      resolution: "1K",
    };
    const pending = tool.execute("one", args);
    await vi.advanceTimersByTimeAsync(2100);
    expect((await pending).isError).not.toBe(true);
    expect(state.submit).toHaveBeenCalledTimes(1);
    for (let i = 1; i < count; i++)
      expect((await tool.execute(String(i), args)).isError).not.toBe(true);
    expect(state.submit).toHaveBeenCalledTimes(count);
    expect(vi.mocked(syncGeneration).mock.calls.map((call) => call[1])).toEqual([ids[0], ...ids]);
    expect(new Set(state.submit.mock.calls.map((call) => call[1].requestKey)).size).toBe(count);
    if (count === 4)
      await expect(tool.execute("fifth", args)).rejects.toThrow("最多生成四张");
  } finally {
    vi.useRealTimers();
  }
});
