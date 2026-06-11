import { describe, it, expect } from "vitest";
import { extractTxsFromAccount } from "@/lib/parsers/account";
import type { CashEvent } from "@/lib/types";

const mk = (over: Partial<CashEvent>): CashEvent => ({
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

describe("extractTxsFromAccount", () => {
  it("extracts a buy + fee from an EUR order group", () => {
    const events = [
      mk({
        date: "2026-01-09",
        kind: "buy",
        description: "Buy 3 Alphabet Inc Class A@281.1 EUR (US02079K3059)",
        currency: "EUR", amount: -843.30,
        orderId: "ord-1",
      }),
      mk({
        date: "2026-01-09",
        kind: "fee",
        description: "DEGIRO Transaction and/or third party fees",
        currency: "EUR", amount: -3.9,
        orderId: "ord-1",
      }),
    ];
    const txs = extractTxsFromAccount(events);
    expect(txs).toHaveLength(1);
    expect(txs[0].quantity).toBe(3);
    expect(txs[0].localCurrency).toBe("EUR");
    expect(txs[0].valueEur).toBeCloseTo(843.3, 2);
    expect(txs[0].brokerFeeEur).toBeCloseTo(3.9, 2);
  });

  it("extracts a USD buy by reading the FX Debit EUR row", () => {
    const events = [
      mk({
        date: "2026-06-10", orderId: "ord-2",
        kind: "fx",
        description: "FX Credit",
        currency: "USD", amount: 976.00,
      }),
      mk({
        date: "2026-06-10", orderId: "ord-2",
        kind: "fx",
        description: "FX Debit",
        currency: "EUR", amount: -846.11,
      }),
      mk({
        date: "2026-06-10", orderId: "ord-2",
        kind: "buy",
        description: "Buy 4 Constellation Energy Corp@244 USD (US21037T1097)",
        currency: "USD", amount: -976.00,
      }),
      mk({
        date: "2026-06-10", orderId: "ord-2",
        kind: "fee",
        description: "DEGIRO Transaction and/or third party fees",
        currency: "EUR", amount: -2.00,
      }),
    ];
    const txs = extractTxsFromAccount(events);
    expect(txs).toHaveLength(1);
    expect(txs[0].quantity).toBe(4);
    expect(txs[0].localCurrency).toBe("USD");
    expect(txs[0].valueEur).toBeCloseTo(846.11, 2);
    expect(txs[0].brokerFeeEur).toBeCloseTo(2.0, 2);
  });

  it("extracts a sell as a negative quantity (EUR)", () => {
    const events = [
      mk({
        date: "2026-02-15",
        kind: "sell",
        description: "Sell 2 Alphabet Inc Class A@290 EUR (US02079K3059)",
        currency: "EUR", amount: 580.00,
        orderId: "ord-3",
      }),
      mk({
        date: "2026-02-15",
        kind: "fee",
        description: "DEGIRO Transaction and/or third party fees",
        currency: "EUR", amount: -3.9,
        orderId: "ord-3",
      }),
    ];
    const txs = extractTxsFromAccount(events);
    expect(txs).toHaveLength(1);
    expect(txs[0].quantity).toBe(-2);
    expect(txs[0].valueEur).toBeCloseTo(580, 2);
  });

  it("extracts a USD sell using FX Credit (EUR) row", () => {
    const events = [
      mk({
        date: "2026-02-15", orderId: "ord-4",
        kind: "fx", description: "FX Debit", currency: "USD", amount: -580.00,
      }),
      mk({
        date: "2026-02-15", orderId: "ord-4",
        kind: "fx", description: "FX Credit", currency: "EUR", amount: 502.00,
      }),
      mk({
        date: "2026-02-15", orderId: "ord-4",
        kind: "sell",
        description: "Sell 2 Vistra Corp@290 USD (US92840M1027)",
        currency: "USD", amount: 580.00,
      }),
      mk({
        date: "2026-02-15", orderId: "ord-4",
        kind: "fee", description: "Tx fees", currency: "EUR", amount: -2.0,
      }),
    ];
    const txs = extractTxsFromAccount(events);
    expect(txs).toHaveLength(1);
    expect(txs[0].quantity).toBe(-2);
    expect(txs[0].valueEur).toBeCloseTo(502, 2);
  });

  it("ignores orders without buy/sell events", () => {
    const events = [
      mk({ orderId: "ord-x", kind: "fee", description: "lonely fee", currency: "EUR", amount: -1 }),
    ];
    expect(extractTxsFromAccount(events)).toHaveLength(0);
  });

  it("ignores buy events with malformed descriptions", () => {
    const events = [
      mk({ orderId: "ord-y", kind: "buy", description: "Buy something unusable", currency: "EUR", amount: -100 }),
    ];
    expect(extractTxsFromAccount(events)).toHaveLength(0);
  });
});
