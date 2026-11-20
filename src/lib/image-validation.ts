import sharp from "sharp";
export const REFERENCE_LIMIT = 10 * 1024 * 1024;
export const OUTPUT_LIMIT = 50 * 1024 * 1024;
export async function inspectImage(bytes: Buffer, limit = REFERENCE_LIMIT) {
  if (bytes.length === 0 || bytes.length > limit)
    throw new Error("图片大小超出限制");
  let meta;
  try {
    meta = await sharp(bytes, {
      limitInputPixels: 100_000_000,
      animated: false,
    }).metadata();
  } catch {
    throw new Error("无法识别图片，请使用 PNG、JPEG 或 WebP");
  }
  if (
    !meta.width ||
    !meta.height ||
    !["png", "jpeg", "webp"].includes(meta.format || "") ||
    (meta.pages || 1) > 1
  )
    throw new Error("仅支持静态 PNG、JPEG 或 WebP 图片");
  // Decode pixels to reject truncated/corrupt image payloads, not just headers.
  await sharp(bytes, { limitInputPixels: 100_000_000 }).stats();
  return {
    width: meta.width,
    height: meta.height,
    mime: `image/${meta.format}`,
    extension: meta.format === "jpeg" ? "jpg" : meta.format,
    bytes: bytes.length,
  };
}
