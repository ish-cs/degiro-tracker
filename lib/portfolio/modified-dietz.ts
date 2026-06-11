// Modified Dietz return — money-weighted return that weighs each contribution
// by how long it's been deployed. Standard formula used by portfolio analytics.
//
//   R = (V_end - V_start - sum(F)) / (V_start + sum(F_i * w_i))
//   where w_i = (T - t_i) / T,  T = period length in days, t_i = days from start to flow

export type Cashflow = {
  dateIso: string;
  amount: number; // positive = money INTO portfolio (buy), negative = OUT (sell/withdrawal)
};

const MS_PER_DAY = 86_400_000;

export function modifiedDietz(
  startValue: number,
  endValue: number,
  flows: Cashflow[],
  periodStartIso: string,
  periodEndIso: string,
): number {
  const start = new Date(`${periodStartIso}T00:00:00Z`).getTime();
  const end = new Date(`${periodEndIso}T00:00:00Z`).getTime();
  const T = (end - start) / MS_PER_DAY;
  if (T <= 0) return 0;

  let netFlow = 0;
  let weightedFlow = 0;
  for (const f of flows) {
    const tFlow = new Date(`${f.dateIso}T00:00:00Z`).getTime();
    const t = (tFlow - start) / MS_PER_DAY;
    const w = Math.max(0, Math.min(1, (T - t) / T));
    netFlow += f.amount;
    weightedFlow += f.amount * w;
  }
  const denom = startValue + weightedFlow;
  if (denom <= 0) return 0;
  return (endValue - startValue - netFlow) / denom;
}
