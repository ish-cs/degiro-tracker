import type { Tx, Position, Currency } from "@/lib/types";
import { isinToTicker } from "./isin-to-ticker";

export function currentPositions(txs: Tx[]): Position[] {
  const acc: Record<string, {
    qty: number; costLocal: number; product: string; exchange: string;
    currency: Currency; costBasisEur: number;
  }> = {};

  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));

  for (const tx of sorted) {
    const k = tx.isin;
    if (!acc[k]) {
      acc[k] = { qty: 0, costLocal: 0, product: tx.product, exchange: tx.exchange,
                 currency: tx.localCurrency, costBasisEur: 0 };
    }
    const p = acc[k];
    if (tx.quantity > 0) {
      p.costLocal += tx.quantity * tx.price;
      p.costBasisEur += tx.valueEur + tx.feeEur;
      p.qty += tx.quantity;
    } else {
      const sellQty = Math.abs(tx.quantity);
      if (p.qty > 0) {
        const avgCostLocal = p.costLocal / p.qty;
        const avgCostEur = p.costBasisEur / p.qty;
        p.costLocal -= sellQty * avgCostLocal;
        p.costBasisEur -= sellQty * avgCostEur;
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
      yahooSymbol: isinToTicker(isin, v.exchange, v.product),
      currency: v.currency,
      quantity: v.qty,
      bep: v.costLocal / v.qty,
      costBasisEur: v.costBasisEur,
    }));
}
