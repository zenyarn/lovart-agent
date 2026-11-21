import { it, expect } from "vitest";
import * as models from "../models";
const base = {
  projectId: "164bec3f-8110-4606-b627-19a508ef9f9c",
  requestKey: "90d12b31-a3bf-4cd5-a555-a9d5ac19d433",
  prompt: "coffee poster",
  model: "gpt25",
  resolution: "1K",
  ratio: "16:9",
  referenceAssetIds: [],
};
it("validates Agent generation and selects Flare text endpoint without references", () => {
  expect(models).toHaveProperty("agentGenerationSchema");
  const value = models.agentGenerationSchema.parse(base);
  expect(models.toKieInput(value, [])).toEqual({
    model: "gpt-image-2-5-flare-text-to-image",
    input: { prompt: "coffee poster", aspect_ratio: "16:9", resolution: "1K" },
  });
});
it("preserves ordered multiple references and selects Flare editing endpoint", () => {
  expect(models).toHaveProperty("agentGenerationSchema");
  const value = models.agentGenerationSchema.parse({
    ...base,
    referenceAssetIds: [base.projectId, base.requestKey],
  });
  const body = models.toKieInput(value, [
    "https://example.com/b.png",
    "https://example.com/a.png",
  ]);
  expect(body.model).toBe("gpt-image-2-5-flare-image-to-image");
  expect(body.input.input_urls).toEqual([
    "https://example.com/b.png",
    "https://example.com/a.png",
  ]);
});
it("rejects duplicate or excess references and 1K-only ratio at higher resolution", () => {
  expect(models).toHaveProperty("agentGenerationSchema");
  for (const change of [
    { referenceAssetIds: [base.projectId, base.projectId] },
    { referenceAssetIds: Array(17).fill(base.projectId) },
    { ratio: "27:16", resolution: "2K" },
    { ratio: "bad" },
    { referenceUrl: "https://evil.test" },
  ])
    expect(
      models.agentGenerationSchema.safeParse({ ...base, ...change }).success,
    ).toBe(false);
  expect(
    models.agentGenerationSchema.safeParse({ ...base, ratio: "27:16" }).success,
  ).toBe(true);
});
