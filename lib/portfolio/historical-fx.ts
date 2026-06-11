import type { CashEvent } from "@/lib/types";
import type { FxLookup } from "./cashflows";

// Build a chronological index of foreign-currency → EUR exchange rates
// observed in the DEGIRO Account.csv. DEGIRO emits matched FX Credit/Debit
// pairs whenever it auto-converts:
//   FX Credit (USD): +$976.00
//   FX Debit  (EUR): -€846.11
// → effective EUR-per-USD = 846.11 / 976.00 = 0.8669
//
// We index by date and look up the nearest-prior rate when converting a
// dividend / fee / tax that has no matching FX event of its own.

type IndexEntry = { date: string; eurPerUnit: number };

export type HistoricalFxIndex = Record<string, IndexEntry[]>;

export function buildHistoricalFx(events: CashEvent[]): HistoricalFxIndex {
  const byOrderId: Record<string, CashEvent[]> = {};
  const orphans: CashEvent[] = [];
  for (const e of events) {
    if (e.kind !== "fx" && !e.description.startsWith("FX")) continue;
    if (e.orderId) {
      (byOrderId[e.orderId] ??= []).push(e);
    } else {
      orphans.push(e);
    }
  }

  const idx: HistoricalFxIndex = {};
  const push = (ccy: string, date: string, rate: number) => {
    if (!Number.isFinite(rate) || rate <= 0) return;
    (idx[ccy] ??= []).push({ date, eurPerUnit: rate });
  };

  // Order-linked: pair an FX Credit (foreign ccy) with an FX Debit (EUR) or vice versa.
  for (const group of Object.values(byOrderId)) {
    const eurLeg = group.find((e) => e.currency === "EUR");
    const foreignLeg = group.find((e) => e.currency !== "EUR");
    if (!eurLeg || !foreignLeg) continue;
    if (foreignLeg.amount === 0) continue;
    const rate = Math.abs(eurLeg.amount) / Math.abs(foreignLeg.amount);
    push(foreignLeg.currency, foreignLeg.date, rate);
  }

  // Orphan FX rows (e.g. dividend auto-conversions that aren't order-linked).
  // Pair by date: an EUR row + a foreign row on the same day = a conversion.
  const orphansByDate: Record<string, CashEvent[]> = {};
  for (const e of orphans) (orphansByDate[e.date] ??= []).push(e);
  for (const [date, group] of Object.entries(orphansByDate)) {
    const eur = group.find((e) => e.currency === "EUR");
    const foreign = group.find((e) => e.currency !== "EUR" && e.amount !== 0);
    if (!eur || !foreign) continue;
    const rate = Math.abs(eur.amount) / Math.abs(foreign.amount);
    push(foreign.currency, date, rate);
  }

  // Some FX Debit rows in the foreign currency carry an explicit FX column
  // value (USD-per-EUR). Fold those in as backup signals.
  for (const e of events) {
    if (e.fxRate == null || e.fxRate <= 0) continue;
    if (e.currency === "EUR") continue;
    push(e.currency, e.date, 1 / e.fxRate);
  }

  // Dedupe: one rate per (ccy, date) — earliest insertion wins, which is the
  // pair-derived rate (more precise than the rounded FX column).
  for (const ccy of Object.keys(idx)) {
    const seen = new Set<string>();
    idx[ccy] = idx[ccy].filter((e) => {
      if (seen.has(e.date)) return false;
      seen.add(e.date);
      return true;
    });
    idx[ccy].sort((a, b) => a.date.localeCompare(b.date));
  }
  return idx;
}

// Lookup factory — returns a function suitable for FxLookup. Falls back to
// `defaultRate` (typically the live spot rate) when no historical rate is
// known for `ccy` yet.
export function makeFxLookup(
  index: HistoricalFxIndex,
  defaultRates: Record<string, number> = {},
): FxLookup {
  return (iso: string, ccy: string) => {
    if (ccy === "EUR") return 1;
    const series = index[ccy];
    if (!series || series.length === 0) {
      return defaultRates[ccy] ?? 0;
    }
    // Binary search for nearest-prior date; fall back to earliest if iso < all.
    let lo = 0, hi = series.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (series[mid].date.localeCompare(iso) <= 0) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (best === -1) return series[0].eurPerUnit;
    return series[best].eurPerUnit;
  };
}
