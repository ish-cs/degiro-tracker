export type Currency = "EUR" | "USD" | "GBP" | "CHF" | "JPY";

export type Tx = {
  date: string;
  time: string;
  product: string;
  isin: string;
  exchange: string;
  quantity: number;
  price: number;
  localCurrency: Currency;
  valueLocal: number;
  valueEur: number;
  fxRate: number | null;
  feeEur: number;
  totalEur: number;
  orderId: string;
};

export type CashEventKind =
  | "deposit"
  | "withdrawal"
  | "dividend"
  | "dividend_tax"
  | "fee"
  | "fx"
  | "buy"
  | "sell"
  | "other";

export type CashEvent = {
  date: string;
  product: string;
  isin: string | null;
  description: string;
  kind: CashEventKind;
  amountEur: number;
  balanceEur: number;
  orderId: string | null;
};

export type Position = {
  isin: string;
  product: string;
  exchange: string;
  yahooSymbol: string;
  currency: Currency;
  quantity: number;
  bep: number;
  costBasisEur: number;
};

export type Price = {
  symbol: string;
  price: number;
  currency: Currency;
  asOf: number;
};

export type ValuePoint = {
  t: number;
  valueEur: number;
  costBasisEur: number;
  plEur: number;
};

export type Returns = {
  costBasisEur: number;
  currentValueEur: number;
  priceReturnEur: number;
  priceReturnPct: number;
  incomeReturnEur: number;
  incomeReturnPct: number;
  totalReturnEur: number;
  totalReturnPct: number;        // money-weighted (Modified Dietz)
  totalReturnPctSimple: number;  // simple cost-basis return
  costRatioPct: number;
};

export type BenchmarkId = "GSPC" | "URTH" | "NDX" | string;

export type BenchmarkSeries = {
  id: BenchmarkId;
  label: string;
  symbol: string;
  points: { t: number; close: number }[];
};

export type ParsedState = {
  txs: Tx[];
  cashEvents: CashEvent[];
  parsedAt: number;
};
