import "server-only";
import { adminClient } from "./supabase/admin";
import { AppError } from "./auth";
import { signedAsset } from "./assets";
const generationFields =
  "id,project_id,prompt,model,config,reference_asset_id,status,error,created_at";
export async function ownedProject(owner: string, id: string) {
  const { data, error } = await adminClient()
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("owner_id", owner)
    .maybeSingle();
  if (error || !data) throw new AppError(404, "项目不存在或无权访问");
  return data;
}
export async function projectDetail(owner: string, id: string) {
  const client = adminClient(),
    project = await ownedProject(owner, id);
  const [gs, ns] = await Promise.all([
    client
      .from("generations")
      .select(generationFields)
      .eq("project_id", id)
      .eq("owner_id", owner)
      .order("created_at"),
    client
      .from("canvas_nodes")
      .select("*")
      .eq("project_id", id)
      .eq("owner_id", owner),
  ]);
  if (gs.error || ns.error) throw new AppError(503, "项目加载失败");
  const ids = gs.data.map((g) => g.id);
  const outputs = ids.length
    ? await client
        .from("generation_outputs")
        .select("generation_id,asset_id,ordinal")
        .in("generation_id", ids)
        .eq("owner_id", owner)
        .order("ordinal")
    : { data: [], error: null };
  if (outputs.error) throw new AppError(503, "结果加载失败");
  const assetIds = [
    ...new Set(
      [
        ...gs.data.map((g) => g.reference_asset_id),
        ...gs.data.flatMap(g=>g.config.referenceAssetIds||[]),
        ...ns.data.map((n) => n.asset_id),
      ].filter(Boolean),
    ),
  ] as string[];
  const entries = await Promise.all(
    assetIds.map(async (id) => [id, await signedAsset(owner, id)]),
  );
  return {
    project,
    nodes: ns.data,
    generations: gs.data.map((g) => ({
      ...g,
      outputs: outputs.data!.filter((o) => o.generation_id === g.id),
    })),
    assets: Object.fromEntries(entries),
  };
}
export async function listProjects(
  owner: string,
  offset: number,
  limit: number,
) {
  const { data, error } = await adminClient()
    .from("projects")
    .select("*")
    .eq("owner_id", owner)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit);
  if (error) throw new AppError(503, "项目加载失败");
  return {
    projects: await Promise.all(
      data
        .slice(0, limit)
        .map(async (p) => ({
          ...p,
          cover: p.cover_asset_id
            ? await signedAsset(owner, p.cover_asset_id)
            : undefined,
        })),
    ),
    hasMore: data.length > limit,
  };
}
