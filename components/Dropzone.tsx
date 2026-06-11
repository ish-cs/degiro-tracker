"use client";
import { useCallback, useState } from "react";
import { GlassCard } from "./GlassCard";

type Props = {
  onFile: (text: string) => void;
  status: "idle" | "ready" | "error";
};

export function Dropzone({ onFile, status }: Props) {
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
          <span className="text-base font-medium">Account.csv</span>
          <span className={`text-xs ${status === "ready" ? "text-[var(--color-positive)]" : status === "error" ? "text-[var(--color-negative)]" : "text-[var(--color-text-muted)]"}`}>
            {status === "ready" ? "loaded" : status === "error" ? "error" : "drop or click"}
          </span>
        </div>
        <p className="text-sm text-[var(--color-text-secondary)]">Account → Activity → Export → Account</p>
      </label>
    </GlassCard>
  );
}
