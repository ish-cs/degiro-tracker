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
  feeEur: number;        // total of brokerage + AutoFX (sum for cost basis)
  brokerFeeEur: number;  // transaction fee only
  autoFxFeeEur: number;  // currency conversion cost only
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
  | "split"
  | "merger"
  | "other";

export type Split = {
  date: string;
  isin: string;
  ratio: number; // newShares / oldShares (4 = 4-for-1; 0.1 = reverse 1-for-10)
  description: string;
};

export type CashEvent = {
  date: string;
  product: string;
  isin: string | null;
  description: string;
  kind: CashEventKind;
  currency: string;       // currency of `amount` (e.g. "EUR", "USD")
  amount: number;         // signed, in `currency`
  amountEur: number;      // EUR-denominated only (0 for non-EUR events)
  balanceCurrency: string;
  balance: number;
  balanceEur: number;
  orderId: string | null;
  fxRate: number | null;  // if event has explicit FX rate (FX Credit/Debit)
};

export type Position = {
  isin: string;
  product: string;
  exchange: string;
  yahooSymbol: string;
  quantity: number;
  bep: number;          // EUR per share, fees excluded (Simple's "Net cash invested / share")
  costBasisEur: number; // EUR total cost incl. fees
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
  totalReturnPct: number;        // annualized money-weighted (XIRR)
  totalReturnPctSimple: number;  // cumulative cost-basis return
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
