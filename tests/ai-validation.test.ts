import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeImage } from "@/lib/ai/client";
import { GET } from "@/app/api/health/route";

const sample = {
  schemaVersion: "1.1", summary: { text: "A clear corridor", confidence: 0.9, imageQuality: "clear" },
  image: { width: 1024, height: 768 }, violations: [], whatToLookFor: [], notVisible: [],
};
function respond(analysis: unknown, usage: unknown = { promptTokenCount: 100, candidatesTokenCount: 200 }) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify(analysis) }] } }], usageMetadata: usage,
  })));
}
beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "google"); vi.stubEnv("GOOGLE_API_KEY", "test");
  vi.stubEnv("ANTHROPIC_API_KEY", ""); vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("OpenAI_API_KEY", "");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("AI result integrity", () => {
  it.each([{}, [], { error: "Unavailable" }, { ...sample, violations: null }, { ...sample, image: { width: "bad", height: 1 } }])(
    "rejects malformed responses instead of reporting a clean photo (%j)", async (payload) => {
      respond(payload); await expect(analyzeImage("test", "image/jpeg")).rejects.toThrow();
    });
  it("accepts a complete zero-finding result", async () => {
    respond(sample); expect((await analyzeImage("test", "image/jpeg")).analysis.violations).toEqual([]);
  });
  it.each(["Critical", "High"])("rejects invalid severity or reversed boxes (%s)", async (severity) => {
    respond({ ...sample, violations: [{ title: "Door", description: "Door held open", category: "Fire", severity,
      confidence: 0.8, coordinates: { x1: 0.9, y1: 0, x2: 0.1, y2: 1 } }] });
    await expect(analyzeImage("test", "image/jpeg")).rejects.toThrow();
  });
  it("retains the spending hold when output usage is missing", async () => {
    respond(sample, { promptTokenCount: 100 });
    expect((await analyzeImage("test", "image/jpeg")).costComplete).toBe(false);
  });
});
describe("health check", () => {
  it("uses a zero-row anonymous table check instead of the restricted API root", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test");
    const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await (await GET()).json()).toMatchObject({ ok: true, supabase: "up" });
    expect(fetcher).toHaveBeenCalledWith("https://example.invalid/rest/v1/inspections?select=id&limit=0", expect.objectContaining({ method: "HEAD" }));
  });
  it.each([401, 403, 500])("does not report an HTTP %i dependency as healthy", async (status) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status })));
    expect(await (await GET()).json()).toMatchObject({ ok: false, supabase: "down" });
  });
});
