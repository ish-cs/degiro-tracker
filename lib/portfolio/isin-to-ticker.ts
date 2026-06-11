const STATIC_MAP: Record<string, string> = {
  US21037T1097: "CEG",
  US92840M1027: "VST",
  US02079K3059: "GOOGL",
  IE00BWBXM948: "ZPDT.DE",
};

// When the same ISIN trades on multiple exchanges in different currencies,
// pick the listing whose currency matches the user's trade. The currency
// comes from the buy event (e.g. "Buy 4 ... 244 USD" → USD; "Buy 4 ...
// 264 EUR" → EUR), which tells us exactly which listing the user owns.
const BY_CURRENCY: Record<string, Record<string, string>> = {
  US02079K3059: {
    EUR: "ABEA.DE",  // Tradegate / Xetra (EUR)
    USD: "GOOGL",    // NASDAQ (USD)
  },
};

export function isinToTicker(isin: string, currency: string, product: string): string {
  const ccy = (currency || "").toUpperCase();
  const override =
    typeof window !== "undefined" ? window.localStorage.getItem(`isin-map:${isin}`) : null;
  if (override) return override;
  const byCcy = BY_CURRENCY[isin]?.[ccy];
  if (byCcy) return byCcy;
  if (STATIC_MAP[isin]) return STATIC_MAP[isin];
  // Fallback heuristic: EUR currency → European exchange suffix
  const root = product.split(" ")[0].toUpperCase();
  if (ccy === "EUR") return `${root}.DE`;
  return root;
}

export function setIsinOverride(isin: string, ticker: string): void {
  if (typeof window !== "undefined")
    window.localStorage.setItem(`isin-map:${isin}`, ticker);
}
