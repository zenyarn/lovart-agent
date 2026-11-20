import { it, expect } from "vitest";
import { readLimitedBody } from "../request-body";
it("rejects chunked bodies exceeding the limit without content-length", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(8));
      c.enqueue(new Uint8Array(8));
    },
    cancel() {
      cancelled = true;
    },
  });
  await expect(readLimitedBody(stream, 10)).rejects.toThrow("请求体过大");
  expect(cancelled).toBe(true);
});
it("returns valid bodies and rejects missing input", async () => {
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array([1, 2, 3]));
      c.close();
    },
  });
  expect(await readLimitedBody(stream, 3)).toEqual(new Uint8Array([1, 2, 3]));
  await expect(readLimitedBody(null, 3)).rejects.toThrow();
});
