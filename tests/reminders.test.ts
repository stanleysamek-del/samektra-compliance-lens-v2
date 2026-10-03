import { describe, expect, it } from "vitest";
import {
  assetPhase,
  daysPastDue,
  describeDue,
  groupByRecipient,
  maskEmail,
  schedulePhase,
  shouldNudge,
} from "@/lib/reminders/logic";
import { buildReminderEmail } from "@/lib/email/send-reminder";
import { runReminders } from "@/lib/reminders/run";

describe("timing", () => {
  it("counts whole days past due", () => {
    expect(daysPastDue("2026-10-10", "2026-10-10")).toBe(0);
    expect(daysPastDue("2026-10-10", "2026-10-07")).toBe(3);
    expect(daysPastDue("2026-10-10", "2026-10-11")).toBe(-1);
    // A timestamptz is read by its date part.
    expect(daysPastDue("2026-10-10", "2026-10-09T23:30:00+00:00")).toBe(1);
  });

  it("nudges overdue items on an escalating cadence, never daily", () => {
    const days = Array.from({ length: 95 }, (_, i) => i + 1).filter(shouldNudge);
    expect(days).toEqual([1, 3, 7, 14, 30, 60, 90]);
    expect(shouldNudge(0)).toBe(false);
    expect(shouldNudge(-3)).toBe(false);
  });

  it("schedules: day before, day of, then overdue cadence", () => {
    expect(schedulePhase(-2)).toBeNull();
    expect(schedulePhase(-1)).toBe("heads_up");
    expect(schedulePhase(0)).toBe("due_today");
    expect(schedulePhase(1)).toBe("overdue");
    expect(schedulePhase(2)).toBeNull();
    expect(schedulePhase(7)).toBe("overdue");
  });

  it("equipment: a week ahead too", () => {
    expect(assetPhase(-7)).toBe("heads_up");
    expect(assetPhase(-6)).toBeNull();
    expect(assetPhase(-1)).toBe("heads_up");
    expect(assetPhase(0)).toBe("due_today");
    expect(assetPhase(3)).toBe("overdue");
  });

  it("describes due dates for humans", () => {
    expect(describeDue(-7)).toBe("due in 7 days");
    expect(describeDue(-1)).toBe("due tomorrow");
    expect(describeDue(0)).toBe("due today");
    expect(describeDue(1)).toBe("1 day overdue");
    expect(describeDue(14)).toBe("14 days overdue");
  });

  it("groups by recipient, case-insensitively, one entry per person", () => {
    const g = groupByRecipient([
      { email: "A@x.org", item: 1 },
      { email: "a@x.org ", item: 2 },
      { email: "b@x.org", item: 3 },
      { email: "  ", item: 4 },
    ]);
    expect([...g.entries()]).toEqual([
      ["a@x.org", [1, 2]],
      ["b@x.org", [3]],
    ]);
  });

  it("masks addresses", () => {
    expect(maskEmail("jane@example.org")).toBe("j***@example.org");
    expect(maskEmail("nope")).toBe("***");
  });
});

describe("email content", () => {
  it("escapes HTML in titles and builds text + html", () => {
    const e = buildReminderEmail({
      to: "a@x.org",
      subject: "s",
      eyebrow: "Equipment checks",
      heading: "Heads up",
      intro: "intro",
      rows: [{ title: "<script>alert(1)</script>", detail: "Bldg A · 3 days overdue", overdue: true, href: "/assets/1" }],
      ctaLabel: "Open",
      ctaHref: "/assets",
    });
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("&lt;script&gt;");
    expect(e.html).toContain("#b42318"); // overdue rows are red
    expect(e.text).toContain("https://compliancelens.app/assets/1");
  });
});

// ---- runner against a fake database ---------------------------------------

type Table = Array<Record<string, unknown>>;
function fakeDb(tables: Record<string, Table>, users: Record<string, string | null>) {
  const q = (name: string) => {
    let rows = tables[name] ?? [];
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), api),
      in: (c: string, v: unknown[]) => ((rows = rows.filter((r) => v.includes(r[c]))), api),
      not: () => api,
      lte: (c: string, v: string) => ((rows = rows.filter((r) => String(r[c]) <= v)), api),
      limit: () => Promise.resolve({ data: rows, error: null }),
      // Supabase's query builder is awaitable without a terminal call.
      then: (resolve: (v: { data: Table; error: null }) => unknown) => resolve({ data: rows, error: null }),
    };
    return api;
  };
  return {
    from: (n: string) => q(n),
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: users[id] ? { email: users[id] } : null } }) } },
  } as never;
}

describe("runReminders (dry)", () => {
  const today = "2026-10-10";
  const db = fakeDb(
    {
      inspection_schedules: [
        { id: "s1", name: "East wing monthly", cadence: "monthly", next_due: "2026-10-11", enabled: true, created_by: "u1", inspections: { facility_name: "St. Anselm" } },
        { id: "s2", name: "Stairs weekly", cadence: "weekly", next_due: "2026-10-09", enabled: true, created_by: "u1", inspections: { facility_name: "St. Anselm" } },
        { id: "s3", name: "Not yet", cadence: "daily", next_due: "2026-10-30", enabled: true, created_by: "u1", inspections: { facility_name: "X" } },
        { id: "s4", name: "Two days over", cadence: "daily", next_due: "2026-10-08", enabled: true, created_by: "u1", inspections: { facility_name: "X" } },
        { id: "s5", name: "No owner email", cadence: "daily", next_due: "2026-10-10", enabled: true, created_by: "ghost", inspections: { facility_name: "X" } },
      ],
      assets: [
        { id: "a1", label: "FE-001", type: "extinguisher", next_due_at: "2026-10-17T00:00:00Z", status: "in_service", location_text: "Corridor 5E", facilities: { name: "Bldg A", organization_id: "org1", created_by: "u1" } },
        { id: "a2", label: null, type: "fire_door", barcode: "BC-2", next_due_at: "2026-10-03T00:00:00Z", status: "in_service", facilities: { name: "Bldg A", organization_id: "org1", created_by: "u1" } },
        { id: "a3", label: "Personal AED", type: "aed", next_due_at: "2026-10-10T00:00:00Z", status: "in_service", facilities: { name: "Home", organization_id: null, created_by: "u2" } },
        { id: "a4", label: "Quiet", type: "other", next_due_at: "2026-10-13T00:00:00Z", status: "in_service", facilities: { name: "Bldg A", organization_id: "org1", created_by: "u1" } },
      ],
      organization_members: [
        { organization_id: "org1", user_id: "u3", role: "admin" },
        { organization_id: "org1", user_id: "u4", role: "member" },
      ],
    },
    { u1: "creator@x.org", u2: "solo@x.org", u3: "admin@x.org", u4: "member@x.org" },
  );

  it("emails each person one digest of only what is due today", async () => {
    const r = await runReminders(db, { dry: true, todayIso: today });
    // The database filter already drops s3 (not due for weeks).
    expect(r.schedulesScanned).toBe(4);
    // s1 (tomorrow) and s2 (1 day over) are on schedule; s4 (2 days over) is
    // between nudges. The creator gets ONE email covering s1 + s2; s5's
    // owner has no email address.
    const sched = r.preview!.filter((p) => /scheduled inspections/.test(p.subject));
    expect(sched).toEqual([{ to: "c***@x.org", subject: "2 scheduled inspections need attention", items: 2 }]);
    expect(r.skippedNoEmail).toBeGreaterThanOrEqual(1);

    // Equipment: a1 is exactly 7 days out, a2 is 7 days over, a3 is due today,
    // a4 is 3 days out (quiet). Bldg A items go to its creator AND its admin
    // (not the plain member); the solo facility goes to its creator.
    const eq = r.preview!.filter((p) => /equipment check/.test(p.subject));
    const byTo = Object.fromEntries(eq.map((p) => [p.to, p.items]));
    expect(byTo).toEqual({ "c***@x.org": 2, "a***@x.org": 2, "s***@x.org": 1 });
    expect(r.equipmentEmails).toBe(3);
    expect(r.scheduleEmails).toBe(1);
  });

  it("never sends in dry mode and does not leak full addresses", async () => {
    const r = await runReminders(db, { dry: true, todayIso: today });
    expect(JSON.stringify(r)).not.toMatch(/(creator|solo|admin|member)@/);
  });
});
