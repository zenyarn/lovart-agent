import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
let db: PGlite;
const owner = randomUUID(), other = randomUUID(), project = randomUUID();
async function balance(id = owner) {
  return (await db.query<{balance:number}>("select ensure_credit_account($1) as balance",[id])).rows[0].balance;
}
async function begin(key = randomUUID()) {
  return (await db.query<{value:{generation:{id:string},is_new:boolean}}>("select begin_generation($1,$2,$3,'test','nano','{}',null,true) as value",[owner,project,key])).rows[0].value;
}
beforeAll(async()=>{
 db = new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key);create table storage.objects(id uuid);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;insert into auth.users values('${owner}'),('${other}');`);
 await db.exec(await readFile('supabase/migrations/20261120085234_app.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261121070012_account_credits.sql','utf8'));
},30000);
afterAll(async()=>{await db.close();});
it('grants five credits once and isolates account balances',async()=>{
 expect(await balance()).toBe(5); expect(await balance()).toBe(5); expect(await balance(other)).toBe(5);
});
it('reserves once for repeated requests and refunds an explicit failure once',async()=>{
 const key=randomUUID(), a=await begin(key); await begin(key);
 expect(await balance()).toBe(4);
 await db.query("update generations set status='persisting',error='temporary storage failure' where id=$1",[a.generation.id]);
 await begin(key);
 expect(await balance()).toBe(4);
 expect((await db.query("select id from credit_ledger where generation_id=$1 and kind='generation'",[a.generation.id])).rows).toHaveLength(1);
 await db.query("update generations set status='submission_unknown' where id=$1",[a.generation.id]);
 expect(await balance()).toBe(4);
 await db.query("update generations set status='failed' where id=$1",[a.generation.id]);
 await db.query("update generations set status='failed' where id=$1",[a.generation.id]);
 expect(await balance()).toBe(5);
 expect(await balance(other)).toBe(5);
});
it('stops the sixth generation atomically with no extra placeholder',async()=>{
 for(let i=0;i<5;i++) {const a=await begin(); await db.query("update generations set status='succeeded' where id=$1",[a.generation.id]);}
 expect(await balance()).toBe(0);
 const before=(await db.query('select id from canvas_nodes')).rows.length;
 await expect(begin()).rejects.toThrow('INSUFFICIENT_CREDITS');
 expect((await db.query('select id from canvas_nodes')).rows.length).toBe(before);
 expect(await balance()).toBe(0);
});
it('prevents users from granting credits or editing balances and hides other users',async()=>{
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${owner}';`);
 expect((await db.query('select owner_id from credit_accounts')).rows).toEqual([{owner_id:owner}]);
 await expect(db.query('select ensure_credit_account($1)',[owner])).rejects.toThrow('permission denied');
 await expect(db.exec('update credit_accounts set balance=100')).rejects.toThrow('permission denied');
 await db.exec('reset role');
});
