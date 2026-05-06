/**
 * Compliance Lens vision analysis — Anthropic primary, OpenAI fallback.
 *
 * Both providers receive the exact same prompts (lib/prompts/compliance.ts)
 * and return a JSON object matching ComplianceAnalysis. We never run the
 * two providers in parallel — Claude first, OpenAI only if Claude times
 * out, 5xxs, or returns malformed JSON.
 *
 * Each call is metered: token counts and computed USD cost come back in
 * the AnalyzeResult so the caller can persist a row to public.ai_calls.
 */

import { SYSTEM_PROMPT, USER_QUERY } from "@/lib/prompts/compliance";
import type { ComplianceAnalysis } from "@/lib/prompts/types";

const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";
const OPENAI_MODEL = "gpt-4o";

const REQUEST_TIMEOUT_MS = 60_000;

// Per-million-token pricing in USD. Keep this colocated with the model
// strings so cost numbers always match the model that actually ran.
const PRICING = {
  "claude-sonnet-4-5-20250929": { input: 3.0, output: 15.0 },
  "gpt-4o":                      { input: 2.5, output: 10.0 },
} as const;

type Provider = "anthropic" | "openai";

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  /** Computed at call time so historical costs don't shift if pricing changes. */
  costUsd: number;
};

export type AnalyzeResult = {
  analysis: ComplianceAnalysis;
  provider: Provider;
  model: string;
  durationMs: number;
  usage: Usage;
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

export async function analyzeImage(
  imageBase64: string,
  mimeType: string,
): Promise<AnalyzeResult> {
  const start = Date.now();

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { analysis, usage } = await callAnthropic(imageBase64, mimeType);
      return {
        analysis,
        provider: "anthropic",
        model: CLAUDE_MODEL,
        durationMs: Date.now() - start,
        usage,
      };
    } catch (err) {
      console.warn("[ai] Claude failed, falling back to OpenAI:", err);
    }
  }

  if (process.env.OPENAI_API_KEY || process.env.OpenAI_API_KEY) {
    try {
      const { analysis, usage } = await callOpenAI(imageBase64, mimeType);
      return {
        analysis,
        provider: "openai",
        model: OPENAI_MODEL,
        durationMs: Date.now() - start,
        usage,
      };
    } catch (err) {
      console.error("[ai] OpenAI also failed:", err);
      throw new AnalyzeError("Both providers failed", "openai", err);
    }
  }

  throw new AnalyzeError(
    "No AI provider configured. Set ANTHROPIC_API_KEY and/or OPENAI_API_KEY.",
  );
}

/* --------------------------------------------------------------------- */

async function callAnthropic(
  imageBase64: string,
  mimeType: string,
): Promise<{ analysis: ComplianceAnalysis; usage: Usage }> {
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
                source: { type: "base64", media_type: mimeType, data: imageBase64 },
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
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n");

    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;
    const costUsd = computeCost(CLAUDE_MODEL, inputTokens, outputTokens);

    return {
      analysis: parseAnalysis(text),
      usage: { inputTokens, outputTokens, costUsd },
    };
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------------------------------------------------- */

async function callOpenAI(
  imageBase64: string,
  mimeType: string,
): Promise<{ analysis: ComplianceAnalysis; usage: Usage }> {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.OpenAI_API_KEY ?? "";
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
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const text = data.choices?.[0]?.message?.content ?? "";

    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;
    const costUsd = computeCost(OPENAI_MODEL, inputTokens, outputTokens);

    return {
      analysis: parseAnalysis(text),
      usage: { inputTokens, outputTokens, costUsd },
    };
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------------------------------------------------- */

function computeCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = (PRICING as Record<string, { input: number; output: number }>)[model];
  if (!p) return 0;
  return (
    (inputTokens / 1_000_000) * p.input +
    (outputTokens / 1_000_000) * p.output
  );
}

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

function validateAnalysis(input: unknown): ComplianceAnalysis {
  if (!input || typeof input !== "object") {
    throw new AnalyzeError("Analysis is not an object");
  }
  const o = input as Record<string, unknown>;

  const summary = (o.summary ?? {}) as Record<string, unknown>;
  const image = (o.image ?? {}) as Record<string, unknown>;

  return {
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
  return { item: String(r.item ?? ""), details: String(r.details ?? "") };
}

function normalizeNotVisible(n: unknown): ComplianceAnalysis["notVisible"][number] {
  const r = (n ?? {}) as Record<string, unknown>;
  return { item: String(r.item ?? ""), reason: String(r.reason ?? "") };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
