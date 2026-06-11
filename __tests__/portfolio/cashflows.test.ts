import { describe, it, expect } from "vitest";
import { buildPortfolioCashflows } from "@/lib/portfolio/cashflows";
import type { CashEvent, Tx } from "@/lib/types";

const fx = (_iso: string, ccy: string) => (ccy === "USD" ? 0.866 : 1);

const tx = (over: Partial<Tx>): Tx => ({
  date: "2026-01-01",
  time: "",
  product: "X",
  isin: "ISIN",
  exchange: "",
  quantity: 1,
  price: 100,
  localCurrency: "EUR",
  valueLocal: 100,
  valueEur: 100,
  fxRate: null,
  feeEur: 0,
  brokerFeeEur: 0,
  autoFxFeeEur: 0,
  totalEur: -100,
  orderId: "ord",
  ...over,
});

const ev = (over: Partial<CashEvent>): CashEvent => ({
  date: "2026-01-01",
  product: "X",
  isin: null,
  description: "x",
  kind: "other",
  currency: "EUR",
  amount: 0,
  amountEur: 0,
  balanceCurrency: "EUR",
  balance: 0,
  balanceEur: 0,
  orderId: null,
  fxRate: null,
  ...over,
});

describe("buildPortfolioCashflows", () => {
  it("buy → negative flow including fee", () => {
    const flows = buildPortfolioCashflows(
      [],
      [tx({ date: "2026-01-01", quantity: 5, valueEur: 1000, feeEur: 3.9 })],
      0,
      "2026-06-11",
      fx,
    );
    expect(flows).toHaveLength(1);
    expect(flows[0].amount).toBeCloseTo(-1003.9, 2);
  });

  it("sell → positive flow net of fee", () => {
    const flows = buildPortfolioCashflows(
      [],
      [tx({ date: "2026-03-01", quantity: -2, valueEur: 500, feeEur: 2 })],
      0,
      "2026-06-11",
      fx,
    );
    expect(flows).toHaveLength(1);
    expect(flows[0].amount).toBeCloseTo(498, 2);
  });

  it("gross dividend → positive (USD converted)", () => {
    const flows = buildPortfolioCashflows(
      [ev({ kind: "dividend", currency: "USD", amount: 4.62, date: "2026-03-17" })],
      [],
      0,
      "2026-06-11",
      fx,
    );
    expect(flows[0].amount).toBeCloseTo(4.62 * 0.866, 3);
  });

  it("dividend withholding tax → negative", () => {
    const flows = buildPortfolioCashflows(
      [ev({ kind: "dividend_tax", currency: "USD", amount: -0.69, date: "2026-03-17" })],
      [],
      0,
      "2026-06-11",
      fx,
    );
    expect(flows[0].amount).toBeCloseTo(-0.69 * 0.866, 3);
  });

  it("standalone connection fee → negative (orderId null)", () => {
    const flows = buildPortfolioCashflows(
      [ev({ kind: "fee", currency: "EUR", amount: -2.5, orderId: null,
            description: "Exchange Connection Fee", date: "2026-02-01" })],
      [],
      0,
      "2026-06-11",
      fx,
    );
    expect(flows[0].amount).toBeCloseTo(-2.5, 2);
  });

  it("Tx-linked broker fees are NOT double-counted (skipped here, included in Tx)", () => {
    const flows = buildPortfolioCashflows(
      [ev({ kind: "fee", currency: "EUR", amount: -3.9, orderId: "ord-x",
            description: "DEGIRO Transaction fees", date: "2026-01-01" })],
      [tx({ orderId: "ord-x", valueEur: 1000, feeEur: 3.9 })],
      0,
      "2026-06-11",
      fx,
    );
    // Only the tx (−1003.9), not also the fee event (−3.9 redundant).
    expect(flows).toHaveLength(1);
    expect(flows[0].amount).toBeCloseTo(-1003.9, 2);
  });

  it("rebate → positive cashflow", () => {
    const flows = buildPortfolioCashflows(
      [ev({ kind: "other", currency: "EUR", amount: 6.9,
            description: "DEGIRO Rebate Promotion", date: "2026-01-20" })],
      [],
      0,
      "2026-06-11",
      fx,
    );
    expect(flows[0].amount).toBeCloseTo(6.9, 2);
  });

  it("terminal mark-to-market added at final date", () => {
    const flows = buildPortfolioCashflows([], [], 13449, "2026-06-11", fx);
    expect(flows).toHaveLength(1);
    expect(flows[0].dateIso).toBe("2026-06-11");
    expect(flows[0].amount).toBe(13449);
  });

  it("ignores deposits/withdrawals/sweeps (not part of XIRR)", () => {
    const flows = buildPortfolioCashflows(
      [
        ev({ kind: "deposit", currency: "EUR", amount: 1000, description: "flatex Deposit" }),
        ev({ kind: "withdrawal", currency: "EUR", amount: -500, description: "Withdrawal" }),
        ev({ kind: "fx", currency: "USD", amount: -100, description: "FX Debit" }),
      ],
      [],
      0,
      "2026-06-11",
      fx,
    );
    expect(flows).toHaveLength(0);
  });

  it("sorts flows by date ascending", () => {
    const flows = buildPortfolioCashflows(
      [],
      [
        tx({ date: "2026-03-01", quantity: 1, valueEur: 100, feeEur: 1 }),
        tx({ date: "2026-01-01", quantity: 1, valueEur: 100, feeEur: 1 }),
      ],
      150,
      "2026-06-11",
      fx,
    );
    expect(flows.map((f) => f.dateIso)).toEqual(["2026-01-01", "2026-03-01", "2026-06-11"]);
  });
});
