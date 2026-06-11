import { describe, it, expect } from "vitest";
import { modifiedDietz } from "@/lib/portfolio/modified-dietz";

describe("modifiedDietz", () => {
  it("returns 0 for zero-day period", () => {
    expect(modifiedDietz(0, 0, [], "2026-01-01", "2026-01-01")).toBe(0);
  });

  it("single contribution at start: matches simple return", () => {
    const r = modifiedDietz(0, 1100, [{ dateIso: "2026-01-01", amount: 1000 }], "2026-01-01", "2026-07-01");
    expect(r).toBeCloseTo(0.1);
  });

  it("late contribution has lower weight, return increases", () => {
    // Early €1000 → grew to €1100 by July, then user adds €500 in June.
    // Naive: (1600 - 1500) / 1500 = 6.67%. Mod Dietz weights the €500 by ~16%.
    const r = modifiedDietz(
      0, 1600,
      [
        { dateIso: "2026-01-01", amount: 1000 },
        { dateIso: "2026-06-01", amount: 500 },
      ],
      "2026-01-01", "2026-07-01",
    );
    // Weighted capital ≈ 1000 + 500*(30/181) ≈ 1082.87
    // R = 100 / 1082.87 ≈ 9.23%
    expect(r).toBeGreaterThan(0.08);
    expect(r).toBeLessThan(0.10);
  });

  it("never deployed → zero", () => {
    const r = modifiedDietz(0, 0, [], "2026-01-01", "2026-12-31");
    expect(r).toBe(0);
  });
});
