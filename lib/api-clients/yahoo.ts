const cache = new Map<string, { ts: number; data: unknown }>();

async function cachedFetch(url: string, ttlSec: number) {
  const key = url;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.ts < ttlSec * 1000) return hit.data;
  const res = await fetch(url, { headers: { "User-Agent": "degiro-tracker/1.0" } });
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const json = await res.json();
  cache.set(key, { ts: now, data: json });
  return json;
}

type YahooChartResult = {
  chart?: {
    result?: Array<{
      meta: {
        regularMarketPrice: number;
        currency: string;
        regularMarketTime: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{ close?: (number | null)[] }>;
      };
    }>;
  };
};

export async function quote(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
  const data = (await cachedFetch(url, 60)) as YahooChartResult;
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`no data for ${symbol}`);
  const meta = result.meta;
  return {
    symbol,
    price: meta.regularMarketPrice,
    currency: meta.currency,
    asOf: meta.regularMarketTime,
  };
}

export async function history(symbol: string, range: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
  const data = (await cachedFetch(url, 60 * 60 * 24)) as YahooChartResult;
  const r = data?.chart?.result?.[0];
  if (!r) throw new Error(`no history for ${symbol}`);
  const ts = r.timestamp ?? [];
  const close = r.indicators?.quote?.[0]?.close ?? [];
  return ts
    .map((t, i) => ({ t, close: close[i] }))
    .filter((p): p is { t: number; close: number } => p.close != null);
}

export async function fx(pair: string) {
  return quote(`${pair}=X`);
}
