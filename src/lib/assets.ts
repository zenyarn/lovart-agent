import "server-only";
import { adminClient } from "./supabase/admin";
import { AppError } from "./auth";
import { inspectImage } from "./image-validation";
export const bucket = () =>
  process.env.SUPABASE_STORAGE_BUCKET || "project-assets";
export async function ownedAsset(owner: string, id: string) {
  const { data, error } = await adminClient()
    .from("assets")
    .select("*")
    .eq("id", id)
    .eq("owner_id", owner)
    .maybeSingle();
  if (error || !data) throw new AppError(404, "图片不存在或无权访问");
  return data;
}
export async function signedAsset(owner: string, id: string, download = false) {
  const asset = await ownedAsset(owner, id);
  const { data, error } = await adminClient()
    .storage.from(asset.bucket)
    .createSignedUrl(
      asset.object_path,
      3600,
      download
        ? {
            download: `image-${id}.${asset.mime === "image/jpeg" ? "jpg" : asset.mime.split("/")[1]}`,
          }
        : undefined,
    );
  if (error) throw new AppError(503, "图片暂时不可用");
  return { ...asset, url: data.signedUrl };
}
export async function uploadReference(
  owner: string,
  bytes: Buffer,
  projectId?: string,
) {
  const client = adminClient();
  if (projectId) {
    const { data } = await client
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("owner_id", owner)
      .maybeSingle();
    if (!data) throw new AppError(404, "项目不存在或无权访问");
  }
  let meta;
  try {
    meta = await inspectImage(bytes);
  } catch (error) {
    throw new AppError(
      400,
      error instanceof Error ? error.message : "图片无效",
    );
  }
  const id = crypto.randomUUID(),
    path = `${owner}/${projectId || "staging"}/${id}.${meta.extension}`;
  const { error: uploadError } = await client.storage
    .from(bucket())
    .upload(path, bytes, { contentType: meta.mime, upsert: false });
  if (uploadError) throw new AppError(503, "图片上传失败，请重试");
  const { error } = await client
    .from("assets")
    .insert({
      id,
      owner_id: owner,
      project_id: projectId || null,
      bucket: bucket(),
      object_path: path,
      mime: meta.mime,
      width: meta.width,
      height: meta.height,
      bytes: meta.bytes,
    });
  if (error) {
    await client.storage.from(bucket()).remove([path]);
    throw new AppError(503, "图片记录保存失败，请重试");
  }
  return signedAsset(owner, id);
}
