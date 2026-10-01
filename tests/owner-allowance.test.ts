import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const org = "33333333-3333-4333-8333-333333333333";
let db: PGlite;
const migration = readFileSync("supabase/migrations/0033_owner_ai_allowance.sql", "utf8");
beforeAll(async () => {
 db = new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
 create table profiles(user_id uuid primary key,is_admin boolean default false);
 create table organizations(id uuid primary key);
 create table organization_members(organization_id uuid,user_id uuid,role text);
 create function is_org_member(id uuid) returns boolean language sql stable as $$
 select exists(select 1 from organization_members where organization_id=id and user_id=auth.uid()) $$;
 create table ai_calls(provider text);
 insert into auth.users values('${owner}','stanley.samek@proton.me',now()),('${other}','other@example.com',now());
 insert into profiles values('${owner}',true),('${other}',true);
 insert into organizations values('${org}');
 insert into organization_members values('${org}','${owner}','member');
 select set_config('test.user','${owner}',false);`);
 await db.exec(readFileSync("supabase/migrations/0029_paid_ai_entitlements.sql", "utf8"));
 await db.exec(migration);
}, 30000);
afterAll(async () => { await db?.close(); });
async function reserve(user = owner, team: string | null = null, cap = 10) {
 return (await db.query<{ result: { ok: boolean; reservationId: string; error?: string; plan: string } }>(
  "select reserve_paid_ai($1,$2,'deep',$3) result", [user, team, cap])).rows[0].result;
}
describe.sequential("complimentary owner allowance", () => {
 it("automatically enables advanced access only for the verified owner/admin", async () => {
  expect(await reserve()).toMatchObject({ ok: true, plan: "healthcare" });
  expect((await reserve(other)).ok).toBe(false);
 });
 it("works in a writable team but cannot bypass viewer restrictions or a global pause", async () => {
  expect((await reserve(owner, org)).ok).toBe(true);
  await db.exec("update organization_members set role='viewer'");
  expect((await reserve(owner, org)).ok).toBe(false);
  expect((await reserve(owner, null, 0)).ok).toBe(false);
 });
 it("keeps holds across months and reports the $8 warning threshold", async () => {
  await db.exec("update ai_usage_reservations set created_at=now()-interval '2 months';");
  expect((await reserve()).ok).toBe(true);
  expect((await reserve()).ok).toBe(true);
  const summary = (await db.query<{ result: { used: number; held: number; warningAt: number } }>("select ai_allowance_summary() result")).rows[0].result;
  expect(summary).toMatchObject({ used: 8, held: 8, warningAt: 8 });
  expect((await reserve()).ok).toBe(true);
  expect((await reserve()).ok).toBe(false);
 });
 it("reapplication never resets the allowance", async () => {
  await db.exec(migration); expect((await reserve()).ok).toBe(false);
 });
 it("settles a hold and revokes complimentary access if administrator status is removed", async () => {
  await db.exec("update ai_usage_reservations set reserved_usd=0.01,settled=true;");
  expect((await reserve()).ok).toBe(true);
  await db.exec(`update profiles set is_admin=false where user_id='${owner}'`);
  expect((await reserve()).ok).toBe(false);
 });
 it("prevents browser roles from granting themselves plans", async () => {
  await db.exec("grant usage on schema public to authenticated; set role authenticated;");
  await expect(db.query("select ensure_owner_ai_entitlement($1)",[other])).rejects.toThrow(/permission denied/);
  await db.exec("reset role");
 });
});
