import { describe, it, expect } from "vitest";
import { xirr, type Cashflow } from "@/lib/portfolio/xirr";

describe("xirr", () => {
  it("simple 10% over 1 year", () => {
    const r = xirr([
      { dateIso: "2025-01-01", amount: -1000 },
      { dateIso: "2026-01-01", amount: 1100 },
    ]);
    expect(r).toBeCloseTo(0.1, 4);
  });

  it("doubling in 1 year ≈ 100%", () => {
    const r = xirr([
      { dateIso: "2025-01-01", amount: -1000 },
      { dateIso: "2026-01-01", amount: 2000 },
    ]);
    expect(r).toBeCloseTo(1.0, 3);
  });

  it("flat → 0% return", () => {
    const r = xirr([
      { dateIso: "2025-01-01", amount: -1000 },
      { dateIso: "2026-01-01", amount: 1000 },
    ]);
    expect(r).toBeCloseTo(0, 4);
  });

  it("negative return (-10%)", () => {
    const r = xirr([
      { dateIso: "2025-01-01", amount: -1000 },
      { dateIso: "2026-01-01", amount: 900 },
    ]);
    expect(r).toBeCloseTo(-0.1, 3);
  });

  it("irregular flows: contribution mid-period weighted less", () => {
    // €1000 day 0, €1000 day 182 (half-year), terminal €2200 day 365.
    // Annualized money-weighted return ~13.5%.
    const r = xirr([
      { dateIso: "2025-01-01", amount: -1000 },
      { dateIso: "2025-07-02", amount: -1000 },
      { dateIso: "2026-01-01", amount: 2200 },
    ]);
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(0.10);
    expect(r!).toBeLessThan(0.18);
  });

  it("dividends count as positive cashflows", () => {
    // Buy €1000, receive €30 dividend mid-year, sell €1100 at end. Better than flat.
    const r = xirr([
      { dateIso: "2025-01-01", amount: -1000 },
      { dateIso: "2025-07-02", amount: 30 },
      { dateIso: "2026-01-01", amount: 1100 },
    ]);
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(0.13);
  });

  it("returns null when only negative or only positive flows", () => {
    expect(xirr([
      { dateIso: "2025-01-01", amount: -1000 },
      { dateIso: "2026-01-01", amount: -100 },
    ])).toBeNull();
    expect(xirr([
      { dateIso: "2025-01-01", amount: 1000 },
      { dateIso: "2026-01-01", amount: 100 },
    ])).toBeNull();
  });

  it("returns null for <2 cashflows", () => {
    expect(xirr([{ dateIso: "2025-01-01", amount: -1000 }])).toBeNull();
    expect(xirr([])).toBeNull();
  });

  it("multi-leg portfolio matches Excel XIRR", () => {
    // Verified against Excel's =XIRR() — Microsoft's reference implementation.
    const flows: Cashflow[] = [
      { dateIso: "2024-01-15", amount: -2000 },
      { dateIso: "2024-04-10", amount: -1500 },
      { dateIso: "2024-09-22", amount: -1200 },
      { dateIso: "2025-02-03", amount: 800 },
      { dateIso: "2026-06-11", amount: 5200 },
    ];
    const r = xirr(flows);
    expect(r).not.toBeNull();
    // Excel XIRR returns ~13.23% — within 0.5% tolerance.
    expect(r!).toBeGreaterThan(0.125);
    expect(r!).toBeLessThan(0.14);
  });

  it("very high return (3x in 1 year) ≈ 200%", () => {
    const r = xirr([
      { dateIso: "2025-01-01", amount: -1000 },
      { dateIso: "2026-01-01", amount: 3000 },
    ]);
    expect(r).toBeCloseTo(2.0, 2);
  });

  it("handles intra-day same-date flows", () => {
    const r = xirr([
      { dateIso: "2025-01-01", amount: -500 },
      { dateIso: "2025-01-01", amount: -500 },
      { dateIso: "2026-01-01", amount: 1100 },
    ]);
    expect(r).toBeCloseTo(0.1, 4);
  });
});
