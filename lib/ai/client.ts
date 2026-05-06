/**
 * Compliance Lens vision analysis — Anthropic primary, OpenAI fallback.
 *
 * Both providers receive the exact same prompts (lib/prompts/compliance.ts)
 * and are expected to return a single JSON object matching ComplianceAnalysis.
 * We never run prompts in parallel — Claude first, OpenAI only if Claude
 * times out, 5xxs, or returns malformed JSON.
 */

import { SYSTEM_PROMPT, USER_QUERY } from "@/lib/prompts/compliance";
import type { ComplianceAnalysis } from "@/lib/prompts/types";

const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";
const OPENAI_MODEL = "gpt-4o";

const REQUEST_TIMEOUT_MS = 60_000;

type Provider = "anthropic" | "openai";

export type AnalyzeResult = {
  analysis: ComplianceAnalysis;
  provider: Provider;
  model: string;
  durationMs: number;
};

export class AnalyzeError extends Error {
  constructor(
    message: string,
    public readonly provider?: Provider,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AnalyzeError";
  }
}

/**
 * Run analysis with primary → fallback strategy.
 * `imageBase64` should be raw base64 (no data: URI prefix).
 * `mimeType` is the image MIME type (image/jpeg, image/png, image/webp).
 */
export async function analyzeImage(
  imageBase64: string,
  mimeType: string,
): Promise<AnalyzeResult> {
  const start = Date.now();

  // 1. Anthropic primary
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const analysis = await callAnthropic(imageBase64, mimeType);
      return {
        analysis,
        provider: "anthropic",
        model: CLAUDE_MODEL,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      console.warn("[ai] Claude failed, falling back to OpenAI:", err);
    }
  }

  // 2. OpenAI fallback
  if (process.env.OPENAI_API_KEY || process.env.OpenAI_API_KEY) {
    try {
      const analysis = await callOpenAI(imageBase64, mimeType);
      return {
        analysis,
        provider: "openai",
        model: OPENAI_MODEL,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      console.error("[ai] OpenAI also failed:", err);
      throw new AnalyzeError(
        "Both providers failed",
        "openai",
        err,
      );
    }
  }

  throw new AnalyzeError(
    "No AI provider configured. Set ANTHROPIC_API_KEY and/or OPENAI_API_KEY.",
  );
}

/* --------------------------------------------------------------------- */
/* Anthropic                                                              */
/* --------------------------------------------------------------------- */

async function callAnthropic(
  imageBase64: string,
  mimeType: string,
): Promise<ComplianceAnalysis> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType,
                  data: imageBase64,
                },
              },
              { type: "text", text: USER_QUERY },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new AnalyzeError(
        `Anthropic ${res.status}: ${body.slice(0, 500)}`,
        "anthropic",
      );
    }

    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
    };

    const text = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n");

    return parseAnalysis(text);
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------------------------------------------------- */
/* OpenAI                                                                 */
/* --------------------------------------------------------------------- */

async function callOpenAI(
  imageBase64: string,
  mimeType: string,
): Promise<ComplianceAnalysis> {
  const apiKey =
    process.env.OPENAI_API_KEY ?? process.env.OpenAI_API_KEY ?? "";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: 4096,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: USER_QUERY },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new AnalyzeError(
        `OpenAI ${res.status}: ${body.slice(0, 500)}`,
        "openai",
      );
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const text = data.choices?.[0]?.message?.content ?? "";
    return parseAnalysis(text);
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------------------------------------------------- */
/* Parsing & validation                                                   */
/* --------------------------------------------------------------------- */

/**
 * Extract JSON from the model output. Both providers occasionally wrap their
 * answer in markdown code fences despite our instructions, so we strip those
 * before parsing.
 */
function parseAnalysis(raw: string): ComplianceAnalysis {
  const trimmed = raw.trim();
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let json: unknown;
  try {
    json = JSON.parse(stripped);
  } catch (err) {
    // Last-ditch: extract first {...} block.
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new AnalyzeError(
        `Model returned non-JSON output: ${stripped.slice(0, 200)}`,
        undefined,
        err,
      );
    }
    json = JSON.parse(match[0]);
  }

  return validateAnalysis(json);
}

/**
 * Light validation — we don't run a full JSON-schema validator, just check
 * the shape we depend on downstream and coerce sensible defaults.
 */
function validateAnalysis(input: unknown): ComplianceAnalysis {
  if (!input || typeof input !== "object") {
    throw new AnalyzeError("Analysis is not an object");
  }
  const o = input as Record<string, unknown>;

  const summary = (o.summary ?? {}) as Record<string, unknown>;
  const image = (o.image ?? {}) as Record<string, unknown>;

  const out: ComplianceAnalysis = {
    schemaVersion: "1.1",
    summary: {
      text: String(summary.text ?? ""),
      confidence: clamp01(Number(summary.confidence ?? 0)),
      imageQuality: (summary.imageQuality as ComplianceAnalysis["summary"]["imageQuality"]) ?? "clear",
    },
    image: {
      width: Math.max(1, Math.floor(Number(image.width ?? 0))),
      height: Math.max(1, Math.floor(Number(image.height ?? 0))),
    },
    violations: Array.isArray(o.violations)
      ? o.violations.map((v, i) => normalizeViolation(v, i))
      : [],
    whatToLookFor: Array.isArray(o.whatToLookFor)
      ? o.whatToLookFor.map((w) => normalizeWhatToLookFor(w))
      : [],
    notVisible: Array.isArray(o.notVisible)
      ? o.notVisible.map((n) => normalizeNotVisible(n))
      : [],
  };

  return out;
}

function normalizeViolation(v: unknown, idx: number): ComplianceAnalysis["violations"][number] {
  const r = (v ?? {}) as Record<string, unknown>;
  const c = (r.coordinates ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id ?? `v_${idx + 1}`),
    title: String(r.title ?? "Unnamed finding"),
    category: (r.category as ComplianceAnalysis["violations"][number]["category"]) ?? "Other",
    code: String(r.code ?? ""),
    severity: (r.severity as ComplianceAnalysis["violations"][number]["severity"]) ?? "Medium",
    description: String(r.description ?? ""),
    location: String(r.location ?? ""),
    coordinates: {
      x1: clamp01(Number(c.x1 ?? 0)),
      y1: clamp01(Number(c.y1 ?? 0)),
      x2: clamp01(Number(c.x2 ?? 1)),
      y2: clamp01(Number(c.y2 ?? 1)),
    },
    confidence: clamp01(Number(r.confidence ?? 0.5)),
    remediation: String(r.remediation ?? ""),
    references: Array.isArray(r.references) ? r.references.map(String) : [],
  };
}

function normalizeWhatToLookFor(w: unknown): ComplianceAnalysis["whatToLookFor"][number] {
  const r = (w ?? {}) as Record<string, unknown>;
  return {
    item: String(r.item ?? ""),
    details: String(r.details ?? ""),
  };
}

function normalizeNotVisible(n: unknown): ComplianceAnalysis["notVisible"][number] {
  const r = (n ?? {}) as Record<string, unknown>;
  return {
    item: String(r.item ?? ""),
    reason: String(r.reason ?? ""),
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
