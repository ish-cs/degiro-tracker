# DEGIRO Portfolio Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page client-side web app that ingests DEGIRO Transactions.csv + Account.csv, computes positions / returns / cost-ratio / historical value, and renders a Liquid-Glass-minimal dashboard with a chart that supports time-range tabs and benchmark overlay.

**Architecture:** Next.js 16 App Router. All CSV parsing, position math, and return math runs client-side. Three Next API routes proxy Yahoo Finance (live price, daily history, FX) with in-memory caching. Persistence is `localStorage` only — no auth, no DB. UI is composed from a small set of reusable `GlassCard`-based primitives.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS, Papa Parse, visx, date-fns, Vitest, Playwright, Vercel.

---

## File Structure (locked in before tasks)

```
~/_Projects/degiro-tracker/
  app/
    layout.tsx                       — root layout, dark theme, mesh bg
    page.tsx                         — dashboard (client component)
    globals.css                      — Tailwind + Liquid Glass tokens
    api/
      price/route.ts                 — GET ?symbols=CEG,VST → { CEG: {price, currency}, ... }
      history/route.ts               — GET ?symbol=CEG&range=5y → { ts:number[], close:number[] }
      fx/route.ts                    — GET ?pair=USDEUR → { rate, ts }
  lib/
    types.ts                         — Tx, CashEvent, Position, ValuePoint, Returns, BenchmarkSeries
    parsers/
      transactions.ts                — parseTransactionsCsv(text): Tx[]
      account.ts                     — parseAccountCsv(text): CashEvent[]
    portfolio/
      positions.ts                   — currentPositions(txs): Position[]
      positions-at-date.ts           — qtyAtDate(txs, isin, date): number
      value-series.ts                — valueSeries(txs, cashEvents, histByIsin, fx, range): ValuePoint[]
      returns.ts                     — computeReturns(positions, dividendsByIsin, prices): Returns
      cost-ratio.ts                  — costRatio(cashEvents, costBasis): number
      isin-to-ticker.ts              — staticMap + overrideFromLocalStorage
    api-clients/
      yahoo.ts                       — server-only fetch helpers
  components/
    GlassCard.tsx
    Dropzone.tsx
    KPIRow.tsx
    Chart.tsx
    TimeRangeTabs.tsx
    BenchmarkSelector.tsx
    Holdings.tsx
    AllocationDonut.tsx
    EmptyState.tsx
  __tests__/
    parsers/transactions.test.ts
    parsers/account.test.ts
    portfolio/positions.test.ts
    portfolio/returns.test.ts
    portfolio/value-series.test.ts
    e2e/upload.spec.ts                — Playwright
  fixtures/
    Transactions.sample.csv
    Account.sample.csv
  package.json
  tsconfig.json
  tailwind.config.ts
  next.config.ts
  vitest.config.ts
  playwright.config.ts
  .gitignore
  README.md
  docs/superpowers/
    specs/2026-06-10-degiro-tracker-design.md
    plans/2026-06-10-degiro-tracker.md
```

---

## PHASE 1 — Foundation (Tasks 1–14)

Goal of Phase 1: User can drop both CSVs → see live positions + KPIs + holdings table. No chart yet.

### Task 1: Scaffold Next.js 16 + deps

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `.gitignore`

- [ ] **Step 1: Scaffold w/ create-next-app**

```bash
cd ~/_Projects/degiro-tracker
npx --yes create-next-app@latest . --typescript --tailwind --app --eslint --src-dir=false --import-alias="@/*" --use-npm --no-turbopack --no-install
```

When prompted to overwrite existing files: yes (the docs/ tree was already there; create-next-app may ask).

- [ ] **Step 2: Install runtime deps**

```bash
npm install papaparse date-fns @visx/group @visx/scale @visx/shape @visx/axis @visx/tooltip @visx/responsive @visx/curve
npm install -D @types/papaparse vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @playwright/test
```

- [ ] **Step 3: Verify dev server boots**

```bash
npm run dev
```

Expected: serves on http://localhost:3000 with the default Next 16 starter page.

Kill the server. We replace `app/page.tsx` later.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold next 16 app + deps"
```

---

### Task 2: Liquid Glass tokens + dark mesh bg

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Replace `app/globals.css`**

```css
@import "tailwindcss";

@theme {
  --color-bg-base: oklch(0.18 0.02 240);
  --color-bg-elevated: oklch(0.22 0.025 240);
  --color-glass-fill: oklch(1 0 0 / 0.06);
  --color-glass-border: oklch(1 0 0 / 0.10);
  --color-text-primary: oklch(0.96 0.005 240);
  --color-text-secondary: oklch(0.72 0.015 240);
  --color-text-muted: oklch(0.55 0.02 240);
  --color-accent: oklch(0.78 0.13 200);
  --color-positive: oklch(0.78 0.18 145);
  --color-negative: oklch(0.70 0.22 25);

  --font-display: "SF Pro Display", "Inter", system-ui, sans-serif;
  --font-mono: "SF Mono", "JetBrains Mono", ui-monospace, monospace;
}

html, body {
  background: var(--color-bg-base);
  color: var(--color-text-primary);
  font-family: var(--font-display);
  -webkit-font-smoothing: antialiased;
  font-feature-settings: "tnum" 1, "ss01" 1;
}

body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(circle at 15% 20%, oklch(0.45 0.15 200 / 0.35), transparent 50%),
    radial-gradient(circle at 85% 60%, oklch(0.40 0.18 280 / 0.30), transparent 55%),
    radial-gradient(circle at 50% 90%, oklch(0.45 0.15 160 / 0.25), transparent 50%);
  filter: blur(60px);
}

.glass {
  background: var(--color-glass-fill);
  border: 1px solid var(--color-glass-border);
  backdrop-filter: blur(20px) saturate(140%);
  border-radius: 1rem;
  box-shadow:
    0 1px 0 oklch(1 0 0 / 0.08) inset,
    0 20px 40px -20px oklch(0 0 0 / 0.40);
}

.tabular { font-variant-numeric: tabular-nums; }
.mono { font-family: var(--font-mono); }
```

- [ ] **Step 2: Replace `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DEGIRO Tracker",
  description: "Drop your DEGIRO CSVs, see your portfolio.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Smoke test**

```bash
npm run dev
```

Expected: dark page w/ mesh gradient. Kill server.

- [ ] **Step 4: Commit**

```bash
git add app/ tailwind.config.ts
git commit -m "feat(ui): liquid glass tokens + dark mesh background"
```

---

### Task 3: Types module

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: Write `lib/types.ts`**

```ts
export type Currency = "EUR" | "USD" | "GBP" | "CHF" | "JPY";

export type Tx = {
  date: string;          // ISO yyyy-mm-dd
  time: string;          // HH:mm
  product: string;
  isin: string;
  exchange: string;      // DEGIRO exchange code: NDQ, NSY, XET, ...
  quantity: number;      // positive=buy, negative=sell
  price: number;         // local-currency unit price
  localCurrency: Currency;
  valueLocal: number;
  valueEur: number;
  fxRate: number | null; // null if same currency
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
  date: string;          // ISO yyyy-mm-dd
  product: string;
  isin: string | null;
  description: string;
  kind: CashEventKind;
  amountEur: number;     // signed
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
  bep: number;           // weighted average cost in local currency
  costBasisEur: number;
};

export type Price = {
  symbol: string;
  price: number;
  currency: Currency;
  asOf: number;          // unix seconds
};

export type ValuePoint = {
  t: number;             // unix seconds
  valueEur: number;
  costBasisEur: number;
  plEur: number;
};

export type Returns = {
  costBasisEur: number;
  currentValueEur: number;
  priceReturnEur: number;
  priceReturnPct: number;
  incomeReturnEur: number;    // dividends net of withholding
  incomeReturnPct: number;
  totalReturnEur: number;
  totalReturnPct: number;
  costRatioPct: number;       // fees / cost basis
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): shared portfolio types"
```

---

### Task 4: Transactions.csv parser (TDD)

**Files:**
- Create: `__tests__/parsers/transactions.test.ts`
- Create: `lib/parsers/transactions.ts`
- Create: `fixtures/Transactions.sample.csv`
- Create: `vitest.config.ts`

- [ ] **Step 1: Add Vitest config**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

Update `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Add fixture `fixtures/Transactions.sample.csv`**

```csv
Date,Time,Product,ISIN,Reference,Exchange,Quantity,Price,Local value,Value,Exchange rate,Fee,Total,Order ID
10-06-2026,15:31,Constellation Energy Corp,US21037T1097,abc-1,NDQ,4,244.00,-976.00,-846.26,1.1535,-0.50,-846.76,ord-1
05-03-2026,14:02,Vistra Corp,US92840M1027,abc-2,NSY,7,164.08,-1148.56,-1056.34,1.0872,-0.50,-1056.84,ord-2
01-02-2025,09:15,Alphabet Inc Class A,US02079K3059,abc-3,TDG,30,265.91,-7977.30,-7977.30,1.0000,-2.50,-7979.80,ord-3
```

(Dates are DD-MM-YYYY — DEGIRO European format.)

- [ ] **Step 3: Write failing test `__tests__/parsers/transactions.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseTransactionsCsv } from "@/lib/parsers/transactions";

const sample = readFileSync(
  path.resolve(__dirname, "../../fixtures/Transactions.sample.csv"),
  "utf-8"
);

describe("parseTransactionsCsv", () => {
  it("parses three rows", () => {
    const txs = parseTransactionsCsv(sample);
    expect(txs).toHaveLength(3);
  });

  it("normalizes DD-MM-YYYY to ISO", () => {
    const txs = parseTransactionsCsv(sample);
    expect(txs[0].date).toBe("2026-06-10");
    expect(txs[2].date).toBe("2025-02-01");
  });

  it("computes signed quantity (buy positive)", () => {
    const txs = parseTransactionsCsv(sample);
    expect(txs[0].quantity).toBe(4);
    expect(txs[0].isin).toBe("US21037T1097");
  });

  it("parses fx rate as 1.0 for EUR-priced", () => {
    const txs = parseTransactionsCsv(sample);
    expect(txs[2].fxRate).toBe(1.0);
  });

  it("treats fee as positive absolute EUR", () => {
    const txs = parseTransactionsCsv(sample);
    expect(txs[0].feeEur).toBe(0.5);
  });
});
```

- [ ] **Step 4: Run test → expect FAIL**

```bash
npm test -- transactions.test
```

Expected: fail — module not found.

- [ ] **Step 5: Implement `lib/parsers/transactions.ts`**

```ts
import Papa from "papaparse";
import type { Tx, Currency } from "@/lib/types";

const exchangeCurrency: Record<string, Currency> = {
  NDQ: "USD", NSY: "USD", NYS: "USD", ASE: "USD",
  TDG: "EUR", XET: "EUR", EAM: "EUR", EPA: "EUR", MIL: "EUR", MAD: "EUR",
  LSE: "GBP",
  EBS: "CHF",
  TYO: "JPY",
};

const parseEuropeanDate = (raw: string): string => {
  const [dd, mm, yyyy] = raw.split("-");
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
};

const num = (raw: string): number => {
  if (raw === "" || raw == null) return 0;
  return Number(raw.replace(/\s/g, "").replace(",", "."));
};

export function parseTransactionsCsv(text: string): Tx[] {
  const { data } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  return data
    .filter((row) => row["ISIN"] && row["Date"])
    .map((row) => {
      const exchange = (row["Exchange"] ?? "").toUpperCase();
      const localCurrency = exchangeCurrency[exchange] ?? "EUR";
      const qty = num(row["Quantity"]);
      const fxRate = num(row["Exchange rate"]) || 1.0;
      const feeAbs = Math.abs(num(row["Fee"]));

      return {
        date: parseEuropeanDate(row["Date"]),
        time: row["Time"] ?? "",
        product: row["Product"] ?? "",
        isin: row["ISIN"],
        exchange,
        quantity: qty,
        price: num(row["Price"]),
        localCurrency,
        valueLocal: Math.abs(num(row["Local value"])),
        valueEur: Math.abs(num(row["Value"])),
        fxRate,
        feeEur: feeAbs,
        totalEur: num(row["Total"]),
        orderId: row["Order ID"] ?? "",
      } as Tx;
    });
}
```

- [ ] **Step 6: Run test → expect PASS**

```bash
npm test -- transactions.test
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add lib/parsers/transactions.ts __tests__/parsers/transactions.test.ts fixtures/Transactions.sample.csv vitest.config.ts package.json
git commit -m "feat(parsers): transactions csv → typed Tx[]"
```

---

### Task 5: Account.csv parser (TDD)

**Files:**
- Create: `fixtures/Account.sample.csv`
- Create: `__tests__/parsers/account.test.ts`
- Create: `lib/parsers/account.ts`

- [ ] **Step 1: Add fixture `fixtures/Account.sample.csv`**

```csv
Date,Time,Value date,Product,ISIN,Description,FX,Change,Balance,Order ID
10-06-2026,15:31,10-06-2026,Constellation Energy Corp,US21037T1097,Buy 4 CEG@244.00 USD,1.1535,-846.26,158.00,ord-1
01-06-2026,10:00,01-06-2026,Constellation Energy Corp,US21037T1097,Dividend,1.1500,5.40,1005.91,
01-06-2026,10:00,01-06-2026,Constellation Energy Corp,US21037T1097,Dividend Tax,1.1500,-0.81,1000.51,
20-05-2026,09:00,20-05-2026,,,Deposit,,1000.00,1001.32,
01-05-2026,00:00,01-05-2026,,,DEGIRO Connection Fee,,-2.50,1.32,
```

- [ ] **Step 2: Write failing test `__tests__/parsers/account.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseAccountCsv } from "@/lib/parsers/account";

const sample = readFileSync(
  path.resolve(__dirname, "../../fixtures/Account.sample.csv"),
  "utf-8"
);

describe("parseAccountCsv", () => {
  it("parses all rows", () => {
    const events = parseAccountCsv(sample);
    expect(events).toHaveLength(5);
  });

  it("classifies dividend (not tax) as dividend", () => {
    const events = parseAccountCsv(sample);
    const div = events.find((e) => e.kind === "dividend")!;
    expect(div.amountEur).toBeCloseTo(5.4);
  });

  it("classifies dividend tax separately", () => {
    const events = parseAccountCsv(sample);
    const tax = events.find((e) => e.kind === "dividend_tax")!;
    expect(tax.amountEur).toBeCloseTo(-0.81);
  });

  it("classifies deposit", () => {
    const events = parseAccountCsv(sample);
    expect(events.some((e) => e.kind === "deposit" && e.amountEur === 1000)).toBe(true);
  });

  it("classifies fee", () => {
    const events = parseAccountCsv(sample);
    const fee = events.find((e) => e.kind === "fee")!;
    expect(fee.amountEur).toBeCloseTo(-2.5);
  });

  it("classifies buy from description", () => {
    const events = parseAccountCsv(sample);
    expect(events.some((e) => e.kind === "buy")).toBe(true);
  });
});
```

- [ ] **Step 3: Run test → expect FAIL**

```bash
npm test -- account.test
```

- [ ] **Step 4: Implement `lib/parsers/account.ts`**

```ts
import Papa from "papaparse";
import type { CashEvent, CashEventKind } from "@/lib/types";

const parseEuropeanDate = (raw: string): string => {
  const [dd, mm, yyyy] = raw.split("-");
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
};

const num = (raw: string): number => {
  if (!raw) return 0;
  return Number(raw.replace(/\s/g, "").replace(",", "."));
};

function classify(description: string): CashEventKind {
  const d = description.toLowerCase();
  if (d.includes("dividend tax") || d.includes("dividend withholding")) return "dividend_tax";
  if (d.includes("dividend")) return "dividend";
  if (d.includes("deposit") || d.includes("flatex cash sweep transfer")) return "deposit";
  if (d.includes("withdrawal")) return "withdrawal";
  if (d.includes("fee") || d.includes("commission")) return "fee";
  if (/^buy\b/.test(d)) return "buy";
  if (/^sell\b/.test(d)) return "sell";
  if (d.includes("fx")) return "fx";
  return "other";
}

export function parseAccountCsv(text: string): CashEvent[] {
  const { data } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  return data
    .filter((row) => row["Date"] && row["Description"])
    .map((row) => ({
      date: parseEuropeanDate(row["Date"]),
      product: row["Product"] ?? "",
      isin: row["ISIN"] || null,
      description: row["Description"],
      kind: classify(row["Description"]),
      amountEur: num(row["Change"]),
      balanceEur: num(row["Balance"]),
      orderId: row["Order ID"] || null,
    }));
}
```

- [ ] **Step 5: Run test → expect PASS**

```bash
npm test -- account.test
```

- [ ] **Step 6: Commit**

```bash
git add lib/parsers/account.ts __tests__/parsers/account.test.ts fixtures/Account.sample.csv
git commit -m "feat(parsers): account csv → classified CashEvent[]"
```

---

### Task 6: Positions math (TDD)

**Files:**
- Create: `__tests__/portfolio/positions.test.ts`
- Create: `lib/portfolio/positions.ts`
- Create: `lib/portfolio/isin-to-ticker.ts`

- [ ] **Step 1: Write `lib/portfolio/isin-to-ticker.ts`**

```ts
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
```

- [ ] **Step 2: Write failing test `__tests__/portfolio/positions.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { currentPositions } from "@/lib/portfolio/positions";
import type { Tx } from "@/lib/types";

const mk = (over: Partial<Tx>): Tx => ({
  date: "2026-01-01", time: "09:00", product: "X", isin: "X1",
  exchange: "NDQ", quantity: 1, price: 100, localCurrency: "USD",
  valueLocal: 100, valueEur: 92, fxRate: 1.08, feeEur: 0.5,
  totalEur: 92.5, orderId: "o1", ...over,
});

describe("currentPositions", () => {
  it("nets a single buy into one position", () => {
    const positions = currentPositions([mk({ quantity: 4, price: 244, isin: "US21037T1097", product: "Constellation Energy Corp" })]);
    expect(positions).toHaveLength(1);
    expect(positions[0].quantity).toBe(4);
    expect(positions[0].bep).toBeCloseTo(244);
  });

  it("ignores closed positions (qty=0)", () => {
    const positions = currentPositions([
      mk({ isin: "A", quantity: 5, price: 10 }),
      mk({ isin: "A", quantity: -5, price: 12 }),
    ]);
    expect(positions).toHaveLength(0);
  });

  it("weighted average BEP across multiple buys", () => {
    const positions = currentPositions([
      mk({ isin: "A", quantity: 2, price: 100 }),
      mk({ isin: "A", quantity: 3, price: 200 }),
    ]);
    expect(positions[0].quantity).toBe(5);
    expect(positions[0].bep).toBeCloseTo((2*100 + 3*200) / 5);
  });

  it("BEP unchanged by partial sell (uses cost-basis-preserving rule)", () => {
    const positions = currentPositions([
      mk({ isin: "A", quantity: 10, price: 100 }),
      mk({ isin: "A", quantity: -4, price: 150 }),
    ]);
    expect(positions[0].quantity).toBe(6);
    expect(positions[0].bep).toBeCloseTo(100);
  });
});
```

- [ ] **Step 3: Implement `lib/portfolio/positions.ts`**

```ts
import type { Tx, Position, Currency } from "@/lib/types";
import { isinToTicker } from "./isin-to-ticker";

export function currentPositions(txs: Tx[]): Position[] {
  const acc: Record<string, {
    qty: number; costLocal: number; product: string; exchange: string;
    currency: Currency; costBasisEur: number;
  }> = {};

  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));

  for (const tx of sorted) {
    const k = tx.isin;
    if (!acc[k]) {
      acc[k] = { qty: 0, costLocal: 0, product: tx.product, exchange: tx.exchange,
                 currency: tx.localCurrency, costBasisEur: 0 };
    }
    const p = acc[k];
    if (tx.quantity > 0) {
      p.costLocal += tx.quantity * tx.price;
      p.costBasisEur += tx.valueEur + tx.feeEur;
      p.qty += tx.quantity;
    } else {
      const sellQty = Math.abs(tx.quantity);
      if (p.qty > 0) {
        const avgCostLocal = p.costLocal / p.qty;
        const avgCostEur = p.costBasisEur / p.qty;
        p.costLocal -= sellQty * avgCostLocal;
        p.costBasisEur -= sellQty * avgCostEur;
      }
      p.qty -= sellQty;
    }
  }

  return Object.entries(acc)
    .filter(([, v]) => v.qty > 0)
    .map(([isin, v]) => ({
      isin,
      product: v.product,
      exchange: v.exchange,
      yahooSymbol: isinToTicker(isin, v.exchange, v.product),
      currency: v.currency,
      quantity: v.qty,
      bep: v.costLocal / v.qty,
      costBasisEur: v.costBasisEur,
    }));
}
```

- [ ] **Step 4: Run test → expect PASS**

```bash
npm test -- positions.test
```

- [ ] **Step 5: Commit**

```bash
git add lib/portfolio/positions.ts lib/portfolio/isin-to-ticker.ts __tests__/portfolio/positions.test.ts
git commit -m "feat(portfolio): currentPositions + isin→ticker map"
```

---

### Task 7: Yahoo client + /api/price + /api/fx

**Files:**
- Create: `lib/api-clients/yahoo.ts`
- Create: `app/api/price/route.ts`
- Create: `app/api/fx/route.ts`

- [ ] **Step 1: Write `lib/api-clients/yahoo.ts`**

```ts
const cache = new Map<string, { ts: number; data: unknown }>();

async function cachedFetch(url: string, ttlSec: number) {
  const key = url;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.ts < ttlSec * 1000) return hit.data;
  const res = await fetch(url, { headers: { "User-Agent": "degiro-tracker/1.0" } });
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const json = await res.json();
  cache.set(key, { ts: now, data: json });
  return json;
}

export async function quote(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
  const data = (await cachedFetch(url, 60)) as any;
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`no data for ${symbol}`);
  const meta = result.meta;
  return {
    symbol,
    price: meta.regularMarketPrice as number,
    currency: meta.currency as string,
    asOf: meta.regularMarketTime as number,
  };
}

export async function history(symbol: string, range: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
  const data = (await cachedFetch(url, 60 * 60 * 24)) as any;
  const r = data?.chart?.result?.[0];
  if (!r) throw new Error(`no history for ${symbol}`);
  const ts = (r.timestamp ?? []) as number[];
  const close = (r.indicators?.quote?.[0]?.close ?? []) as (number | null)[];
  return ts.map((t, i) => ({ t, close: close[i] })).filter((p) => p.close != null) as { t: number; close: number }[];
}

export async function fx(pair: string) {
  return quote(`${pair}=X`);
}
```

- [ ] **Step 2: Write `app/api/price/route.ts`**

```ts
import { NextResponse } from "next/server";
import { quote } from "@/lib/api-clients/yahoo";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbols = (url.searchParams.get("symbols") ?? "").split(",").filter(Boolean);
  if (symbols.length === 0) return NextResponse.json({ error: "no symbols" }, { status: 400 });
  try {
    const results = await Promise.all(symbols.map(async (s) => [s, await quote(s)] as const));
    return NextResponse.json(Object.fromEntries(results));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
```

- [ ] **Step 3: Write `app/api/fx/route.ts`**

```ts
import { NextResponse } from "next/server";
import { fx } from "@/lib/api-clients/yahoo";

export async function GET(req: Request) {
  const pair = new URL(req.url).searchParams.get("pair") ?? "USDEUR";
  try {
    return NextResponse.json(await fx(pair));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
```

- [ ] **Step 4: Smoke test**

```bash
npm run dev
curl 'http://localhost:3000/api/price?symbols=CEG,VST' | head -c 300
curl 'http://localhost:3000/api/fx?pair=USDEUR' | head -c 200
```

Expected: JSON with `price` and `currency` for each symbol. Kill server.

- [ ] **Step 5: Commit**

```bash
git add lib/api-clients/yahoo.ts app/api/price/route.ts app/api/fx/route.ts
git commit -m "feat(api): yahoo proxy w/ in-memory cache (price + fx)"
```

---

### Task 8: GlassCard primitive + Dropzone

**Files:**
- Create: `components/GlassCard.tsx`
- Create: `components/Dropzone.tsx`

- [ ] **Step 1: Write `components/GlassCard.tsx`**

```tsx
import { cn } from "@/lib/cn";

export function GlassCard({
  children, className, ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("glass p-6", className)} {...rest}>
      {children}
    </div>
  );
}
```

Add `lib/cn.ts`:
```ts
export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
```

- [ ] **Step 2: Write `components/Dropzone.tsx`**

```tsx
"use client";
import { useCallback, useState } from "react";
import { GlassCard } from "./GlassCard";

type Slot = "transactions" | "account";

type Props = {
  onFile: (slot: Slot, text: string) => void;
  status: Record<Slot, "idle" | "ready" | "error">;
};

export function Dropzone({ onFile, status }: Props) {
  const slots: { key: Slot; label: string; hint: string }[] = [
    { key: "transactions", label: "Transactions.csv", hint: "Account → Activity → Export → Transactions" },
    { key: "account", label: "Account.csv",       hint: "Account → Activity → Export → Account" },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {slots.map((s) => (
        <Slot key={s.key} {...s} state={status[s.key]} onFile={(t) => onFile(s.key, t)} />
      ))}
    </div>
  );
}

function Slot({ label, hint, state, onFile }: { label: string; hint: string; state: "idle"|"ready"|"error"; onFile: (t: string)=>void }) {
  const [drag, setDrag] = useState(false);
  const handle = useCallback(async (f: File) => onFile(await f.text()), [onFile]);
  return (
    <GlassCard
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault(); setDrag(false);
        const f = e.dataTransfer.files[0]; if (f) handle(f);
      }}
      className={`relative cursor-pointer transition ${drag ? "ring-2 ring-[var(--color-accent)]" : ""}`}
    >
      <label className="flex flex-col gap-2 cursor-pointer">
        <input type="file" accept=".csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); }} />
        <div className="flex items-center justify-between">
          <span className="text-base font-medium">{label}</span>
          <span className={`text-xs ${state === "ready" ? "text-[var(--color-positive)]" : state === "error" ? "text-[var(--color-negative)]" : "text-[var(--color-text-muted)]"}`}>
            {state === "ready" ? "loaded" : state === "error" ? "error" : "drop or click"}
          </span>
        </div>
        <p className="text-sm text-[var(--color-text-secondary)]">{hint}</p>
      </label>
    </GlassCard>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/GlassCard.tsx components/Dropzone.tsx lib/cn.ts
git commit -m "feat(ui): GlassCard + Dropzone"
```

---

### Task 9: KPIRow + Holdings table

**Files:**
- Create: `components/KPIRow.tsx`
- Create: `components/Holdings.tsx`
- Create: `lib/format.ts`

- [ ] **Step 1: Add `lib/format.ts`**

```ts
const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("en-IE", { style: "percent", maximumFractionDigits: 2 });

export const fmtEur = (n: number) => eur.format(n);
export const fmtPct = (n: number) => pct.format(n);                  // expects 0.15 → 15.00%
export const fmtNum = (n: number, dp = 2) => n.toLocaleString("en-IE", { maximumFractionDigits: dp });
export const signCls = (n: number) => n > 0 ? "text-[var(--color-positive)]" : n < 0 ? "text-[var(--color-negative)]" : "";
```

- [ ] **Step 2: Write `components/KPIRow.tsx`**

```tsx
import { GlassCard } from "./GlassCard";
import { fmtEur, fmtPct, signCls } from "@/lib/format";
import type { Returns } from "@/lib/types";

export function KPIRow({ r, cashEur }: { r: Returns; cashEur: number }) {
  const tiles = [
    { label: "Total Value", value: fmtEur(r.currentValueEur + cashEur), sub: `incl. cash ${fmtEur(cashEur)}` },
    { label: "Total Return", value: fmtEur(r.totalReturnEur), sub: fmtPct(r.totalReturnPct), cls: signCls(r.totalReturnEur) },
    { label: "Price Return", value: fmtPct(r.priceReturnPct), sub: fmtEur(r.priceReturnEur), cls: signCls(r.priceReturnEur) },
    { label: "Income Return", value: fmtPct(r.incomeReturnPct), sub: fmtEur(r.incomeReturnEur), cls: signCls(r.incomeReturnEur) },
    { label: "Cost Ratio", value: fmtPct(r.costRatioPct), sub: "fees / cost basis", cls: "text-[var(--color-text-secondary)]" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {tiles.map((t) => (
        <GlassCard key={t.label}>
          <div className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">{t.label}</div>
          <div className={`mono tabular text-2xl mt-1 ${t.cls ?? ""}`}>{t.value}</div>
          <div className="text-xs text-[var(--color-text-secondary)] mt-1">{t.sub}</div>
        </GlassCard>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write `components/Holdings.tsx`**

```tsx
"use client";
import { useMemo, useState } from "react";
import { GlassCard } from "./GlassCard";
import { fmtEur, fmtNum, fmtPct, signCls } from "@/lib/format";
import type { Position, Price } from "@/lib/types";

type Row = {
  isin: string; name: string; qty: number; bep: number;
  current: number; currency: string;
  valueEur: number; priceReturnPct: number;
  incomeReturnPct: number; totalReturnPct: number; allocPct: number;
};

export function Holdings({ rows, totalEur }: { rows: Row[]; totalEur: number }) {
  const [sort, setSort] = useState<keyof Row>("valueEur");
  const [dir, setDir] = useState<1 | -1>(-1);
  const sorted = useMemo(() => [...rows].sort((a,b) => {
    const av = a[sort]; const bv = b[sort];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  }), [rows, sort, dir]);

  const hd = (k: keyof Row, label: string) => (
    <th onClick={() => { setSort(k); setDir(sort === k ? (dir === 1 ? -1 : 1) : -1); }}
        className="text-left px-3 py-2 text-xs uppercase tracking-wider text-[var(--color-text-muted)] cursor-pointer select-none">
      {label}{sort === k ? (dir === 1 ? " ↑" : " ↓") : ""}
    </th>
  );

  return (
    <GlassCard className="overflow-x-auto p-0">
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            {hd("name", "Name")}
            {hd("qty", "Qty")}
            {hd("bep", "BEP")}
            {hd("current", "Current")}
            {hd("valueEur", "Value")}
            {hd("priceReturnPct", "Price %")}
            {hd("incomeReturnPct", "Income %")}
            {hd("totalReturnPct", "Total %")}
            {hd("allocPct", "% Book")}
            {hd("currency", "Curr")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.isin} className="border-t border-[var(--color-glass-border)] hover:bg-white/[0.03]">
              <td className="px-3 py-2">{r.name}</td>
              <td className="px-3 py-2 mono tabular">{fmtNum(r.qty, 0)}</td>
              <td className="px-3 py-2 mono tabular">{fmtNum(r.bep, 2)}</td>
              <td className="px-3 py-2 mono tabular">{fmtNum(r.current, 2)}</td>
              <td className="px-3 py-2 mono tabular">{fmtEur(r.valueEur)}</td>
              <td className={`px-3 py-2 mono tabular ${signCls(r.priceReturnPct)}`}>{fmtPct(r.priceReturnPct)}</td>
              <td className={`px-3 py-2 mono tabular ${signCls(r.incomeReturnPct)}`}>{fmtPct(r.incomeReturnPct)}</td>
              <td className={`px-3 py-2 mono tabular ${signCls(r.totalReturnPct)}`}>{fmtPct(r.totalReturnPct)}</td>
              <td className="px-3 py-2 mono tabular">{fmtPct(r.allocPct)}</td>
              <td className="px-3 py-2 text-[var(--color-text-secondary)]">{r.currency}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add components/KPIRow.tsx components/Holdings.tsx lib/format.ts
git commit -m "feat(ui): KPIRow + sortable Holdings table"
```

---

### Task 10: Returns + cost-ratio (TDD)

**Files:**
- Create: `__tests__/portfolio/returns.test.ts`
- Create: `lib/portfolio/returns.ts`
- Create: `lib/portfolio/cost-ratio.ts`

- [ ] **Step 1: Write failing test `__tests__/portfolio/returns.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { computeReturns } from "@/lib/portfolio/returns";
import type { Position, CashEvent } from "@/lib/types";

const p = (over: Partial<Position>): Position => ({
  isin: "X", product: "X", exchange: "NDQ", yahooSymbol: "X",
  currency: "USD", quantity: 4, bep: 244, costBasisEur: 846.76,
  ...over,
});

describe("computeReturns", () => {
  it("computes price return €", () => {
    const r = computeReturns(
      [p({ isin: "CEG", quantity: 4, bep: 244, costBasisEur: 846 })],
      { CEG: 10 },                                  // dividends received €
      { CEG: { priceEur: 220, currency: "USD" } },  // current price in EUR
      0                                              // total fees not relevant for price calc
    );
    expect(r.currentValueEur).toBeCloseTo(880);
    expect(r.priceReturnEur).toBeCloseTo(880 - 846);
    expect(r.incomeReturnEur).toBeCloseTo(10);
    expect(r.totalReturnEur).toBeCloseTo(880 - 846 + 10);
    expect(r.totalReturnPct).toBeCloseTo((880 - 846 + 10) / 846);
  });

  it("cost ratio = fees / cost basis", () => {
    const r = computeReturns(
      [p({ isin: "A", costBasisEur: 1000 })],
      {}, { A: { priceEur: 250, currency: "USD" } },
      5
    );
    expect(r.costRatioPct).toBeCloseTo(0.005);
  });
});
```

- [ ] **Step 2: Implement `lib/portfolio/returns.ts`**

```ts
import type { Position, Returns } from "@/lib/types";

export function computeReturns(
  positions: Position[],
  dividendsByIsin: Record<string, number>,
  pricesByIsin: Record<string, { priceEur: number; currency: string }>,
  totalFeesEur: number,
): Returns {
  let cost = 0, value = 0, income = 0;
  for (const p of positions) {
    cost += p.costBasisEur;
    const px = pricesByIsin[p.isin]?.priceEur ?? p.bep;
    value += p.quantity * px;
    income += dividendsByIsin[p.isin] ?? 0;
  }
  const priceReturnEur = value - cost;
  const totalReturnEur = priceReturnEur + income;
  return {
    costBasisEur: cost,
    currentValueEur: value,
    priceReturnEur,
    priceReturnPct: cost ? priceReturnEur / cost : 0,
    incomeReturnEur: income,
    incomeReturnPct: cost ? income / cost : 0,
    totalReturnEur,
    totalReturnPct: cost ? totalReturnEur / cost : 0,
    costRatioPct: cost ? totalFeesEur / cost : 0,
  };
}
```

- [ ] **Step 3: Implement `lib/portfolio/cost-ratio.ts`**

```ts
import type { CashEvent } from "@/lib/types";

export function totalFeesEur(events: CashEvent[]): number {
  return events
    .filter((e) => e.kind === "fee")
    .reduce((acc, e) => acc + Math.abs(e.amountEur), 0);
}

export function totalDividendsEur(events: CashEvent[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const e of events) {
    if (!e.isin) continue;
    if (e.kind === "dividend") acc[e.isin] = (acc[e.isin] ?? 0) + e.amountEur;
    if (e.kind === "dividend_tax") acc[e.isin] = (acc[e.isin] ?? 0) + e.amountEur;
  }
  return acc;
}

export function cashBalanceEur(events: CashEvent[]): number {
  return events.reduce((acc, e) => acc + e.amountEur, 0);
}
```

- [ ] **Step 4: Run test → expect PASS**

```bash
npm test -- returns.test
```

- [ ] **Step 5: Commit**

```bash
git add lib/portfolio/returns.ts lib/portfolio/cost-ratio.ts __tests__/portfolio/returns.test.ts
git commit -m "feat(portfolio): returns + cost-ratio math"
```

---

### Task 11: Main page wire-up (Phase 1 dashboard)

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { parseTransactionsCsv } from "@/lib/parsers/transactions";
import { parseAccountCsv } from "@/lib/parsers/account";
import { currentPositions } from "@/lib/portfolio/positions";
import { computeReturns } from "@/lib/portfolio/returns";
import { totalFeesEur, totalDividendsEur, cashBalanceEur } from "@/lib/portfolio/cost-ratio";
import { Dropzone } from "@/components/Dropzone";
import { KPIRow } from "@/components/KPIRow";
import { Holdings } from "@/components/Holdings";
import type { Tx, CashEvent, Position } from "@/lib/types";

type SlotStatus = { transactions: "idle"|"ready"|"error"; account: "idle"|"ready"|"error" };
type LiveData = { prices: Record<string, { priceEur: number; currency: string; raw: number }>; fxUsdEur: number };

const LS_KEY = "degiro-tracker:v1";

export default function Page() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [cashEvents, setCashEvents] = useState<CashEvent[]>([]);
  const [status, setStatus] = useState<SlotStatus>({ transactions: "idle", account: "idle" });
  const [live, setLive] = useState<LiveData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // restore
  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      setTxs(s.txs ?? []); setCashEvents(s.cashEvents ?? []);
      setStatus({ transactions: s.txs?.length ? "ready" : "idle", account: s.cashEvents?.length ? "ready" : "idle" });
    } catch {}
  }, []);

  // persist
  useEffect(() => {
    if (txs.length || cashEvents.length) {
      localStorage.setItem(LS_KEY, JSON.stringify({ txs, cashEvents, savedAt: Date.now() }));
    }
  }, [txs, cashEvents]);

  const positions = useMemo(() => currentPositions(txs), [txs]);

  // fetch live prices + fx whenever positions change
  useEffect(() => {
    if (positions.length === 0) { setLive(null); return; }
    const symbols = positions.map((p) => p.yahooSymbol);
    (async () => {
      try {
        const [pr, fx] = await Promise.all([
          fetch(`/api/price?symbols=${symbols.join(",")}`).then((r) => r.json()),
          fetch(`/api/fx?pair=USDEUR`).then((r) => r.json()),
        ]);
        const fxUsdEur = 1 / (fx.price ?? 1);
        const prices: LiveData["prices"] = {};
        for (const p of positions) {
          const q = pr[p.yahooSymbol];
          if (!q) continue;
          const eur = q.currency === "USD" ? q.price * fxUsdEur
                   : q.currency === "EUR" ? q.price
                   : q.price; // other currencies pass through for now
          prices[p.isin] = { priceEur: eur, currency: q.currency, raw: q.price };
        }
        setLive({ prices, fxUsdEur });
        setErr(null);
      } catch (e: any) {
        setErr(e.message ?? "price fetch failed");
      }
    })();
  }, [positions]);

  const ready = txs.length > 0 && live;
  const returns = useMemo(() => {
    if (!ready) return null;
    return computeReturns(positions, totalDividendsEur(cashEvents), live!.prices, totalFeesEur(cashEvents));
  }, [ready, positions, cashEvents, live]);

  const rows = useMemo(() => {
    if (!returns || !live) return [];
    const total = returns.currentValueEur;
    return positions.map((p) => {
      const px = live.prices[p.isin];
      const valueEur = p.quantity * (px?.priceEur ?? p.bep);
      const dividends = (totalDividendsEur(cashEvents)[p.isin] ?? 0);
      const priceReturnPct = p.costBasisEur ? (valueEur - p.costBasisEur) / p.costBasisEur : 0;
      const incomeReturnPct = p.costBasisEur ? dividends / p.costBasisEur : 0;
      return {
        isin: p.isin,
        name: p.product,
        qty: p.quantity,
        bep: p.bep,
        current: px?.raw ?? 0,
        currency: p.currency,
        valueEur,
        priceReturnPct,
        incomeReturnPct,
        totalReturnPct: priceReturnPct + incomeReturnPct,
        allocPct: total ? valueEur / total : 0,
      };
    });
  }, [returns, live, positions, cashEvents]);

  const cash = useMemo(() => cashBalanceEur(cashEvents), [cashEvents]);

  const onFile = async (slot: keyof SlotStatus, text: string) => {
    try {
      if (slot === "transactions") setTxs(parseTransactionsCsv(text));
      else setCashEvents(parseAccountCsv(text));
      setStatus((s) => ({ ...s, [slot]: "ready" }));
    } catch {
      setStatus((s) => ({ ...s, [slot]: "error" }));
    }
  };

  const reset = () => {
    localStorage.removeItem(LS_KEY);
    setTxs([]); setCashEvents([]); setLive(null);
    setStatus({ transactions: "idle", account: "idle" });
  };

  return (
    <main className="min-h-screen p-6 md:p-10 flex flex-col gap-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-medium tracking-tight">DEGIRO Tracker</h1>
        {ready ? (
          <button onClick={reset} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">clear data</button>
        ) : null}
      </header>

      {err ? (
        <div className="glass p-3 text-sm text-[var(--color-negative)]">{err}</div>
      ) : null}

      <Dropzone onFile={onFile} status={status} />

      {ready && returns ? (
        <>
          <KPIRow r={returns} cashEur={cash} />
          <Holdings rows={rows} totalEur={returns.currentValueEur} />
        </>
      ) : null}
    </main>
  );
}
```

- [ ] **Step 2: Smoke test in browser**

```bash
npm run dev
```

Open http://localhost:3000. Drop the fixture CSVs. Confirm KPI row + Holdings render with live prices. Kill server.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(app): phase-1 dashboard wired up (upload → KPIs + holdings)"
```

---

### Task 12: positions-at-date (TDD) — prep for chart

**Files:**
- Create: `__tests__/portfolio/positions-at-date.test.ts`
- Create: `lib/portfolio/positions-at-date.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { qtyAtDate, costBasisAtDate } from "@/lib/portfolio/positions-at-date";
import type { Tx } from "@/lib/types";

const mk = (date: string, isin: string, qty: number, price: number, valueEur: number, feeEur = 0): Tx => ({
  date, time: "09:00", product: isin, isin, exchange: "NDQ",
  quantity: qty, price, localCurrency: "USD", valueLocal: qty * price,
  valueEur, fxRate: 1, feeEur, totalEur: valueEur + feeEur, orderId: "o",
});

describe("positions-at-date", () => {
  const txs = [
    mk("2026-01-01", "A", 10, 100, 920),
    mk("2026-02-01", "A",  5, 120, 552),
    mk("2026-03-01", "A", -4, 150, 552),
  ];

  it("qty zero before any buy", () => {
    expect(qtyAtDate(txs, "A", "2025-12-31")).toBe(0);
  });

  it("qty after first buy", () => {
    expect(qtyAtDate(txs, "A", "2026-01-15")).toBe(10);
  });

  it("qty after second buy", () => {
    expect(qtyAtDate(txs, "A", "2026-02-15")).toBe(15);
  });

  it("qty after sell", () => {
    expect(qtyAtDate(txs, "A", "2026-03-15")).toBe(11);
  });

  it("cost basis after partial sell uses average-cost rule", () => {
    const cb = costBasisAtDate(txs, "A", "2026-03-15");
    const avgBefore = (920 + 552) / 15;
    expect(cb).toBeCloseTo(11 * avgBefore);
  });
});
```

- [ ] **Step 2: Implement `lib/portfolio/positions-at-date.ts`**

```ts
import type { Tx } from "@/lib/types";

function walk(txs: Tx[], isin: string, dateInclusive: string) {
  let qty = 0, costEur = 0;
  for (const t of txs) {
    if (t.isin !== isin) continue;
    if (t.date > dateInclusive) break;
    if (t.quantity > 0) {
      qty += t.quantity;
      costEur += t.valueEur + t.feeEur;
    } else {
      const sellQty = Math.abs(t.quantity);
      if (qty > 0) {
        const avg = costEur / qty;
        costEur -= sellQty * avg;
      }
      qty -= sellQty;
    }
  }
  return { qty, costEur };
}

export function qtyAtDate(txs: Tx[], isin: string, dateInclusive: string): number {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  return walk(sorted, isin, dateInclusive).qty;
}

export function costBasisAtDate(txs: Tx[], isin: string, dateInclusive: string): number {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  return walk(sorted, isin, dateInclusive).costEur;
}
```

- [ ] **Step 3: Run test → expect PASS**

```bash
npm test -- positions-at-date.test
```

- [ ] **Step 4: Commit**

```bash
git add lib/portfolio/positions-at-date.ts __tests__/portfolio/positions-at-date.test.ts
git commit -m "feat(portfolio): qty + cost-basis at any historical date"
```

---

### Task 13: /api/history route + history client

**Files:**
- Create: `app/api/history/route.ts`

- [ ] **Step 1: Write `app/api/history/route.ts`**

```ts
import { NextResponse } from "next/server";
import { history } from "@/lib/api-clients/yahoo";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol");
  const range = url.searchParams.get("range") ?? "5y";
  if (!symbol) return NextResponse.json({ error: "no symbol" }, { status: 400 });
  try {
    const points = await history(symbol, range);
    return NextResponse.json({ symbol, points });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
```

- [ ] **Step 2: Smoke test**

```bash
npm run dev
curl 'http://localhost:3000/api/history?symbol=CEG&range=1y' | head -c 400
```

Expected: JSON `{symbol, points: [{t, close}, ...]}`.

- [ ] **Step 3: Commit**

```bash
git add app/api/history/route.ts
git commit -m "feat(api): history route (daily OHLC proxy w/ 24h cache)"
```

---

### Task 14: value-series math (TDD)

**Files:**
- Create: `__tests__/portfolio/value-series.test.ts`
- Create: `lib/portfolio/value-series.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { valueSeries } from "@/lib/portfolio/value-series";
import type { Tx } from "@/lib/types";

const mk = (date: string, isin: string, qty: number, valueEur: number): Tx => ({
  date, time: "09:00", product: isin, isin, exchange: "TDG",
  quantity: qty, price: valueEur / Math.abs(qty), localCurrency: "EUR",
  valueLocal: valueEur, valueEur, fxRate: 1, feeEur: 0, totalEur: valueEur, orderId: "o",
});

const day = (s: string) => Math.floor(new Date(`${s}T00:00:00Z`).getTime() / 1000);

describe("valueSeries", () => {
  it("portfolio value = qty * close on each day", () => {
    const txs: Tx[] = [mk("2026-01-01", "A", 10, 1000)];
    const histByIsin = { A: [
      { t: day("2026-01-01"), close: 100 },
      { t: day("2026-01-02"), close: 110 },
      { t: day("2026-01-03"), close: 120 },
    ]};
    const series = valueSeries(txs, [], histByIsin, { USDEUR: 1 });
    expect(series).toHaveLength(3);
    expect(series[0].valueEur).toBeCloseTo(1000);
    expect(series[2].valueEur).toBeCloseTo(1200);
    expect(series[2].plEur).toBeCloseTo(200);
  });
});
```

- [ ] **Step 2: Implement `lib/portfolio/value-series.ts`**

```ts
import type { Tx, ValuePoint, CashEvent } from "@/lib/types";
import { qtyAtDate, costBasisAtDate } from "./positions-at-date";

type HistPoint = { t: number; close: number };
type HistByIsin = Record<string, HistPoint[]>;

function isoFromTs(t: number) {
  return new Date(t * 1000).toISOString().slice(0, 10);
}

export function valueSeries(
  txs: Tx[],
  _cashEvents: CashEvent[],
  histByIsin: HistByIsin,
  fxToEur: { USDEUR?: number; GBPEUR?: number } = { USDEUR: 1, GBPEUR: 1 },
): ValuePoint[] {
  const isins = Object.keys(histByIsin);
  const tsSet = new Set<number>();
  for (const isin of isins) for (const p of histByIsin[isin]) tsSet.add(p.t);
  const days = [...tsSet].sort((a, b) => a - b);

  const lookup: Record<string, Record<number, number>> = {};
  for (const isin of isins) {
    lookup[isin] = {};
    for (const p of histByIsin[isin]) lookup[isin][p.t] = p.close;
  }

  // currency per isin (assume USD if any tx for that isin is non-EUR)
  const currency: Record<string, "EUR" | "USD" | "GBP"> = {};
  for (const isin of isins) {
    const sampleTx = txs.find((t) => t.isin === isin);
    currency[isin] = (sampleTx?.localCurrency ?? "EUR") as any;
  }

  const points: ValuePoint[] = [];
  for (const t of days) {
    const iso = isoFromTs(t);
    let value = 0, cost = 0;
    for (const isin of isins) {
      const qty = qtyAtDate(txs, isin, iso);
      if (qty === 0) continue;
      const close = lookup[isin][t];
      if (close == null) continue;
      const fx = currency[isin] === "USD" ? (fxToEur.USDEUR ?? 1)
                : currency[isin] === "GBP" ? (fxToEur.GBPEUR ?? 1)
                : 1;
      value += qty * close * fx;
      cost += costBasisAtDate(txs, isin, iso);
    }
    points.push({ t, valueEur: value, costBasisEur: cost, plEur: value - cost });
  }
  return points;
}
```

- [ ] **Step 3: Run test → expect PASS**

```bash
npm test -- value-series.test
```

- [ ] **Step 4: Commit**

```bash
git add lib/portfolio/value-series.ts __tests__/portfolio/value-series.test.ts
git commit -m "feat(portfolio): daily portfolio valueSeries"
```

---

## PHASE 2 — Analytics (Tasks 15–19)

### Task 15: TimeRangeTabs + range math

**Files:**
- Create: `lib/range.ts`
- Create: `components/TimeRangeTabs.tsx`

- [ ] **Step 1: Write `lib/range.ts`**

```ts
import { startOfYear, startOfMonth, subDays, subMonths, subYears } from "date-fns";

export type RangeId = "1D" | "1W" | "MTD" | "1M" | "YTD" | "1Y" | "ALL" | "CUSTOM";

export function rangeBounds(id: RangeId, firstTxIso: string, custom?: { from: string; to: string }) {
  const now = new Date();
  const map: Record<Exclude<RangeId, "ALL" | "CUSTOM">, Date> = {
    "1D":  subDays(now, 1),
    "1W":  subDays(now, 7),
    "MTD": startOfMonth(now),
    "1M":  subMonths(now, 1),
    "YTD": startOfYear(now),
    "1Y":  subYears(now, 1),
  };
  if (id === "ALL") return { from: new Date(`${firstTxIso}T00:00:00Z`), to: now };
  if (id === "CUSTOM") return { from: new Date(`${custom!.from}T00:00:00Z`), to: new Date(`${custom!.to}T00:00:00Z`) };
  return { from: map[id], to: now };
}
```

- [ ] **Step 2: Write `components/TimeRangeTabs.tsx`**

```tsx
"use client";
import type { RangeId } from "@/lib/range";

const ALL: RangeId[] = ["1D","1W","MTD","1M","YTD","1Y","ALL","CUSTOM"];

export function TimeRangeTabs({ value, onChange }: { value: RangeId; onChange: (r: RangeId) => void }) {
  return (
    <div className="flex flex-wrap gap-1 p-1 glass" style={{ borderRadius: "999px" }}>
      {ALL.map((id) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`px-3 py-1 text-xs uppercase tracking-wider rounded-full transition ${
            value === id ? "bg-white/10 text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          {id}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/range.ts components/TimeRangeTabs.tsx
git commit -m "feat(ui): TimeRangeTabs + range bounds math"
```

---

### Task 16: Chart component (visx)

**Files:**
- Create: `components/Chart.tsx`

- [ ] **Step 1: Write `components/Chart.tsx`**

```tsx
"use client";
import { useMemo, useState } from "react";
import { ParentSize } from "@visx/responsive";
import { Group } from "@visx/group";
import { LinePath } from "@visx/shape";
import { scaleTime, scaleLinear } from "@visx/scale";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { curveMonotoneX } from "@visx/curve";
import { Tooltip, useTooltip, defaultStyles } from "@visx/tooltip";
import { bisector, extent, max, min } from "d3-array";
import { GlassCard } from "./GlassCard";
import { fmtEur } from "@/lib/format";
import type { ValuePoint, BenchmarkSeries } from "@/lib/types";

type Mode = "value" | "pl";

export function Chart({ series, benchmarks, mode, onModeChange }: {
  series: ValuePoint[];
  benchmarks: BenchmarkSeries[];
  mode: Mode;
  onModeChange: (m: Mode) => void;
}) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between mb-3 px-2">
        <div className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Portfolio</div>
        <div className="flex gap-1 p-1 glass" style={{ borderRadius: "999px" }}>
          {(["value","pl"] as Mode[]).map((m) => (
            <button key={m} onClick={() => onModeChange(m)}
              className={`px-3 py-1 text-xs uppercase rounded-full ${mode === m ? "bg-white/10" : "text-[var(--color-text-secondary)]"}`}>
              {m === "value" ? "Value" : "P/L"}
            </button>
          ))}
        </div>
      </div>
      <div style={{ height: 320 }}>
        <ParentSize>{({ width, height }) => (
          <ChartInner width={width} height={height} series={series} benchmarks={benchmarks} mode={mode} />
        )}</ParentSize>
      </div>
    </GlassCard>
  );
}

function ChartInner({ width, height, series, benchmarks, mode }: {
  width: number; height: number; series: ValuePoint[]; benchmarks: BenchmarkSeries[]; mode: Mode;
}) {
  const margin = { top: 12, right: 12, bottom: 28, left: 56 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = Math.max(0, height - margin.top - margin.bottom);

  const accessorX = (d: ValuePoint) => new Date(d.t * 1000);
  const accessorY = (d: ValuePoint) => (mode === "value" ? d.valueEur : d.plEur);

  // rebase benchmarks: benchmark.close[0] -> series[0].valueEur (or 0 if pl mode)
  const startValue = series[0] ? (mode === "value" ? series[0].valueEur : 0) : 0;
  const startCost  = series[0] ? series[0].costBasisEur : 0;

  const rebased = benchmarks.map((b) => {
    if (b.points.length === 0) return { ...b, scaled: [] as { t: number; v: number }[] };
    const base = b.points[0].close;
    const scaled = b.points.map((p) => ({
      t: p.t,
      v: mode === "value"
        ? (p.close / base) * (startValue || 1)
        : ((p.close / base) - 1) * (startCost || 1),
    }));
    return { ...b, scaled };
  });

  const allY = [
    ...series.map(accessorY),
    ...rebased.flatMap((b) => b.scaled.map((p) => p.v)),
  ];

  const xScale = scaleTime({
    range: [0, innerW],
    domain: extent(series, accessorX) as [Date, Date],
  });
  const yScale = scaleLinear({
    range: [innerH, 0],
    domain: [Math.min(0, min(allY) ?? 0), max(allY) ?? 1],
    nice: true,
  });

  const { tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip } = useTooltip<ValuePoint>();
  const bisectDate = bisector<ValuePoint, Date>((d) => new Date(d.t * 1000)).left;

  return (
    <>
      <svg width={width} height={height}>
        <Group left={margin.left} top={margin.top}>
          {rebased.map((b, i) => (
            <LinePath
              key={b.id}
              data={b.scaled}
              x={(d) => xScale(new Date(d.t * 1000))!}
              y={(d) => yScale(d.v)!}
              stroke={`oklch(0.7 0.05 ${200 + i * 40})`}
              strokeWidth={1.25}
              strokeDasharray="4 4"
              curve={curveMonotoneX}
            />
          ))}
          <LinePath
            data={series}
            x={(d) => xScale(accessorX(d))!}
            y={(d) => yScale(accessorY(d))!}
            stroke={mode === "value" ? "oklch(0.85 0.13 200)" : "oklch(0.85 0.18 145)"}
            strokeWidth={2}
            curve={curveMonotoneX}
          />
          <AxisBottom top={innerH} scale={xScale} numTicks={width > 600 ? 8 : 4}
            stroke="oklch(1 0 0 / 0.15)" tickStroke="oklch(1 0 0 / 0.15)"
            tickLabelProps={() => ({ fill: "oklch(0.72 0.015 240)", fontSize: 10, textAnchor: "middle" })}
          />
          <AxisLeft scale={yScale} numTicks={5}
            stroke="oklch(1 0 0 / 0.15)" tickStroke="oklch(1 0 0 / 0.15)"
            tickFormat={(v) => fmtEur(Number(v))}
            tickLabelProps={() => ({ fill: "oklch(0.72 0.015 240)", fontSize: 10, textAnchor: "end", dx: -4, dy: 3 })}
          />
          <rect width={innerW} height={innerH} fill="transparent"
            onMouseMove={(e) => {
              const { left } = (e.currentTarget as SVGRectElement).getBoundingClientRect();
              const x = e.clientX - left;
              const date = xScale.invert(x);
              const idx = bisectDate(series, date, 1);
              const d = series[Math.min(idx, series.length - 1)];
              showTooltip({ tooltipData: d, tooltipLeft: xScale(accessorX(d))!, tooltipTop: yScale(accessorY(d))! });
            }}
            onMouseLeave={hideTooltip}
          />
        </Group>
      </svg>
      {tooltipData ? (
        <Tooltip top={(tooltipTop ?? 0) + margin.top} left={(tooltipLeft ?? 0) + margin.left}
          style={{ ...defaultStyles, background: "oklch(0.2 0.02 240 / 0.9)", color: "white", border: "1px solid oklch(1 0 0 / 0.15)" }}>
          <div className="text-xs">{new Date(tooltipData.t * 1000).toLocaleDateString()}</div>
          <div className="mono tabular text-sm">{fmtEur(mode === "value" ? tooltipData.valueEur : tooltipData.plEur)}</div>
        </Tooltip>
      ) : null}
    </>
  );
}
```

(Note: requires `d3-array`. Install:)

```bash
npm install d3-array
npm install -D @types/d3-array
```

- [ ] **Step 2: Commit**

```bash
git add components/Chart.tsx package.json package-lock.json
git commit -m "feat(ui): visx chart w/ value↔P/L toggle + benchmark overlay"
```

---

### Task 17: BenchmarkSelector + integrate chart into page

**Files:**
- Create: `components/BenchmarkSelector.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Write `components/BenchmarkSelector.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";

const PRESETS = [
  { id: "GSPC", label: "S&P 500", symbol: "^GSPC" },
  { id: "URTH", label: "MSCI World", symbol: "URTH" },
  { id: "NDX", label: "NASDAQ-100", symbol: "^NDX" },
];

const LS_KEY = "degiro-tracker:benchmarks:v1";

export type BenchmarkSelection = { id: string; label: string; symbol: string }[];

export function BenchmarkSelector({ value, onChange }: { value: BenchmarkSelection; onChange: (v: BenchmarkSelection) => void }) {
  const [customSym, setCustomSym] = useState("");

  useEffect(() => { localStorage.setItem(LS_KEY, JSON.stringify(value)); }, [value]);

  const toggle = (b: typeof PRESETS[number]) => {
    const exists = value.find((v) => v.id === b.id);
    onChange(exists ? value.filter((v) => v.id !== b.id) : [...value, b]);
  };

  const addCustom = () => {
    const s = customSym.trim().toUpperCase();
    if (!s) return;
    onChange([...value, { id: s, label: s, symbol: s }]);
    setCustomSym("");
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {PRESETS.map((b) => {
        const on = !!value.find((v) => v.id === b.id);
        return (
          <button key={b.id} onClick={() => toggle(b)}
            className={`px-3 py-1 text-xs rounded-full border ${on ? "bg-white/10 border-white/30" : "border-white/10 text-[var(--color-text-secondary)]"}`}>
            {b.label}
          </button>
        );
      })}
      <input
        value={customSym}
        onChange={(e) => setCustomSym(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }}
        placeholder="custom ticker"
        className="bg-transparent border border-white/10 rounded-full px-3 py-1 text-xs w-32"
      />
      <button onClick={addCustom} className="text-xs text-[var(--color-text-secondary)]">add</button>
    </div>
  );
}

export function loadSavedBenchmarks(): BenchmarkSelection {
  if (typeof window === "undefined") return [PRESETS[0]];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [PRESETS[0]];
    return JSON.parse(raw);
  } catch { return [PRESETS[0]]; }
}
```

- [ ] **Step 2: Modify `app/page.tsx` — add chart, range tabs, benchmark selector**

Add these imports at top:
```ts
import { Chart } from "@/components/Chart";
import { TimeRangeTabs } from "@/components/TimeRangeTabs";
import { BenchmarkSelector, loadSavedBenchmarks, type BenchmarkSelection } from "@/components/BenchmarkSelector";
import { valueSeries } from "@/lib/portfolio/value-series";
import { rangeBounds, type RangeId } from "@/lib/range";
import type { ValuePoint, BenchmarkSeries } from "@/lib/types";
```

Add state inside `Page()`:
```ts
const [range, setRange] = useState<RangeId>("YTD");
const [mode, setMode] = useState<"value" | "pl">("value");
const [benchmarks, setBenchmarks] = useState<BenchmarkSelection>(() => loadSavedBenchmarks());
const [histByIsin, setHistByIsin] = useState<Record<string, { t: number; close: number }[]>>({});
const [benchSeries, setBenchSeries] = useState<BenchmarkSeries[]>([]);
```

After the live-price `useEffect`, add a history-fetch effect:
```ts
useEffect(() => {
  if (positions.length === 0) { setHistByIsin({}); return; }
  (async () => {
    const entries = await Promise.all(positions.map(async (p) => {
      const r = await fetch(`/api/history?symbol=${encodeURIComponent(p.yahooSymbol)}&range=5y`).then((r) => r.json());
      return [p.isin, r.points ?? []] as const;
    }));
    setHistByIsin(Object.fromEntries(entries));
  })();
}, [positions]);

useEffect(() => {
  if (benchmarks.length === 0) { setBenchSeries([]); return; }
  (async () => {
    const series = await Promise.all(benchmarks.map(async (b) => {
      const r = await fetch(`/api/history?symbol=${encodeURIComponent(b.symbol)}&range=5y`).then((r) => r.json());
      return { id: b.id, label: b.label, symbol: b.symbol, points: r.points ?? [] };
    }));
    setBenchSeries(series);
  })();
}, [benchmarks]);
```

Compute the windowed series:
```ts
const firstTxIso = txs[0]?.date ?? new Date().toISOString().slice(0,10);

const fullSeries: ValuePoint[] = useMemo(() => {
  if (positions.length === 0 || Object.keys(histByIsin).length === 0 || !live) return [];
  return valueSeries(txs, cashEvents, histByIsin, { USDEUR: live.fxUsdEur });
}, [positions, txs, cashEvents, histByIsin, live]);

const windowed = useMemo(() => {
  if (fullSeries.length === 0) return [];
  const { from, to } = rangeBounds(range, firstTxIso);
  const fromTs = Math.floor(from.getTime() / 1000), toTs = Math.floor(to.getTime() / 1000);
  return fullSeries.filter((p) => p.t >= fromTs && p.t <= toTs);
}, [fullSeries, range, firstTxIso]);

const windowedBench = useMemo(() => {
  if (benchSeries.length === 0 || windowed.length === 0) return [];
  const fromTs = windowed[0].t, toTs = windowed[windowed.length - 1].t;
  return benchSeries.map((b) => ({ ...b, points: b.points.filter((p) => p.t >= fromTs && p.t <= toTs) }));
}, [benchSeries, windowed]);
```

Render between KPIRow and Holdings:
```tsx
<div className="flex items-center justify-between flex-wrap gap-3">
  <TimeRangeTabs value={range} onChange={setRange} />
  <BenchmarkSelector value={benchmarks} onChange={setBenchmarks} />
</div>
<Chart series={windowed} benchmarks={windowedBench} mode={mode} onModeChange={setMode} />
```

- [ ] **Step 3: Smoke test**

```bash
npm run dev
```

Upload fixtures → confirm chart renders w/ default S&P 500 dashed overlay, time-range tabs switch the window, Value↔P/L toggle flips the y-axis. Kill.

- [ ] **Step 4: Commit**

```bash
git add components/BenchmarkSelector.tsx app/page.tsx
git commit -m "feat(app): wire chart + range tabs + benchmark overlay"
```

---

### Task 18: AllocationDonut

**Files:**
- Create: `components/AllocationDonut.tsx`
- Modify: `app/page.tsx` (render after Holdings)

- [ ] **Step 1: Write `components/AllocationDonut.tsx`**

```tsx
"use client";
import { useState } from "react";
import { Pie } from "@visx/shape";
import { Group } from "@visx/group";
import { GlassCard } from "./GlassCard";
import { fmtEur, fmtPct } from "@/lib/format";

type Slice = { label: string; value: number };

export function AllocationDonut({ data, size = 240 }: { data: Slice[]; size?: number }) {
  const [hover, setHover] = useState<Slice | null>(null);
  const total = data.reduce((a, b) => a + b.value, 0);
  const radius = size / 2;
  const thickness = 28;

  return (
    <GlassCard className="flex flex-col items-center">
      <div className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] self-start mb-2">Allocation</div>
      <svg width={size} height={size}>
        <Group top={radius} left={radius}>
          <Pie<Slice>
            data={data}
            pieValue={(d) => d.value}
            outerRadius={radius}
            innerRadius={radius - thickness}
            padAngle={0.005}
          >
            {(pie) => pie.arcs.map((arc, i) => {
              const path = pie.path(arc) ?? "";
              const hue = 200 + (i * 47) % 180;
              return (
                <path key={i} d={path} fill={`oklch(0.72 0.13 ${hue})`} opacity={hover && hover.label !== arc.data.label ? 0.4 : 1}
                  onMouseEnter={() => setHover(arc.data)} onMouseLeave={() => setHover(null)} />
              );
            })}
          </Pie>
          <text textAnchor="middle" dy="-0.3em" fontSize={11} fill="oklch(0.72 0.015 240)">total</text>
          <text textAnchor="middle" dy="1em" fontSize={16} className="mono tabular" fill="white">{fmtEur(total)}</text>
        </Group>
      </svg>
      <div className="mt-3 w-full">
        {data.map((d) => (
          <div key={d.label} className="flex items-center justify-between text-sm py-0.5">
            <span className="truncate text-[var(--color-text-secondary)]">{d.label}</span>
            <span className="mono tabular ml-2">{fmtPct(d.value / total)}</span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
```

- [ ] **Step 2: Render in page after Holdings** (in the `ready` block)

```tsx
<div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-4">
  <Holdings rows={rows} totalEur={returns.currentValueEur} />
  <AllocationDonut data={rows.map((r) => ({ label: r.name, value: r.valueEur }))} />
</div>
```

- [ ] **Step 3: Smoke test → commit**

```bash
git add components/AllocationDonut.tsx app/page.tsx
git commit -m "feat(ui): allocation donut beside holdings"
```

---

### Task 19: Error boundaries + empty/error states

**Files:**
- Create: `components/EmptyState.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Write `components/EmptyState.tsx`**

```tsx
import { GlassCard } from "./GlassCard";

export function EmptyState() {
  return (
    <GlassCard className="text-center">
      <h2 className="text-lg font-medium">Drop your DEGIRO exports</h2>
      <p className="text-sm text-[var(--color-text-secondary)] mt-2 max-w-md mx-auto">
        Both files needed. <strong>Transactions.csv</strong> rebuilds your positions and BEP.
        <strong> Account.csv</strong> adds dividends and fees so we can split returns.
      </p>
      <p className="text-xs text-[var(--color-text-muted)] mt-4">
        Everything stays in your browser. No upload, no account, no tracking.
      </p>
    </GlassCard>
  );
}
```

- [ ] **Step 2: Render EmptyState when `!ready`** in `app/page.tsx` below the Dropzone.

- [ ] **Step 3: Commit**

```bash
git add components/EmptyState.tsx app/page.tsx
git commit -m "feat(ui): empty state + error banner polish"
```

---

## PHASE 3 — Ship (Tasks 20–22)

### Task 20: Playwright E2E happy-path

**Files:**
- Create: `playwright.config.ts`
- Create: `__tests__/e2e/upload.spec.ts`

- [ ] **Step 1: Add playwright config**

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "__tests__/e2e",
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: !process.env.CI },
  use: { baseURL: "http://localhost:3000" },
});
```

- [ ] **Step 2: Write `__tests__/e2e/upload.spec.ts`**

```ts
import { test, expect } from "@playwright/test";
import path from "node:path";

test("upload sample CSVs and render KPIs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /DEGIRO Tracker/i })).toBeVisible();

  const tx = path.resolve(__dirname, "../../fixtures/Transactions.sample.csv");
  const ac = path.resolve(__dirname, "../../fixtures/Account.sample.csv");

  const [txInput, acInput] = await page.locator('input[type=file]').all();
  await txInput.setInputFiles(tx);
  await acInput.setInputFiles(ac);

  await expect(page.getByText("Total Value")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Cost Ratio")).toBeVisible();
});
```

- [ ] **Step 3: Run**

```bash
npx playwright install chromium
npx playwright test
```

Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts __tests__/e2e/upload.spec.ts
git commit -m "test(e2e): happy-path upload renders dashboard"
```

---

### Task 21: README + DEGIRO export instructions

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```md
# DEGIRO Portfolio Tracker

Drop your DEGIRO `Transactions.csv` + `Account.csv` exports → see your real portfolio with positions, returns, dividends, fees, historical chart, and benchmark overlays. All client-side. Nothing leaves your browser.

## How to export from DEGIRO

1. Web app → top-right menu → **Activity**
2. Pick a date range (use "All" for full history)
3. Click **Export** → choose **CSV**
4. You get two files: `Transactions.csv` and `Account.csv`
5. Drop both into this app

## Run locally

```bash
npm install
npm run dev
```

## Test

```bash
npm test         # vitest
npx playwright test
```

## Deploy

This deploys to Vercel as a normal Next.js app. No env vars required.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: readme + export instructions"
```

---

### Task 22: Deploy to Vercel

- [ ] **Step 1: Confirm build**

```bash
npm run build
```

Expected: clean build, no type errors.

- [ ] **Step 2: Push (user-gated)**

```bash
# user creates GitHub repo `degiro-tracker` manually OR via gh
git remote add origin git@github.com:pandey-ishaan/degiro-tracker.git
git branch -M main
git push -u origin main
```

(Push requires user approval per global rule. Stop here and ask user before pushing.)

- [ ] **Step 3: Vercel deploy**

```bash
npx vercel --prod
```

Expected: live URL.

- [ ] **Step 4: Commit**

No code commit needed for deploy. Smoke test the prod URL in browser by uploading fixtures.

---

## Self-review notes

- **Spec coverage:** every spec requirement maps to a task —
  - CSV upload (Task 4, 5, 8, 11)
  - Live prices, FX (Task 7)
  - Positions + BEP (Task 6)
  - KPI row (Task 9)
  - Holdings table (Task 9)
  - Historical chart (Tasks 13–16)
  - Time-range tabs (Task 15)
  - Value↔P/L toggle (Task 16)
  - Returns decomposition + cost ratio (Task 10)
  - Allocation donut (Task 18)
  - Benchmark overlay (Tasks 16–17)
  - localStorage persistence (Task 11)
  - Empty + error state (Task 19)
  - Liquid Glass aesthetic (Task 2)
  - Tests (Task 4, 5, 6, 10, 12, 14, 20)
  - Vercel deploy (Task 22)
- **No placeholders:** every step has executable code or an exact command.
- **Type consistency:** `Tx`, `CashEvent`, `Position`, `Returns`, `ValuePoint`, `BenchmarkSeries` defined in Task 3 are referenced exactly by name elsewhere.
- **Ordering:** parsers → positions → live prices → table → historical → chart → polish → tests → deploy. Each task can be reverted independently.
