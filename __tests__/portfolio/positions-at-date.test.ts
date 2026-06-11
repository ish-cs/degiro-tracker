import { describe, it, expect } from "vitest";
import { qtyAtDate, costBasisAtDate } from "@/lib/portfolio/positions-at-date";
import type { Tx } from "@/lib/types";

const mk = (date: string, isin: string, qty: number, price: number, valueEur: number, feeEur = 0): Tx => ({
  date, time: "09:00", product: isin, isin, exchange: "NDQ",
  quantity: qty, price, localCurrency: "USD", valueLocal: qty * price,
  valueEur, fxRate: 1, feeEur, brokerFeeEur: feeEur, autoFxFeeEur: 0,
  totalEur: valueEur + feeEur, orderId: "o",
});

describe("positions-at-date", () => {
  const txs = [
    mk("2026-01-01", "A", 10, 100, 920),
    mk("2026-02-01", "A",  5, 120, 552),
    mk("2026-03-01", "A", -4, 150, 552),
  ];

  it("qty zero before any buy", () => {
    expect(qtyAtDate(txs, "A", "2025-12-31")).toBe(0);
  });

  it("qty after first buy", () => {
    expect(qtyAtDate(txs, "A", "2026-01-15")).toBe(10);
  });

  it("qty after second buy", () => {
    expect(qtyAtDate(txs, "A", "2026-02-15")).toBe(15);
  });

  it("qty after sell", () => {
    expect(qtyAtDate(txs, "A", "2026-03-15")).toBe(11);
  });

  it("cost basis after partial sell uses average-cost rule", () => {
    const cb = costBasisAtDate(txs, "A", "2026-03-15");
    const avgBefore = (920 + 552) / 15;
    expect(cb).toBeCloseTo(11 * avgBefore);
  });
});
