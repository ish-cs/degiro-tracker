// Trading-currency → preferred Yahoo Finance ticker suffix.
// Used to disambiguate when an ISIN is listed on multiple Yahoo venues.
export const CURRENCY_TO_SUFFIX: Record<string, string> = {
  // Europe
  SEK: ".ST", NOK: ".OL", DKK: ".CO", ISK: ".IC",
  CHF: ".SW", GBP: ".L",  GBp: ".L",
  PLN: ".WA", CZK: ".PR", HUF: ".BD", RON: ".RO",
  TRY: ".IS", RUB: ".ME",
  // Asia / Pacific
  JPY: ".T",  HKD: ".HK", CNY: ".SS", KRW: ".KS",
  TWD: ".TW", INR: ".NS", SGD: ".SI", AUD: ".AX",
  NZD: ".NZ", MYR: ".KL", THB: ".BK", IDR: ".JK",
  PHP: ".PS", VND: ".VN",
  // Americas
  CAD: ".TO", MXN: ".MX", BRL: ".SA", ARS: ".BA", CLP: ".SN",
  // Middle East / Africa
  ILS: ".TA", ZAR: ".JO", SAR: ".SR", AED: ".AE", EGP: ".CA",
  // EUR/USD left unmapped: EUR spans many exchanges, US listings carry no suffix.
};

// ISIN country prefix → preferred Yahoo Finance ticker suffix.
// Used as fallback when currency hint is ambiguous (e.g. EUR).
export const COUNTRY_TO_SUFFIX: Record<string, string> = {
  DE: ".DE", FR: ".PA", NL: ".AS", IT: ".MI", ES: ".MC",
  FI: ".HE", BE: ".BR", PT: ".LS", AT: ".VI", GR: ".AT",
  IE: ".IR", LU: ".LU",
  SE: ".ST", NO: ".OL", DK: ".CO", IS: ".IC",
  CH: ".SW", GB: ".L",
  PL: ".WA", CZ: ".PR", HU: ".BD", RO: ".RO", TR: ".IS",
  JP: ".T",  HK: ".HK", CN: ".SS", KR: ".KS", TW: ".TW",
  IN: ".NS", SG: ".SI", AU: ".AX", NZ: ".NZ", MY: ".KL",
  TH: ".BK", ID: ".JK", PH: ".PS", VN: ".VN",
  CA: ".TO", MX: ".MX", BR: ".SA", AR: ".BA", CL: ".SN",
  IL: ".TA", ZA: ".JO", SA: ".SR", AE: ".AE", EG: ".CA",
  // US intentionally omitted — US ISINs map to bare tickers.
};

// Small allowlist for ISINs where currency/country heuristics give a wrong
// or undertested ticker. Kept short; expand only when we hit verified misses.
export const MANUAL_TICKER_MAPPING: Record<string, Record<string, string>> = {
  US21037T1097: { USD: "CEG" },
  US92840M1027: { USD: "VST" },
  US02079K3059: { USD: "GOOGL", EUR: "ABEA.DE" },
  IE00BWBXM948: { EUR: "ZPDT.DE" },
  DE0007164600: { EUR: "SAP.DE" },
  NL0010273215: { EUR: "ASML.AS" },
  DE0007030009: { EUR: "RHM.DE" },
  IT0003856405: { EUR: "LDO.MI" },
  NL0000235190: { EUR: "AIR.PA" },
};
