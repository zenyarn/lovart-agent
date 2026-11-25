import { describe, it, expect } from "vitest";
import { generationSchema, toKieInput, allowedRatios } from "../models";
const base = {
  projectId: "164bec3f-8110-4606-b627-19a508ef9f9c",
  requestKey: "90d12b31-a3bf-4cd5-a555-a9d5ac19d433",
  prompt: " blue mug ",
  model: "nano",
  resolution: "1K",
  ratio: "1:1",
};
describe("generation contract", () => {
  it("trims prompt and rejects blank or oversized prompts", () => {
    expect(generationSchema.parse(base).prompt).toBe("blue mug");
    expect(generationSchema.safeParse({ ...base, prompt: "  " }).success).toBe(
      false,
    );
    expect(
      generationSchema.safeParse({ ...base, prompt: "x".repeat(20001) })
        .success,
    ).toBe(false);
  });
  it("rejects unsupported resolution and GPT ratio combinations", () => {
    expect(
      generationSchema.safeParse({ ...base, resolution: "512" }).success,
    ).toBe(false);
    expect(
      generationSchema.safeParse({
        ...base,
        model: "gpt",
        resolution: "2K",
        ratio: "5:4",
      }).success,
    ).toBe(false);
    expect(allowedRatios("gpt", "4K")).not.toContain("3:1");
  });
  it("routes GPT references and strips unsupported background", () => {
    const data = generationSchema.parse({
      ...base,
      model: "gpt",
      resolution: "2K",
    });
    const out = toKieInput(data, "https://example.com/image.png");
    expect(out.model).toBe("gpt-image-2-image-to-image");
    expect(out.input.input_urls).toEqual(["https://example.com/image.png"]);
    expect(out.input).not.toHaveProperty("background");
  });
  it("routes Nano reference and rejects arbitrary URL fields", () => {
    expect(
      toKieInput(generationSchema.parse(base), "https://example.com/a.png")
        .input.image_input,
    ).toHaveLength(1);
    expect(
      generationSchema.safeParse({ ...base, referenceUrl: "https://evil.test" })
        .success,
    ).toBe(false);
  });
});
it("rejects editing with no source image and sends preservation instructions with the actual reference", () => {
  expect(generationSchema.safeParse({ ...base, editing: true }).success).toBe(false);
  const input = generationSchema.parse({ ...base, editing: true, referenceAssetId: base.projectId });
  const payload = toKieInput(input, "https://example.com/source.png");
  expect(payload.input.image_input).toEqual(["https://example.com/source.png"]);
  expect(payload.input.prompt).toContain("保留");
  expect(payload.input.prompt).toContain("blue mug");
  expect(() => toKieInput(input)).toThrow();
});
