import { it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
const mock = vi.hoisted(() => ({
  handler: undefined as ((res: IncomingMessage) => void) | undefined,
}));
vi.mock("server-only", () => ({}));
vi.mock("../public-dns", () => ({
  resolvePublicHost: async () => ({ address: "1.1.1.1", family: 4 }),
}));
vi.mock("node:https", () => ({
  default: {
    get: (
      _url: unknown,
      _opts: unknown,
      handler: (res: IncomingMessage) => void,
    ) => {
      mock.handler = handler;
      return new EventEmitter();
    },
  },
}));
import { downloadImage } from "../download";
it("rejects an invalid redirect location without throwing outside its promise", async () => {
  const result = downloadImage("https://example.com/result.png");
  await vi.waitFor(() => expect(mock.handler).toBeDefined());
  const response = Object.assign(new EventEmitter(), {
    statusCode: 302,
    headers: { location: "https://[" },
    resume: vi.fn(),
    destroy: vi.fn(),
  });
  expect(() =>
    mock.handler!(response as unknown as IncomingMessage),
  ).not.toThrow();
  await expect(result).rejects.toThrow();
});
