import type { CashEvent, Split } from "@/lib/types";

// Parse a split ratio from a DEGIRO description.
// Common formats:
//   "Stock split CONVERSION: 9 for 1"   → 9
//   "Stock Split 4:1"                   → 4
//   "Bonus shares 1:10"                 → 1.1 (1 free per 10 held; new ratio 1.1)
//   "Reverse stock split 1 for 10"      → 0.1
//
// Returns newShares-per-old-share ratio, or null if unparseable.
export function parseSplitRatio(description: string): number | null {
  const d = description.toLowerCase();
  const isReverse = d.includes("reverse");
  const isBonus = d.includes("bonus");

  const m = d.match(/(\d+(?:\.\d+)?)\s*(?:for|:)\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;

  const a = parseFloat(m[1]);
  const b = parseFloat(m[2]);
  if (a <= 0 || b <= 0) return null;

  if (isBonus) {
    // "Bonus 1:10" usually means 1 bonus share per 10 held → 11 shares per 10
    // (i.e. ratio 1.1). We use the larger-first convention "X bonus per Y held".
    return 1 + a / b;
  }

  if (isReverse) {
    // "Reverse 1 for 10" or "Reverse 1:10" → 0.1 (consolidation)
    const r = a / b;
    return r > 1 ? 1 / r : r;
  }

  // Forward split: "X for Y" → ratio X/Y
  return a / b;
}

// Extract splits from cash events. Skips events whose ratio can't be parsed
// (caller can flag those via the unparsed-events alert pipeline).
export function extractSplits(events: CashEvent[]): Split[] {
  const splits: Split[] = [];
  for (const e of events) {
    if (e.kind !== "split") continue;
    if (!e.isin) continue;
    const ratio = parseSplitRatio(e.description);
    if (ratio == null) continue;
    splits.push({ date: e.date, isin: e.isin, ratio, description: e.description });
  }
  return splits;
}
