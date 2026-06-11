"use client";
import { useEffect, useMemo, useState } from "react";
import { parseTransactionsCsv } from "@/lib/parsers/transactions";
import { parseAccountCsv } from "@/lib/parsers/account";
import { currentPositions } from "@/lib/portfolio/positions";
import { computeReturns } from "@/lib/portfolio/returns";
import { totalFeesEur, totalDividendsEur, cashBalanceEur, totalOtherIncomeEur } from "@/lib/portfolio/cost-ratio";
import { Dropzone } from "@/components/Dropzone";
import { KPIRow } from "@/components/KPIRow";
import { Holdings, type HoldingRow } from "@/components/Holdings";
import { AllocationDonut } from "@/components/AllocationDonut";
import { EmptyState } from "@/components/EmptyState";
import { Chart } from "@/components/Chart";
import { TimeRangeTabs } from "@/components/TimeRangeTabs";
import { BenchmarkSelector, loadSavedBenchmarks, type BenchmarkSelection } from "@/components/BenchmarkSelector";
import { valueSeries } from "@/lib/portfolio/value-series";
import { rangeBounds, type RangeId } from "@/lib/range";
import type { Tx, CashEvent, ValuePoint, BenchmarkSeries } from "@/lib/types";

type SlotStatus = { transactions: "idle"|"ready"|"error"; account: "idle"|"ready"|"error" };
type LiveData = {
  prices: Record<string, { priceEur: number; currency: string; raw: number }>;
  fxUsdEur: number;
};

const LS_KEY = "degiro-tracker:v1";

export default function Page() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [cashEvents, setCashEvents] = useState<CashEvent[]>([]);
  const [status, setStatus] = useState<SlotStatus>({ transactions: "idle", account: "idle" });
  const [live, setLive] = useState<LiveData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [range, setRange] = useState<RangeId>("YTD");
  const [mode, setMode] = useState<"value" | "pl">("value");
  const [benchmarks, setBenchmarks] = useState<BenchmarkSelection>(() => loadSavedBenchmarks());
  const [histByIsin, setHistByIsin] = useState<Record<string, { t: number; close: number }[]>>({});
  const [benchSeries, setBenchSeries] = useState<BenchmarkSeries[]>([]);

  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      setTxs(s.txs ?? []); setCashEvents(s.cashEvents ?? []);
      setStatus({
        transactions: s.txs?.length ? "ready" : "idle",
        account: s.cashEvents?.length ? "ready" : "idle",
      });
    } catch {}
  }, []);

  useEffect(() => {
    if (txs.length || cashEvents.length) {
      localStorage.setItem(LS_KEY, JSON.stringify({ txs, cashEvents, savedAt: Date.now() }));
    }
  }, [txs, cashEvents]);

  const positions = useMemo(() => currentPositions(txs), [txs]);

  useEffect(() => {
    if (positions.length === 0) { setLive(null); return; }
    const symbols = positions.map((p) => p.yahooSymbol);
    (async () => {
      try {
        const [pr, fxRes] = await Promise.all([
          fetch(`/api/price?symbols=${symbols.join(",")}`).then((r) => r.json()),
          fetch(`/api/fx?pair=USDEUR`).then((r) => r.json()),
        ]);
        const fxUsdEur = fxRes.price ?? 1;
        const prices: LiveData["prices"] = {};
        for (const p of positions) {
          const q = pr[p.yahooSymbol];
          if (!q) continue;
          const eur = q.currency === "USD" ? q.price * fxUsdEur
                   : q.currency === "EUR" ? q.price
                   : q.price;
          prices[p.isin] = { priceEur: eur, currency: q.currency, raw: q.price };
        }
        setLive({ prices, fxUsdEur });
        setErr(null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "price fetch failed");
      }
    })();
  }, [positions]);

  useEffect(() => {
    if (positions.length === 0) { setHistByIsin({}); return; }
    (async () => {
      try {
        const entries = await Promise.all(positions.map(async (p) => {
          const r = await fetch(`/api/history?symbol=${encodeURIComponent(p.yahooSymbol)}&range=5y`).then((r) => r.json());
          return [p.isin, r.points ?? []] as const;
        }));
        setHistByIsin(Object.fromEntries(entries));
      } catch {}
    })();
  }, [positions]);

  useEffect(() => {
    if (benchmarks.length === 0) { setBenchSeries([]); return; }
    (async () => {
      try {
        const series = await Promise.all(benchmarks.map(async (b) => {
          const r = await fetch(`/api/history?symbol=${encodeURIComponent(b.symbol)}&range=5y`).then((r) => r.json());
          return { id: b.id, label: b.label, symbol: b.symbol, points: r.points ?? [] };
        }));
        setBenchSeries(series);
      } catch {}
    })();
  }, [benchmarks]);

  const ready = txs.length > 0 && live;
  const dividendsByIsin = useMemo(() => totalDividendsEur(cashEvents), [cashEvents]);
  const feesEur = useMemo(() => totalFeesEur(cashEvents), [cashEvents]);
  const otherIncomeEur = useMemo(() => totalOtherIncomeEur(cashEvents), [cashEvents]);

  const returns = useMemo(() => {
    if (!ready) return null;
    return computeReturns(positions, dividendsByIsin, live!.prices, feesEur, otherIncomeEur, txs);
  }, [ready, positions, dividendsByIsin, feesEur, otherIncomeEur, live, txs]);

  const rows: HoldingRow[] = useMemo(() => {
    if (!returns || !live) return [];
    const total = returns.currentValueEur;
    return positions.map((p) => {
      const px = live.prices[p.isin];
      const bepEur = p.quantity ? p.costBasisEur / p.quantity : 0;
      const currentEur = px?.priceEur ?? bepEur;
      const valueEur = p.quantity * currentEur;
      const dividends = dividendsByIsin[p.isin] ?? 0;
      const priceReturnPct = p.costBasisEur ? (valueEur - p.costBasisEur) / p.costBasisEur : 0;
      const incomeReturnPct = p.costBasisEur ? dividends / p.costBasisEur : 0;
      return {
        isin: p.isin,
        name: p.product,
        qty: p.quantity,
        bep: bepEur,
        current: currentEur,
        currency: p.currency,
        valueEur,
        priceReturnPct,
        incomeReturnPct,
        totalReturnPct: priceReturnPct + incomeReturnPct,
        allocPct: total ? valueEur / total : 0,
      };
    });
  }, [returns, live, positions, dividendsByIsin]);

  const cash = useMemo(() => cashBalanceEur(cashEvents), [cashEvents]);

  const firstTxIso = txs[0]?.date ?? new Date().toISOString().slice(0,10);

  const fullSeries: ValuePoint[] = useMemo(() => {
    if (positions.length === 0 || Object.keys(histByIsin).length === 0 || !live) return [];
    return valueSeries(txs, cashEvents, histByIsin, { USDEUR: live.fxUsdEur });
  }, [positions, txs, cashEvents, histByIsin, live]);

  const windowed = useMemo(() => {
    if (fullSeries.length === 0) return [];
    const { from, to } = rangeBounds(range, firstTxIso);
    const fromTs = Math.floor(from.getTime() / 1000), toTs = Math.floor(to.getTime() / 1000);
    return fullSeries.filter((p) => p.t >= fromTs && p.t <= toTs);
  }, [fullSeries, range, firstTxIso]);

  const windowedBench = useMemo(() => {
    if (benchSeries.length === 0 || windowed.length === 0) return [];
    const fromTs = windowed[0].t, toTs = windowed[windowed.length - 1].t;
    return benchSeries.map((b) => ({ ...b, points: b.points.filter((p) => p.t >= fromTs && p.t <= toTs) }));
  }, [benchSeries, windowed]);

  const onFile = async (slot: keyof SlotStatus, text: string) => {
    try {
      if (slot === "transactions") setTxs(parseTransactionsCsv(text));
      else setCashEvents(parseAccountCsv(text));
      setStatus((s) => ({ ...s, [slot]: "ready" }));
    } catch {
      setStatus((s) => ({ ...s, [slot]: "error" }));
    }
  };

  const reset = () => {
    localStorage.removeItem(LS_KEY);
    setTxs([]); setCashEvents([]); setLive(null);
    setStatus({ transactions: "idle", account: "idle" });
  };

  return (
    <main className="min-h-screen p-6 md:p-10 flex flex-col gap-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-medium tracking-tight">DEGIRO Tracker</h1>
        {ready ? (
          <button onClick={reset} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">clear data</button>
        ) : null}
      </header>

      {err ? (
        <div className="glass p-3 text-sm text-[var(--color-negative)]">{err}</div>
      ) : null}

      <Dropzone onFile={onFile} status={status} />

      {!ready ? <EmptyState /> : null}

      {ready && returns ? (
        <>
          <KPIRow r={returns} cashEur={cash} />
          <div className="flex items-center justify-between flex-wrap gap-3">
            <TimeRangeTabs value={range} onChange={setRange} />
            <BenchmarkSelector value={benchmarks} onChange={setBenchmarks} />
          </div>
          <Chart series={windowed} benchmarks={windowedBench} mode={mode} onModeChange={setMode} />
          <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-4">
            <Holdings rows={rows} />
            <AllocationDonut data={rows.map((r) => ({ label: r.name, value: r.valueEur }))} />
          </div>
        </>
      ) : null}
    </main>
  );
}
