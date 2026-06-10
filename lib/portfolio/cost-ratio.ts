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
  return events.reduce((acc, e) => acc + e.amountEur, 0);
}
