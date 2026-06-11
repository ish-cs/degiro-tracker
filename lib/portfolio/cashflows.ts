import type { CashEvent, Tx } from "@/lib/types";
import type { Cashflow } from "./xirr";

// FX lookup signature — callers can supply a constant map or a historical
// table keyed by date. Returns multiplier ccy → EUR.
export type FxLookup = (iso: string, ccy: string) => number;

function toEur(amount: number, ccy: string, iso: string, fx: FxLookup): number {
  if (ccy === "EUR") return amount;
  return amount * fx(iso, ccy);
}

// Build portfolio cashflows for XIRR. Sign convention:
//   - = capital committed (buy + fee + withholding tax)
//   + = capital returned (sell, dividend, rebate, terminal mark)
//
// What we INCLUDE:
//   - Buys/sells with full per-tx EUR cost (already includes broker fee + AutoFX spread)
//   - Per-event dividends (gross, FX-converted at event date)
//   - Per-event dividend withholding taxes
//   - Standalone fees (connection/membership) that aren't tied to a Tx
//   - Other income (rebates, interest, promotions)
//   - Terminal: current portfolio EUR value, dated `finalDateIso`
//
// What we EXCLUDE: deposits, withdrawals, internal flatex sweeps, FX pair rows
// (their effect is already inside the tx EUR cost basis).
export function buildPortfolioCashflows(
  events: CashEvent[],
  txs: Tx[],
  finalValueEur: number,
  finalDateIso: string,
  fx: FxLookup,
): Cashflow[] {
  const flows: Cashflow[] = [];

  for (const tx of txs) {
    if (tx.quantity > 0) {
      flows.push({ dateIso: tx.date, amount: -(tx.valueEur + tx.feeEur) });
    } else {
      flows.push({ dateIso: tx.date, amount: tx.valueEur - tx.feeEur });
    }
  }

  const incomeKeywords = ["rebate", "interest income", "promotion", "cashback"];

  for (const e of events) {
    const desc = e.description.toLowerCase();

    if (e.kind === "dividend" || e.kind === "dividend_tax") {
      const eur = toEur(e.amount, e.currency, e.date, fx);
      if (eur !== 0) flows.push({ dateIso: e.date, amount: eur });
      continue;
    }

    // Standalone (non-Tx-linked) fees — connection, membership, courtesy.
    if (e.kind === "fee" && !e.orderId) {
      const eur = toEur(e.amount, e.currency, e.date, fx);
      if (eur !== 0) flows.push({ dateIso: e.date, amount: eur });
      continue;
    }

    if (incomeKeywords.some((k) => desc.includes(k))) {
      const eur = toEur(e.amount, e.currency, e.date, fx);
      if (eur !== 0) flows.push({ dateIso: e.date, amount: eur });
    }
  }

  if (finalValueEur > 0) {
    flows.push({ dateIso: finalDateIso, amount: finalValueEur });
  }

  return flows.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}
