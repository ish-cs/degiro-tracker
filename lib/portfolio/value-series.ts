import type { Tx, ValuePoint, CashEvent } from "@/lib/types";
import { qtyAtDate, costBasisAtDate } from "./positions-at-date";

type HistPoint = { t: number; close: number };
type HistByIsin = Record<string, HistPoint[]>;

function isoFromTs(t: number) {
  return new Date(t * 1000).toISOString().slice(0, 10);
}

export function valueSeries(
  txs: Tx[],
  _cashEvents: CashEvent[],
  histByIsin: HistByIsin,
  fxToEur: { USDEUR?: number; GBPEUR?: number } = { USDEUR: 1, GBPEUR: 1 },
): ValuePoint[] {
  const isins = Object.keys(histByIsin);
  const tsSet = new Set<number>();
  for (const isin of isins) for (const p of histByIsin[isin]) tsSet.add(p.t);
  const days = [...tsSet].sort((a, b) => a - b);

  const lookup: Record<string, Record<number, number>> = {};
  for (const isin of isins) {
    lookup[isin] = {};
    for (const p of histByIsin[isin]) lookup[isin][p.t] = p.close;
  }

  const currency: Record<string, "EUR" | "USD" | "GBP"> = {};
  for (const isin of isins) {
    const sampleTx = txs.find((t) => t.isin === isin);
    const c = sampleTx?.localCurrency ?? "EUR";
    currency[isin] = c === "USD" || c === "GBP" ? c : "EUR";
  }

  const points: ValuePoint[] = [];
  for (const t of days) {
    const iso = isoFromTs(t);
    let value = 0, cost = 0;
    for (const isin of isins) {
      const qty = qtyAtDate(txs, isin, iso);
      if (qty === 0) continue;
      const close = lookup[isin][t];
      if (close == null) continue;
      const fx = currency[isin] === "USD" ? (fxToEur.USDEUR ?? 1)
                : currency[isin] === "GBP" ? (fxToEur.GBPEUR ?? 1)
                : 1;
      value += qty * close * fx;
      cost += costBasisAtDate(txs, isin, iso);
    }
    points.push({ t, valueEur: value, costBasisEur: cost, plEur: value - cost });
  }
  return points;
}
