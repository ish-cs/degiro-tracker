import { describe, it, expect } from "vitest";
import { findUnrecognizedEvents } from "@/lib/portfolio/unrecognized";
import type { CashEvent } from "@/lib/types";

const ev = (over: Partial<CashEvent>): CashEvent => ({
  date: "2026-01-01", product: "", isin: null, description: "x", kind: "other",
  currency: "EUR", amount: 0, amountEur: 0,
  balanceCurrency: "EUR", balance: 0, balanceEur: 0,
  orderId: null, fxRate: null, ...over,
});

describe("findUnrecognizedEvents", () => {
  it("ignores known transaction kinds (buy/sell/dividend/etc.)", () => {
    const out = findUnrecognizedEvents([
      ev({ kind: "buy", description: "Buy 1 X@1 EUR (X1)", amount: -1 }),
      ev({ kind: "sell", description: "Sell 1 X@1 EUR (X1)", amount: 1 }),
      ev({ kind: "dividend", description: "Dividend", amount: 1 }),
      ev({ kind: "fee", description: "DEGIRO fee", amount: -1 }),
      ev({ kind: "fx", description: "FX Debit", amount: -1 }),
      ev({ kind: "deposit", description: "flatex Deposit", amount: 1000 }),
      ev({ kind: "withdrawal", description: "Withdrawal", amount: -100 }),
    ]);
    expect(out).toHaveLength(0);
  });

  it("ignores internal sweeps and known income/cost descriptions", () => {
    const out = findUnrecognizedEvents([
      ev({ kind: "other", description: "Degiro Cash Sweep Transfer", amount: 100 }),
      ev({ kind: "other", description: "Transfer from your Cash Account at flatexDEGIRO Bank SE: 100 EUR", amount: 0 }),
      ev({ kind: "other", description: "DEGIRO Rebate Promotion", amount: 6.9 }),
      ev({ kind: "other", description: "Flatex Interest Income", amount: 0.5 }),
      ev({ kind: "other", description: "DEGIRO Debit Interest", amount: -1.5 }),
    ]);
    expect(out).toHaveLength(0);
  });

  it("ignores zero-amount info rows", () => {
    const out = findUnrecognizedEvents([
      ev({ kind: "other", description: "Some informational notice", amount: 0 }),
    ]);
    expect(out).toHaveLength(0);
  });

  it("flags split with no parseable ratio", () => {
    const out = findUnrecognizedEvents([
      ev({ kind: "split", description: "Stock split confirmation", isin: "X1" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("split");
  });

  it("does NOT flag split with parseable ratio", () => {
    const out = findUnrecognizedEvents([
      ev({ kind: "split", description: "Stock split 4 for 1", isin: "X1" }),
    ]);
    expect(out).toHaveLength(0);
  });

  it("flags any merger/spinoff (we never auto-handle these)", () => {
    const out = findUnrecognizedEvents([
      ev({ kind: "merger", description: "Acquisition: Company A merged into B" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("merger");
  });

  it("groups identical descriptions and sums total EUR", () => {
    const out = findUnrecognizedEvents([
      ev({ kind: "other", description: "Mystery charge", amount: -2.50 }),
      ev({ kind: "other", description: "Mystery charge", amount: -2.50 }),
      ev({ kind: "other", description: "Mystery charge", amount: -2.50 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(3);
    expect(out[0].totalEur).toBeCloseTo(-7.5);
  });

  it("sorts by abs(totalEur) descending so biggest impact surfaces first", () => {
    const out = findUnrecognizedEvents([
      ev({ kind: "other", description: "Small mystery", amount: -1 }),
      ev({ kind: "other", description: "Huge mystery", amount: -100 }),
      ev({ kind: "other", description: "Medium mystery", amount: -10 }),
    ]);
    expect(out.map((g) => g.description)).toEqual(["Huge mystery", "Medium mystery", "Small mystery"]);
  });
});
