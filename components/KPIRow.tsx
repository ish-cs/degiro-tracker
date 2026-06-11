import { GlassCard } from "./GlassCard";
import { fmtEur, fmtPct, signCls } from "@/lib/format";
import type { Returns } from "@/lib/types";

export function KPIRow({ r, cashEur }: { r: Returns; cashEur: number }) {
  const tiles = [
    { label: "Total Value", value: fmtEur(r.currentValueEur + cashEur), sub: `incl. cash ${fmtEur(cashEur)}` },
    { label: "Total Return", value: fmtEur(r.totalReturnEur), sub: fmtPct(r.totalReturnPct), cls: signCls(r.totalReturnEur) },
    { label: "Price Return", value: fmtPct(r.priceReturnPct), sub: fmtEur(r.priceReturnEur), cls: signCls(r.priceReturnEur) },
    { label: "Income Return", value: fmtPct(r.incomeReturnPct), sub: fmtEur(r.incomeReturnEur), cls: signCls(r.incomeReturnEur) },
    { label: "Cost Ratio", value: fmtPct(r.costRatioPct), sub: "brokerage + FX + taxes / cost", cls: signCls(r.costRatioPct) },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {tiles.map((t) => (
        <GlassCard key={t.label}>
          <div className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">{t.label}</div>
          <div className={`mono tabular text-2xl mt-1 ${t.cls ?? ""}`}>{t.value}</div>
          <div className="text-xs text-[var(--color-text-secondary)] mt-1">{t.sub}</div>
        </GlassCard>
      ))}
    </div>
  );
}
