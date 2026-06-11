import type { CashEvent, Tx } from "@/lib/types";

// Sum signed EUR amounts of all events matching predicate.
// Reversals (positive entries when the broker refunds) net out correctly.
function netEur(events: CashEvent[], pred: (e: CashEvent) => boolean): number {
  return events.filter(pred).reduce((acc, e) => acc + e.amountEur, 0);
}

// Total brokerage fees in EUR (cost), reversals netted.
export function totalFeesEur(events: CashEvent[]): number {
  const net = netEur(events, (e) => e.kind === "fee" && e.currency === "EUR");
  return Math.max(0, -net);
}

// AutoFX (currency conversion) fee. When derived from Transactions.csv,
// these are split out per row. When derived from Account.csv only, AutoFX
// is implicit in the FX-Debit EUR amount used as cost basis — so this
// returns 0 and "currency conversion costs" already sit in cost basis.
export function totalAutoFxFeesEur(txs: Tx[]): number {
  return txs.reduce((acc, t) => acc + Math.abs(t.autoFxFeeEur ?? 0), 0);
}

// Net dividend withholding tax (cost, signed positive). FX-converts non-EUR
// taxes (e.g. US-stock dividend taxes paid in USD).
export function totalTaxesEur(
  events: CashEvent[],
  fx: { USDEUR?: number; GBPEUR?: number } = {},
): number {
  let net = 0;
  for (const e of events) {
    if (e.kind !== "dividend_tax") continue;
    net += toEur(e.amount, e.currency, fx);
  }
  return Math.max(0, -net);
}

// Aggregate cost drag on the portfolio:
//   brokerage + currency conversion (when explicitly tracked) + taxes
//   + margin interest (none for this user).
export function totalCostsEur(
  events: CashEvent[],
  txs: Tx[],
  fx: { USDEUR?: number; GBPEUR?: number } = {},
): number {
  return totalFeesEur(events) + totalAutoFxFeesEur(txs) + totalTaxesEur(events, fx);
}

// Convert an event's native amount to EUR using passed FX rates, or 1:1
// when already EUR. For US stocks DEGIRO records dividends in USD and never
// auto-converts; we estimate the EUR equivalent at the rate provided.
function toEur(amount: number, currency: string, fx: { USDEUR?: number; GBPEUR?: number } = {}): number {
  if (currency === "EUR") return amount;
  if (currency === "USD") return amount * (fx.USDEUR ?? 1);
  if (currency === "GBP") return amount * (fx.GBPEUR ?? 1);
  return amount;
}

// Per-ISIN GROSS dividend income. Withholding tax is excluded — it shows
// up in cost ratio (matches Simple Portfolio's convention).
export function totalDividendsEur(
  events: CashEvent[],
  fx: { USDEUR?: number; GBPEUR?: number } = {},
): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const e of events) {
    if (!e.isin) continue;
    if (e.kind !== "dividend") continue;
    acc[e.isin] = (acc[e.isin] ?? 0) + toEur(e.amount, e.currency, fx);
  }
  return acc;
}

// Income not tied to a specific ISIN — broker rebates, interest.
export function totalOtherIncomeEur(
  events: CashEvent[],
  fx: { USDEUR?: number; GBPEUR?: number } = {},
): number {
  let sum = 0;
  for (const e of events) {
    const d = e.description.toLowerCase();
    if (
      d.includes("rebate") ||
      d.includes("interest") ||
      d.includes("promotion") ||
      d.includes("cashback")
    ) {
      sum += toEur(e.amount, e.currency, fx);
    }
  }
  return sum;
}

// Current EUR cash balance — latest EUR balance reported by the broker.
// Avoids double-counting internal sweeps and FX-paired entries.
export function cashBalanceEur(events: CashEvent[]): number {
  let latest: CashEvent | null = null;
  for (const e of events) {
    if (e.balanceCurrency !== "EUR") continue;
    if (!latest || e.date.localeCompare(latest.date) > 0) latest = e;
  }
  if (!latest) return 0;
  return Number.isFinite(latest.balanceEur) ? latest.balanceEur : 0;
}
