import type { Tx } from "@/lib/types";

function walk(txs: Tx[], isin: string, dateInclusive: string) {
  let qty = 0, costEur = 0;
  for (const t of txs) {
    if (t.isin !== isin) continue;
    if (t.date > dateInclusive) break;
    if (t.quantity > 0) {
      qty += t.quantity;
      costEur += t.valueEur + t.feeEur;
    } else {
      const sellQty = Math.abs(t.quantity);
      if (qty > 0) {
        const avg = costEur / qty;
        costEur -= sellQty * avg;
      }
      qty -= sellQty;
    }
  }
  return { qty, costEur };
}

export function qtyAtDate(txs: Tx[], isin: string, dateInclusive: string): number {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  return walk(sorted, isin, dateInclusive).qty;
}

export function costBasisAtDate(txs: Tx[], isin: string, dateInclusive: string): number {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  return walk(sorted, isin, dateInclusive).costEur;
}
