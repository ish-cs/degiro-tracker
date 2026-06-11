import { describe, it, expect } from "vitest";
import { buildHistoricalFx, makeFxLookup } from "@/lib/portfolio/historical-fx";
import type { CashEvent } from "@/lib/types";

const mk = (over: Partial<CashEvent>): CashEvent => ({
  date: "2026-01-01", product: "", isin: null, description: "x", kind: "other",
  currency: "EUR", amount: 0, amountEur: 0,
  balanceCurrency: "EUR", balance: 0, balanceEur: 0,
  orderId: null, fxRate: null, ...over,
});

describe("buildHistoricalFx", () => {
  it("extracts USD→EUR rate from matched FX Credit/Debit pair", () => {
    const idx = buildHistoricalFx([
      mk({ date: "2026-06-10", orderId: "ac-001", kind: "fx",
           description: "FX Credit", currency: "USD", amount: 976.00, fxRate: 1.1535 }),
      mk({ date: "2026-06-10", orderId: "ac-001", kind: "fx",
           description: "FX Debit", currency: "EUR", amount: -846.11 }),
    ]);
    expect(idx.USD).toHaveLength(1);
    expect(idx.USD[0].eurPerUnit).toBeCloseTo(846.11 / 976.00, 5);
    expect(idx.USD[0].date).toBe("2026-06-10");
  });

  it("extracts rate from orphan (non-order-linked) FX pair by date", () => {
    const idx = buildHistoricalFx([
      mk({ date: "2026-03-18", kind: "fx", description: "FX Credit",
           currency: "EUR", amount: 3.40 }),
      mk({ date: "2026-03-18", kind: "fx", description: "FX Debit",
           currency: "USD", amount: -3.93, fxRate: 1.1570 }),
    ]);
    expect(idx.USD).toHaveLength(1); // pair wins; fxRate column deduped
    expect(idx.USD[0].eurPerUnit).toBeCloseTo(3.40 / 3.93, 4);
  });

  it("sorts entries by date ascending per ccy", () => {
    const idx = buildHistoricalFx([
      mk({ date: "2026-05-01", orderId: "a", kind: "fx", description: "FX Credit",
           currency: "USD", amount: 100 }),
      mk({ date: "2026-05-01", orderId: "a", kind: "fx", description: "FX Debit",
           currency: "EUR", amount: -88 }),
      mk({ date: "2026-01-01", orderId: "b", kind: "fx", description: "FX Credit",
           currency: "USD", amount: 100 }),
      mk({ date: "2026-01-01", orderId: "b", kind: "fx", description: "FX Debit",
           currency: "EUR", amount: -95 }),
    ]);
    expect(idx.USD.map((e) => e.date)).toEqual(["2026-01-01", "2026-05-01"]);
  });

  it("ignores zero-amount or single-leg events", () => {
    const idx = buildHistoricalFx([
      mk({ date: "2026-01-01", orderId: "x", kind: "fx",
           description: "FX Credit", currency: "USD", amount: 0 }),
    ]);
    expect(idx.USD ?? []).toEqual([]);
  });

  it("supports multiple currencies", () => {
    const idx = buildHistoricalFx([
      mk({ date: "2026-02-01", orderId: "a", kind: "fx", description: "FX Credit",
           currency: "USD", amount: 100 }),
      mk({ date: "2026-02-01", orderId: "a", kind: "fx", description: "FX Debit",
           currency: "EUR", amount: -90 }),
      mk({ date: "2026-02-02", orderId: "b", kind: "fx", description: "FX Credit",
           currency: "GBP", amount: 100 }),
      mk({ date: "2026-02-02", orderId: "b", kind: "fx", description: "FX Debit",
           currency: "EUR", amount: -118 }),
    ]);
    expect(idx.USD[0].eurPerUnit).toBeCloseTo(0.9, 2);
    expect(idx.GBP[0].eurPerUnit).toBeCloseTo(1.18, 2);
  });
});

describe("makeFxLookup", () => {
  it("returns 1 for EUR", () => {
    const fx = makeFxLookup({});
    expect(fx("2026-01-01", "EUR")).toBe(1);
  });

  it("returns nearest-prior rate", () => {
    const fx = makeFxLookup({
      USD: [
        { date: "2026-01-15", eurPerUnit: 0.92 },
        { date: "2026-04-01", eurPerUnit: 0.88 },
        { date: "2026-06-10", eurPerUnit: 0.867 },
      ],
    });
    expect(fx("2026-03-01", "USD")).toBeCloseTo(0.92);   // before Apr 1, after Jan 15
    expect(fx("2026-05-01", "USD")).toBeCloseTo(0.88);   // between Apr 1 and Jun 10
    expect(fx("2026-07-01", "USD")).toBeCloseTo(0.867);  // after last entry
  });

  it("falls back to earliest entry when date precedes the index", () => {
    const fx = makeFxLookup({
      USD: [{ date: "2026-05-01", eurPerUnit: 0.88 }],
    });
    expect(fx("2026-01-01", "USD")).toBeCloseTo(0.88);
  });

  it("falls back to defaultRates when ccy unknown", () => {
    const fx = makeFxLookup({}, { USD: 0.866 });
    expect(fx("2026-01-01", "USD")).toBeCloseTo(0.866);
  });

  it("returns 0 when no history and no default", () => {
    const fx = makeFxLookup({});
    expect(fx("2026-01-01", "USD")).toBe(0);
  });
});
