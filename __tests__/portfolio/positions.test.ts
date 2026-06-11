import { describe, it, expect } from "vitest";
import { currentPositions } from "@/lib/portfolio/positions";
import type { Tx } from "@/lib/types";

// BEP is now EUR-per-share, fees EXCLUDED. So mock fixtures set valueEur
// independently from local-currency price.
const mk = (over: Partial<Tx>): Tx => ({
  date: "2026-01-01", time: "09:00", product: "X", isin: "X1",
  exchange: "NDQ", quantity: 1, price: 100, localCurrency: "USD",
  valueLocal: 100, valueEur: 92, fxRate: 1.08, feeEur: 0.5,
  totalEur: 92.5, orderId: "o1", ...over,
});

describe("currentPositions", () => {
  it("nets a single buy into one position with EUR BEP", () => {
    const positions = currentPositions([
      mk({ quantity: 4, price: 244, valueEur: 844, feeEur: 4, isin: "US21037T1097", product: "Constellation Energy Corp" }),
    ]);
    expect(positions).toHaveLength(1);
    expect(positions[0].quantity).toBe(4);
    expect(positions[0].bep).toBeCloseTo(844 / 4);             // €211 (no fees)
    expect(positions[0].costBasisEur).toBeCloseTo(848);        // €848 (with fees)
  });

  it("ignores closed positions (qty=0)", () => {
    const positions = currentPositions([
      mk({ isin: "A", quantity: 5, valueEur: 460 }),
      mk({ isin: "A", quantity: -5, valueEur: 552 }),
    ]);
    expect(positions).toHaveLength(0);
  });

  it("weighted average BEP across multiple buys", () => {
    const positions = currentPositions([
      mk({ isin: "A", quantity: 2, valueEur: 200, feeEur: 0 }),
      mk({ isin: "A", quantity: 3, valueEur: 600, feeEur: 0 }),
    ]);
    expect(positions[0].quantity).toBe(5);
    expect(positions[0].bep).toBeCloseTo((200 + 600) / 5);     // €160
  });

  it("BEP preserved after partial sell (average-cost rule)", () => {
    const positions = currentPositions([
      mk({ isin: "A", quantity: 10, valueEur: 1000, feeEur: 0 }),
      mk({ isin: "A", quantity: -4, valueEur: 600, feeEur: 0 }),
    ]);
    expect(positions[0].quantity).toBe(6);
    expect(positions[0].bep).toBeCloseTo(100);
  });
});
