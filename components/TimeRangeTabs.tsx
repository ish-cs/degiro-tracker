"use client";
import type { RangeId } from "@/lib/range";

const ALL: RangeId[] = ["1D","1W","MTD","1M","YTD","1Y","ALL"];

export function TimeRangeTabs({ value, onChange }: { value: RangeId; onChange: (r: RangeId) => void }) {
  return (
    <div className="flex flex-wrap gap-1 p-1 glass" style={{ borderRadius: "999px" }}>
      {ALL.map((id) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`px-3 py-1 text-xs uppercase tracking-wider rounded-full transition ${
            value === id ? "bg-white/10 text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          {id}
        </button>
      ))}
    </div>
  );
}
