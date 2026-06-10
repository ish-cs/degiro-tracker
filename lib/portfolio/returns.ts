import type { Position, Returns } from "@/lib/types";

export function computeReturns(
  positions: Position[],
  dividendsByIsin: Record<string, number>,
  pricesByIsin: Record<string, { priceEur: number; currency: string }>,
  totalFeesEur: number,
): Returns {
  let cost = 0, value = 0, income = 0;
  for (const p of positions) {
    cost += p.costBasisEur;
    const px = pricesByIsin[p.isin]?.priceEur ?? p.bep;
    value += p.quantity * px;
    income += dividendsByIsin[p.isin] ?? 0;
  }
  const priceReturnEur = value - cost;
  const totalReturnEur = priceReturnEur + income;
  return {
    costBasisEur: cost,
    currentValueEur: value,
    priceReturnEur,
    priceReturnPct: cost ? priceReturnEur / cost : 0,
    incomeReturnEur: income,
    incomeReturnPct: cost ? income / cost : 0,
    totalReturnEur,
    totalReturnPct: cost ? totalReturnEur / cost : 0,
    costRatioPct: cost ? totalFeesEur / cost : 0,
  };
}
