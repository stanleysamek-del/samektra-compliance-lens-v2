/**
 * Labeled vision eval against LifeSafetyWiki's Field Call scene bank.
 *
 * Every scene has a photo, the CORRECT call, three distractors, a code
 * citation, and a teaching explanation — real ground truth, not filename
 * guesses. This runs the app's actual analyzeImage() on each photo and
 * scores whether Chip's findings land on the correct call.
 *
 * Scoring (deliberately simple and inspectable): tokenize the scene's
 * correct answer + question + explanation into content words; tokenize
 * Chip's findings (title + description + code); a scene is a HIT when the
 * overlap with the correct-answer tokens is >= 3 AND beats the overlap
 * with every distractor. Everything is written to the report so a human
 * can disagree with the scorer line by line.
 *
 * Usage (repo root, ANTHROPIC_API_KEY in env):
 *   npx --yes tsx@4.19.2 scripts/vision-eval-gamebank.ts
 *       [--bank D:/LifeSafetyWiki/.claude/worktrees/.../lib/fieldCallScenes.js]
 *       [--photos <folder with the scene jpgs>] [--limit 40] [--offset 0]
 *       [--concurrency 2] [--tier default|deep] [--out <dir>]
 *       [--track technical|clinical|hardcore|all]
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeImage, type Tier } from "@/lib/ai/client";
import { getBuiltinTemplate } from "@/lib/checklists/builtin-templates";

type Scene = {
  id: string;
  cat: string;
  sev: string;
  photo: string;
  q: string;
  correct: string;
  d: string[];
  code?: string;
  why?: string;
};

const STOP = new Set(
  "the a an and or of to in on for with is are be by at from this that it its as not no into over under than then when which who what where their there here they them these those you your our can may must should will would has have had do does did been being also very more most less".split(" "),
);

function tokens(s: string): Set<string> {
  return new Set(
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9§. ]+/g, " ")
      .split(/\s+/)
      .map((w) => w.replace(/^[.]+|[.]+$/g, ""))
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  );
}
function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}

function arg(flag: string, dflt: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set");
    process.exit(1);
  }
  const bankPath = arg(
    "--bank",
    "D:/LifeSafetyWiki/.claude/worktrees/smart-range-improvements-3509c4/lib/fieldCallScenes.js",
  );
  const photosDir = arg(
    "--photos",
    "D:/LifeSafetyWiki/.claude/worktrees/smart-range-improvements-3509c4/public/images/games/field-call",
  );
  const limit = Number(arg("--limit", "40"));
  const offset = Number(arg("--offset", "0"));
  const concurrency = Number(arg("--concurrency", "2"));
  const tier = arg("--tier", "default") as Tier;
  const track = arg("--track", "technical");
  const out = arg("--out", path.join(process.cwd(), "vision-eval-gamebank-out"));
  // --checklist builtin:<slug> sends that template's photo-answerable
  // questions with every photo, exactly as the upload route does when an
  // inspection runs a template — lets you measure the block's effect.
  const checklistId = arg("--checklist", "");
  const template = checklistId ? getBuiltinTemplate(checklistId) : null;
  const checklistFocus: string[] = template
    ? template.sections.flatMap((sec) =>
        sec.items
          .filter((it) => (it.match ?? []).length > 0)
          .map((it) => `${sec.code} ${sec.title} — ${it.q}`),
      )
    : [];
  if (checklistId) console.log(`Checklist focus: ${checklistFocus.length} questions from ${checklistId}`);

  const bank = (await import(pathToFileURL(bankPath).href)) as {
    SCENES: Scene[];
    CLINICAL_SCENES: Scene[];
    HARDCORE_SCENES: Scene[];
  };
  let scenes: Scene[] =
    track === "clinical"
      ? bank.CLINICAL_SCENES
      : track === "hardcore"
        ? bank.HARDCORE_SCENES
        : track === "all"
          ? [...bank.SCENES, ...bank.CLINICAL_SCENES, ...bank.HARDCORE_SCENES]
          : bank.SCENES;
  scenes = scenes.slice(offset, offset + limit);
  await fs.mkdir(out, { recursive: true });
  console.log(`Scoring ${scenes.length} ${track} scenes (tier=${tier}, concurrency=${concurrency})`);

  type Row = {
    id: string;
    cat: string;
    sev: string;
    correct: string;
    code?: string;
    ok: boolean;
    error?: string;
    hit: boolean;
    correctOverlap: number;
    bestDistractorOverlap: number;
    findings: Array<{ title: string; severity: string; code: string; confidence: number }>;
    ms: number;
    cost: number;
  };
  const rows: Row[] = [];
  let next = 0;

  async function worker() {
    while (next < scenes.length) {
      const sc = scenes[next++];
      const file = path.join(photosDir, path.basename(sc.photo.split("?")[0]));
      const started = Date.now();
      try {
        const buf = await fs.readFile(file);
        const mime = file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
        const res = await analyzeImage(buf.toString("base64"), mime, tier, [], [], [], checklistFocus);
        const findingText = res.analysis.violations
          .map((v) => `${v.title} ${v.description} ${v.code}`)
          .join(" ");
        const ft = tokens(findingText);
        const correctT = tokens(`${sc.correct} ${sc.q} ${sc.why ?? ""}`);
        const correctOverlap = overlap(ft, correctT);
        const bestDistractorOverlap = Math.max(0, ...sc.d.map((d) => overlap(ft, tokens(d))));
        const hit = correctOverlap >= 3 && correctOverlap > bestDistractorOverlap;
        rows.push({
          id: sc.id,
          cat: sc.cat,
          sev: sc.sev,
          correct: sc.correct,
          code: sc.code,
          ok: true,
          hit,
          correctOverlap,
          bestDistractorOverlap,
          findings: res.analysis.violations.map((v) => ({
            title: v.title,
            severity: v.severity,
            code: v.code,
            confidence: v.confidence,
          })),
          ms: res.durationMs,
          cost: res.usage?.costUsd ?? 0,
        });
        console.log(`${hit ? "HIT " : "miss"} ${sc.id} — ${res.analysis.violations.length} findings (${(res.durationMs / 1000).toFixed(0)}s)`);
      } catch (err) {
        rows.push({
          id: sc.id, cat: sc.cat, sev: sc.sev, correct: sc.correct, code: sc.code,
          ok: false, error: err instanceof Error ? err.message : String(err),
          hit: false, correctOverlap: 0, bestDistractorOverlap: 0, findings: [],
          ms: Date.now() - started, cost: 0,
        });
        console.log(`ERR  ${sc.id} — ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  const okRows = rows.filter((r) => r.ok);
  const hits = okRows.filter((r) => r.hit).length;
  const zero = okRows.filter((r) => r.findings.length === 0).length;
  const cost = rows.reduce((s, r) => s + r.cost, 0);
  const byCat = new Map<string, { n: number; hit: number }>();
  for (const r of okRows) {
    const c = byCat.get(r.cat) ?? { n: 0, hit: 0 };
    c.n++;
    if (r.hit) c.hit++;
    byCat.set(r.cat, c);
  }

  await fs.writeFile(path.join(out, "raw.json"), JSON.stringify(rows, null, 2));
  const lines: string[] = [];
  lines.push(`# Field Call game-bank eval — ${track} · tier ${tier}`);
  lines.push("");
  lines.push(`**${hits}/${okRows.length} scenes hit (${okRows.length ? Math.round((hits / okRows.length) * 100) : 0}%)** · ${zero} with zero findings · ${rows.length - okRows.length} errors · $${cost.toFixed(2)}`);
  lines.push("");
  lines.push("| Category | Hit | Total |");
  lines.push("|---|---|---|");
  for (const [cat, c] of [...byCat.entries()].sort()) lines.push(`| ${cat} | ${c.hit} | ${c.n} |`);
  lines.push("");
  for (const r of rows) {
    lines.push(`## ${r.hit ? "✅" : r.ok ? "❌" : "⚠️"} ${r.id} · ${r.cat} · ${r.sev}`);
    lines.push(`**Correct call:** ${r.correct}${r.code ? ` _(${r.code})_` : ""}`);
    if (!r.ok) {
      lines.push(`ERROR: ${r.error}`);
    } else {
      lines.push(`overlap correct=${r.correctOverlap} · best distractor=${r.bestDistractorOverlap} · ${(r.ms / 1000).toFixed(0)}s`);
      if (r.findings.length === 0) lines.push("- (no findings)");
      for (const f of r.findings) lines.push(`- **${f.severity}** ${f.title} — ${f.code} · ${Math.round(f.confidence * 100)}%`);
    }
    lines.push("");
  }
  await fs.writeFile(path.join(out, "report.md"), lines.join("\n"));
  console.log(`\n${hits}/${okRows.length} hit · $${cost.toFixed(2)} · ${path.join(out, "report.md")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
