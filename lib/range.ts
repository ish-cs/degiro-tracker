import { startOfYear, startOfMonth, subDays, subMonths, subYears } from "date-fns";

export type RangeId = "1D" | "1W" | "MTD" | "1M" | "YTD" | "1Y" | "ALL" | "CUSTOM";

export function rangeBounds(id: RangeId, firstTxIso: string, custom?: { from: string; to: string }) {
  const now = new Date();
  const map: Record<Exclude<RangeId, "ALL" | "CUSTOM">, Date> = {
    "1D":  subDays(now, 1),
    "1W":  subDays(now, 7),
    "MTD": startOfMonth(now),
    "1M":  subMonths(now, 1),
    "YTD": startOfYear(now),
    "1Y":  subYears(now, 1),
  };
  if (id === "ALL") return { from: new Date(`${firstTxIso}T00:00:00Z`), to: now };
  if (id === "CUSTOM") return { from: new Date(`${custom!.from}T00:00:00Z`), to: new Date(`${custom!.to}T00:00:00Z`) };
  return { from: map[id], to: now };
}
