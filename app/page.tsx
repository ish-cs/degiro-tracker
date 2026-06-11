"use client";
import { useEffect, useMemo, useState } from "react";
import { parseAccountCsv, extractTxsFromAccount } from "@/lib/parsers/account";
import { currentPositions } from "@/lib/portfolio/positions";
import { computeReturns } from "@/lib/portfolio/returns";
import { totalCostsEur, totalDividendsEur, cashBalanceEur, totalOtherIncomeEur } from "@/lib/portfolio/cost-ratio";
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
import type { CashEvent, ValuePoint, BenchmarkSeries } from "@/lib/types";

type LiveData = {
  prices: Record<string, { priceEur: number; currency: string; raw: number }>;
  // EUR-per-1-unit-of-foreign for every non-EUR currency present in
  // the user's portfolio (e.g. { USD: 0.866, GBP: 1.17 }).
  fxToEur: Record<string, number>;
};

const LS_KEY = "degiro-tracker:v2";
const LEGACY_LS_KEYS = ["degiro-tracker:v1"];

function loadFromLocalStorage(): CashEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (Array.isArray(s.cashEvents)) return s.cashEvents;
    }
    // Migrate from any prior key. Old v1 stored {txs, cashEvents}, ignore
    // the txs side since we derive them now.
    for (const k of LEGACY_LS_KEYS) {
      const r = localStorage.getItem(k);
      if (!r) continue;
      const s = JSON.parse(r);
      if (Array.isArray(s.cashEvents)) {
        localStorage.removeItem(k);
        return s.cashEvents;
      }
    }
  } catch {}
  return [];
}

export default function Page() {
  // We always render the empty shell server-side, then swap in any saved
  // state once mounted. `mounted` is what unblocks client-only UI.
  const [mounted, setMounted] = useState(false);
  const [cashEvents, setCashEvents] = useState<CashEvent[]>([]);
  const [parseStatus, setParseStatus] = useState<"idle"|"ready"|"error">("idle");
  const status: "idle"|"ready"|"error" =
    parseStatus !== "idle" ? parseStatus : (cashEvents.length > 0 ? "ready" : "idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [live, setLive] = useState<LiveData | null>(null);
  const [priceErr, setPriceErr] = useState<string | null>(null);
  const [range, setRange] = useState<RangeId>("YTD");
  const [mode, setMode] = useState<"value" | "pl">("value");
  const [benchmarks, setBenchmarks] = useState<BenchmarkSelection>([]);
  const [histByIsin, setHistByIsin] = useState<Record<string, { t: number; close: number }[]>>({});
  const [benchSeries, setBenchSeries] = useState<BenchmarkSeries[]>([]);
  const badBenchmarks = useMemo(
    () => benchSeries.filter((s) => s.points.length === 0).map((s) => s.label),
    [benchSeries],
  );

  // Effect intentionally hydrates state from localStorage post-mount.
  // The source of truth (browser storage) doesn't exist on the server,
  // so there's nothing to "derive" — setState in effect is the right shape.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setCashEvents(loadFromLocalStorage());
    setBenchmarks(loadSavedBenchmarks());
    setMounted(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!mounted) return;
    if (cashEvents.length) {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({ cashEvents, savedAt: Date.now() }));
      } catch (e) {
        // QuotaExceededError: CSV too large to persist. setState in
        // response to an external-system failure is the right shape.
        /* eslint-disable react-hooks/set-state-in-effect */
        if (e instanceof DOMException && e.name === "QuotaExceededError") {
          setErrorMsg("Couldn't save your data — your browser's storage is full. The app will work for this session but you'll have to re-upload next time.");
        }
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    }
  }, [cashEvents, mounted]);

  // Derive Tx[] from cash events. Single source of truth.
  const txs = useMemo(() => extractTxsFromAccount(cashEvents), [cashEvents]);
  const positions = useMemo(() => currentPositions(txs), [txs]);

  useEffect(() => {
    if (positions.length === 0) return;
    let cancelled = false;
    const symbols = positions.map((p) => p.yahooSymbol);
    (async () => {
      try {
        // Fetch live prices first; the response tells us which currencies
        // we actually need FX for (the Yahoo listing's currency, not the
        // currency we recorded on the buy).
        const pr = await fetch(`/api/price?symbols=${symbols.join(",")}`).then((r) => r.json());
        if (cancelled) return;
        const neededCcys = new Set<string>();
        for (const sym of symbols) {
          const ccy = pr[sym]?.currency;
          if (ccy && ccy !== "EUR") neededCcys.add(ccy);
        }
        const fxResults = await Promise.all(
          [...neededCcys].map(async (ccy) => {
            const res = await fetch(`/api/fx?pair=${ccy}EUR`).then((r) => r.json());
            return [ccy, res.price ?? 1] as const;
          }),
        );
        if (cancelled) return;
        const fxToEur: Record<string, number> = { EUR: 1 };
        for (const [ccy, rate] of fxResults) fxToEur[ccy] = rate;

        const prices: LiveData["prices"] = {};
        for (const p of positions) {
          const q = pr[p.yahooSymbol];
          if (!q) continue;
          const rate = fxToEur[q.currency] ?? 1;
          prices[p.isin] = { priceEur: q.price * rate, currency: q.currency, raw: q.price };
        }
        setLive({ prices, fxToEur });
        setPriceErr(null);
      } catch (e) {
        if (!cancelled) setPriceErr(e instanceof Error ? e.message : "price fetch failed");
      }
    })();
    return () => { cancelled = true; };
  }, [positions]);

  useEffect(() => {
    if (positions.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const entries = await Promise.all(positions.map(async (p) => {
          const r = await fetch(`/api/history?symbol=${encodeURIComponent(p.yahooSymbol)}&range=5y`).then((r) => r.json());
          return [p.isin, r.points ?? []] as const;
        }));
        if (!cancelled) setHistByIsin(Object.fromEntries(entries));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [positions]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const series = await Promise.all(benchmarks.map(async (b) => {
          const r = await fetch(`/api/history?symbol=${encodeURIComponent(b.symbol)}&range=5y`).then((r) => r.json());
          return { id: b.id, label: b.label, symbol: b.symbol, points: r.points ?? [] };
        }));
        if (!cancelled) setBenchSeries(series);
      } catch {
        if (!cancelled) {
          // Mark all current benchmarks as failed so the user sees a warning.
          setBenchSeries(benchmarks.map((b) => ({ ...b, points: [] })));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [benchmarks]);

  const ready = txs.length > 0 && live;
  const fx = useMemo(
    () => ({
      USDEUR: live?.fxToEur.USD ?? 1,
      GBPEUR: live?.fxToEur.GBP ?? 1,
    }),
    [live],
  );
  const dividendsByIsin = useMemo(() => totalDividendsEur(cashEvents, fx), [cashEvents, fx]);
  const costsEur = useMemo(() => totalCostsEur(cashEvents, txs, fx), [cashEvents, txs, fx]);
  const otherIncomeEur = useMemo(() => totalOtherIncomeEur(cashEvents, fx), [cashEvents, fx]);

  const returns = useMemo(() => {
    if (!ready) return null;
    return computeReturns(positions, dividendsByIsin, live!.prices, costsEur, otherIncomeEur, txs);
  }, [ready, positions, dividendsByIsin, costsEur, otherIncomeEur, live, txs]);

  const rows: HoldingRow[] = useMemo(() => {
    if (!returns || !live) return [];
    const total = returns.currentValueEur;
    return positions.map((p) => {
      const px = live.prices[p.isin];
      const currentEur = px?.priceEur ?? p.bep;
      const valueEur = p.quantity * currentEur;
      const dividends = dividendsByIsin[p.isin] ?? 0;
      const priceReturnPct = p.costBasisEur ? (valueEur - p.costBasisEur) / p.costBasisEur : 0;
      const incomeReturnPct = p.costBasisEur ? dividends / p.costBasisEur : 0;
      return {
        isin: p.isin,
        name: p.product,
        qty: p.quantity,
        bep: p.bep,
        current: currentEur,
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
    return valueSeries(txs, cashEvents, histByIsin, fx);
  }, [positions, txs, cashEvents, histByIsin, live, fx]);

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

  const onFile = async (text: string) => {
    try {
      const events = parseAccountCsv(text);
      if (events.length === 0) {
        setErrorMsg("That doesn't look like a DEGIRO Account.csv. Make sure you exported Account → Activity → Export → Account (not Transactions).");
        setParseStatus("error");
        return;
      }
      setCashEvents(events);
      setParseStatus("ready");
      setErrorMsg(null);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Couldn't parse the file.");
      setParseStatus("error");
    }
  };

  const reset = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(LS_KEY);
      for (const k of LEGACY_LS_KEYS) localStorage.removeItem(k);
    }
    setCashEvents([]); setLive(null); setHistByIsin({}); setBenchSeries([]);
    setParseStatus("idle");
    setErrorMsg(null);
    setPriceErr(null);
  };

  const showReset = mounted && (cashEvents.length > 0 || parseStatus !== "idle");

  return (
    <main className="min-h-screen p-6 md:p-10 flex flex-col gap-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-medium tracking-tight">DEGIRO Tracker</h1>
        {showReset ? (
          <button onClick={reset} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">clear data</button>
        ) : null}
      </header>

      {errorMsg ? (
        <div className="glass p-3 text-sm text-[var(--color-negative)]">{errorMsg}</div>
      ) : null}
      {priceErr ? (
        <div className="glass p-3 text-sm text-[var(--color-negative)]">Live prices failed: {priceErr}</div>
      ) : null}
      {badBenchmarks.length > 0 ? (
        <div className="glass p-3 text-sm text-[var(--color-text-secondary)]">
          No Yahoo Finance data for: {badBenchmarks.join(", ")}. Check the ticker symbol.
        </div>
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
