"use client";
import { useEffect, useState } from "react";

const PRESETS = [
  { id: "GSPC", label: "S&P 500", symbol: "^GSPC" },
  { id: "URTH", label: "MSCI World", symbol: "URTH" },
  { id: "NDX", label: "NASDAQ-100", symbol: "^NDX" },
];

const LS_KEY = "degiro-tracker:benchmarks:v1";

export type BenchmarkSelection = { id: string; label: string; symbol: string }[];

export function BenchmarkSelector({ value, onChange }: { value: BenchmarkSelection; onChange: (v: BenchmarkSelection) => void }) {
  const [customSym, setCustomSym] = useState("");

  useEffect(() => { localStorage.setItem(LS_KEY, JSON.stringify(value)); }, [value]);

  const toggle = (b: typeof PRESETS[number]) => {
    const exists = value.find((v) => v.id === b.id);
    onChange(exists ? value.filter((v) => v.id !== b.id) : [...value, b]);
  };

  const addCustom = () => {
    const s = customSym.trim().toUpperCase();
    if (!s) return;
    onChange([...value, { id: s, label: s, symbol: s }]);
    setCustomSym("");
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {PRESETS.map((b) => {
        const on = !!value.find((v) => v.id === b.id);
        return (
          <button key={b.id} onClick={() => toggle(b)}
            className={`px-3 py-1 text-xs rounded-full border ${on ? "bg-white/10 border-white/30" : "border-white/10 text-[var(--color-text-secondary)]"}`}>
            {b.label}
          </button>
        );
      })}
      <input
        value={customSym}
        onChange={(e) => setCustomSym(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }}
        placeholder="custom ticker"
        className="bg-transparent border border-white/10 rounded-full px-3 py-1 text-xs w-32"
      />
      <button onClick={addCustom} className="text-xs text-[var(--color-text-secondary)]">add</button>
    </div>
  );
}

export function loadSavedBenchmarks(): BenchmarkSelection {
  if (typeof window === "undefined") return [PRESETS[0]];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [PRESETS[0]];
    return JSON.parse(raw);
  } catch { return [PRESETS[0]]; }
}
