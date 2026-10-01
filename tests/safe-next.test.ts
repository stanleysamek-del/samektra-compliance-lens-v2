import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-next";

describe("safeNext", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeNext("/team/invite/abc")).toBe("/team/invite/abc");
    expect(safeNext("/inspections?x=1")).toBe("/inspections?x=1");
  });

  it("falls back for missing values", () => {
    expect(safeNext(undefined)).toBe("/inspections");
    expect(safeNext("")).toBe("/inspections");
    expect(safeNext(null, "")).toBe("");
  });

  it("rejects off-site and scheme targets", () => {
    for (const bad of [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "javascript:alert(1)",
      "/javascript:alert(1)",
      "/ok\r\nSet-Cookie: x=1",
      "evil.com",
    ]) {
      expect(safeNext(bad)).toBe("/inspections");
    }
  });
});
