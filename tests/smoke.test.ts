import { describe, it, expect } from "vitest";
import { buildExportFilename } from "@/lib/exports/filename";
import { autoResolveClearedPunchListItems } from "@/lib/findings/auto-resolve-punch-list";
import { formatCoachThread, type CoachTurn } from "@/lib/prompts/coach";

/**
 * Smoke tests for pure-logic helpers. These don't hit Supabase or Anthropic
 * — they exercise just our code paths. Run via `pnpm test`.
 *
 * Adding API-route tests requires a Supabase test instance + auth mocking,
 * which is a separate setup. Starting here so the foundation is in place
 * and the next session can grow coverage.
 */

describe("buildExportFilename", () => {
  it("uses facility initials + report type + extension", () => {
    const out = buildExportFilename(
      {
        facility_name: "Northside Hospital Duluth",
        location: "1st Floor SC-1",
        date_of_inspection: "2024-07-15",
      },
      "ILSM",
      "xlsx",
    );
    expect(out.startsWith("ILSM")).toBe(true);
    expect(out.endsWith(".xlsx")).toBe(true);
    expect(out).toContain("NHD");
  });

  it("strips unsafe characters", () => {
    const out = buildExportFilename(
      {
        facility_name: "Test/Facility:Name",
        location: "Wing A",
        date_of_inspection: null,
      },
      "CAP",
      "xlsx",
    );
    expect(out).not.toMatch(/[\/\\:?*<>|]/);
  });

  it("caps length at 200 chars", () => {
    const out = buildExportFilename(
      {
        facility_name: "A".repeat(500),
        location: "B".repeat(500),
        date_of_inspection: null,
      },
      "LSRA",
      "xlsx",
    );
    expect(out.length).toBeLessThanOrEqual(200);
  });
});

describe("autoResolveClearedPunchListItems", () => {
  it("returns 0 when supabase read fails (defensive no-op)", async () => {
    const fakeSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: null, error: { message: "boom" } }),
            }),
          }),
        }),
      }),
    };
    // Cast through unknown so we don't have to mock the full SupabaseClient type.
    const result = await autoResolveClearedPunchListItems(
      fakeSupabase as unknown as Parameters<typeof autoResolveClearedPunchListItems>[0],
      "photo-id",
      [{ item: "anything" }],
    );
    expect(result).toBe(0);
  });
});

describe("formatCoachThread", () => {
  it("returns empty array when there's nothing to coach", () => {
    expect(formatCoachThread([], "", undefined, [])).toEqual([]);
  });

  it("includes ratings block when rated findings are present", () => {
    const out = formatCoachThread([], "", undefined, [
      { title: "Gauge expired", severity: "Medium", rating: 1 },
      { title: "False alarm", severity: "Low", rating: -1 },
    ]);
    const joined = out.map((c) => c.question + "\n" + c.answer).join("\n---\n");
    expect(joined).toMatch(/THUMBS-UP/);
    expect(joined).toMatch(/THUMBS-DOWN/);
    expect(joined).toContain("Gauge expired");
    expect(joined).toContain("False alarm");
  });

  it("includes conversation block when a hint is present", () => {
    const turns: CoachTurn[] = [
      { role: "inspector", text: "There's a sprinkler" },
      { role: "ai", text: "Got it." },
    ];
    const out = formatCoachThread(turns, "Check the deflector", undefined, []);
    const joined = out.map((c) => c.answer).join("\n");
    expect(joined).toContain("INSPECTOR HINT");
    expect(joined).toContain("YOUR PRIOR RESPONSE");
    expect(joined).toContain("Check the deflector");
  });
});
