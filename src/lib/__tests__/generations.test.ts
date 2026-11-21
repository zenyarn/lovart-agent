import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  upload: vi.fn(),
  rpc: vi.fn(),
  create: vi.fn(),
  query: vi.fn(),
  download: vi.fn(),
  sign: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../supabase/server", () => ({ sessionClient: vi.fn() }));
vi.mock("../supabase/admin", () => ({
  adminClient: () => ({
    from: () => {
      let patch: Record<string, unknown> | undefined;
      const filters: [string, unknown][] = [];
      const execute = () => {
        const matches = filters.every(([k, v]) => state.row[k] === v);
        if (matches && patch) Object.assign(state.row, patch);
        return { data: matches ? { ...state.row } : null, error: null };
      };
      const builder = {
        select: () => builder,
        update: (p: Record<string, unknown>) => {
          patch = p;
          return builder;
        },
        eq: (k: string, v: unknown) => {
          filters.push([k, v]);
          return builder;
        },
        maybeSingle: async () => execute(),
        then: (resolve: (result: ReturnType<typeof execute>) => unknown) =>
          Promise.resolve(execute()).then(resolve),
      };
      return builder;
    },
    rpc: state.rpc,
    storage: { from: () => ({ upload: state.upload }) },
  }),
}));
vi.mock("../assets", () => ({
  signedAsset: state.sign,
  bucket: () => "project-assets",
}));
vi.mock("../kie-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../kie-client")>();
  return { ...actual, createTask: state.create, queryTask: state.query };
});
vi.mock("../download", () => ({ downloadImage: state.download }));
vi.mock("../image-validation", () => ({
  OUTPUT_LIMIT: 50 * 1024 * 1024,
  inspectImage: async () => ({
    extension: "png",
    mime: "image/png",
    width: 1024,
    height: 1024,
    bytes: 8,
  }),
}));
import { submitGeneration, syncGeneration } from "../generations";
import { ProviderRejection } from "../kie-client";
const input = {
  projectId: "33333333-3333-4333-8333-333333333333",
  requestKey: "44444444-4444-4444-8444-444444444444",
  prompt: "blue cup",
  model: "nano" as const,
  resolution: "1K" as const,
  ratio: "1:1" as const,
};
beforeEach(() => {
  vi.clearAllMocks();
  process.env.KIE_API_KEY = "test-only-not-a-real-key";
  state.row = {
    id: "generation",
    owner_id: "owner",
    project_id: input.projectId,
    status: "pending",
    provider_task_id: "upstream-task",
    created_at: new Date().toISOString(),
  };
  state.rpc.mockImplementation(
    async (name: string, args: Record<string, unknown>) => {
      if (name === "begin_generation")
        return { data: { generation: state.row, is_new: true }, error: null };
      if (name === "claim_generation_sync") {
        state.row.sync_token = args.p_token;
        return { data: true, error: null };
      }
      if (name === "complete_generation") {
        state.row.status = "succeeded";
        return { data: true, error: null };
      }
      throw Error("unexpected RPC");
    },
  );
  state.upload.mockResolvedValue({ error: null });
  state.download.mockResolvedValue(Buffer.from("png-data"));
  state.query.mockResolvedValue({
    state: "success",
    urls: ["https://example.com/result.png"],
    creditsConsumed: 8,
  });
  state.create.mockResolvedValue("new-upstream-task");
});
it("records ambiguous submission and never creates again for the same request", async () => {
  state.create.mockRejectedValueOnce(new Error("network timeout"));
  expect((await submitGeneration("owner", input)).status).toBe(
    "submission_unknown",
  );
  state.rpc.mockResolvedValueOnce({
    data: { generation: { ...state.row }, is_new: false },
    error: null,
  });
  expect((await submitGeneration("owner", input)).status).toBe(
    "submission_unknown",
  );
  expect(state.create).toHaveBeenCalledTimes(1);
});
it("records an explicit provider rejection as failed", async () => {
  state.create.mockRejectedValueOnce(
    new ProviderRejection("insufficient credits", 402),
  );
  expect((await submitGeneration("owner", input)).status).toBe("failed");
  expect(state.row.error).toBe("KIE 额度不足，请充值后重试");
});
it("retries result storage without querying or submitting another paid task", async () => {
  state.upload.mockResolvedValueOnce({
    error: new Error("temporary storage failure"),
  });
  await syncGeneration("owner", "generation");
  expect(state.row.status).toBe("persisting");
  expect(state.row.error).toContain("结果保存失败");
  expect(state.row.sync_token).toBeNull();
  await syncGeneration("owner", "generation");
  expect(state.row.status).toBe("succeeded");
  expect(state.query).toHaveBeenCalledTimes(1);
  expect(state.create).not.toHaveBeenCalled();
  expect(state.upload).toHaveBeenCalledTimes(2);
  expect(state.upload.mock.calls[0][0]).toBe(state.upload.mock.calls[1][0]);
});
it("does no provider or storage work when another worker owns the lease", async () => {
  state.rpc.mockResolvedValueOnce({ data: false, error: null });
  await syncGeneration("owner", "generation");
  expect(state.query).not.toHaveBeenCalled();
  expect(state.download).not.toHaveBeenCalled();
  expect(state.upload).not.toHaveBeenCalled();
});
it("keeps a temporary query error retryable and releases the lease", async () => {
  state.query.mockRejectedValueOnce(new Error("temporary network failure"));
  await syncGeneration("owner", "generation");
  expect(state.row.status).toBe("pending");
  expect(state.row.error).toContain("等待重试");
  expect(state.row.sync_token).toBeNull();
  await syncGeneration("owner", "generation");
  expect(state.row.status).toBe("succeeded");
  expect(state.create).not.toHaveBeenCalled();
});
it("does not leak or query another owners task", async () => {
  await expect(syncGeneration("other", "generation")).rejects.toThrow(
    "任务不存在或无权访问",
  );
  expect(state.query).not.toHaveBeenCalled();
});
it("submits Flare with every ordered reference and persists the actual model configuration", async () => {
  state.sign.mockImplementation(async (_o, id) => ({
    id,
    project_id: input.projectId,
    mime: "image/png",
    url: `https://example.com/${id}.png`,
  }));
  const refs = [
    "164bec3f-8110-4606-b627-19a508ef9f9c",
    "90d12b31-a3bf-4cd5-a555-a9d5ac19d433",
  ];
  await submitGeneration("owner", {
    ...input,
    model: "gpt25",
    referenceAssetIds: refs,
  });
  expect(state.create.mock.calls[0][1]).toEqual({
    model: "gpt-image-2-5-flare-image-to-image",
    input: {
      prompt: "blue cup",
      aspect_ratio: "1:1",
      resolution: "1K",
      input_urls: refs.map((id) => `https://example.com/${id}.png`),
    },
  });
  expect(state.rpc.mock.calls[0][1].p_config).toMatchObject({
    referenceAssetIds: refs,
    providerModel: "gpt-image-2-5-flare-image-to-image",
  });
});
it("rejects a second reference belonging to another project before creating a paid task", async () => {
  state.sign.mockImplementation(async (_o, id) => ({
    id,
    project_id: id === "first" ? input.projectId : "other",
    mime: "image/png",
    url: "https://example.com/a.png",
  }));
  await expect(
    submitGeneration("owner", {
      ...input,
      model: "gpt25",
      referenceAssetIds: ["first", "second"],
    }),
  ).rejects.toThrow("参考图不属于当前项目");
  expect(state.create).not.toHaveBeenCalled();
});
