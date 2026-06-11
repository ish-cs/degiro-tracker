import { describe, it, expect } from "vitest";
import { valueSeries } from "@/lib/portfolio/value-series";
import type { Tx } from "@/lib/types";

const mk = (date: string, isin: string, qty: number, valueEur: number): Tx => ({
  date, time: "09:00", product: isin, isin, exchange: "TDG",
  quantity: qty, price: valueEur / Math.abs(qty), localCurrency: "EUR",
  valueLocal: valueEur, valueEur, fxRate: 1, feeEur: 0, brokerFeeEur: 0,
  autoFxFeeEur: 0, totalEur: valueEur, orderId: "o",
});

const day = (s: string) => Math.floor(new Date(`${s}T00:00:00Z`).getTime() / 1000);

describe("valueSeries", () => {
  it("portfolio value = qty * close on each day", () => {
    const txs: Tx[] = [mk("2026-01-01", "A", 10, 1000)];
    const histByIsin = { A: [
      { t: day("2026-01-01"), close: 100 },
      { t: day("2026-01-02"), close: 110 },
      { t: day("2026-01-03"), close: 120 },
    ]};
    const series = valueSeries(txs, [], histByIsin, { USDEUR: 1 });
    expect(series).toHaveLength(3);
    expect(series[0].valueEur).toBeCloseTo(1000);
    expect(series[2].valueEur).toBeCloseTo(1200);
    expect(series[2].plEur).toBeCloseTo(200);
  });
});
