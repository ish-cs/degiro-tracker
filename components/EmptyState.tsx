import { GlassCard } from "./GlassCard";

export function EmptyState() {
  return (
    <GlassCard className="text-center">
      <h2 className="text-lg font-medium">Drop your DEGIRO exports</h2>
      <p className="text-sm text-[var(--color-text-secondary)] mt-2 max-w-md mx-auto">
        One file. <strong>Account.csv</strong> contains every buy, dividend, fee, and FX event —
        enough to reconstruct your positions, returns, and cost ratio.
      </p>
      <p className="text-xs text-[var(--color-text-muted)] mt-4">
        Everything stays in your browser. No upload, no account, no tracking.
      </p>
    </GlassCard>
  );
}
