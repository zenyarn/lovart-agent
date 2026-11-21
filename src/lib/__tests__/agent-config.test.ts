import { it, expect } from "vitest";
import { kimiConfiguration } from "../agent/config";
it("uses Moonshot models and the actual configured URL rather than the coding endpoint", () => {
  const c = kimiConfiguration({
    KIMI_API_KEY: "test",
    KIMI_BASE_URL: "https://api.moonshot.cn/v1",
  });
  expect(c.model.id).toBe("kimi-k3.1-pro");
  expect(c.model.baseUrl).toBe("https://api.moonshot.cn/v1");
});
it("supports the tutorial coding address and rejects unsafe configuration", () => {
  expect(
    kimiConfiguration({
      KIMI_API_KEY: "test",
      KIMI_BASE_URL: "https://api.kimi.com/coding/",
    }).model.baseUrl,
  ).toBe("https://api.kimi.com/coding/v1");
  expect(() =>
    kimiConfiguration({
      KIMI_API_KEY: "test",
      KIMI_BASE_URL: "http://example.com",
    }),
  ).toThrow();
  expect(() => kimiConfiguration({})).toThrow();
});
