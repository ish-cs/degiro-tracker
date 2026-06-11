import { startOfYear, startOfMonth, subDays, subMonths, subYears } from "date-fns";

export type RangeId = "1D" | "1W" | "MTD" | "1M" | "YTD" | "1Y" | "ALL";

export function rangeBounds(id: RangeId, firstTxIso: string) {
  const now = new Date();
  if (id === "ALL") return { from: new Date(`${firstTxIso}T00:00:00Z`), to: now };
  const map: Record<Exclude<RangeId, "ALL">, Date> = {
    "1D":  subDays(now, 1),
    "1W":  subDays(now, 7),
    "MTD": startOfMonth(now),
    "1M":  subMonths(now, 1),
    "YTD": startOfYear(now),
    "1Y":  subYears(now, 1),
  };
  return { from: map[id], to: now };
}
