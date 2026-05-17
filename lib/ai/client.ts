/**
 * Compliance Lens vision analysis.
 *
 * Tier system:
 *   - "default" — fast, cheap.
 *                 Anthropic: Claude Haiku 4.5 (~$0.005-0.010/photo).
 *                 Google:    Gemini 2.5 Flash (~$0.001-0.003/photo).
 *   - "deep"    — stronger reasoning.
 *                 Anthropic: Claude Sonnet 4.5 (~$0.020-0.040/photo).
 *                 Google:    Gemini 2.5 Pro (~$0.008-0.025/photo).
 *
 * Provider order is controlled by the AI_PROVIDER env var:
 *   AI_PROVIDER=anthropic   → Anthropic, then Google, then OpenAI (default)
 *   AI_PROVIDER=google      → Google,   then Anthropic, then OpenAI
 *   AI_PROVIDER=openai      → OpenAI,   then Anthropic, then Google
 *
 * If the chosen provider fails (5xx, timeout, malformed JSON), we fall
 * through the rest of the chain so a single hiccup doesn't break the upload.
 */

import {
  SYSTEM_PROMPT,
  USER_QUERY,
  CONTEXT_QUESTIONS_SYSTEM,
  CONTEXT_QUESTIONS_USER,
  formatUserContext,
  formatOrgRules,
  type ContextAnswer,
} from "@/lib/prompts/compliance";
import {
  DETECT_SYSTEM_PROMPT,
  DETECT_USER_PROMPT,
  DETECT_CATEGORIES,
  formatFocusHint,
  type DetectCategory,
} from "@/lib/prompts/compliance-detect";
import type { ComplianceAnalysis } from "@/lib/prompts/types";

export type Tier = "default" | "deep";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SONNET_MODEL = "claude-sonnet-4-5-20250929";
const OPENAI_MODEL = "gpt-4o";
const GEMINI_FLASH_MODEL = "gemini-2.5-flash";
const GEMINI_PRO_MODEL = "gemini-2.5-pro";

// Per-provider hard timeout. Vercel functions cap at 60s on Hobby and 90s
// on Pro; we set 45s so a slow provider can be abandoned in time to fall
// through to the next one (Anthropic → Google → OpenAI) without the whole
// function getting killed by Vercel's gateway with a 504.
const REQUEST_TIMEOUT_MS = 45_000;

// Per-million-token pricing in USD. Tweak as Google / Anthropic / OpenAI
// re-price; the cost dashboard reads these.
const PRICING = {
  "claude-haiku-4-5-20251001":  { input: 1.0,  output: 5.0  },
  "claude-sonnet-4-5-20250929": { input: 3.0,  output: 15.0 },
  "gpt-4o":                      { input: 2.5,  output: 10.0 },
  "gemini-2.5-flash":            { input: 0.30, output: 2.50 },
  "gemini-2.5-pro":              { input: 1.25, output: 10.0 },
} as const;

type Provider = "anthropic" | "openai" | "google";

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

export type AnalyzeResult = {
  analysis: ComplianceAnalysis;
  provider: Provider;
  model: string;
  durationMs: number;
  usage: Usage;
  tier: Tier;
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
  tier: Tier = "default",
  userContext: ContextAnswer[] = [],
  focusCategories: DetectCategory[] = [],
  orgRules: string[] = [],
): Promise<AnalyzeResult> {
  const start = Date.now();
  // Order: schema/instructions → focus hint → org house rules →
  // inspector context. Inspector context comes LAST because it's
  // authoritative for this specific photo and should be the freshest
  // information the model reads. House rules apply to the whole org so
  // they sit higher up. Focus hint helps skip irrelevant rule blocks.
  const userPrompt =
    USER_QUERY +
    formatFocusHint(focusCategories) +
    formatOrgRules(orgRules) +
    formatUserContext(userContext);

  // Resolve the per-tier model id for each provider.
  const anthropicModel = tier === "deep" ? SONNET_MODEL : HAIKU_MODEL;
  const googleModel = tier === "deep" ? GEMINI_PRO_MODEL : GEMINI_FLASH_MODEL;

  // Build the provider try-order from AI_PROVIDER env (default Anthropic).
  const providers = providerChainFromEnv();

  const errors: Array<{ provider: Provider; err: unknown }> = [];
  for (const provider of providers) {
    try {
      if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
        const { analysis, usage } = await callAnthropic(
          imageBase64,
          mimeType,
          anthropicModel,
          userPrompt,
        );
        return {
          analysis,
          provider: "anthropic",
          model: anthropicModel,
          durationMs: Date.now() - start,
          usage,
          tier,
        };
      }
      if (provider === "google" && process.env.GOOGLE_API_KEY) {
        const { analysis, usage } = await callGemini(
          imageBase64,
          mimeType,
          googleModel,
          userPrompt,
        );
        return {
          analysis,
          provider: "google",
          model: googleModel,
          durationMs: Date.now() - start,
          usage,
          tier,
        };
      }
      if (
        provider === "openai" &&
        (process.env.OPENAI_API_KEY || process.env.OpenAI_API_KEY)
      ) {
        const { analysis, usage } = await callOpenAI(
          imageBase64,
          mimeType,
          userPrompt,
        );
        return {
          analysis,
          provider: "openai",
          model: OPENAI_MODEL,
          durationMs: Date.now() - start,
          usage,
          tier,
        };
      }
    } catch (err) {
      console.warn(`[ai] ${provider} failed, trying next provider:`, err);
      errors.push({ provider, err });
    }
  }

  if (errors.length > 0) {
    throw new AnalyzeError(
      "All AI providers failed: " +
        errors.map((e) => `${e.provider}: ${(e.err as Error)?.message ?? e.err}`).join("; "),
      errors[errors.length - 1]!.provider,
      errors[errors.length - 1]!.err,
    );
  }
  throw new AnalyzeError(
    "No AI provider configured. Set at least one of ANTHROPIC_API_KEY, GOOGLE_API_KEY, or OPENAI_API_KEY.",
  );
}

/** Resolve the provider chain from the AI_PROVIDER env var. */
function providerChainFromEnv(): Provider[] {
  const v = (process.env.AI_PROVIDER ?? "").toLowerCase();
  if (v === "google" || v === "gemini") {
    return ["google", "anthropic", "openai"];
  }
  if (v === "openai") {
    return ["openai", "anthropic", "google"];
  }
  // Default: Anthropic first, then Google, then OpenAI.
  return ["anthropic", "google", "openai"];
}

/* --------------------------------------------------------------------- */

async function callAnthropic(
  imageBase64: string,
  mimeType: string,
  model: string,
  userPrompt: string,
): Promise<{ analysis: ComplianceAnalysis; usage: Usage }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    // PROMPT CACHING — both the giant SYSTEM_PROMPT and the image are
    // marked cacheable. Cache has a ~5-min TTL on Anthropic. The first
    // call on a photo writes the cache (slightly slower); follow-up
    // Coach turns / Re-analyze within 5 min read from the cache, which
    // is ~10x cheaper on input cost AND noticeably faster.
    //
    // This is the single biggest speed lever for the Coach workflow,
    // where the inspector typically iterates on the same photo back to
    // back. cache_creation_input_tokens are billed at 1.25x, cache_read
    // at 0.10x of normal input — see computeCost below.
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        // Real outputs are 500-1500 tokens. Capping at 2048 instead of
        // 4096 doesn't change speed for normal cases but caps the
        // worst-case runaway response.
        max_tokens: 2048,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mimeType, data: imageBase64 },
                cache_control: { type: "ephemeral" },
              },
              { type: "text", text: userPrompt },
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
      usage?: {
        input_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
        output_tokens?: number;
      };
    };

    const text = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n");

    const inputTokens = data.usage?.input_tokens ?? 0;
    const cacheCreate = data.usage?.cache_creation_input_tokens ?? 0;
    const cacheRead = data.usage?.cache_read_input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;
    // Effective input tokens for cost-tracking: cache writes are 1.25x,
    // cache reads are 0.10x of the normal per-million input price.
    const effectiveInputTokens =
      inputTokens + Math.round(cacheCreate * 1.25) + Math.round(cacheRead * 0.10);
    const costUsd = computeCost(model, effectiveInputTokens, outputTokens);

    if (cacheRead > 0) {
      console.log(
        `[anthropic] cache HIT — saved ~${Math.round((cacheRead * 0.9) / 1000)}k effective input tokens`,
      );
    }

    return {
      analysis: parseAnalysis(text),
      // Report the sum of all input-side tokens so the ai_calls ledger
      // captures the full usage; cost is already adjusted via the
      // multipliers above.
      usage: {
        inputTokens: inputTokens + cacheCreate + cacheRead,
        outputTokens,
        costUsd,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAI(
  imageBase64: string,
  mimeType: string,
  userPrompt: string,
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
        max_tokens: 2048,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
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

async function callGemini(
  imageBase64: string,
  mimeType: string,
  model: string,
  userPrompt: string,
): Promise<{ analysis: ComplianceAnalysis; usage: Usage }> {
  const apiKey = process.env.GOOGLE_API_KEY ?? "";
  if (!apiKey) {
    throw new AnalyzeError("GOOGLE_API_KEY missing", "google");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: imageBase64,
                },
              },
              { text: userPrompt },
            ],
          },
        ],
        generation_config: {
          max_output_tokens: 2048,
          response_mime_type: "application/json",
          temperature: 0.2,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new AnalyzeError(
        `Google ${res.status}: ${body.slice(0, 500)}`,
        "google",
      );
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    const text = (data.candidates ?? [])
      .flatMap((c) => c.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("\n");

    const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
    const costUsd = computeCost(model, inputTokens, outputTokens);

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
      imageQuality:
        (summary.imageQuality as ComplianceAnalysis["summary"]["imageQuality"]) ??
        "clear",
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
    // Phase 3 of Coach the AI — optional clarifying question back.
    // Pass through only when the model returns a non-empty question;
    // otherwise leave the field absent so legacy consumers stay clean.
    clarifyingQuestion: normalizeClarifyingQuestion(o.clarifyingQuestion),
  };
}

function normalizeClarifyingQuestion(
  raw: unknown,
): ComplianceAnalysis["clarifyingQuestion"] {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const question = String(r.question ?? "").trim();
  if (!question) return undefined;
  const options = Array.isArray(r.options)
    ? r.options.map((o) => String(o ?? "").trim()).filter((s) => s.length > 0)
    : undefined;
  return {
    question,
    rationale: r.rationale ? String(r.rationale).trim() || undefined : undefined,
    options: options && options.length > 0 ? options : undefined,
  };
}

function normalizeViolation(
  v: unknown,
  idx: number,
): ComplianceAnalysis["violations"][number] {
  const r = (v ?? {}) as Record<string, unknown>;
  const c = (r.coordinates ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id ?? `v_${idx + 1}`),
    title: String(r.title ?? "Unnamed finding"),
    category:
      (r.category as ComplianceAnalysis["violations"][number]["category"]) ??
      "Other",
    code: String(r.code ?? ""),
    severity:
      (r.severity as ComplianceAnalysis["violations"][number]["severity"]) ??
      "Medium",
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

/* =====================================================================
 * Context-questions pass (deep analyze, step 1).
 *
 * Sends the photo to Sonnet 4.5 with a different system prompt that
 * asks the model to produce 3-6 highest-leverage clarifying questions
 * for the on-site inspector. The answers later feed back into the final
 * analyzeImage() call as `userContext`.
 *
 * Sonnet only — this pass is the premium/deep upgrade path.
 * ===================================================================== */

export type ContextQuestion = {
  id: string;
  question: string;
  rationale?: string;
  options?: string[];
  type: "single" | "free";
};

export type QuestionsResult = {
  questions: ContextQuestion[];
  provider: Provider;
  model: string;
  durationMs: number;
  usage: Usage;
};

export async function generateContextQuestions(
  imageBase64: string,
  mimeType: string,
): Promise<QuestionsResult> {
  const start = Date.now();

  // Walk the provider chain (Anthropic / Google / OpenAI), preferring the
  // chain order set by AI_PROVIDER. The first one that's configured + works
  // wins. Each provider uses its "deep" model for question generation since
  // we want strong reasoning here.
  const providers = providerChainFromEnv();
  const errors: Array<{ provider: Provider; err: unknown }> = [];

  for (const provider of providers) {
    try {
      if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
        return await callAnthropicQuestions(imageBase64, mimeType, start);
      }
      if (provider === "google" && process.env.GOOGLE_API_KEY) {
        return await callGeminiQuestions(imageBase64, mimeType, start);
      }
      // OpenAI question-generation isn't implemented (we'd need a separate
      // JSON-mode prompt path). Skip it and continue the chain.
    } catch (err) {
      console.warn(
        `[ai/questions] ${provider} failed, trying next provider:`,
        err,
      );
      errors.push({ provider, err });
    }
  }

  if (errors.length > 0) {
    throw new AnalyzeError(
      "All providers failed for context questions: " +
        errors.map((e) => `${e.provider}: ${(e.err as Error)?.message ?? e.err}`).join("; "),
      errors[errors.length - 1]!.provider,
      errors[errors.length - 1]!.err,
    );
  }
  throw new AnalyzeError(
    "Deep analysis (context questions) requires ANTHROPIC_API_KEY or GOOGLE_API_KEY.",
  );
}

async function callAnthropicQuestions(
  imageBase64: string,
  mimeType: string,
  start: number,
): Promise<QuestionsResult> {
  const model = SONNET_MODEL;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AnalyzeError("ANTHROPIC_API_KEY missing", "anthropic");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: CONTEXT_QUESTIONS_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mimeType, data: imageBase64 },
              },
              { type: "text", text: CONTEXT_QUESTIONS_USER },
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
    const costUsd = computeCost(model, inputTokens, outputTokens);

    return {
      questions: parseQuestions(text),
      provider: "anthropic",
      model,
      durationMs: Date.now() - start,
      usage: { inputTokens, outputTokens, costUsd },
    };
  } finally {
    clearTimeout(timer);
  }
}

async function callGeminiQuestions(
  imageBase64: string,
  mimeType: string,
  start: number,
): Promise<QuestionsResult> {
  const model = GEMINI_PRO_MODEL;
  const apiKey = process.env.GOOGLE_API_KEY ?? "";
  if (!apiKey) throw new AnalyzeError("GOOGLE_API_KEY missing", "google");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: CONTEXT_QUESTIONS_SYSTEM }] },
        contents: [
          {
            role: "user",
            parts: [
              {
                inline_data: { mime_type: mimeType, data: imageBase64 },
              },
              { text: CONTEXT_QUESTIONS_USER },
            ],
          },
        ],
        generation_config: {
          max_output_tokens: 1024,
          response_mime_type: "application/json",
          temperature: 0.2,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new AnalyzeError(
        `Google ${res.status}: ${body.slice(0, 500)}`,
        "google",
      );
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
      };
    };

    const text = (data.candidates ?? [])
      .flatMap((c) => c.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("\n");

    const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
    const costUsd = computeCost(model, inputTokens, outputTokens);

    return {
      questions: parseQuestions(text),
      provider: "google",
      model,
      durationMs: Date.now() - start,
      usage: { inputTokens, outputTokens, costUsd },
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseQuestions(raw: string): ContextQuestion[] {
  const trimmed = raw.trim();
  // Strip code fences if model added them despite instructions.
  const cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to find a JSON object inside the text.
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new AnalyzeError("Could not parse questions JSON");
    parsed = JSON.parse(m[0]);
  }

  const obj = parsed as { questions?: unknown };
  const arr = Array.isArray(obj.questions) ? obj.questions : [];

  const out: ContextQuestion[] = [];
  for (let i = 0; i < arr.length; i++) {
    const r = arr[i] as Record<string, unknown>;
    const id = String(r.id ?? `q${i + 1}`);
    const question = String(r.question ?? "").trim();
    if (!question) continue;
    const type = r.type === "free" ? "free" : "single";
    const options = Array.isArray(r.options)
      ? r.options.map((o) => String(o)).filter(Boolean)
      : undefined;
    out.push({
      id,
      question,
      rationale: r.rationale ? String(r.rationale) : undefined,
      type,
      options: options && options.length > 0 ? options : undefined,
    });
  }
  return out.slice(0, 6);
}

/* =====================================================================
 * STAGE-1 DETECTION — fast triage classifier.
 *
 * Runs Haiku with a tiny (~500 tok) prompt to identify which
 * compliance-relevant categories are visible in the photo. The result
 * is used to prepend a focus hint to the STAGE-2 analysis prompt, so
 * the model can skip rule blocks that don't apply to anything visible.
 *
 * Detection is intentionally CHEAP and PROMISCUOUS — false positives
 * cost nothing because Stage 2 still has the full rulebook. False
 * negatives are the only failure mode worth worrying about, so we err
 * on the side of including categories.
 * ===================================================================== */

export type DetectResult = {
  categories: DetectCategory[];
  provider: Provider;
  model: string;
  durationMs: number;
  usage: Usage;
};

export async function detectCategories(
  imageBase64: string,
  mimeType: string,
): Promise<DetectResult> {
  const start = Date.now();
  const providers = providerChainFromEnv();
  const errors: Array<{ provider: Provider; err: unknown }> = [];

  for (const provider of providers) {
    try {
      if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
        return await callAnthropicDetect(imageBase64, mimeType, start);
      }
      if (provider === "google" && process.env.GOOGLE_API_KEY) {
        return await callGeminiDetect(imageBase64, mimeType, start);
      }
      // OpenAI detection unimplemented — fall through.
    } catch (err) {
      console.warn(`[ai/detect] ${provider} failed, trying next:`, err);
      errors.push({ provider, err });
    }
  }

  if (errors.length > 0) {
    throw new AnalyzeError(
      "All providers failed for detection: " +
        errors.map((e) => `${e.provider}: ${(e.err as Error)?.message ?? e.err}`).join("; "),
      errors[errors.length - 1]!.provider,
      errors[errors.length - 1]!.err,
    );
  }
  throw new AnalyzeError(
    "Detection requires ANTHROPIC_API_KEY or GOOGLE_API_KEY.",
  );
}

async function callAnthropicDetect(
  imageBase64: string,
  mimeType: string,
  start: number,
): Promise<DetectResult> {
  const model = HAIKU_MODEL;
  const controller = new AbortController();
  // Detection has a tighter budget — it MUST be fast or there's no point.
  // 20s is generous; typical Haiku response is 1-2s.
  const timer = setTimeout(() => controller.abort(), 20_000);
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
        model,
        max_tokens: 256,
        system: DETECT_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mimeType, data: imageBase64 },
              },
              { type: "text", text: DETECT_USER_PROMPT },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new AnalyzeError(
        `Anthropic detect ${res.status}: ${body.slice(0, 300)}`,
        "anthropic",
      );
    }

    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;
    const costUsd = computeCost(model, inputTokens, outputTokens);

    return {
      categories: parseDetectCategories(text),
      provider: "anthropic",
      model,
      durationMs: Date.now() - start,
      usage: { inputTokens, outputTokens, costUsd },
    };
  } finally {
    clearTimeout(timer);
  }
}

async function callGeminiDetect(
  imageBase64: string,
  mimeType: string,
  start: number,
): Promise<DetectResult> {
  const model = GEMINI_FLASH_MODEL;
  const apiKey = process.env.GOOGLE_API_KEY ?? "";
  if (!apiKey) throw new AnalyzeError("GOOGLE_API_KEY missing", "google");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: DETECT_SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
              { text: DETECT_USER_PROMPT },
            ],
          },
        ],
        generation_config: {
          max_output_tokens: 256,
          response_mime_type: "application/json",
          temperature: 0.1,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new AnalyzeError(
        `Google detect ${res.status}: ${body.slice(0, 300)}`,
        "google",
      );
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const text = (data.candidates ?? [])
      .flatMap((c) => c.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("");
    const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
    const costUsd = computeCost(model, inputTokens, outputTokens);

    return {
      categories: parseDetectCategories(text),
      provider: "google",
      model,
      durationMs: Date.now() - start,
      usage: { inputTokens, outputTokens, costUsd },
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseDetectCategories(raw: string): DetectCategory[] {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (!m) return [];
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return [];
    }
  }
  const obj = parsed as { categories?: unknown };
  const arr = Array.isArray(obj.categories) ? obj.categories : [];
  const allowed = new Set<string>(DETECT_CATEGORIES);
  const out: DetectCategory[] = [];
  for (const item of arr) {
    const s = String(item ?? "").trim();
    if (allowed.has(s)) out.push(s as DetectCategory);
  }
  // De-dupe while preserving order.
  return Array.from(new Set(out));
}

/* =====================================================================
 * TWO-STAGE ANALYSIS — detection → focused analyzeImage.
 *
 * Runs detectCategories first, then passes the resulting category list
 * as `focusCategories` to analyzeImage. The user-facing prompt then
 * includes a "DETECTED EQUIPMENT" block that tells the model which rule
 * blocks to focus on.
 *
 * Result shape mirrors analyzeImage with an extra `detection` field for
 * telemetry / debugging. Cost adds the detect call (~$0.0005 with Haiku).
 *
 * Failure fallback: if detection itself fails for any reason, we skip
 * the focus hint and run analyzeImage with the full default prompt, so
 * a flaky detect call never blocks the main analysis.
 * ===================================================================== */

export type TwoStageResult = AnalyzeResult & {
  detection: {
    categories: DetectCategory[];
    durationMs: number;
    usage: Usage;
  } | null;
};

export async function analyzeImageTwoStage(
  imageBase64: string,
  mimeType: string,
  tier: Tier = "default",
  userContext: ContextAnswer[] = [],
  orgRules: string[] = [],
): Promise<TwoStageResult> {
  const start = Date.now();
  let detection: TwoStageResult["detection"] = null;
  let focus: DetectCategory[] = [];

  try {
    const det = await detectCategories(imageBase64, mimeType);
    detection = {
      categories: det.categories,
      durationMs: det.durationMs,
      usage: det.usage,
    };
    focus = det.categories;
  } catch (err) {
    // Detection failed — log and continue without a focus hint.
    // The Stage-2 analyzer falls back to the original full-prompt
    // behavior, so no findings are lost.
    console.warn(
      "[analyzeImageTwoStage] detection failed, falling back to full prompt:",
      err,
    );
  }

  const result = await analyzeImage(
    imageBase64,
    mimeType,
    tier,
    userContext,
    focus,
    orgRules,
  );
  // Override durationMs with the wall-clock time across BOTH stages so
  // callers see honest total latency, not just stage 2.
  return { ...result, durationMs: Date.now() - start, detection };
}
