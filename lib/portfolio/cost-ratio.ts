import type { CashEvent } from "@/lib/types";

export function totalFeesEur(events: CashEvent[]): number {
  return events
    .filter((e) => e.kind === "fee")
    .reduce((acc, e) => acc + Math.abs(e.amountEur), 0);
}

export function totalDividendsEur(events: CashEvent[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const e of events) {
    if (!e.isin) continue;
    if (e.kind === "dividend") acc[e.isin] = (acc[e.isin] ?? 0) + e.amountEur;
    if (e.kind === "dividend_tax") acc[e.isin] = (acc[e.isin] ?? 0) + e.amountEur;
  }
  return acc;
}

// Income that isn't tied to a specific ISIN — broker rebates, interest, etc.
// Counted toward income return at the portfolio level.
export function totalOtherIncomeEur(events: CashEvent[]): number {
  let sum = 0;
  for (const e of events) {
    const d = e.description.toLowerCase();
    if (
      d.includes("rebate") ||
      d.includes("interest") ||
      d.includes("promotion") ||
      d.includes("cashback")
    ) {
      sum += e.amountEur;
    }
  }
  return sum;
}

export function cashBalanceEur(events: CashEvent[]): number {
  // Use latest reported balance from broker, not sum of changes.
  // Summing double-counts internal sweep transfers and FX pair events.
  if (events.length === 0) return 0;
  let latest = events[0];
  for (const e of events) {
    if (e.date.localeCompare(latest.date) > 0) latest = e;
  }
  return Number.isFinite(latest.balanceEur) ? latest.balanceEur : 0;
}
