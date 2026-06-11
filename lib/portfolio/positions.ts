import type { Tx, Position, Currency } from "@/lib/types";
import { isinToTicker } from "./isin-to-ticker";

export function currentPositions(txs: Tx[]): Position[] {
  // Everything normalized to the broker's reporting currency (EUR for DEGIRO):
  //   bep            = per-share net cash invested in EUR (fees excluded)
  //                    — matches "Net Cash Invested per share" in established trackers
  //   costBasisEur   = total cost basis in EUR INCLUDING fees
  //                    — what return % is computed against
  const acc: Record<string, {
    qty: number;
    netCashEur: number;     // sum of tx.valueEur for buys (no fees)
    costBasisEur: number;   // sum of tx.valueEur + tx.feeEur (with fees)
    product: string;
    exchange: string;
    localCurrency: Currency;
  }> = {};

  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));

  for (const tx of sorted) {
    const k = tx.isin;
    if (!acc[k]) {
      acc[k] = {
        qty: 0,
        netCashEur: 0,
        costBasisEur: 0,
        product: tx.product,
        exchange: tx.exchange,
        localCurrency: tx.localCurrency,
      };
    }
    const p = acc[k];
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
    .filter(([, v]) => v.qty > 0)
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
