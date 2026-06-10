"use client";
import { useMemo, useState } from "react";
import { GlassCard } from "./GlassCard";
import { fmtEur, fmtNum, fmtPct, signCls } from "@/lib/format";

export type HoldingRow = {
  isin: string; name: string; qty: number; bep: number;
  current: number; currency: string;
  valueEur: number; priceReturnPct: number;
  incomeReturnPct: number; totalReturnPct: number; allocPct: number;
};

export function Holdings({ rows }: { rows: HoldingRow[] }) {
  const [sort, setSort] = useState<keyof HoldingRow>("valueEur");
  const [dir, setDir] = useState<1 | -1>(-1);
  const sorted = useMemo(() => [...rows].sort((a,b) => {
    const av = a[sort]; const bv = b[sort];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  }), [rows, sort, dir]);

  const hd = (k: keyof HoldingRow, label: string) => (
    <th onClick={() => { setSort(k); setDir(sort === k ? (dir === 1 ? -1 : 1) : -1); }}
        className="text-left px-3 py-2 text-xs uppercase tracking-wider text-[var(--color-text-muted)] cursor-pointer select-none">
      {label}{sort === k ? (dir === 1 ? " ↑" : " ↓") : ""}
    </th>
  );

  return (
    <GlassCard className="overflow-x-auto p-0">
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            {hd("name", "Name")}
            {hd("qty", "Qty")}
            {hd("bep", "BEP")}
            {hd("current", "Current")}
            {hd("valueEur", "Value")}
            {hd("priceReturnPct", "Price %")}
            {hd("incomeReturnPct", "Income %")}
            {hd("totalReturnPct", "Total %")}
            {hd("allocPct", "% Book")}
            {hd("currency", "Curr")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.isin} className="border-t border-[var(--color-glass-border)] hover:bg-white/[0.03]">
              <td className="px-3 py-2">{r.name}</td>
              <td className="px-3 py-2 mono tabular">{fmtNum(r.qty, 0)}</td>
              <td className="px-3 py-2 mono tabular">{fmtNum(r.bep, 2)}</td>
              <td className="px-3 py-2 mono tabular">{fmtNum(r.current, 2)}</td>
              <td className="px-3 py-2 mono tabular">{fmtEur(r.valueEur)}</td>
              <td className={`px-3 py-2 mono tabular ${signCls(r.priceReturnPct)}`}>{fmtPct(r.priceReturnPct)}</td>
              <td className={`px-3 py-2 mono tabular ${signCls(r.incomeReturnPct)}`}>{fmtPct(r.incomeReturnPct)}</td>
              <td className={`px-3 py-2 mono tabular ${signCls(r.totalReturnPct)}`}>{fmtPct(r.totalReturnPct)}</td>
              <td className="px-3 py-2 mono tabular">{fmtPct(r.allocPct)}</td>
              <td className="px-3 py-2 text-[var(--color-text-secondary)]">{r.currency}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}
