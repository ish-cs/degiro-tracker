import { describe, it, expect } from "vitest";
import { currentPositions } from "@/lib/portfolio/positions";
import type { Tx } from "@/lib/types";

const mk = (over: Partial<Tx>): Tx => ({
  date: "2026-01-01", time: "09:00", product: "X", isin: "X1",
  exchange: "NDQ", quantity: 1, price: 100, localCurrency: "USD",
  valueLocal: 100, valueEur: 92, fxRate: 1.08, feeEur: 0.5,
  totalEur: 92.5, orderId: "o1", ...over,
});

describe("currentPositions", () => {
  it("nets a single buy into one position", () => {
    const positions = currentPositions([mk({ quantity: 4, price: 244, isin: "US21037T1097", product: "Constellation Energy Corp" })]);
    expect(positions).toHaveLength(1);
    expect(positions[0].quantity).toBe(4);
    expect(positions[0].bep).toBeCloseTo(244);
  });

  it("ignores closed positions (qty=0)", () => {
    const positions = currentPositions([
      mk({ isin: "A", quantity: 5, price: 10 }),
      mk({ isin: "A", quantity: -5, price: 12 }),
    ]);
    expect(positions).toHaveLength(0);
  });

  it("weighted average BEP across multiple buys", () => {
    const positions = currentPositions([
      mk({ isin: "A", quantity: 2, price: 100 }),
      mk({ isin: "A", quantity: 3, price: 200 }),
    ]);
    expect(positions[0].quantity).toBe(5);
    expect(positions[0].bep).toBeCloseTo((2*100 + 3*200) / 5);
  });

  it("BEP unchanged by partial sell (uses cost-basis-preserving rule)", () => {
    const positions = currentPositions([
      mk({ isin: "A", quantity: 10, price: 100 }),
      mk({ isin: "A", quantity: -4, price: 150 }),
    ]);
    expect(positions[0].quantity).toBe(6);
    expect(positions[0].bep).toBeCloseTo(100);
  });
});
