import type { CashEvent, Tx } from "@/lib/types";
import type { FxLookup } from "./cashflows";

// EUR-only sum across events matching predicate. Reversals net out.
function netEur(events: CashEvent[], pred: (e: CashEvent) => boolean): number {
  return events.filter(pred).reduce((acc, e) => acc + e.amountEur, 0);
}

// FX-aware: convert each event to EUR using the supplied lookup, then sum.
function netAnyCcy(
  events: CashEvent[],
  pred: (e: CashEvent) => boolean,
  fx: FxLookup,
): number {
  return events.filter(pred).reduce((acc, e) => {
    if (e.currency === "EUR") return acc + e.amount;
    return acc + e.amount * fx(e.date, e.currency);
  }, 0);
}

// Total brokerage fees in EUR (cost), reversals netted.
export function totalFeesEur(events: CashEvent[]): number {
  const net = netEur(events, (e) => e.kind === "fee" && e.currency === "EUR");
  return Math.max(0, -net);
}

// AutoFX (currency conversion) fee. When derived from Transactions.csv,
// these are split out per row. From Account.csv alone, AutoFX is implicit in
// the FX-Debit EUR amount → use the published DEGIRO 0.25% rate × FX volume.
export function totalAutoFxFeesEur(txs: Tx[]): number {
  return txs.reduce((acc, t) => acc + Math.abs(t.autoFxFeeEur ?? 0), 0);
}

// DEGIRO's published AutoFX rate (0.25%) × sum of EUR-converted FX volume.
// Use when AutoFX is baked into cost basis but you want to surface it.
const AUTOFX_RATE = 0.0025;
export function estimatedAutoFxFromVolume(events: CashEvent[]): number {
  const totalEurFxVolume = events
    .filter((e) => e.kind === "fx" && e.currency === "EUR")
    .reduce((s, e) => s + Math.abs(e.amount), 0);
  return totalEurFxVolume * AUTOFX_RATE;
}

// Net dividend withholding tax (cost, signed positive). Uses historical FX
// at the tax event's date.
export function totalTaxesEur(events: CashEvent[], fx: FxLookup): number {
  const net = netAnyCcy(events, (e) => e.kind === "dividend_tax", fx);
  return Math.max(0, -net);
}

// Money-market / margin interest charged by DEGIRO. Income side (Flatex
// Interest Income) is handled in totalOtherIncomeEur — this is the COST side.
export function totalMarginInterestEur(events: CashEvent[], fx: FxLookup): number {
  const net = netAnyCcy(events, (e) => {
    const d = e.description.toLowerCase();
    return e.amount < 0 && (
      d.includes("allocatie geldmarktfonds") ||
      d.includes("money market fund compensation") ||
      d.includes("margin interest") ||
      d.includes("debit interest") ||
      d.includes("interest charge")
    );
  }, fx);
  return Math.max(0, -net);
}

// Aggregate cost drag: brokerage + AutoFX + taxes + margin interest.
// `includeImplicitAutoFx`: when AutoFX isn't already in `txs[].autoFxFeeEur`
// (Account.csv-only mode), set true to add the 0.25%×volume estimate.
export function totalCostsEur(
  events: CashEvent[],
  txs: Tx[],
  fx: FxLookup,
  includeImplicitAutoFx: boolean = true,
): number {
  const autoFx = includeImplicitAutoFx && totalAutoFxFeesEur(txs) === 0
    ? estimatedAutoFxFromVolume(events)
    : totalAutoFxFeesEur(txs);
  return totalFeesEur(events) + autoFx + totalTaxesEur(events, fx)
       + totalMarginInterestEur(events, fx);
}

// Per-ISIN GROSS dividend income. Tax excluded — shows up in cost ratio.
export function totalDividendsEur(
  events: CashEvent[],
  fx: FxLookup,
): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const e of events) {
    if (!e.isin || e.kind !== "dividend") continue;
    const eur = e.currency === "EUR" ? e.amount : e.amount * fx(e.date, e.currency);
    acc[e.isin] = (acc[e.isin] ?? 0) + eur;
  }
  return acc;
}

// Income not tied to a specific ISIN — broker rebates, interest income, promotions.
export function totalOtherIncomeEur(events: CashEvent[], fx: FxLookup): number {
  let sum = 0;
  for (const e of events) {
    const d = e.description.toLowerCase();
    const isIncomeDesc =
      d.includes("rebate") ||
      d.includes("interest income") ||
      d.includes("promotion") ||
      d.includes("cashback");
    if (!isIncomeDesc) continue;
    if (e.amount <= 0) continue; // only positive income
    sum += e.currency === "EUR" ? e.amount : e.amount * fx(e.date, e.currency);
  }
  return sum;
}

// Latest EUR cash balance reported by the broker. Avoids double-counting
// internal sweeps and FX-paired entries.
export function cashBalanceEur(events: CashEvent[]): number {
  let latest: CashEvent | null = null;
  for (const e of events) {
    if (e.balanceCurrency !== "EUR") continue;
    if (!latest || e.date.localeCompare(latest.date) > 0) latest = e;
  }
  if (!latest) return 0;
  return Number.isFinite(latest.balanceEur) ? latest.balanceEur : 0;
}

// Multi-currency cash balance: returns latest balance per currency,
// EUR-converted using the historical FX index. Useful when a user holds USD
// or GBP cash positions inside their broker account.
export function cashBalancesByCurrency(events: CashEvent[]): Record<string, number> {
  const latest: Record<string, CashEvent> = {};
  for (const e of events) {
    const ccy = e.balanceCurrency;
    if (!ccy) continue;
    const prev = latest[ccy];
    if (!prev || e.date.localeCompare(prev.date) > 0) latest[ccy] = e;
  }
  const out: Record<string, number> = {};
  for (const [ccy, e] of Object.entries(latest)) {
    if (Number.isFinite(e.balance)) out[ccy] = e.balance;
  }
  return out;
}

export function totalCashEur(events: CashEvent[], fx: FxLookup): number {
  const balances = cashBalancesByCurrency(events);
  const today = new Date().toISOString().slice(0, 10);
  let sum = 0;
  for (const [ccy, amount] of Object.entries(balances)) {
    sum += ccy === "EUR" ? amount : amount * fx(today, ccy);
  }
  return sum;
}
