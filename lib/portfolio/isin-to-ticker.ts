import { CURRENCY_TO_SUFFIX, COUNTRY_TO_SUFFIX, MANUAL_TICKER_MAPPING } from "./ticker-maps";

// Resolve an ISIN + trading-currency to a Yahoo Finance ticker symbol.
// Pure, synchronous, offline. Strategy:
//   1. localStorage override (per-ISIN user pin)
//   2. MANUAL_TICKER_MAPPING (small allowlist)
//   3. CURRENCY_TO_SUFFIX (e.g. SEK → .ST) — best for stocks priced in a
//      currency that uniquely identifies the venue
//   4. COUNTRY_TO_SUFFIX (e.g. DE → .DE) — fallback when currency is ambiguous
//      (EUR across many exchanges) or unmapped
//   5. Bare product-first-word — last resort, matches most US tickers
//
// For ISINs whose preferred listing has a non-trivial ticker (e.g. ABEA.DE
// for Alphabet on Tradegate), an async upgrade via /api/resolve-ticker will
// override the sync guess at runtime — see `useTickerResolver`.
export function isinToTicker(isin: string, currency: string, product: string): string {
  const ccy = (currency || "").toUpperCase();

  if (typeof window !== "undefined") {
    const override = window.localStorage.getItem(`isin-map:${isin}`);
    if (override) return override;
  }

  const manual = MANUAL_TICKER_MAPPING[isin];
  if (manual) {
    if (ccy && manual[ccy]) return manual[ccy];
    const first = Object.values(manual)[0];
    if (first) return first;
  }

  const root = (product || "").split(" ")[0].toUpperCase().replace(/[^A-Z0-9]/g, "");
  const safeRoot = root || isin.slice(0, 4);

  const ccySuffix = ccy ? CURRENCY_TO_SUFFIX[ccy] : undefined;
  if (ccySuffix) return `${safeRoot}${ccySuffix}`;

  const country = (isin || "").slice(0, 2).toUpperCase();
  const countrySuffix = country ? COUNTRY_TO_SUFFIX[country] : undefined;
  if (countrySuffix) return `${safeRoot}${countrySuffix}`;

  // US ISINs + USD-listed → bare ticker (no suffix on Yahoo)
  return safeRoot;
}

export function setIsinOverride(isin: string, ticker: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(`isin-map:${isin}`, ticker);
  }
}

export function clearIsinOverride(isin: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(`isin-map:${isin}`);
  }
}
