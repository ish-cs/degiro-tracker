import { describe, it, expect } from "vitest";
import {
  totalFeesEur,
  totalTaxesEur,
  totalCostsEur,
  totalDividendsEur,
  totalOtherIncomeEur,
  totalMarginInterestEur,
  estimatedAutoFxFromVolume,
  cashBalancesByCurrency,
  totalCashEur,
} from "@/lib/portfolio/cost-ratio";
import type { CashEvent } from "@/lib/types";

const ev = (over: Partial<CashEvent>): CashEvent => ({
  date: "2026-01-01", product: "", isin: null, description: "x", kind: "other",
  currency: "EUR", amount: 0, amountEur: 0,
  balanceCurrency: "EUR", balance: 0, balanceEur: 0,
  orderId: null, fxRate: null, ...over,
});

const fx = (_iso: string, ccy: string) => (ccy === "EUR" ? 1 : ccy === "USD" ? 0.866 : 0);

describe("totalMarginInterestEur (cost side)", () => {
  it("picks up DEGIRO debit interest charges", () => {
    const events = [
      ev({ kind: "other", description: "DEGIRO Debit Interest", currency: "EUR", amount: -1.50, amountEur: -1.50 }),
    ];
    expect(totalMarginInterestEur(events, fx)).toBeCloseTo(1.50);
  });

  it("picks up Dutch Allocatie geldmarktfonds", () => {
    const events = [
      ev({ kind: "other", description: "Allocatie geldmarktfonds", currency: "EUR", amount: -0.85, amountEur: -0.85 }),
    ];
    expect(totalMarginInterestEur(events, fx)).toBeCloseTo(0.85);
  });

  it("doesn't double-count Flatex Interest Income (that's income side)", () => {
    const events = [
      ev({ kind: "other", description: "Flatex Interest Income", currency: "EUR", amount: 1.20, amountEur: 1.20 }),
    ];
    expect(totalMarginInterestEur(events, fx)).toBe(0);
  });
});

describe("estimatedAutoFxFromVolume", () => {
  it("0.25% of summed FX EUR volume", () => {
    const events = [
      ev({ kind: "fx", description: "FX Debit", currency: "EUR", amount: -846.11 }),
      ev({ kind: "fx", description: "FX Debit", currency: "EUR", amount: -990.14 }),
    ];
    expect(estimatedAutoFxFromVolume(events)).toBeCloseTo((846.11 + 990.14) * 0.0025, 4);
  });

  it("ignores non-FX events", () => {
    const events = [
      ev({ kind: "fee", description: "x", currency: "EUR", amount: -3.9 }),
    ];
    expect(estimatedAutoFxFromVolume(events)).toBe(0);
  });
});

describe("totalCostsEur with implicit AutoFX", () => {
  it("adds 0.25% × FX volume when explicit autoFxFeeEur is 0", () => {
    const events = [
      ev({ kind: "fx", description: "FX Debit", currency: "EUR", amount: -1000 }),
      ev({ kind: "fee", description: "x", currency: "EUR", amount: -3.9, amountEur: -3.9 }),
    ];
    const costs = totalCostsEur(events, [], fx, true);
    // 3.9 broker fee + 1000 × 0.0025 = 3.9 + 2.5 = 6.4
    expect(costs).toBeCloseTo(6.4, 3);
  });

  it("omits implicit autoFx when includeImplicitAutoFx=false", () => {
    const events = [
      ev({ kind: "fx", description: "FX Debit", currency: "EUR", amount: -1000 }),
      ev({ kind: "fee", description: "x", currency: "EUR", amount: -3.9, amountEur: -3.9 }),
    ];
    const costs = totalCostsEur(events, [], fx, false);
    expect(costs).toBeCloseTo(3.9, 3);
  });
});

describe("cashBalancesByCurrency", () => {
  it("returns latest balance per currency", () => {
    const events = [
      ev({ date: "2026-01-01", balanceCurrency: "EUR", balance: 100 }),
      ev({ date: "2026-06-01", balanceCurrency: "EUR", balance: 157.80 }),
      ev({ date: "2026-03-01", balanceCurrency: "USD", balance: 0 }),
      ev({ date: "2026-06-01", balanceCurrency: "USD", balance: 42.50 }),
    ];
    const bal = cashBalancesByCurrency(events);
    expect(bal.EUR).toBeCloseTo(157.80);
    expect(bal.USD).toBeCloseTo(42.50);
  });
});

describe("totalCashEur (multi-currency sum)", () => {
  it("sums EUR + USD-converted", () => {
    const events = [
      ev({ date: "2026-06-01", balanceCurrency: "EUR", balance: 100 }),
      ev({ date: "2026-06-01", balanceCurrency: "USD", balance: 100 }),
    ];
    expect(totalCashEur(events, fx)).toBeCloseTo(100 + 100 * 0.866, 2);
  });
});

describe("totalDividendsEur (existing behaviour holds)", () => {
  it("groups dividends by ISIN with FX conversion", () => {
    const events = [
      ev({ kind: "dividend", isin: "X1", currency: "USD", amount: 4.62 }),
      ev({ kind: "dividend", isin: "X1", currency: "USD", amount: 4.62 }),
      ev({ kind: "dividend", isin: "X2", currency: "EUR", amount: 10 }),
    ];
    const divs = totalDividendsEur(events, fx);
    expect(divs.X1).toBeCloseTo(2 * 4.62 * 0.866, 3);
    expect(divs.X2).toBeCloseTo(10);
  });
});

describe("totalOtherIncomeEur ignores negative rows", () => {
  it("only counts positive rebate/interest/promotion lines", () => {
    const events = [
      ev({ kind: "other", description: "DEGIRO Rebate Promotion", currency: "EUR", amount: 6.9 }),
      ev({ kind: "other", description: "Flatex Interest Income", currency: "EUR", amount: 0.5 }),
      ev({ kind: "other", description: "DEGIRO Debit Interest", currency: "EUR", amount: -1.20 }),
    ];
    expect(totalOtherIncomeEur(events, fx)).toBeCloseTo(7.4);
  });
});

describe("totalFeesEur netting", () => {
  it("nets fee reversals", () => {
    const events = [
      ev({ kind: "fee", description: "DEGIRO fee", currency: "EUR", amount: -3.9, amountEur: -3.9 }),
      ev({ kind: "fee", description: "DEGIRO fee reversal", currency: "EUR", amount: 3.9, amountEur: 3.9 }),
    ];
    expect(totalFeesEur(events)).toBe(0);
  });
});

describe("totalTaxesEur nets dividend tax reversals", () => {
  it("nets reversals (USD)", () => {
    const events = [
      ev({ kind: "dividend_tax", description: "Dividend Tax", currency: "USD", amount: -0.69 }),
      ev({ kind: "dividend_tax", description: "Dividend Tax", currency: "USD", amount: 0.69 }),
      ev({ kind: "dividend_tax", description: "Dividend Tax", currency: "USD", amount: -0.69 }),
    ];
    expect(totalTaxesEur(events, fx)).toBeCloseTo(0.69 * 0.866, 3);
  });
});
