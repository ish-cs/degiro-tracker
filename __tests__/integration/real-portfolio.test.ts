// Real-portfolio regression suite.
//
// Ground truth pinned against Simple Portfolio (the established tracker
// the user cross-validated against) and the raw DEGIRO Account.csv
// balance row. Tolerances reflect FX timing differences between brokers
// — NOT bugs.
//
// The fixture is a real DEGIRO Account.csv with order IDs replaced by
// stable synthetic IDs (same UUID → same synthetic) so order_id joins
// still resolve.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseAccountCsv, extractTxsFromAccount } from "@/lib/parsers/account";
import { currentPositions } from "@/lib/portfolio/positions";
import { computeReturns } from "@/lib/portfolio/returns";
import {
  totalFeesEur,
  totalAutoFxFeesEur,
  totalTaxesEur,
  totalCostsEur,
  totalDividendsEur,
  cashBalanceEur,
  totalOtherIncomeEur,
} from "@/lib/portfolio/cost-ratio";
import { isinToTicker } from "@/lib/portfolio/isin-to-ticker";
import { xirr } from "@/lib/portfolio/xirr";
import type { Tx, CashEvent, Position } from "@/lib/types";

const fixturePath = (name: string) =>
  path.resolve(__dirname, "../../fixtures", name);

// Pinned FX so the suite is deterministic. Roughly EUR/USD on 2026-06-11.
const FX = { USDEUR: 0.866 };
const fxLookup = (_iso: string, ccy: string) =>
  ccy === "EUR" ? 1 : ccy === "USD" ? FX.USDEUR : 0;

let events: CashEvent[];
let txs: Tx[];
let positions: Position[];

beforeAll(() => {
  events = parseAccountCsv(
    readFileSync(fixturePath("Account.real-degiro.csv"), "utf-8"),
  );
  txs = extractTxsFromAccount(events);
  positions = currentPositions(txs);
});

describe("Account.csv parsing", () => {
  it("captures per-event currency (not all events are EUR)", () => {
    const hasUsd = events.some((e) => e.currency === "USD");
    const hasEur = events.some((e) => e.currency === "EUR");
    expect(hasUsd).toBe(true);
    expect(hasEur).toBe(true);
  });

  it("normalizes DD-MM-YYYY → ISO", () => {
    expect(events[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("extracts dividend, dividend_tax, fee, buy event kinds", () => {
    const kinds = new Set(events.map((e) => e.kind));
    for (const k of ["dividend", "dividend_tax", "fee", "buy"]) {
      expect(kinds.has(k as CashEvent["kind"])).toBe(true);
    }
  });
});

describe("Tx extraction from Account.csv alone", () => {
  it("extracts exactly 8 buys", () => {
    expect(txs).toHaveLength(8);
  });

  it("EUR buys: valueEur from buy event direct (GOOGL 15 sh @ €259.95)", () => {
    const dec16 = txs.find((t) => t.date === "2025-12-16")!;
    expect(dec16.isin).toBe("US02079K3059");
    expect(dec16.localCurrency).toBe("EUR");
    expect(dec16.valueEur).toBeCloseTo(3899.25, 2);
    expect(dec16.brokerFeeEur).toBeCloseTo(3.9, 2);
  });

  it("USD buys: valueEur from FX Debit (CEG €846.11 — includes AutoFX spread)", () => {
    const ceg = txs.find((t) => t.isin === "US21037T1097")!;
    expect(ceg.localCurrency).toBe("USD");
    expect(ceg.valueEur).toBeCloseTo(846.11, 2);
    expect(ceg.brokerFeeEur).toBeCloseTo(2.0, 2);
  });

  it("USD buys: VST €990.14 + €2 broker (total €992.14)", () => {
    const vst = txs.find((t) => t.isin === "US92840M1027")!;
    expect(vst.valueEur).toBeCloseTo(990.14, 2);
    expect(vst.brokerFeeEur).toBeCloseTo(2.0, 2);
  });
});

describe("positions (matches Simple Portfolio)", () => {
  // bep = net cash invested per share in EUR (fees excluded) —
  // matches Simple's "Net Cash Invested per share" column.
  const expectedHoldings = [
    { isin: "US02079K3059", qty: 30, bep: 265.905, bepWithFees: 266.555, simpleBep: 265.90, name: /Alphabet/i },
    { isin: "IE00BWBXM948", qty: 15, bep: 133.34,  bepWithFees: 133.54,  simpleBep: 133.34, name: /SPDR|StSt/i },
    { isin: "US92840M1027", qty: 7,  bep: 141.45,  bepWithFees: 141.73,  simpleBep: 141.03, name: /Vistra/i },
    { isin: "US21037T1097", qty: 4,  bep: 211.53,  bepWithFees: 212.03,  simpleBep: 211.46, name: /Constellation/i },
  ];

  it("returns exactly 4 open positions", () => {
    expect(positions).toHaveLength(4);
  });

  for (const exp of expectedHoldings) {
    it(`${exp.isin} → qty ${exp.qty}, BEP €${exp.bep}/sh (Simple: €${exp.simpleBep})`, () => {
      const p = positions.find((x) => x.isin === exp.isin)!;
      expect(p).toBeDefined();
      expect(p.quantity).toBe(exp.qty);
      expect(p.product).toMatch(exp.name);
      expect(p.bep).toBeCloseTo(exp.bep, 2);
      expect(p.costBasisEur / p.quantity).toBeCloseTo(exp.bepWithFees, 2);
      // Within €0.60 of Simple Portfolio (FX-convention drift between brokers)
      expect(Math.abs(p.bep - exp.simpleBep)).toBeLessThan(0.6);
    });
  }

  it("total cost basis ≈ €11,840 (sum of all buys + fees)", () => {
    const total = positions.reduce((s, p) => s + p.costBasisEur, 0);
    expect(total).toBeGreaterThan(11_800);
    expect(total).toBeLessThan(11_900);
  });
});

describe("cash, income, cost (matches DEGIRO statement + Simple Portfolio)", () => {
  it("cash balance = €157.80 (latest EUR balance from broker)", () => {
    expect(cashBalanceEur(events)).toBeCloseTo(157.8, 2);
  });

  it("brokerage fees = €39 (8 transaction fees + 5 connection fees)", () => {
    expect(totalFeesEur(events)).toBeCloseTo(39, 2);
  });

  it("AutoFX = €0 in Account-only mode (baked into cost basis already)", () => {
    expect(totalAutoFxFeesEur(txs)).toBeCloseTo(0, 2);
  });

  it("dividend tax converts USD → EUR at pinned FX", () => {
    const tax = totalTaxesEur(events, fxLookup);
    // $0.69 net × 0.866 ≈ €0.60
    expect(tax).toBeCloseTo(0.69 * FX.USDEUR, 2);
  });

  it("gross dividends per ISIN (no tax netting); USD → EUR converted", () => {
    const divs = totalDividendsEur(events, fxLookup);
    // $4.62 net gross × 0.866 ≈ €4.00
    const total = Object.values(divs).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(4.62 * FX.USDEUR, 2);
  });

  it("DEGIRO Rebate Promotion = €6.90 other income", () => {
    expect(totalOtherIncomeEur(events, fxLookup)).toBeCloseTo(6.9, 2);
  });

  it("total income (gross dividends + rebate) ≈ €10.90 (Simple shows €10.91)", () => {
    const divs = totalDividendsEur(events, fxLookup);
    const total =
      Object.values(divs).reduce((s, v) => s + v, 0) +
      totalOtherIncomeEur(events, fxLookup);
    expect(total).toBeGreaterThan(10);
    expect(total).toBeLessThan(11.5);
    expect(Math.abs(total - 10.91)).toBeLessThan(1);
  });

  it("total costs (brokerage + tax, autofx baked-in) ≈ €39.60", () => {
    const costs = totalCostsEur(events, txs, fxLookup, false);
    expect(costs).toBeCloseTo(39 + 0.69 * FX.USDEUR, 2);
  });
});

describe("ticker routing by currency", () => {
  it("GOOGL bought in EUR → ABEA.DE (Tradegate / Xetra)", () => {
    expect(isinToTicker("US02079K3059", "EUR", "Alphabet Inc Class A")).toBe("ABEA.DE");
  });

  it("GOOGL bought in USD → GOOGL (NASDAQ)", () => {
    expect(isinToTicker("US02079K3059", "USD", "Alphabet Inc Class A")).toBe("GOOGL");
  });

  it("STST SPDR (EUR) → ZPDT.DE", () => {
    expect(isinToTicker("IE00BWBXM948", "EUR", "STST SPDR")).toBe("ZPDT.DE");
  });

  it("CEG (USD) → CEG", () => {
    expect(isinToTicker("US21037T1097", "USD", "Constellation Energy")).toBe("CEG");
  });

  it("VST (USD) → VST", () => {
    expect(isinToTicker("US92840M1027", "USD", "Vistra")).toBe("VST");
  });
});

describe("returns (deterministic snapshot)", () => {
  const mockPrices = {
    US02079K3059: { priceEur: 310.55, currency: "EUR" },  // ABEA.DE
    IE00BWBXM948: { priceEur: 153.04, currency: "EUR" },  // ZPDT.DE
    US92840M1027: { priceEur: 120.04, currency: "USD" },  // VST × FX
    US21037T1097: { priceEur: 210.12, currency: "USD" },  // CEG × FX
  };

  it("computeReturns produces internally consistent numbers", () => {
    const divs = totalDividendsEur(events, fxLookup);
    const costs = totalCostsEur(events, txs, fxLookup, false);
    const other = totalOtherIncomeEur(events, fxLookup);
    const fxFn = (_iso: string, ccy: string) =>
      ccy === "EUR" ? 1 : ccy === "USD" ? FX.USDEUR : 0;
    const r = computeReturns(
      positions, divs, mockPrices, costs, other, txs, events, fxFn, "2026-06-11",
    );

    const expectedValue =
      30 * 310.55 + 15 * 153.04 + 7 * 120.04 + 4 * 210.12;
    expect(r.currentValueEur).toBeCloseTo(expectedValue, 1);

    const expectedSimple =
      (r.currentValueEur + r.incomeReturnEur - r.costBasisEur) /
      r.costBasisEur;
    expect(r.totalReturnPctSimple).toBeCloseTo(expectedSimple, 4);
    // XIRR annualizes — on a portfolio held <1 year that's been profitable,
    // the annualized rate will be HIGHER than the cumulative simple rate.
    expect(r.totalReturnPct).toBeGreaterThan(r.totalReturnPctSimple);
    expect(r.totalReturnPct).toBeLessThan(2); // sanity: under 200% annualized
  });

  it("cost ratio is negative", () => {
    const costs = totalCostsEur(events, txs, fxLookup, false);
    const r = computeReturns(positions, {}, mockPrices, costs, 0, txs, events);
    expect(r.costRatioPct).toBeCloseTo(-costs / r.costBasisEur, 6);
    expect(r.costRatioPct).toBeLessThan(0);
  });
});

describe("XIRR sanity", () => {
  it("matches simple 10% annual", () => {
    const r = xirr([
      { dateIso: "2025-01-01", amount: -1000 },
      { dateIso: "2026-01-01", amount: 1100 },
    ]);
    expect(r).toBeCloseTo(0.1, 4);
  });

  it("returns null when no sign change in flows", () => {
    expect(xirr([
      { dateIso: "2025-01-01", amount: -100 },
      { dateIso: "2026-01-01", amount: -100 },
    ])).toBeNull();
  });
});
