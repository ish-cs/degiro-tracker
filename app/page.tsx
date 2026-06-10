"use client";
import { useEffect, useMemo, useState } from "react";
import { parseTransactionsCsv } from "@/lib/parsers/transactions";
import { parseAccountCsv } from "@/lib/parsers/account";
import { currentPositions } from "@/lib/portfolio/positions";
import { computeReturns } from "@/lib/portfolio/returns";
import { totalFeesEur, totalDividendsEur, cashBalanceEur } from "@/lib/portfolio/cost-ratio";
import { Dropzone } from "@/components/Dropzone";
import { KPIRow } from "@/components/KPIRow";
import { Holdings, type HoldingRow } from "@/components/Holdings";
import type { Tx, CashEvent } from "@/lib/types";

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

  const ready = txs.length > 0 && live;
  const dividendsByIsin = useMemo(() => totalDividendsEur(cashEvents), [cashEvents]);
  const feesEur = useMemo(() => totalFeesEur(cashEvents), [cashEvents]);

  const returns = useMemo(() => {
    if (!ready) return null;
    return computeReturns(positions, dividendsByIsin, live!.prices, feesEur);
  }, [ready, positions, dividendsByIsin, feesEur, live]);

  const rows: HoldingRow[] = useMemo(() => {
    if (!returns || !live) return [];
    const total = returns.currentValueEur;
    return positions.map((p) => {
      const px = live.prices[p.isin];
      const valueEur = p.quantity * (px?.priceEur ?? p.bep);
      const dividends = dividendsByIsin[p.isin] ?? 0;
      const priceReturnPct = p.costBasisEur ? (valueEur - p.costBasisEur) / p.costBasisEur : 0;
      const incomeReturnPct = p.costBasisEur ? dividends / p.costBasisEur : 0;
      return {
        isin: p.isin,
        name: p.product,
        qty: p.quantity,
        bep: p.bep,
        current: px?.raw ?? 0,
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

      {ready && returns ? (
        <>
          <KPIRow r={returns} cashEur={cash} />
          <Holdings rows={rows} />
        </>
      ) : null}
    </main>
  );
}
