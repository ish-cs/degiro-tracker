import type { Tx, Position, Currency, Split } from "@/lib/types";
import { isinToTicker } from "./isin-to-ticker";

// Compute current positions from buys/sells, applying corporate actions
// (stock splits, bonus issues, reverse splits) chronologically.
//
// On a forward split of ratio R:
//   newQty = qty * R       (10 shares × 4-for-1 → 40)
//   costBasis unchanged    (no cash committed/returned)
//   BEP/sh = costBasis/qty automatically falls (€266/sh × 4-for-1 → €66.50/sh)
export function currentPositions(txs: Tx[], splits: Split[] = []): Position[] {
  type Acc = {
    qty: number;
    netCashEur: number;
    costBasisEur: number;
    product: string;
    exchange: string;
    localCurrency: Currency;
  };
  const acc: Record<string, Acc> = {};

  // Build a unified event timeline so splits apply between the buys that
  // straddle them. Sort by date, ties broken: buy/sell before split (a split
  // at end of day applies to the day's holdings including any earlier buys).
  type Event =
    | { kind: "tx"; tx: Tx }
    | { kind: "split"; split: Split };
  const events: Event[] = [
    ...txs.map((tx) => ({ kind: "tx" as const, tx })),
    ...splits.map((split) => ({ kind: "split" as const, split })),
  ];
  events.sort((a, b) => {
    const dateA = a.kind === "tx" ? a.tx.date : a.split.date;
    const dateB = b.kind === "tx" ? b.tx.date : b.split.date;
    const c = dateA.localeCompare(dateB);
    if (c !== 0) return c;
    // same date: txs before splits (a split at end of day applies to all of
    // the day's trades).
    if (a.kind === b.kind) return 0;
    return a.kind === "tx" ? -1 : 1;
  });

  for (const evt of events) {
    if (evt.kind === "split") {
      const p = acc[evt.split.isin];
      if (!p || p.qty <= 0) continue;
      p.qty *= evt.split.ratio;
      // cost basis stays the same — per-share automatically falls
      continue;
    }

    const tx = evt.tx;
    if (!acc[tx.isin]) {
      acc[tx.isin] = {
        qty: 0,
        netCashEur: 0,
        costBasisEur: 0,
        product: tx.product,
        exchange: tx.exchange,
        localCurrency: tx.localCurrency,
      };
    }
    const p = acc[tx.isin];

    if (tx.quantity > 0) {
      p.qty += tx.quantity;
      p.netCashEur += tx.valueEur;
      p.costBasisEur += tx.valueEur + tx.feeEur;
    } else {
      const sellQty = Math.abs(tx.quantity);
      if (p.qty > 0) {
        const avgNet = p.netCashEur / p.qty;
        const avgCost = p.costBasisEur / p.qty;
        p.netCashEur -= sellQty * avgNet;
        p.costBasisEur -= sellQty * avgCost;
      }
      p.qty -= sellQty;
    }
  }

  return Object.entries(acc)
    .filter(([, v]) => v.qty > 1e-9)
    .map(([isin, v]) => ({
      isin,
      product: v.product,
      exchange: v.exchange,
      yahooSymbol: isinToTicker(isin, v.localCurrency, v.product),
      quantity: v.qty,
      bep: v.netCashEur / v.qty,
      costBasisEur: v.costBasisEur,
    }));
}
