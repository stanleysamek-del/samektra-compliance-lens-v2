import { afterEach, describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const mocks = vi.hoisted(() => ({ service: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.service,
}));
import { assertAiBudget, settleAiBudget } from "@/lib/ai/budget";
const client = {} as SupabaseClient;
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
describe("paid budget fails closed", () => {
  it("denies guests and missing service configuration", async () => {
    mocks.service.mockReturnValue(null);
    expect(
      (await assertAiBudget(client, { userId: "user", orgId: null })).ok,
    ).toBe(false);
    const rpc = vi.fn();
    mocks.service.mockReturnValue({ rpc });
    expect(
      (await assertAiBudget(client, { userId: null, orgId: null })).ok,
    ).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("denies database failures and interrupted verification", async () => {
    mocks.service.mockReturnValue({
      rpc: vi
        .fn()
        .mockResolvedValue({ error: { message: "missing migration" } }),
    });
    expect(
      (await assertAiBudget(client, { userId: "user", orgId: null })).ok,
    ).toBe(false);
    mocks.service.mockImplementation(() => {
      throw new Error("bad configuration");
    });
    expect(
      (await assertAiBudget(client, { userId: "user", orgId: null })).ok,
    ).toBe(false);
  });
  it("treats invalid or zero global caps as a kill switch", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: { ok: false, error: "paused" } });
    mocks.service.mockReturnValue({ rpc });
    for (const value of ["0", "invalid", "-1"]) {
      vi.stubEnv("AI_GLOBAL_DAILY_BUDGET_USD", value);
      await assertAiBudget(client, {
        userId: "user",
        orgId: "org",
        tier: "deep",
      });
      expect(rpc).toHaveBeenLastCalledWith("reserve_paid_ai", {
        _user_id: "user",
        _org_id: "org",
        _tier: "deep",
        _global_daily_cap: 0,
      });
    }
  });
  it("does not release holds for missing or invalid cost reports", async () => {
    const rpc = vi.fn();
    mocks.service.mockReturnValue({ rpc });
    for (const value of [0, -1, NaN])
      await settleAiBudget("reservation", value);
    expect(rpc).not.toHaveBeenCalled();
  });
});
