import { it, expect, vi } from "vitest";
import { createTask, queryTask, SubmissionUnknownError } from "../kie-client";
it("never retries an ambiguous submission", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("timeout"));
  await expect(
    createTask("key", { model: "nano-banana-2", input: {} }, fetcher),
  ).rejects.toBeInstanceOf(SubmissionUnknownError);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("treats HTTP 200 logical errors as rejection", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ code: 402, msg: "credits" })),
    );
  await expect(
    createTask("key", { model: "nano", input: {} }, fetcher),
  ).rejects.toThrow("credits");
});
it("requires valid task identifier in accepted response", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ code: 200, data: {} })));
  await expect(
    createTask("key", { model: "nano", input: {} }, fetcher),
  ).rejects.toBeInstanceOf(SubmissionUnknownError);
});
it("parses canonical result JSON without trusting extra callback values", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        code: 200,
        data: {
          taskId: "task",
          state: "success",
          resultJson: JSON.stringify({
            resultUrls: ["https://example.com/a.png"],
          }),
        },
      }),
    ),
  );
  expect((await queryTask("key", "task", fetcher)).urls).toEqual([
    "https://example.com/a.png",
  ]);
});
it("rejects mismatched task IDs", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        code: 200,
        data: { taskId: "other", state: "success", resultJson: "{}" },
      }),
    ),
  );
  await expect(queryTask("key", "task", fetcher)).rejects.toThrow();
});
it("exposes a safe actionable reason for insufficient credit without leaking provider details", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ code: 402, msg: "private-provider-detail" }),
      ),
    );
  await expect(
    createTask("secret", { model: "gpt25", input: {} }, fetcher),
  ).rejects.toMatchObject({
    code: 402,
    publicMessage: "KIE 额度不足，请充值后重试",
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
