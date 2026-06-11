import type { CashEvent } from "@/lib/types";
import { parseSplitRatio } from "./splits";

export type UnrecognizedGroup = {
  description: string;
  kind: string;
  count: number;
  totalEur: number;
};

// Identify events the rest of the pipeline silently ignores. Surfacing these
// in the UI tells the user "your reported totals may be off by ~€X".
//
// Handled categories: buy, sell, dividend, dividend_tax, fee, fx,
// deposit, withdrawal, split (when ratio parses), rebate/interest income,
// margin interest charge.
export function findUnrecognizedEvents(events: CashEvent[]): UnrecognizedGroup[] {
  const isInternalTransfer = (d: string) =>
    d.includes("cash sweep transfer") ||
    d.includes("transfer from your cash account") ||
    d.includes("transfer to your cash account") ||
    d.includes("flatex deposit") ||
    d.includes("flatex storting") ||
    d.includes("flatex einzahlung");

  const isKnownIncome = (d: string) =>
    d.includes("rebate") ||
    d.includes("interest income") ||
    d.includes("promotion") ||
    d.includes("cashback");

  const isKnownMarginCost = (d: string) =>
    d.includes("allocatie geldmarktfonds") ||
    d.includes("money market fund compensation") ||
    d.includes("margin interest") ||
    d.includes("debit interest") ||
    d.includes("interest charge");

  const grouped: Record<string, UnrecognizedGroup> = {};
  for (const e of events) {
    const d = e.description.toLowerCase().trim();
    if (!d) continue;

    let unhandled = false;

    if (e.kind === "split") {
      if (parseSplitRatio(e.description) == null) unhandled = true;
    } else if (e.kind === "merger") {
      unhandled = true;
    } else if (e.kind === "other") {
      if (isInternalTransfer(d) || isKnownIncome(d) || isKnownMarginCost(d)) {
        unhandled = false;
      } else if (Math.abs(e.amount) < 0.01) {
        unhandled = false; // zero-amount info row
      } else {
        unhandled = true;
      }
    }

    if (!unhandled) continue;

    const key = `${e.kind}::${e.description}`;
    if (!grouped[key]) {
      grouped[key] = { description: e.description, kind: e.kind, count: 0, totalEur: 0 };
    }
    grouped[key].count += 1;
    grouped[key].totalEur += e.currency === "EUR" ? e.amount : 0;
  }
  return Object.values(grouped).sort((a, b) => Math.abs(b.totalEur) - Math.abs(a.totalEur));
}
