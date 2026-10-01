import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { analyzeImage, type AnalyzeResult } from "@/lib/ai/client";
import { createServiceClient } from "@/lib/supabase/service";
import { assertAiBudget, settleAiBudget } from "@/lib/ai/budget";

type Scene = { id: string; cat: string; sev: string; photo: string; correct: string; setting: string; code?: string; why?: string };
const ids = ["taped-door-latch", "door-propped-chock", "strobe-blocked-tv", "open-junction-box",
  "space-heater-strip", "sprinkler-wrench-left", "garage-sprinkler-wire", "hospital-outlet", "viking-test-orifice", "jockey-pump"];
const escape = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export async function main(args: string[], bank: { SCENES: Scene[] }) {
  const arg = (key: string, fallback: string) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
  const root = path.resolve(arg("--wiki", "D:/LifeSafetyWiki"));
  const out = path.resolve(arg("--out", "test-results/photo-acceptance"));
  const run = args.includes("--run");
  const localBudget = Number(arg("--budget", "2"));
  if (!Number.isFinite(localBudget) || localBudget <= 0 || localBudget > 10) throw new Error("Test budget must be above $0 and at most $10.");
  // Expected answers never enter the AI prompt.
  const selected = ids.map(id => { const scene = bank.SCENES.find(s => s.id === id); if (!scene) throw new Error(`Missing fixture ${id}`); return scene; });
  await fs.mkdir(out, { recursive: true });
  type Row = { id: string; category: string; expected: string; noFindingExpected: boolean; setting: string;
    expectedCitation?: string; file: string; sha256: string; bytes: number; width?: number; height?: number;
    status: string; review: string; analysis?: AnalyzeResult; error?: string; reservationId?: string };
  const rows: Row[] = [];
  // Verify every local image before making a provider request or reserving money.
  for (const scene of selected) {
    const file = path.join(root, "public", scene.photo.split("?")[0]);
    const bytes = await fs.readFile(file);
    const meta = await sharp(bytes).metadata();
    if (!meta.width || !meta.height) throw new Error(`Cannot decode ${scene.id}`);
    rows.push({ id: scene.id, category: scene.cat, expected: scene.correct, setting: scene.setting,
      expectedCitation: scene.code, noFindingExpected: scene.sev === "none", file,
      sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length,
      width: meta.width, height: meta.height, status: "prepared; AI not run", review: "unreviewed" });
  }
  let accounted = 0;
  async function save() {
    await fs.writeFile(path.join(out, "results.json"), JSON.stringify({ createdAt: new Date().toISOString(),
      mode: run ? "real-provider" : "preflight-only", testBudget: localBudget, accountedUsd: accounted,
      scoring: "Human review required. No accuracy percentage is inferred from word overlap. Fixture citations are not verified code authority.", rows }, null, 2));
    const cards = await Promise.all(rows.map(async row => {
      const preview = await sharp(row.file).rotate().resize({ width: 700, height: 500, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
      return `<article><h2>${escape(row.id)}</h2><img src="data:image/jpeg;base64,${preview.toString("base64")}" alt="${escape(row.id)}"><p><b>${escape(row.status)}</b></p><p>Fixture expectation: ${escape(row.expected)}</p><p>Fixture setting (not sent to AI): ${escape(row.setting)}</p><p>${escape(row.error ?? "")}</p><pre>${escape(row.analysis ? JSON.stringify(row.analysis.analysis, null, 2) : "Awaiting real AI run and human review")}</pre></article>`;
    }));
    await fs.writeFile(path.join(out, "review.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Compliance Lens photo acceptance</title><style>body{font:16px system-ui;max-width:1100px;margin:40px auto;padding:20px;background:#f5f7fa;color:#172a38}article{background:white;padding:24px;margin:20px 0;border-radius:12px}img{max-width:100%;max-height:500px}pre{white-space:pre-wrap;overflow-wrap:anywhere}h1{font-size:32px}</style><h1>Local photo acceptance</h1><p>${rows.length} fixtures: visible defects and no-finding controls. ${run ? "Real provider run" : "Image preflight only — no AI accuracy results yet"}.</p><p>Review each finding for visible evidence, missed defects, false positives, severity, and citation applicability. Training labels may depend on context that a photo alone cannot prove. Word overlap is not an accuracy score.</p><p>Accounted charges and retained holds: $${accounted.toFixed(4)} / $${localBudget.toFixed(2)} test limit.</p>${cards.join("")}</html>`);
  }
  await save();
  console.log(`Prepared ${rows.length} readable photos (${rows.filter(r => r.noFindingExpected).length} no-finding controls). Review: ${path.join(out, "review.html")}`);
  if (!run) return;
  const service = createServiceClient();
  if (!service) throw new Error("Real testing needs a local SUPABASE_SERVICE_ROLE_KEY. Preflight report saved; no paid call made.");
  if (![process.env.GOOGLE_API_KEY, process.env.ANTHROPIC_API_KEY, process.env.OPENAI_API_KEY, process.env.OpenAI_API_KEY].some(Boolean)) {
    throw new Error("No local AI provider credential. Preflight report saved; no paid call made.");
  }
  // Resolve the authorized owner by server-verified account data, never a guessed UUID.
  const { data: profiles, error: profileError } = await service.from("profiles").select("user_id").eq("is_admin", true);
  if (profileError) throw new Error("Could not verify administrator accounts.");
  let userId: string | undefined;
  for (const profile of profiles ?? []) {
    const { data } = await service.auth.admin.getUserById(profile.user_id);
    if (data.user?.email?.toLowerCase() === "stanley.samek@proton.me" && data.user.email_confirmed_at) userId = data.user.id;
  }
  if (!userId) throw new Error("Verified owner/admin account was not found.");
  // No production settings are changed. Both the local limit and database allowance apply.
  const cap = Number(arg("--daily-cap", process.env.AI_GLOBAL_DAILY_BUDGET_USD || "0"));
  if (!Number.isFinite(cap) || cap <= 0 || cap > 10) throw new Error("Choose an authorized local --daily-cap between $0 and $10; production stays unchanged.");
  process.env.AI_GLOBAL_DAILY_BUDGET_USD = String(cap);
  for (const row of rows) {
    if (accounted + 0.75 > localBudget) { row.status = "skipped: test budget"; continue; }
    // Approximate the upload's 1024px analysis copy and 600KB bypass; never send labels/context.
    let bytes = await fs.readFile(row.file);
    let mime = row.file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    if (bytes.length >= 600 * 1024 && Math.max(row.width!, row.height!) > 1024) {
      bytes = await sharp(bytes).rotate().resize({ width: 1024, height: 1024, fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
      mime = "image/jpeg";
    }
    const reservation = await assertAiBudget(service, { userId, orgId: null, tier: "default" });
    if (!reservation.ok) { row.status = "blocked: allowance"; row.error = reservation.error; await save(); throw new Error(reservation.error); }
    row.reservationId = reservation.reservationId;
    accounted += 0.75;
    row.status = "reserved; result pending";
    await save(); // A killed process still leaves the hold and audit trail visible.
    try {
      row.analysis = await analyzeImage(bytes.toString("base64"), mime);
      if (row.analysis.costComplete && row.analysis.usage.costUsd > 0) {
        await settleAiBudget(reservation.reservationId, row.analysis.usage.costUsd);
        // Check settlement before releasing the local conservative hold.
        const { data } = await service.from("ai_usage_reservations").select("settled,reserved_usd").eq("id", reservation.reservationId).single();
        if (data?.settled) accounted += Number(data.reserved_usd) - 0.75;
      }
      row.status = "analyzed; human review required";
    } catch (error) { row.status = "AI error; hold retained"; row.error = error instanceof Error ? error.message : "AI failed"; }
    await save();
    console.log(`${row.id}: ${row.status}; accounted $${accounted.toFixed(4)}`);
  }
  await save();
}
