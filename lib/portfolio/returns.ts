import type { CashEvent, Position, Returns, Tx } from "@/lib/types";
import { xirr } from "./xirr";
import { buildPortfolioCashflows, type FxLookup } from "./cashflows";

export function computeReturns(
  positions: Position[],
  dividendsByIsin: Record<string, number>,
  pricesByIsin: Record<string, { priceEur: number; currency: string }>,
  totalCostsEur: number,
  otherIncomeEur: number = 0,
  txs: Tx[] = [],
  events: CashEvent[] = [],
  fx: FxLookup = (_iso, ccy) => (ccy === "EUR" ? 1 : 0),
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

  // Annualized money-weighted return (XIRR) — what brokers and Simple Portfolio show.
  let annualizedPct = simplePct;
  if (txs.length > 0 || events.length > 0) {
    const flows = buildPortfolioCashflows(events, txs, value, endIso, fx);
    const rate = xirr(flows);
    if (rate != null && Number.isFinite(rate)) annualizedPct = rate;
  }

  return {
    costBasisEur: cost,
    currentValueEur: value,
    priceReturnEur,
    priceReturnPct: cost ? priceReturnEur / cost : 0,
    incomeReturnEur: income,
    incomeReturnPct: cost ? income / cost : 0,
    totalReturnEur,
    totalReturnPct: annualizedPct,        // XIRR (annualized, money-weighted)
    totalReturnPctSimple: simplePct,      // cumulative cost-basis return
    costRatioPct: cost ? -totalCostsEur / cost : 0,
  };
}
