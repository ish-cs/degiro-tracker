import { GlassCard } from "./GlassCard";

export function EmptyState() {
  return (
    <GlassCard className="text-center">
      <h2 className="text-lg font-medium">Drop your DEGIRO exports</h2>
      <p className="text-sm text-[var(--color-text-secondary)] mt-2 max-w-md mx-auto">
        Both files needed. <strong>Transactions.csv</strong> rebuilds your positions and BEP.
        <strong> Account.csv</strong> adds dividends and fees so we can split returns.
      </p>
      <p className="text-xs text-[var(--color-text-muted)] mt-4">
        Everything stays in your browser. No upload, no account, no tracking.
      </p>
    </GlassCard>
  );
}
