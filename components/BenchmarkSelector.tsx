"use client";
import { useEffect, useState } from "react";

const PRESETS = [
  { id: "GSPC", label: "S&P 500", symbol: "^GSPC" },
  { id: "URTH", label: "MSCI World", symbol: "URTH" },
  { id: "NDX", label: "NASDAQ-100", symbol: "^NDX" },
];

const PRESET_IDS = new Set(PRESETS.map((p) => p.id));

const LS_KEY = "degiro-tracker:benchmarks:v1";

export type BenchmarkSelection = { id: string; label: string; symbol: string }[];

export function BenchmarkSelector({ value, onChange }: { value: BenchmarkSelection; onChange: (v: BenchmarkSelection) => void }) {
  const [customSym, setCustomSym] = useState("");

  // Persist on change. Skip the initial empty value the parent passes
  // before hydration so we don't clobber saved selection with [].
  useEffect(() => {
    if (value.length === 0) return;
    localStorage.setItem(LS_KEY, JSON.stringify(value));
  }, [value]);

  const togglePreset = (b: typeof PRESETS[number]) => {
    const exists = value.find((v) => v.id === b.id);
    onChange(exists ? value.filter((v) => v.id !== b.id) : [...value, b]);
  };

  const removeCustom = (id: string) => {
    onChange(value.filter((v) => v.id !== id));
  };

  const addCustom = () => {
    const s = customSym.trim().toUpperCase();
    if (!s) return;
    if (value.some((v) => v.id === s)) { setCustomSym(""); return; }
    onChange([...value, { id: s, label: s, symbol: s }]);
    setCustomSym("");
  };

  const customs = value.filter((v) => !PRESET_IDS.has(v.id));

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {PRESETS.map((b) => {
        const on = !!value.find((v) => v.id === b.id);
        return (
          <button key={b.id} onClick={() => togglePreset(b)}
            className={`px-3 py-1 text-xs rounded-full border transition ${on ? "bg-white/10 border-white/30" : "border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"}`}>
            {b.label}
          </button>
        );
      })}
      {customs.map((b) => (
        <span key={b.id} className="inline-flex items-center gap-1 px-2 pl-3 py-1 text-xs rounded-full border border-white/30 bg-white/10">
          <span>{b.label}</span>
          <button
            type="button"
            onClick={() => removeCustom(b.id)}
            aria-label={`Remove ${b.label}`}
            className="ml-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] leading-none px-1"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={customSym}
        onChange={(e) => setCustomSym(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }}
        placeholder="custom ticker"
        className="bg-transparent border border-white/10 rounded-full px-3 py-1 text-xs w-32 focus:outline-none focus:border-white/30"
      />
      <button onClick={addCustom} className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">add</button>
    </div>
  );
}

export function loadSavedBenchmarks(): BenchmarkSelection {
  // SSR / first paint: render with no benchmarks. The selector mounts
  // empty, then the parent's useState initializer rehydrates on the
  // client. This avoids the SSR/CSR mismatch from reading window during
  // server render.
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [PRESETS[0]];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [PRESETS[0]];
  } catch { return [PRESETS[0]]; }
}
