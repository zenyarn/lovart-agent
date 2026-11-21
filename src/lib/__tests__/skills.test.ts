import { describe, it, expect } from "vitest";
import { parseSkill } from "../skills-parser";
const bytes = (s: string) => new TextEncoder().encode(s);
describe("Skill parser", () => {
  it("parses YAML multiline metadata and preserves the complete body", () => {
    const body = "# 规则\n逐字保留。\n\n---\n结尾";
    const s = parseSkill(
      bytes(
        "---\nname: wechat-cover\ndescription: >-\n  阅读文章\n  生成封面\nmetadata:\n  version: 1\n---\n" +
          body,
      ),
    );
    expect(s).toMatchObject({
      name: "wechat-cover",
      description: "阅读文章 生成封面",
      body,
    });
  });
  it.each([
    "../evil",
    "a/b",
    "a\\b",
    "a..b",
    "%2e%2e",
    "UPPER",
    "a--b",
    "-x",
    "x-",
  ])("rejects unsafe name %s", (name) => {
    expect(() =>
      parseSkill(bytes(`---\nname: '${name}'\ndescription: test\n---\nbody`)),
    ).toThrow();
  });
  it.each([
    "name: okay",
    "name: okay\ndescription: []",
    "name: okay\nname: duplicate\ndescription: test",
    "name: okay\ndescription: &a hello\nmetadata: *a",
  ])("rejects invalid metadata", (front) => {
    expect(() => parseSkill(bytes(`---\n${front}\n---\nbody`))).toThrow();
  });
  it("rejects empty rules, oversized and invalid UTF8", () => {
    expect(() =>
      parseSkill(bytes("---\nname: okay\ndescription: test\n---\n ")),
    ).toThrow();
    expect(() => parseSkill(new Uint8Array(65537))).toThrow();
    expect(() => parseSkill(new Uint8Array([255]))).toThrow();
  });
});
