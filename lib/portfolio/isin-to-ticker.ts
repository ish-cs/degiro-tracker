const STATIC_MAP: Record<string, string> = {
  US21037T1097: "CEG",
  US92840M1027: "VST",
  US02079K3059: "GOOGL",
  IE00BWBXM948: "ZPDT.DE",
};

// Per-exchange overrides. Some US ISINs are dual-listed on European exchanges
// and trade in EUR there; the EUR listing has a distinct Yahoo symbol whose
// price already includes the broker's FX. Always prefer the user's actual
// trading venue when known.
const STATIC_MAP_BY_EXCHANGE: Record<string, Record<string, string>> = {
  US02079K3059: {
    TDG: "ABEA.DE",
    XET: "ABEA.DE",
    EAM: "ABEA.DE",
    EPA: "ABEA.PA",
  },
};

const exchangeSuffix: Record<string, string> = {
  NDQ: "", NSY: "", NYS: "", ASE: "",
  TDG: "", XET: ".DE", EAM: ".AS", EPA: ".PA",
  LSE: ".L", MIL: ".MI", MAD: ".MC", EBS: ".SW", TYO: ".T",
};

export function isinToTicker(isin: string, exchange: string, product: string): string {
  const ex = (exchange || "").toUpperCase();
  const override = typeof window !== "undefined" ? window.localStorage.getItem(`isin-map:${isin}`) : null;
  if (override) return override;
  const byExchange = STATIC_MAP_BY_EXCHANGE[isin]?.[ex];
  if (byExchange) return byExchange;
  if (STATIC_MAP[isin]) return STATIC_MAP[isin];
  const root = product.split(" ")[0].toUpperCase();
  const suffix = exchangeSuffix[ex] ?? "";
  return `${root}${suffix}`;
}

export function setIsinOverride(isin: string, ticker: string): void {
  if (typeof window !== "undefined") window.localStorage.setItem(`isin-map:${isin}`, ticker);
}
