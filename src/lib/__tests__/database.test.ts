import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, it, expect } from "vitest";
let db: PGlite;
const owner = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  project = "33333333-3333-4333-8333-333333333333",
  request = "44444444-4444-4444-8444-444444444444";
async function begin(key = request, prompt = "blue mug") {
  const result = await db.query<{
    value: { generation: { id: string }; is_new: boolean };
  }>(
    'select public.begin_generation($1,$2,$3,$4,\'nano\',\'{"resolution":"1K","ratio":"1:1"}\',null,true) as value',
    [owner, project, key, prompt],
  );
  return result.rows[0].value;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key);create table storage.objects(id uuid);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;insert into auth.users values('${owner}'),('${other}');`,
  );
  await db.exec(
    await readFile("supabase/migrations/20261120085234_app.sql", "utf8"),
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
it("creates project, task and placeholder atomically; same request returns same task", async () => {
  const a = await begin(),
    b = await begin();
  expect(a.is_new).toBe(true);
  expect(b.is_new).toBe(false);
  expect(b.generation.id).toBe(a.generation.id);
  expect((await db.query("select * from canvas_nodes")).rows).toHaveLength(1);
});
it("rejects reused idempotency key with changed input and second active task", async () => {
  await expect(begin(request, "different")).rejects.toThrow(
    "IDEMPOTENCY_CONFLICT",
  );
  await expect(begin("55555555-5555-4555-8555-555555555555")).rejects.toThrow(
    "ACTIVE_GENERATION",
  );
});
it("rejects cross owner project foreign keys", async () => {
  await expect(
    db.query(
      "insert into generations(owner_id,project_id,request_key,prompt,model,config) values($1,$2,gen_random_uuid(),'x','nano','{}')",
      [other, project],
    ),
  ).rejects.toThrow();
});
it("saves positions with revision and rejects stale writes", async () => {
  const node = (await db.query<{ id: string }>("select id from canvas_nodes"))
    .rows[0];
  const args = [
    owner,
    project,
    1,
    JSON.stringify([{ id: node.id, x: 42, y: 19 }]),
    '{"x":0,"y":0,"zoom":1}',
    "{}",
  ];
  expect(
    (
      await db.query<{ value: number }>(
        "select save_canvas($1,$2,$3,$4,$5,$6) as value",
        args,
      )
    ).rows[0].value,
  ).toBe(2);
  await expect(
    db.query("select save_canvas($1,$2,$3,$4,$5,$6)", args),
  ).rejects.toThrow("REVISION_CONFLICT");
});
it("leases permit one synchronizer; wrong token cannot finish", async () => {
  const g = await begin(),
    token = "66666666-6666-4666-8666-666666666666";
  await db.query("update generations set status='pending' where id=$1", [
    g.generation.id,
  ]);
  expect(
    (
      await db.query<{ value: boolean }>(
        "select claim_generation_sync($1,$2,$3) as value",
        [owner, g.generation.id, token],
      )
    ).rows[0].value,
  ).toBe(true);
  expect(
    (
      await db.query<{ value: boolean }>(
        "select claim_generation_sync($1,$2,$3) as value",
        [owner, g.generation.id, token],
      )
    ).rows[0].value,
  ).toBe(false);
  expect(
    (
      await db.query<{ value: boolean }>(
        "select complete_generation($1,$2,$3,'[]') as value",
        [owner, g.generation.id, request],
      )
    ).rows[0].value,
  ).toBe(false);
});
it("authenticated users cannot execute privileged RPC or modify records", async () => {
  await db.exec("set role authenticated");
  try {
    await expect(
      db.query("select begin_generation($1,$2,$3,'x','nano','{}')", [
        owner,
        project,
        request,
      ]),
    ).rejects.toThrow("permission denied");
    await expect(db.exec("update projects set name='hacked'")).rejects.toThrow(
      "permission denied",
    );
  } finally {
    await db.exec("reset role");
  }
});
it("RLS hides other accounts projects", async () => {
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${other}';`);
  try {
    expect((await db.query("select * from projects")).rows).toHaveLength(0);
  } finally {
    await db.exec("reset role");
  }
});
