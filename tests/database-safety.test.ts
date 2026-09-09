import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
let db: PGlite;
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const inspection = "33333333-3333-4333-8333-333333333333";
const photo = "44444444-4444-4444-8444-444444444444";
const sqlFile = (name: string) =>
  readFileSync(`supabase/migrations/${name}`, "utf8");
const analysis = (title = "Blocked exit", severity = "High") => ({
  schemaVersion: "1.1",
  image: { width: 100, height: 100 },
  summary: { text: "Draft", confidence: 0.9, imageQuality: "clear" },
  violations: [
    {
      title,
      category: "Egress",
      severity,
      code: "Verify locally",
      description: "Boxes",
      remediation: "Clear",
      location: "Hall",
      references: [],
      coordinates: { x1: 0, y1: 0, x2: 1, y2: 1 },
      confidence: 0.9,
    },
  ],
  whatToLookFor: [{ item: "Clear route", details: "Inspect" }],
  notVisible: [{ item: "Exit width", reason: "Measure on site" }],
});
async function save(
  payload = analysis(),
  replace = false,
  expected: string | null = null,
) {
  return db.query<{
    result: { findingsCount: number; preservedCount: number };
  }>("select save_photo_analysis($1,$2::jsonb,$3,$4::timestamptz) result", [
    photo,
    JSON.stringify(payload),
    replace,
    expected,
  ]);
}
async function timestamp() {
  return (
    await db.query<{ t: string }>(
      "select analyzed_at::text t from photos where id=$1",
      [photo],
    )
  ).rows[0].t;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
 create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
 create table public.organizations(id uuid primary key);
 create table public.organization_members(organization_id uuid,user_id uuid,role text);
 create function public.is_org_member(id uuid) returns boolean language sql stable as $$ select exists(select 1 from organization_members where organization_id=id and user_id=auth.uid()) $$;`);
  // Use original table definitions rather than maintaining duplicate column schemas.
  const base = sqlFile("0001_init.sql");
  for (const name of [
    "inspections",
    "photos",
    "findings",
    "what_to_look_for",
    "not_visible",
  ]) {
    const start = base.indexOf(`create table if not exists public.${name} (`);
    const end = base.indexOf("\n);", start) + 4;
    await db.exec(base.slice(start, end));
  }
  await db.exec(`alter table inspections add organization_id uuid;
 alter table photos add analysis_status text default 'queued', add analysis_error text;
 alter table findings add assigned_to uuid, add assigned_email text, add assigned_at timestamptz,
 add assigned_by uuid, add priority text default 'medium', add action_closed_at timestamptz,
 add closure_photo_id uuid, add closure_note text;
 create table finding_comments(id uuid default gen_random_uuid(),finding_id uuid references findings(id) on delete cascade);
 create table plan_pins(id uuid default gen_random_uuid(),finding_id uuid references findings(id) on delete cascade);
 create table inspection_checklist_items(finding_id uuid references findings(id) on delete set null);
 create table analysis_jobs(inspection_id uuid,status text);
 create function can_write_inspection(_inspection_id uuid) returns boolean language sql stable as $$
 select exists(select 1 from inspections where id=_inspection_id and created_by=auth.uid()) $$;
 create table profiles(user_id uuid primary key,is_admin boolean default false);
 create table ai_calls(provider text constraint ai_calls_provider_check check(provider in ('anthropic','openai')));`);
  await db.exec(sqlFile("0010_finding_feedback.sql"));
  await db.exec(sqlFile("0012_not_visible_resolution.sql"));
  await db.exec(sqlFile("0013_not_visible_skip.sql"));
  await db.exec(`alter table inspections add column if not exists facility_id uuid;
 create table facilities(id uuid primary key,created_by uuid);
 create function can_access_inspection(id uuid) returns boolean language sql stable as $$ select can_write_inspection(id) $$;
 create function can_access_facility(id uuid) returns boolean language sql stable as $$ select exists(select 1 from facilities where facilities.id=id and created_by=auth.uid()) $$;
 create function can_write_facility(id uuid) returns boolean language sql stable as $$ select can_access_facility(id) $$;
 create table inspection_sections(inspection_id uuid,created_by uuid default auth.uid(),name text,sort_order integer);
 alter table inspection_checklist_items add inspection_id uuid, add template_ref text,add template_name text,
 add section_code text,add section_title text,add sort integer,add question text,add code_ref text,
 add match_terms text[],add answer text,add answered_by_ai boolean default false;
 `);
  const assetSql = sqlFile("0026_assets.sql");
  const assetStart = assetSql.indexOf(
    "create table if not exists public.assets (",
  );
  await db.exec(
    assetSql.slice(assetStart, assetSql.indexOf("\n);", assetStart) + 4),
  );
  await db.exec(sqlFile("0028_atomic_analysis.sql"));
  await db.exec(sqlFile("0029_paid_ai_entitlements.sql"));
  await db.exec(sqlFile("0030_inspection_schedules.sql"));
  await db.exec(sqlFile("0031_asset_checks.sql"));
  await db.exec(`create unique index assets_facility_barcode_uidx on assets(facility_id,barcode) where barcode is not null;
 create table facility_plans(id uuid primary key,facility_id uuid);
 alter table plan_pins add plan_id uuid,add facility_id uuid,add kind text,add asset_id uuid,add x numeric,add y numeric,add label text,add created_by uuid,add created_at timestamptz default now();`);
  await db.exec(sqlFile("0032_equipment_import_placement.sql"));
  // Reapplying the release migrations must be safe.
  for (const migration of [
    "0028_atomic_analysis.sql",
    "0029_paid_ai_entitlements.sql",
    "0030_inspection_schedules.sql",
    "0031_asset_checks.sql",
    "0032_equipment_import_placement.sql",
  ])
    await db.exec(sqlFile(migration));

  await db.exec(`grant usage on schema public,auth to authenticated,service_role,anon;
 grant all on all tables in schema public,auth to authenticated,service_role;
 insert into auth.users values ('${owner}'),('${other}');
 select set_config('test.user','${owner}',false);
 insert into inspections(id,created_by,facility_name) values('${inspection}','${owner}','Test facility');
 insert into photos(id,inspection_id,created_by,storage_path) values('${photo}','${inspection}','${owner}','test.jpg');
 set role authenticated;`);
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe.sequential("transactional inspection safety", () => {
  it("denies another user's save", async () => {
    await db.query("select set_config('test.user',$1,false)", [other]);
    await expect(save()).rejects.toThrow(/permission/);
    await db.query("select set_config('test.user',$1,false)", [owner]);
  });
  it("blocks RPC and direct finalization while a photo is pending", async () => {
    await expect(
      db.query("update inspections set status='completed' where id=$1", [
        inspection,
      ]),
    ).rejects.toThrow(/Finish photo analysis/);
    await expect(
      db.query("select set_inspection_status_checked($1,'completed')", [
        inspection,
      ]),
    ).rejects.toThrow(/Finish photo analysis/);
  });
  it("saves the entire analysis and makes job replay idempotent", async () => {
    expect((await save()).rows[0].result.findingsCount).toBe(1);
    await save();
    expect(
      (await db.query<{ n: number }>("select count(*)::int n from findings"))
        .rows[0].n,
    ).toBe(1);
  });
  it("rolls back deletion if a replacement violates a constraint", async () => {
    const before = await timestamp();
    await expect(
      save(analysis("Invalid", "Critical"), true, before),
    ).rejects.toThrow();
    expect(
      (await db.query<{ title: string }>("select title from findings")).rows[0]
        .title,
    ).toBe("Blocked exit");
    expect(await timestamp()).toBe(before);
  });
  it("preserves assigned findings, linked comments, and missing evidence", async () => {
    await db.exec(
      "update findings set assigned_email='manager@example.test'; insert into finding_comments(finding_id) select id from findings;",
    );
    const payload = analysis();
    payload.notVisible = [];
    const result = await save(payload, true, await timestamp());
    expect(result.rows[0].result.preservedCount).toBe(1);
    expect(result.rows[0].result.findingsCount).toBe(1);
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from finding_comments",
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await db.query<{ resolved: boolean }>(
          "select resolved from not_visible",
        )
      ).rows[0].resolved,
    ).toBe(false);
  });
  it("rejects a stale concurrent reanalysis", async () => {
    await expect(
      save(analysis(), true, "2020-01-01T00:00:00Z"),
    ).rejects.toThrow(/newer analysis/);
  });
  it("locks completed inspections against new photos and AI results", async () => {
    await db.query("select set_inspection_status_checked($1,'completed')", [
      inspection,
    ]);
    await expect(save(analysis(), true, await timestamp())).rejects.toThrow(
      /finalized/,
    );
    await expect(
      db.query(
        "insert into photos(inspection_id,created_by,storage_path) values($1,$2,'late.jpg')",
        [inspection, owner],
      ),
    ).rejects.toThrow(/finalized/);
    await db.query("select set_inspection_status_checked($1,'in_progress')", [
      inspection,
    ]);
  });
  it("blocks self-admin creation and promotion", async () => {
    await expect(
      db.query("insert into profiles(user_id,is_admin) values($1,true)", [
        owner,
      ]),
    ).rejects.toThrow(/Administrator/);
    await db.query("insert into profiles(user_id,is_admin) values($1,false)", [
      owner,
    ]);
    await expect(
      db.query("update profiles set is_admin=true where user_id=$1", [owner]),
    ).rejects.toThrow(/Administrator/);
  });
  it("browser role cannot mint entitlements or reserve paid usage directly", async () => {
    await expect(
      db.query(
        "insert into ai_entitlements(user_id,plan,active_until,monthly_credits,monthly_budget_usd,payment_reference) values($1,'pro',now()+interval '1 month',100,5,'fake')",
        [owner],
      ),
    ).rejects.toThrow();
    await expect(
      db.query("select reserve_paid_ai($1,null,'default',25)", [owner]),
    ).rejects.toThrow(/permission/);
  });
  it("service denies free users, Pro deep calls, exhausted allowances, and expired plans", async () => {
    await db.exec("reset role; set role service_role;");
    const reserve = async (tier = "default") =>
      (
        await db.query<{ r: { ok: boolean; reservationId?: string } }>(
          "select reserve_paid_ai($1,null,$2,25) r",
          [owner, tier],
        )
      ).rows[0].r;
    expect((await reserve()).ok).toBe(false);
    await db.query(
      "insert into ai_entitlements(user_id,plan,active_until,monthly_credits,monthly_budget_usd,payment_reference) values($1,'pro',now()+interval '1 month',1,5,'verified-test')",
      [owner],
    );
    expect((await reserve("deep")).ok).toBe(false);
    expect((await reserve()).ok).toBe(true);
    expect((await reserve()).ok).toBe(false);
    await db.exec(
      "update ai_entitlements set active_until=now()-interval '1 day', monthly_credits=100",
    );
    expect((await reserve()).ok).toBe(false);
  });
  it("viewer cannot borrow a team entitlement", async () => {
    const org = "55555555-5555-4555-8555-555555555555";
    await db.query("insert into organizations values($1)", [org]);
    await db.query("insert into organization_members values($1,$2,'viewer')", [
      org,
      owner,
    ]);
    await db.query(
      "insert into ai_entitlements(organization_id,plan,active_until,monthly_credits,monthly_budget_usd,payment_reference) values($1,'facility',now()+interval '1 month',100,20,'verified-team')",
      [org],
    );
    expect(
      (
        await db.query<{ r: { ok: boolean } }>(
          "select reserve_paid_ai($1,$2,'default',25) r",
          [owner, org],
        )
      ).rows[0].r.ok,
    ).toBe(false);
  });
});

describe.sequential("repeat inspections and equipment checks", () => {
  it("clones questions with fresh answers and handles month-end recurrence without drift", async () => {
    await db.exec(
      `reset role; set role authenticated; select set_config('test.user','${owner}',false);`,
    );
    await db.query(
      "insert into inspection_checklist_items(inspection_id,section_code,section_title,sort,question,answer) values($1,'A','Egress',1,'Route clear?','yes')",
      [inspection],
    );
    await db.query(
      "insert into inspection_sections(inspection_id,name,sort_order) values($1,'Egress',1)",
      [inspection],
    );
    const schedule = (
      await db.query<{ id: string }>(
        "insert into inspection_schedules(source_inspection_id,name,cadence,next_due,anchor_day) values($1,'Monthly round','monthly','2024-01-31',31) returning id",
        [inspection],
      )
    ).rows[0].id;
    const first = (
      await db.query<{ id: string }>(
        "select start_scheduled_inspection($1,'2024-01-31') id",
        [schedule],
      )
    ).rows[0].id;
    expect(first).not.toBe(inspection);
    expect(
      (
        await db.query<{ answer: string | null }>(
          "select answer from inspection_checklist_items where inspection_id=$1",
          [first],
        )
      ).rows[0].answer,
    ).toBeNull();
    const duplicate = (
      await db.query<{ id: string }>(
        "select start_scheduled_inspection($1,'2024-01-31') id",
        [schedule],
      )
    ).rows[0].id;
    expect(duplicate).toBe(first);
    expect(
      (
        await db.query<{ d: string }>(
          "select next_due::text d from inspection_schedules where id=$1",
          [schedule],
        )
      ).rows[0].d,
    ).toBe("2024-02-29");
    await db.query("select start_scheduled_inspection($1,'2024-02-29')", [
      schedule,
    ]);
    expect(
      (
        await db.query<{ d: string }>(
          "select next_due::text d from inspection_schedules where id=$1",
          [schedule],
        )
      ).rows[0].d,
    ).toBe("2024-03-31");
  });
  it("rejects early and paused schedule starts", async () => {
    const schedule = (
      await db.query<{ id: string }>(
        "insert into inspection_schedules(source_inspection_id,name,cadence,next_due,anchor_day) values($1,'Later','weekly','2099-01-01',1) returning id",
        [inspection],
      )
    ).rows[0].id;
    await expect(
      db.query("select start_scheduled_inspection($1,'2099-01-01')", [
        schedule,
      ]),
    ).rejects.toThrow(/not due/);
    await db.query(
      "update inspection_schedules set next_due='2024-01-01',enabled=false where id=$1",
      [schedule],
    );
    await expect(
      db.query("select start_scheduled_inspection($1,'2024-01-01')", [
        schedule,
      ]),
    ).rejects.toThrow(/not due/);
  });
  it("requires notes for a failed check and keeps not-tested equipment due", async () => {
    const facility = "66666666-6666-4666-8666-666666666666";
    await db.query("insert into facilities values($1,$2)", [facility, owner]);
    const asset = (
      await db.query<{ id: string }>(
        "insert into assets(facility_id,created_by,type,label,next_due_at) values($1,$2,'extinguisher','FE-01','2024-01-01') returning id",
        [facility, owner],
      )
    ).rows[0].id;
    await expect(
      db.query("select record_asset_check($1,'fail','',null)", [asset]),
    ).rejects.toThrow();
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from asset_checks",
        )
      ).rows[0].n,
    ).toBe(0);
    await db.query(
      "select record_asset_check($1,'not_tested','Room inaccessible','2024-02-01')",
      [asset],
    );
    expect(
      (
        await db.query<{ d: string }>(
          "select next_due_at::date::text d from assets where id=$1",
          [asset],
        )
      ).rows[0].d,
    ).toBe("2024-01-01");
    await db.query(
      "select record_asset_check($1,'pass','Monthly check','2024-02-01')",
      [asset],
    );
    expect(
      (
        await db.query<{ d: string }>(
          "select next_due_at::date::text d from assets where id=$1",
          [asset],
        )
      ).rows[0].d,
    ).toBe("2024-02-01");
  });
});

describe.sequential("equipment report import and placement", () => {
  const facility = "66666666-6666-4666-8666-666666666666";
  const second = "77777777-7777-4777-8777-777777777777";
  const plan = "88888888-8888-4888-8888-888888888888";
  const row = {
    barcode: "000123",
    label: "West extinguisher",
    type: "extinguisher",
    location: "West corridor",
    manufacturer: "Example",
    model: "ABC",
    serial: "00999",
  };
  async function run(rows: unknown[], overwrite = false, building = facility) {
    return db.query<{ r: { added: number; updated: number; skipped: number } }>(
      "select import_equipment_rows($1,$2::jsonb,$3) r",
      [building, JSON.stringify(rows), overwrite],
    );
  }
  it("preserves leading zeros, skips existing rows, and updates only when requested", async () => {
    expect((await run([row])).rows[0].r.added).toBe(1);
    expect((await run([{ ...row, location: "Wrong" }])).rows[0].r.skipped).toBe(
      1,
    );
    expect(
      (
        await db.query<{ location_text: string }>(
          "select location_text from assets where barcode='000123'",
        )
      ).rows[0].location_text,
    ).toBe(row.location);
    expect(
      (await run([{ ...row, location: "Reviewed new location" }], true)).rows[0]
        .r.updated,
    ).toBe(1);
  });
  it("rolls back an invalid batch and rejects duplicated identifiers", async () => {
    await expect(
      run([
        { ...row, barcode: "NEW" },
        { ...row, barcode: "BAD", type: "invalid" },
      ]),
    ).rejects.toThrow();
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from assets where barcode='NEW'",
        )
      ).rows[0].n,
    ).toBe(0);
    await expect(run([row, row])).rejects.toThrow(/Duplicate/);
  });
  it("allows the same barcode in different buildings and prevents unauthorized imports", async () => {
    await db.query("insert into facilities values($1,$2)", [second, owner]);
    expect((await run([row], false, second)).rows[0].r.added).toBe(1);
    await db.query("select set_config('test.user',$1,false)", [other]);
    await expect(run([row])).rejects.toThrow(/permission/);
    await db.query("select set_config('test.user',$1,false)", [owner]);
  });
  it("places equipment once, moves the same pin, and rejects a different building", async () => {
    await db.query("insert into facility_plans values($1,$2)", [
      plan,
      facility,
    ]);
    const asset = (
      await db.query<{ id: string }>(
        "select id from assets where facility_id=$1 and barcode='000123'",
        [facility],
      )
    ).rows[0].id;
    const pin = (
      await db.query<{ id: string }>(
        "select place_asset_on_plan($1,$2,0.25,0.75) id",
        [asset, plan],
      )
    ).rows[0].id;
    expect(
      (
        await db.query<{ id: string }>(
          "select place_asset_on_plan($1,$2,0.5,0.6) id",
          [asset, plan],
        )
      ).rows[0].id,
    ).toBe(pin);
    const otherAsset = (
      await db.query<{ id: string }>(
        "select id from assets where facility_id=$1 and barcode='000123'",
        [second],
      )
    ).rows[0].id;
    await expect(
      db.query("select place_asset_on_plan($1,$2,0.2,0.4)", [otherAsset, plan]),
    ).rejects.toThrow(/this building/);
    await expect(
      db.query("update plan_pins set asset_id=$1 where id=$2", [
        otherAsset,
        pin,
      ]),
    ).rejects.toThrow(/same building/);
    await expect(
      db.query("select place_asset_on_plan($1,$2,2,0.4)", [asset, plan]),
    ).rejects.toThrow(/position/);
  });
});

describe("persistent equipment location integrity",()=>{
 it("rejects duplicate pins and later building changes",async()=>{
 const asset=(await db.query<{id:string}>("select id from assets where barcode='000123' and facility_id='66666666-6666-4666-8666-666666666666'")).rows[0].id;
 await expect(db.query("insert into plan_pins(plan_id,facility_id,kind,asset_id,x,y) select plan_id,facility_id,kind,asset_id,x,y from plan_pins where asset_id=$1",[asset])).rejects.toThrow(/unique/);
 await expect(db.query("update assets set facility_id='77777777-7777-4777-8777-777777777777' where id=$1",[asset])).rejects.toThrow(/placements/);
 await expect(db.query("update facility_plans set facility_id='77777777-7777-4777-8777-777777777777' where id='88888888-8888-4888-8888-888888888888'")).rejects.toThrow(/placements/);
 });
});
