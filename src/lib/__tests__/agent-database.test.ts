import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { beforeAll, afterAll, it, expect } from "vitest";
let db: PGlite;
const o = "11111111-1111-4111-8111-111111111111",
  p = "33333333-3333-4333-8333-333333333333",
  p2 = "33333333-3333-4333-8333-333333333334",
  a = "44444444-4444-4444-8444-444444444444";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key);create table storage.objects(id uuid);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;insert into auth.users values('${o}');`,
  );
  await db.exec(
    await readFile("supabase/migrations/20261120085234_app.sql", "utf8"),
  );
  for (const f of (await readdir("supabase/migrations")).filter((f) =>
    f.endsWith("_pi_agent.sql"),
  ))
    await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
  await db.exec(
    `insert into projects(id,owner_id) values('${p}','${o}'),('${p2}','${o}');insert into assets(id,owner_id,project_id,object_path,mime,width,height,bytes) values('${a}','${o}','${p}','${o}/a.png','image/png',400,800,100);`,
  );
}, 30000);
afterAll(() => db.close());
it("places an uploaded image with its real aspect ratio and rejects another project", async () => {
  const result = await db.query<{ value: { id: string } }>(
    "select place_canvas_asset($1,$2,$3,$4,10,20) as value",
    [o, p, a, a],
  );
  expect(result.rows[0].value.id).toBe(a);
  const n = (
    await db.query<{ width: number; height: number }>(
      "select width,height from canvas_nodes where id=$1",
      [a],
    )
  ).rows[0];
  expect(n.height / n.width).toBe(2);
  await expect(
    db.query("select place_canvas_asset($1,$2,$3,gen_random_uuid(),0,0)", [
      o,
      p2,
      a,
    ]),
  ).rejects.toThrow("ASSET_NOT_FOUND");
});
it("persists resize and removal without deleting source asset; refuses stale revision", async () => {
  const revision = (
    await db.query<{ revision: number }>(
      "select revision from projects where id=$1",
      [p],
    )
  ).rows[0].revision;
  const args = [
    o,
    p,
    revision,
    JSON.stringify([{ id: a, x: 30, y: 40, width: 200, height: 400 }]),
    '{"x":0,"y":0,"zoom":1}',
    "{}",
  ];
  await db.query("select save_canvas($1,$2,$3,$4,$5,$6)", args);
  expect(
    (
      await db.query<{ width: number }>(
        "select width from canvas_nodes where id=$1",
        [a],
      )
    ).rows[0].width,
  ).toBe(200);
  await expect(
    db.query("select save_canvas($1,$2,$3,$4,$5,$6)", args),
  ).rejects.toThrow("REVISION_CONFLICT");
  await db.query(
    "select save_canvas($1,$2,$3,'[]','{\"x\":0,\"y\":0,\"zoom\":1}','{}')",
    [o, p, revision + 1],
  );
  expect(
    (await db.query("select * from canvas_nodes where id=$1", [a])).rows,
  ).toHaveLength(0);
  expect(
    (await db.query("select * from assets where id=$1", [a])).rows,
  ).toHaveLength(1);
});
it("accepts Markdown as an asset but never as a canvas image", async () => {
  const id = "55555555-5555-4555-8555-555555555555";
  await db.query(
    "insert into assets(id,owner_id,project_id,object_path,mime,width,height,bytes,name) values($1,$2,$3,$4,'text/markdown',1,1,30,'article.md')",
    [id, o, p, o + "/article.md"],
  );
  await expect(
    db.query("select place_canvas_asset($1,$2,$3,gen_random_uuid(),0,0)", [
      o,
      p,
      id,
    ]),
  ).rejects.toThrow("ASSET_NOT_FOUND");
});
it("begins an idempotent Agent run and prevents concurrent runs", async () => {
  const id = "66666666-6666-4666-8666-666666666666";
  const args = [o, p, id, "hello", JSON.stringify([a])];
  const first = await db.query<{ value: { id: string } }>(
    "select begin_agent_run($1,$2,$3,$4,$5) as value",
    args,
  );
  expect(first.rows[0].value.id).toBe(id);
  expect(
    (
      await db.query<{ value: { id: string } }>(
        "select begin_agent_run($1,$2,$3,$4,$5) as value",
        args,
      )
    ).rows[0].value.id,
  ).toBe(id);
  await expect(
    db.query("select begin_agent_run($1,$2,gen_random_uuid(),'again','[]')", [
      o,
      p,
    ]),
  ).rejects.toThrow("ACTIVE_AGENT_RUN");
  await expect(
    db.query("select begin_agent_run($1,$2,$3,'changed',$4)", [
      o,
      p,
      id,
      JSON.stringify([a]),
    ]),
  ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
});
