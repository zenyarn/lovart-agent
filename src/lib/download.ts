import "server-only";
import { resolvePublicHost } from "./public-dns";
import https from "node:https";
import { OUTPUT_LIMIT } from "./image-validation";
export async function downloadImage(
  address: string,
  redirects = 0,
): Promise<Buffer> {
  const url = new URL(address);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    redirects > 3
  )
    throw new Error("结果地址无效");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const target = await resolvePublicHost(hostname);
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        lookup: (_host, _opts, callback) =>
          callback(null, target.address, target.family),
        timeout: 30000,
        family: target.family,
        signal: AbortSignal.timeout(60000),
        headers: { Accept: "image/*" },
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          try {
            const next = new URL(res.headers.location, url).toString();
            res.resume();
            downloadImage(next, redirects + 1).then(resolve, reject);
          } catch (error) {
            res.destroy();
            reject(error);
          }
          return;
        }
        if (
          res.statusCode !== 200 ||
          Number(res.headers["content-length"] || 0) > OUTPUT_LIMIT
        ) {
          res.destroy();
          reject(new Error("图片下载失败或文件过大"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > OUTPUT_LIMIT) {
            res.destroy(new Error("图片过大"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("图片下载超时")));
    req.on("error", reject);
  });
}
