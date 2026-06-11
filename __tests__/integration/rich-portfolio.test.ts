// Pinning test against a hand-crafted comprehensive fixture exercising every
// code path: buys + sells (partial close), multi-currency (EUR + USD), AutoFX
// pair via FX Credit/Debit, dividend + tax + reversal (net to 1 of each),
// stock split (4-for-1 mid-period), margin interest charge, broker rebate,
// multi-currency cash balance.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseAccountCsv, extractTxsFromAccount } from "@/lib/parsers/account";
import { currentPositions } from "@/lib/portfolio/positions";
import { extractSplits } from "@/lib/portfolio/splits";
import { buildHistoricalFx, makeFxLookup } from "@/lib/portfolio/historical-fx";
import {
  totalFeesEur, totalTaxesEur, totalDividendsEur, totalOtherIncomeEur,
  totalMarginInterestEur, estimatedAutoFxFromVolume, totalCostsEur,
  cashBalancesByCurrency, totalCashEur,
} from "@/lib/portfolio/cost-ratio";
import { computeReturns } from "@/lib/portfolio/returns";
import { findUnrecognizedEvents } from "@/lib/portfolio/unrecognized";
import { xirr } from "@/lib/portfolio/xirr";
import { buildPortfolioCashflows } from "@/lib/portfolio/cashflows";
import type { CashEvent, Tx, Position, Split } from "@/lib/types";

let events: CashEvent[];
let txs: Tx[];
let splits: Split[];
let positions: Position[];
const fxLookup = makeFxLookup({}, { USD: 1 / 1.10 });

beforeAll(() => {
  events = parseAccountCsv(
    readFileSync(path.resolve(__dirname, "../../fixtures/Account.rich.csv"), "utf-8"),
  );
  txs = extractTxsFromAccount(events);
  splits = extractSplits(events);
  positions = currentPositions(txs, splits);
});

describe("rich-fixture parsing", () => {
  it("captures both USD and EUR currencies", () => {
    expect(events.some((e) => e.currency === "USD")).toBe(true);
    expect(events.some((e) => e.currency === "EUR")).toBe(true);
  });

  it("classifies stock split events", () => {
    expect(events.some((e) => e.kind === "split")).toBe(true);
  });

  it("classifies dividend + dividend_tax + their reversals", () => {
    expect(events.filter((e) => e.kind === "dividend")).toHaveLength(3); // +20, -20, +20
    expect(events.filter((e) => e.kind === "dividend_tax")).toHaveLength(3); // -3, +3, -3
  });

  it("extracts both buys + sell (3 trades total)", () => {
    expect(txs).toHaveLength(3);
    expect(txs.filter((t) => t.quantity > 0)).toHaveLength(2);
    expect(txs.filter((t) => t.quantity < 0)).toHaveLength(1);
  });
});

describe("rich-fixture positions (split + partial sell)", () => {
  it("AAPL: 100 buys → 4-for-1 split → 400 → sell 100 → 300 shares", () => {
    const a = positions.find((p) => p.isin === "US0378331005");
    expect(a).toBeDefined();
    expect(a!.quantity).toBe(300);
  });

  it("AAPL BEP per share ≈ €34.09 (post-split, post-partial-sell)", () => {
    const a = positions.find((p) => p.isin === "US0378331005")!;
    // Net cash: 13636.36 buy − (13636.36/400)*100 sell = 10227.27 ÷ 300 = 34.09
    expect(a.bep).toBeCloseTo(34.09, 2);
  });

  it("AAPL cost basis includes broker fees (=€10,228.77)", () => {
    const a = positions.find((p) => p.isin === "US0378331005")!;
    // 13638.36 buy with fee − (13638.36/400)*100 = 10228.77
    expect(a.costBasisEur).toBeCloseTo(10228.77, 1);
  });

  it("ASML: 5 shares @ €800, cost basis €4003 with €3 fee", () => {
    const asml = positions.find((p) => p.isin === "NL0010273215")!;
    expect(asml.quantity).toBe(5);
    expect(asml.bep).toBeCloseTo(800);
    expect(asml.costBasisEur).toBeCloseTo(4003);
  });
});

describe("rich-fixture income & costs", () => {
  it("gross dividends: net $20 × FX = ~€18.18", () => {
    const divs = totalDividendsEur(events, fxLookup);
    const total = Object.values(divs).reduce((s, v) => s + v, 0);
    // $20 × (1/1.10) ≈ €18.18
    expect(total).toBeCloseTo(20 / 1.10, 1);
  });

  it("dividend tax (after reversals net): $3 × FX = ~€2.73", () => {
    expect(totalTaxesEur(events, fxLookup)).toBeCloseTo(3 / 1.10, 1);
  });

  it("broker fees = €7 (2 buy + 3 buy + 2 sell)", () => {
    expect(totalFeesEur(events)).toBeCloseTo(7);
  });

  it("margin interest = €2.50 (DEGIRO Debit Interest)", () => {
    expect(totalMarginInterestEur(events, fxLookup)).toBeCloseTo(2.50);
  });

  it("rebate income = €10 (DEGIRO Rebate Promotion)", () => {
    expect(totalOtherIncomeEur(events, fxLookup)).toBeCloseTo(10);
  });

  it("AutoFX estimate ≈ 0.25% × (13636.36 + 3636.36) FX vol", () => {
    const expected = (13636.36 + 3636.36) * 0.0025;
    expect(estimatedAutoFxFromVolume(events)).toBeCloseTo(expected, 1);
  });

  it("total costs (with implicit AutoFX) ≈ €55.4", () => {
    const costs = totalCostsEur(events, txs, fxLookup, true);
    // 7 broker + 2.73 tax + 2.50 margin + 43.18 autofx ≈ 55.41
    expect(costs).toBeGreaterThan(50);
    expect(costs).toBeLessThan(60);
  });
});

describe("rich-fixture multi-currency cash", () => {
  it("EUR + USD cash balances both present", () => {
    const bal = cashBalancesByCurrency(events);
    expect(bal.EUR).toBeGreaterThan(9000);
    expect(bal.EUR).toBeLessThan(10500);
    expect(bal.USD).toBeCloseTo(14, 1);
  });

  it("totalCashEur sums both EUR + USD-converted", () => {
    const bal = cashBalancesByCurrency(events);
    const total = totalCashEur(events, fxLookup);
    // EUR balance + USD/1.10 conversion
    expect(total).toBeCloseTo(bal.EUR + bal.USD / 1.10, 1);
  });
});

describe("rich-fixture XIRR cashflows", () => {
  it("builds non-empty cashflows mixing buys, sells, divs, taxes, rebate", () => {
    const flows = buildPortfolioCashflows(events, txs, 15000, "2026-06-11", fxLookup);
    // 2 buys (−) + 1 sell (+) + 3 divs + 3 taxes + 1 margin + 1 rebate + terminal
    expect(flows.length).toBeGreaterThan(5);
    expect(flows.some((f) => f.amount < 0)).toBe(true);
    expect(flows.some((f) => f.amount > 0)).toBe(true);
  });

  it("XIRR converges on a synthetic profitable portfolio", () => {
    // Mock current value of remaining positions
    const mockValue = 300 * 50 + 5 * 900; // €19,500
    const flows = buildPortfolioCashflows(events, txs, mockValue, "2026-06-11", fxLookup);
    const rate = xirr(flows);
    expect(rate).not.toBeNull();
    expect(rate!).toBeGreaterThan(0); // profitable
    expect(rate!).toBeLessThan(2); // sane
  });
});

describe("rich-fixture computeReturns end-to-end", () => {
  const mockPrices = {
    US0378331005: { priceEur: 45, currency: "EUR" },  // 300 × €45 = €13,500
    NL0010273215: { priceEur: 900, currency: "EUR" }, // 5 × €900 = €4,500
  };

  it("produces XIRR, simple-cost-basis, cost-ratio all consistent", () => {
    const divs = totalDividendsEur(events, fxLookup);
    const costs = totalCostsEur(events, txs, fxLookup, true);
    const other = totalOtherIncomeEur(events, fxLookup);
    const r = computeReturns(
      positions, divs, mockPrices, costs, other, txs, events, fxLookup, "2026-06-11",
    );
    expect(r.currentValueEur).toBeCloseTo(300 * 45 + 5 * 900, 1);
    expect(r.totalReturnPctSimple).toBeGreaterThan(0); // profitable
    expect(r.costRatioPct).toBeLessThan(0); // cost reduces return
    expect(Number.isFinite(r.totalReturnPct)).toBe(true);
  });
});

describe("rich-fixture unrecognized events", () => {
  it("no unrecognized events (everything handled cleanly)", () => {
    const unhandled = findUnrecognizedEvents(events);
    expect(unhandled).toEqual([]);
  });
});
