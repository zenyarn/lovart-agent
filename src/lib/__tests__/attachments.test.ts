import { it, expect } from "vitest";
import * as attachment from "../attachment-validation";
it("reads the full UTF-8 Markdown while rejecting binary and oversized files", () => {
  expect(attachment).toHaveProperty("readMarkdown");
  expect(attachment.readMarkdown(Buffer.from("# 标题\n正文\n最后一行"))).toBe(
    "# 标题\n正文\n最后一行",
  );
  expect(() => attachment.readMarkdown(Buffer.from([0xff, 0xfe, 0]))).toThrow();
  expect(() =>
    attachment.readMarkdown(Buffer.alloc(256 * 1024 + 1, 65)),
  ).toThrow();
});
it("normalizes a display filename without allowing path traversal or control characters", () => {
  expect(attachment).toHaveProperty("attachmentName");
  expect(attachment.attachmentName("../../article.md")).toBe("article.md");
  expect(attachment.attachmentName("a\u0000b.md")).toBe("ab.md");
});
