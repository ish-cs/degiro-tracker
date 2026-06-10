import { describe, it, expect } from "vitest";
import { computeReturns } from "@/lib/portfolio/returns";
import type { Position } from "@/lib/types";

const p = (over: Partial<Position>): Position => ({
  isin: "X", product: "X", exchange: "NDQ", yahooSymbol: "X",
  currency: "USD", quantity: 4, bep: 244, costBasisEur: 846.76,
  ...over,
});

describe("computeReturns", () => {
  it("computes price return €", () => {
    const r = computeReturns(
      [p({ isin: "CEG", quantity: 4, bep: 244, costBasisEur: 846 })],
      { CEG: 10 },
      { CEG: { priceEur: 220, currency: "USD" } },
      0,
    );
    expect(r.currentValueEur).toBeCloseTo(880);
    expect(r.priceReturnEur).toBeCloseTo(880 - 846);
    expect(r.incomeReturnEur).toBeCloseTo(10);
    expect(r.totalReturnEur).toBeCloseTo(880 - 846 + 10);
    expect(r.totalReturnPct).toBeCloseTo((880 - 846 + 10) / 846);
  });

  it("cost ratio = fees / cost basis", () => {
    const r = computeReturns(
      [p({ isin: "A", costBasisEur: 1000 })],
      {}, { A: { priceEur: 250, currency: "USD" } },
      5,
    );
    expect(r.costRatioPct).toBeCloseTo(0.005);
  });
});
