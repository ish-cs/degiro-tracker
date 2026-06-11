import { NextResponse } from "next/server";
import { searchByIsin } from "@/lib/api-clients/yahoo";
import { CURRENCY_TO_SUFFIX, COUNTRY_TO_SUFFIX } from "@/lib/portfolio/ticker-maps";

// Resolve an ISIN to a Yahoo ticker by querying Yahoo's search index, then
// picking the best EQUITY/ETF/MUTUALFUND candidate via currency-suffix →
// country-suffix → first match.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const isin = (url.searchParams.get("isin") ?? "").trim();
  const currency = (url.searchParams.get("currency") ?? "").trim().toUpperCase();
  if (!isin) {
    return NextResponse.json({ error: "isin required" }, { status: 400 });
  }

  try {
    const quotes = await searchByIsin(isin);
    const eligible = quotes.filter((q) =>
      q.quoteType === "EQUITY" || q.quoteType === "ETF" || q.quoteType === "MUTUALFUND",
    );
    const pool = eligible.length > 0 ? eligible : quotes;

    let preferredSuffix: string | undefined;
    if (currency && CURRENCY_TO_SUFFIX[currency]) {
      preferredSuffix = CURRENCY_TO_SUFFIX[currency];
    } else {
      const country = isin.slice(0, 2).toUpperCase();
      if (country && COUNTRY_TO_SUFFIX[country]) {
        preferredSuffix = COUNTRY_TO_SUFFIX[country];
      }
    }

    let chosen: string | null = null;
    if (preferredSuffix) {
      const match = pool.find((q) => q.symbol?.endsWith(preferredSuffix!));
      if (match?.symbol) chosen = match.symbol;
    }
    if (!chosen && pool[0]?.symbol) chosen = pool[0].symbol;

    if (!chosen) {
      return NextResponse.json({ isin, ticker: null, candidates: [] });
    }
    return NextResponse.json({
      isin,
      ticker: chosen,
      candidates: pool.slice(0, 5).map((q) => ({
        symbol: q.symbol,
        name: q.shortname ?? q.longname,
        exchange: q.exchange,
        type: q.quoteType,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "search failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
