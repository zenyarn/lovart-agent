import { it, expect } from "vitest";
import sharp from "sharp";
import { inspectImage, REFERENCE_LIMIT } from "../image-validation";
it("uses actual image bytes rather than supplied extension", async () => {
  const png = await sharp({
    create: { width: 20, height: 10, channels: 3, background: "#336699" },
  })
    .png()
    .toBuffer();
  const meta = await inspectImage(png);
  expect(meta).toMatchObject({ mime: "image/png", width: 20, height: 10 });
});
it("rejects empty, fake, corrupt and oversized references", async () => {
  for (const bytes of [
    Buffer.alloc(0),
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    Buffer.alloc(REFERENCE_LIMIT + 1),
  ])
    await expect(inspectImage(bytes)).rejects.toThrow();
  const png = await sharp({
    create: { width: 100, height: 100, channels: 3, background: "#336699" },
  })
    .png()
    .toBuffer();
  await expect(inspectImage(png.subarray(0, 60))).rejects.toThrow();
});
