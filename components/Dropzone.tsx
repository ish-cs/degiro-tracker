"use client";
import { useCallback, useState } from "react";
import { GlassCard } from "./GlassCard";

type SlotKind = "transactions" | "account";

type Props = {
  onFile: (slot: SlotKind, text: string) => void;
  status: Record<SlotKind, "idle" | "ready" | "error">;
};

export function Dropzone({ onFile, status }: Props) {
  const slots: { key: SlotKind; label: string; hint: string }[] = [
    { key: "transactions", label: "Transactions.csv", hint: "Account → Activity → Export → Transactions" },
    { key: "account", label: "Account.csv", hint: "Account → Activity → Export → Account" },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {slots.map((s) => (
        <Slot key={s.key} {...s} state={status[s.key]} onFile={(t) => onFile(s.key, t)} />
      ))}
    </div>
  );
}

function Slot({ label, hint, state, onFile }: { label: string; hint: string; state: "idle"|"ready"|"error"; onFile: (t: string)=>void }) {
  const [drag, setDrag] = useState(false);
  const handle = useCallback(async (f: File) => onFile(await f.text()), [onFile]);
  return (
    <GlassCard
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault(); setDrag(false);
        const f = e.dataTransfer.files[0]; if (f) handle(f);
      }}
      className={`relative cursor-pointer transition ${drag ? "ring-2 ring-[var(--color-accent)]" : ""}`}
    >
      <label className="flex flex-col gap-2 cursor-pointer">
        <input type="file" accept=".csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); }} />
        <div className="flex items-center justify-between">
          <span className="text-base font-medium">{label}</span>
          <span className={`text-xs ${state === "ready" ? "text-[var(--color-positive)]" : state === "error" ? "text-[var(--color-negative)]" : "text-[var(--color-text-muted)]"}`}>
            {state === "ready" ? "loaded" : state === "error" ? "error" : "drop or click"}
          </span>
        </div>
        <p className="text-sm text-[var(--color-text-secondary)]">{hint}</p>
      </label>
    </GlassCard>
  );
}
