import { it, expect, vi } from "vitest";
import { resolvePublicHost } from "../public-dns";
it("rejects private destinations without using alternate DNS", async () => {
  const fetcher = vi.fn();
  await expect(
    resolvePublicHost(
      "internal.test",
      async () => [{ address: "127.0.0.1", family: 4 }],
      fetcher,
    ),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it("resolves TUN fake IP through fixed HTTPS DNS and pins the public result", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ Status: 0, Answer: [{ type: 1, data: "8.8.8.8" }] }),
      ),
    );
  expect(
    await resolvePublicHost(
      "images.example.com",
      async () => [{ address: "198.18.0.247", family: 4 }],
      fetcher,
    ),
  ).toEqual({ address: "8.8.8.8", family: 4 });
  expect(String(fetcher.mock.calls[0][0])).toMatch(
    /^https:\/\/dns.google\/resolve\?/,
  );
});
it("rejects private answers from HTTPS DNS", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          Status: 0,
          Answer: [{ type: 1, data: "169.254.169.254" }],
        }),
      ),
    );
  await expect(
    resolvePublicHost(
      "images.example.com",
      async () => [{ address: "198.18.0.1", family: 4 }],
      fetcher,
    ),
  ).rejects.toThrow();
});
it("never resolves a literal benchmark IP through DNS", async () => {
  const fetcher = vi.fn();
  await expect(
    resolvePublicHost(
      "198.18.0.1",
      async () => [{ address: "198.18.0.1", family: 4 }],
      fetcher,
    ),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
