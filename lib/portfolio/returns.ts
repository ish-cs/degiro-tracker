import type { Position, Returns, Tx } from "@/lib/types";
import { modifiedDietz, type Cashflow } from "./modified-dietz";

export function computeReturns(
  positions: Position[],
  dividendsByIsin: Record<string, number>,
  pricesByIsin: Record<string, { priceEur: number; currency: string }>,
  totalFeesEur: number,
  otherIncomeEur: number = 0,
  txs: Tx[] = [],
  endIso: string = new Date().toISOString().slice(0, 10),
): Returns {
  let cost = 0, value = 0, income = 0;
  for (const p of positions) {
    cost += p.costBasisEur;
    const px = pricesByIsin[p.isin]?.priceEur ?? p.bep;
    value += p.quantity * px;
    income += dividendsByIsin[p.isin] ?? 0;
  }
  income += otherIncomeEur;
  const priceReturnEur = value - cost;
  const totalReturnEur = priceReturnEur + income;
  const simplePct = cost ? totalReturnEur / cost : 0;

  // Money-weighted return — weighs each contribution by time deployed.
  let mwPct = simplePct;
  if (txs.length > 0) {
    const sortedTxs = [...txs].sort((a, b) => a.date.localeCompare(b.date));
    const periodStart = sortedTxs[0].date;
    const flows: Cashflow[] = sortedTxs
      .filter((t) => t.quantity > 0)
      .map((t) => ({ dateIso: t.date, amount: t.valueEur + t.feeEur }));
    mwPct = modifiedDietz(0, value + income, flows, periodStart, endIso);
  }

  return {
    costBasisEur: cost,
    currentValueEur: value,
    priceReturnEur,
    priceReturnPct: cost ? priceReturnEur / cost : 0,
    incomeReturnEur: income,
    incomeReturnPct: cost ? income / cost : 0,
    totalReturnEur,
    totalReturnPct: mwPct,
    totalReturnPctSimple: simplePct,
    costRatioPct: cost ? totalFeesEur / cost : 0,
  };
}
