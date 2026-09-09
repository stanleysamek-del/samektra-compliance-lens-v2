import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireInspectionWrite } from "@/lib/inspection-access";
import { escalationReason } from "@/lib/ai/routing";
import { analyzeImage } from "@/lib/ai/client";
import type { ComplianceAnalysis } from "@/lib/prompts/types";
const sample: ComplianceAnalysis = {
  schemaVersion: "1.1",
  summary: { text: "Check", confidence: 0.95, imageQuality: "clear" },
  image: { width: 100, height: 100 },
  violations: [],
  whatToLookFor: [],
  notVisible: [],
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("write access and model routing", () => {
  it("denies viewers and fails closed on permission errors", async () => {
    const client = (data: unknown, error: unknown) =>
      ({ rpc: async () => ({ data, error }) }) as unknown as SupabaseClient;
    expect((await requireInspectionWrite(client(false, null), "x")).ok).toBe(
      false,
    );
    expect(
      (await requireInspectionWrite(client(true, { message: "offline" }), "x"))
        .ok,
    ).toBe(false);
    expect((await requireInspectionWrite(client(true, null), "x")).ok).toBe(
      true,
    );
  });
  it("does not spend more on poor evidence or confident routine results", () => {
    expect(escalationReason(sample)).toBeNull();
    expect(
      escalationReason({
        ...sample,
        summary: { ...sample.summary, confidence: 0.2, imageQuality: "blurry" },
      }),
    ).toBeNull();
    expect(
      escalationReason({
        ...sample,
        summary: { ...sample.summary, confidence: 0.5 },
      }),
    ).toMatch(/confident/);
  });
  it("uses standard Google vision first and accounts for reasoning tokens", async () => {
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("GOOGLE_API_KEY", "test-google");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic");
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: JSON.stringify(sample) }] } },
            ],
            usageMetadata: {
              promptTokenCount: 100,
              candidatesTokenCount: 200,
              thoughtsTokenCount: 100,
            },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    const result = await analyzeImage("test", "image/jpeg");
    expect(result.provider).toBe("google");
    expect(result.model).toBe("gemini-2.5-flash");
    expect(result.usage.outputTokens).toBe(300);
    expect(result.costComplete).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("honors explicit operator provider selection", async () => {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "test");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              content: [{ type: "text", text: JSON.stringify(sample) }],
              usage: { input_tokens: 100, output_tokens: 200 },
            }),
            { status: 200 },
          ),
      ),
    );
    const result = await analyzeImage("test", "image/jpeg");
    expect(result.provider).toBe("anthropic");
    expect(result.model).toContain("haiku");
  });
});
