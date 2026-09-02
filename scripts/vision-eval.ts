/**
 * Vision eval harness — runs the app's REAL analysis (lib/ai/client.ts) over a
 * folder of photos, no Supabase involved, and reports what Chip found plus
 * which checklist question the AI pre-fill would have auto-flagged.
 *
 * Usage (from repo root; needs ANTHROPIC_API_KEY in the environment):
 *   npx tsx scripts/vision-eval.ts <folder> [--out <dir>] [--limit N]
 *                                  [--concurrency 3] [--tier default|deep]
 *                                  [--template builtin:healthcare-eoc]
 *
 * Filenames are treated as the ground-truth label (Stanley names photos by
 * the violation they show), so the report reads label → what Chip said.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { analyzeImage, type Tier } from "@/lib/ai/client";
import { getBuiltinTemplate } from "@/lib/checklists/builtin-templates";

type Args = {
  folder: string;
  out: string;
  limit: number;
  concurrency: number;
  tier: Tier;
  template: string;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const folder = argv.find((a) => !a.startsWith("--"));
  if (!folder) {
    console.error("folder argument required");
    process.exit(1);
  }
  const get = (flag: string, dflt: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
  };
  return {
    folder,
    out: get("--out", path.join(process.cwd(), "vision-eval-out")),
    limit: Number(get("--limit", "999")),
    concurrency: Number(get("--concurrency", "3")),
    tier: get("--tier", "default") as Tier,
    template: get("--template", "builtin:healthcare-eoc"),
  };
}

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// Mirrors scoreItem in lib/checklists/engine.ts (phrase = 2, word = 1).
function scoreTerms(hay: string, terms: string[]): number {
  let score = 0;
  for (const term of terms) {
    const t = term.toLowerCase();
    if (t && hay.includes(t)) score += t.includes(" ") ? 2 : 1;
  }
  return score;
}

async function main() {
  const args = parseArgs();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set in environment");
    process.exit(1);
  }
  const template = getBuiltinTemplate(args.template);
  const questions = template
    ? template.sections.flatMap((s) =>
        s.items.map((it, idx) => ({
          code: `${s.code}.${idx + 1}`,
          q: it.q,
          match: it.match ?? [],
        })),
      )
    : [];

  const entries = (await fs.readdir(args.folder, { withFileTypes: true }))
    .filter((e) => e.isFile() && MIME[path.extname(e.name).toLowerCase()])
    .map((e) => e.name)
    .sort()
    .slice(0, args.limit);

  console.log(`Analyzing ${entries.length} photos from ${args.folder} (tier=${args.tier}, concurrency=${args.concurrency})`);
  await fs.mkdir(args.out, { recursive: true });

  type Row = {
    file: string;
    ok: boolean;
    error?: string;
    durationMs: number;
    cost: number;
    model?: string;
    quality?: string;
    summary?: string;
    findings: Array<{
      title: string;
      severity: string;
      category: string;
      code: string;
      confidence: number;
      matched: string | null;
      matchScore: number;
    }>;
    notVisible: string[];
  };

  const rows: Row[] = [];
  let next = 0;
  async function worker() {
    while (next < entries.length) {
      const file = entries[next++];
      const full = path.join(args.folder, file);
      const started = Date.now();
      try {
        const buf = await fs.readFile(full);
        const mime = MIME[path.extname(file).toLowerCase()];
        const res = await analyzeImage(buf.toString("base64"), mime, args.tier);
        const findings = res.analysis.violations.map((v) => {
          const hay = `${v.title} ${v.description} ${v.code}`.toLowerCase();
          let best: { code: string; q: string; score: number } | null = null;
          for (const qn of questions) {
            const s = scoreTerms(hay, qn.match);
            if (s > 0 && (!best || s > best.score)) best = { code: qn.code, q: qn.q, score: s };
          }
          return {
            title: v.title,
            severity: v.severity,
            category: v.category,
            code: v.code,
            confidence: v.confidence,
            matched: best ? `${best.code} ${best.q}` : null,
            matchScore: best?.score ?? 0,
          };
        });
        rows.push({
          file,
          ok: true,
          durationMs: res.durationMs,
          cost: res.usage?.costUsd ?? 0,
          model: res.model,
          quality: res.analysis.summary?.imageQuality,
          summary: res.analysis.summary?.text,
          findings,
          notVisible: res.analysis.notVisible.map((n) => n.item),
        });
        console.log(`✓ ${file} — ${findings.length} findings, ${(res.durationMs / 1000).toFixed(1)}s`);
      } catch (err) {
        rows.push({
          file,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - started,
          cost: 0,
          findings: [],
          notVisible: [],
        });
        console.log(`✗ ${file} — ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  await Promise.all(Array.from({ length: args.concurrency }, worker));

  rows.sort((a, b) => a.file.localeCompare(b.file));
  await fs.writeFile(path.join(args.out, "raw.json"), JSON.stringify(rows, null, 2));

  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const avgMs = rows.length ? rows.reduce((s, r) => s + r.durationMs, 0) / rows.length : 0;
  const lines: string[] = [];
  lines.push(`# Vision eval — ${path.basename(args.folder)}`);
  lines.push("");
  lines.push(`${rows.length} photos · tier ${args.tier} · model ${rows.find((r) => r.model)?.model ?? "?"} · total cost $${totalCost.toFixed(3)} · avg ${(avgMs / 1000).toFixed(1)}s/photo · template ${args.template}`);
  lines.push("");
  for (const r of rows) {
    lines.push(`## ${r.file}`);
    if (!r.ok) {
      lines.push(`ERROR: ${r.error}`);
      lines.push("");
      continue;
    }
    lines.push(`quality: ${r.quality} · ${(r.durationMs / 1000).toFixed(1)}s · $${r.cost.toFixed(4)}`);
    if (r.summary) lines.push(`> ${r.summary}`);
    if (r.findings.length === 0) lines.push("- (no findings)");
    for (const f of r.findings) {
      lines.push(
        `- **${f.severity}** ${f.title} — ${f.category} · ${f.code} · conf ${Math.round(f.confidence * 100)}%` +
          (f.matched ? `\n  ↳ checklist: ${f.matched} (score ${f.matchScore})` : "\n  ↳ checklist: (no match — would not auto-file)"),
      );
    }
    if (r.notVisible.length) lines.push(`- not visible: ${r.notVisible.join("; ")}`);
    lines.push("");
  }
  await fs.writeFile(path.join(args.out, "report.md"), lines.join("\n"));
  console.log(`\nDone. $${totalCost.toFixed(3)} total. Report: ${path.join(args.out, "report.md")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
