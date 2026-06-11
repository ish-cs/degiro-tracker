import { describe, it, expect } from "vitest";
import { parseSplitRatio, extractSplits } from "@/lib/portfolio/splits";
import type { CashEvent } from "@/lib/types";

const ev = (over: Partial<CashEvent>): CashEvent => ({
  date: "2026-06-01", product: "X", isin: "X1", description: "x", kind: "split",
  currency: "EUR", amount: 0, amountEur: 0,
  balanceCurrency: "EUR", balance: 0, balanceEur: 0,
  orderId: null, fxRate: null, ...over,
});

describe("parseSplitRatio", () => {
  it("'Stock split CONVERSION: 9 for 1' → 9", () => {
    expect(parseSplitRatio("Stock split CONVERSION: 9 for 1")).toBeCloseTo(9);
  });

  it("'Stock Split 4:1' → 4", () => {
    expect(parseSplitRatio("Stock Split 4:1")).toBeCloseTo(4);
  });

  it("'Stock Split 3 for 1' → 3", () => {
    expect(parseSplitRatio("Stock Split 3 for 1")).toBeCloseTo(3);
  });

  it("'Reverse stock split 1 for 10' → 0.1", () => {
    expect(parseSplitRatio("Reverse stock split 1 for 10")).toBeCloseTo(0.1);
  });

  it("'Reverse stock split 10:1' → 0.1 (normalized)", () => {
    expect(parseSplitRatio("Reverse stock split 10:1")).toBeCloseTo(0.1);
  });

  it("'Bonus shares 1:10' → 1.1", () => {
    expect(parseSplitRatio("Bonus shares 1:10")).toBeCloseTo(1.1);
  });

  it("returns null for unparseable description", () => {
    expect(parseSplitRatio("Stock split")).toBeNull();
    expect(parseSplitRatio("Some random text")).toBeNull();
  });
});

describe("extractSplits", () => {
  it("pulls splits with parseable ratios", () => {
    const splits = extractSplits([
      ev({ kind: "split", description: "Stock split 4 for 1", isin: "ISIN1", date: "2026-03-01" }),
      ev({ kind: "buy", description: "Buy 10 ISIN1@100 EUR", isin: "ISIN1" }),
      ev({ kind: "split", description: "Reverse stock split 1:5", isin: "ISIN2", date: "2026-05-01" }),
    ]);
    expect(splits).toHaveLength(2);
    expect(splits[0].ratio).toBeCloseTo(4);
    expect(splits[0].isin).toBe("ISIN1");
    expect(splits[1].ratio).toBeCloseTo(0.2);
  });

  it("skips splits without ISIN", () => {
    const splits = extractSplits([
      ev({ kind: "split", description: "Stock split 2:1", isin: null }),
    ]);
    expect(splits).toHaveLength(0);
  });

  it("skips splits with unparseable description", () => {
    const splits = extractSplits([
      ev({ kind: "split", description: "Stock split confirmation", isin: "ISIN1" }),
    ]);
    expect(splits).toHaveLength(0);
  });
});
