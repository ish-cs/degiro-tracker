const STATIC_MAP: Record<string, string> = {
  US21037T1097: "CEG",
  US92840M1027: "VST",
  US02079K3059: "GOOGL",
  IE00BWBXM948: "ZPDT.DE",
};

const exchangeSuffix: Record<string, string> = {
  NDQ: "", NSY: "", NYS: "", ASE: "",
  TDG: "", XET: ".DE", EAM: ".AS", EPA: ".PA",
  LSE: ".L", MIL: ".MI", MAD: ".MC", EBS: ".SW", TYO: ".T",
};

export function isinToTicker(isin: string, exchange: string, product: string): string {
  const override = typeof window !== "undefined" ? window.localStorage.getItem(`isin-map:${isin}`) : null;
  if (override) return override;
  if (STATIC_MAP[isin]) return STATIC_MAP[isin];
  const root = product.split(" ")[0].toUpperCase();
  const suffix = exchangeSuffix[exchange.toUpperCase()] ?? "";
  return `${root}${suffix}`;
}

export function setIsinOverride(isin: string, ticker: string): void {
  if (typeof window !== "undefined") window.localStorage.setItem(`isin-map:${isin}`, ticker);
}
