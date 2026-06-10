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
