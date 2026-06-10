# DEGIRO Portfolio Tracker — Design Spec

**Date:** 2026-06-10
**Status:** Draft → awaiting user review
**Owner:** Ishaan Pandey

## Overview

Web app to track a DEGIRO brokerage portfolio. User uploads DEGIRO CSV exports → sees live positions, historical value chart, return decomposition, and allocation breakdown. Single-page, fully client-side (no auth, no DB, no PII risk). Public Vercel URL — anyone can use it with their own CSVs.

## Goals

- Upload DEGIRO `Transactions.csv` + `Account.csv` → see full portfolio analytics.
- Historical portfolio value chart with multiple time ranges (1D/1W/MTD/1M/YTD/1Y/ALL/Custom).
- Toggle chart between Value (€) and P/L (€).
- Return decomposition: **price return**, **income return** (dividends), **cost ratio** (fees), **total return**.
- All holdings table with per-position returns + allocation.
- localStorage persistence — auto-restore on revisit.
- No auth. Data never leaves the user's browser except outbound price lookups.

## Non-goals

- Multi-broker support (DEGIRO only for v1).
- Tax computation (Irish CGT, deemed disposal, US/Irish treaty etc).
- Realized P/L on closed positions (only open-position analytics).
- Mobile-first layout (responsive, desktop-primary).
- Server-side persistent storage / multi-device sync.
- Benchmark comparisons (vs S&P, MSCI World) — future.

## User flow

1. Land on empty state → two drop zones (Transactions.csv + Account.csv) + brief explainer.
2. User drops both files → client-side Papa Parse builds positions, dividends, fees.
3. App calls `/api/price`, `/api/history`, `/api/fx` in parallel → fetches data.
4. Dashboard renders: KPI row → value chart w/ time-range tabs → holdings table → allocation donut.
5. State saved to localStorage → next visit auto-restores (with stale-price re-fetch).
6. "Clear data" button wipes localStorage and returns to empty state.

## Architecture

### Tech stack

- **Next.js 16** (App Router) — SSR for static shell, client for everything else
- **TypeScript**
- **Tailwind CSS** — Liquid Glass tokens + minimal layout
- **visx** — line + donut chart (better than Recharts for dual-axis + time-range zoom)
- **Papa Parse** — CSV parsing client-side
- **date-fns** — time-range math
- **Vitest** + **Playwright** — tests
- **Vercel** — deploy

### Layers

- **Client**: parsers, position/return math, all UI
- **Server (Next API routes)**: thin proxies to Yahoo Finance with in-memory caching (avoids CORS, hides any future key)
- **Storage**: browser `localStorage` only

### Directory structure

```
~/_Projects/degiro-tracker/
  app/
    page.tsx                — main dashboard (client component, gated on parsed-state presence)
    layout.tsx              — root layout, theme provider, mesh-gradient background
    globals.css             — Tailwind + Liquid Glass tokens
    api/
      price/route.ts        — live current price (cache 60s)
      history/route.ts      — daily OHLC for symbol (cache 24h)
      fx/route.ts           — FX rate (cache 1h)
  lib/
    parsers/
      transactions.ts       — Papa Parse → Tx[]
      account.ts            — Papa Parse → CashEvent[] (cash/dividends/fees/taxes)
    portfolio/
      positions.ts          — net open positions from Tx[]
      positions-at-date.ts  — qty for symbol on date X (walks Tx[] up to date)
      value-series.ts       — daily portfolio value array for chart
      returns.ts            — price/income/total return decomposition per position + total
      cost-ratio.ts         — total fees / total cost basis
    api-clients/
      yahoo.ts              — chart endpoint client (server-side only)
    isin-to-ticker.ts       — static ISIN→Yahoo ticker map + user-override (localStorage)
    types.ts                — Tx, CashEvent, Position, Return, ValuePoint
  components/
    Dropzone.tsx
    KPIRow.tsx              — 4 KPI tiles
    Chart.tsx               — visx line w/ tooltip, dual-mode (Value/PL)
    TimeRangeTabs.tsx       — 1D/1W/MTD/1M/YTD/1Y/ALL/Custom
    Holdings.tsx            — sortable table
    AllocationDonut.tsx
    GlassCard.tsx           — shared glass container
    EmptyState.tsx
    ErrorBoundary.tsx
  __tests__/
    parsers/                — parse fixtures (anonymized real CSVs)
    portfolio/              — positions/returns math
    e2e/                    — Playwright: upload sample → assert numbers
  docs/superpowers/specs/
    2026-06-10-degiro-tracker-design.md
```

### Data flow

```
User drops CSVs
  ↓
Papa Parse (client) → Tx[] + CashEvent[]
  ↓
positions.ts → current positions (qty, BEP, isin, currency)
  ↓
isin-to-ticker → Yahoo symbol per position
  ↓
parallel:
  /api/price?symbols=...      → live prices
  /api/history?symbol=...     → daily OHLC (one call per symbol)
  /api/fx?pair=USDEUR         → fx rate
  ↓
value-series.ts → walks daily history, computes portfolio value per day in EUR
returns.ts → price/income/total + cost ratio
  ↓
Render KPIRow + Chart + Holdings + Donut
  ↓
localStorage.setItem('degiro-state', { parsed, prices, lastFetch })
```

### CSV format assumptions

**Transactions.csv** (DEGIRO English export):
```
Date, Time, Product, ISIN, Reference, Exchange, Quantity, Price, Local value, Value, Exchange rate, Fee, Total, Order ID
```

**Account.csv** (Account → Activity → Export):
```
Date, Time, Value date, Product, ISIN, Description, FX, Change, Balance, Order ID
```

`Description` field is parsed for type:
- `Dividend` (not "Dividend Tax") → income
- `Dividend Tax` → tax withholding (tracked, displayed as drag)
- `DEGIRO Connection Fee`, `DEGIRO Transaction Fee`, `Commission` → cost
- `flatex Cash Sweep Transfer`, `Deposit`, `Withdrawal` → cash movement

### Pricing

- **Live current**: `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1m&range=1d`
- **Historical daily**: `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=5y` (or `max` if first-buy > 5y ago)
- **FX**: `EURUSD=X`, `EURGBP=X` via same endpoint
- All requests proxied through Next API routes
- In-memory cache: live 60s, history 24h, fx 1h
- **Fallback**: if Yahoo returns 4xx/5xx → try Stooq (`https://stooq.com/q/d/?s={symbol}&i=d`)

### ISIN → Yahoo ticker mapping

- Static lookup for portfolio's existing ISINs: `US21037T1097 → CEG`, `IE00BWBXM948 → ZPDT.DE`, `US02079K3059 → GOOGL`, `US92840M1027 → VST`.
- DEGIRO `Exchange` column resolves the Yahoo suffix: `NDQ`/`NSY` → no suffix (US), `XET` → `.DE`, `AMS` → `.AS`, `LSE` → `.L`, `EPA` → `.PA`.
- Cache miss → modal asks user to enter Yahoo ticker. Saved to localStorage.

## Components

### KPIRow (4 glass tiles)
- **Total Value (€)** — current portfolio market value in EUR (incl. cash)
- **Total Return** — price + income, € and %
- **Price Return %** — capital gain only
- **Income Return %** — dividends / cost basis
- **Cost Ratio %** — fees / cost basis

### Chart
- visx `LineSeries` + `Tooltip` + `Crosshair`
- Glass card container
- Time range tabs above
- Toggle pill: **Value €** / **P/L €** — switches y-axis + line color
- Hover: date, value, P/L €, day-over-day Δ, **plus benchmark % at hover date**
- Smooth curve, no markers (clean Liquid Glass style)
- For `1D` range: use 5-min interval Yahoo data; for `1W`–`1M`: daily; for `1Y`–`ALL`: daily decimated if > 365 points
- **Benchmark overlay**: one or more comparison series (S&P 500, MSCI World, NASDAQ-100, custom ticker) rebased to portfolio start value at the left edge of the selected time range, so visual % comparison is direct. Lighter weight, dashed style, distinct from portfolio line. Tooltip shows benchmark % return at hover date alongside portfolio % return.

### TimeRangeTabs
- Pill group: `1D` `1W` `MTD` `1M` `YTD` `1Y` `ALL` `Custom`
- `Custom` opens date-range picker (two date inputs)
- Active tab: glass accent + subtle inner glow

### BenchmarkSelector
- Multi-select chip group below chart: `S&P 500` `MSCI World` `NASDAQ-100` `+ Add custom...`
- Defaults: S&P 500 enabled, others off
- Custom input accepts any Yahoo ticker (e.g. `^STOXX50E`, `URTH`, `QQQ`)
- Selections persisted to localStorage
- Pre-mapped symbols: `^GSPC` (S&P 500), `URTH` (MSCI World ETF), `^NDX` (NASDAQ-100)

### Holdings table
Columns: **Name | Qty | BEP | Current | Value | Price Return % | Income Return % | Total Return % | % of Book | Currency**
- Sortable per column (click header)
- Color-code returns: green positive, red negative
- Row hover: subtle glass highlight
- Footer row: totals where summable

### AllocationDonut
- visx `Pie` + center label (total value)
- Hover slice → position name + value + %
- Glass card container

### Dropzone
- Two slots side-by-side: Transactions + Account
- Drag-drop OR click-to-upload
- Per-slot status: pending / parsed (rows count) / error (message + retry)
- Link: "Where do I find these in DEGIRO?" → modal w/ screenshots
- Sample CSVs in repo for testing

## Aesthetic — Glass × Minimal hybrid

- **Background**: soft mesh gradient (blues/teals/lavenders, low saturation)
- **Cards**: `backdrop-filter: blur(20px)` + semi-transparent white-on-light or dark-on-dark + 1px subtle border + soft shadow
- **Typography**: SF Pro Display (Inter fallback) — `font-weight: 400/500/600` only, tight tracking on headings
- **Numbers**: SF Mono (JetBrains Mono fallback) — tabular figures for tables and KPIs
- **Colors**:
  - Slate-900 / slate-100 text
  - Accent: soft cyan/teal (matches the mesh)
  - Semantic: `emerald-500` (positive), `rose-500` (negative)
- **Spacing**: 8px base grid, generous whitespace
- **Borrow** Liquid Glass tokens from `berkeleyclasses-web` where the design system overlaps
- Dark mode default, light toggle in header

## Error handling

- CSV parse fails → row-level error toast w/ "skip row and continue" option
- Unmapped ISIN → modal asking for Yahoo ticker; persisted to localStorage
- Yahoo API fails → red banner w/ retry button; auto-fallback to Stooq once
- localStorage quota exceeded → prompt to clear old data
- Bad date in CSV → reject row, show count in summary
- Two CSVs from different accounts uploaded → detect mismatch (different ISIN sets impossible to reconcile cash↔tx) → warn

## Testing strategy

- **Vitest** for parsers: anonymized DEGIRO CSV fixtures, edge cases (partial fills, dividends, fee-only lines, FX events)
- **Vitest** for portfolio math: `positions-at-date` against hand-computed expected values, `returns` for price/income split, `cost-ratio` math
- **Playwright** E2E: upload sample CSVs, verify rendered KPI numbers + first holding row matches expected
- **Visual regression**: defer to v2

## Deploy

- Vercel from `main`
- Default domain: `degiro-tracker.vercel.app` (custom domain optional)
- No env vars required for v1 (Yahoo + Stooq are keyless)
- Preview deploys on PR branches

## Phase split (delivery order)

**Phase 1 — Foundation (the working snapshot)**
1. Repo + Next.js scaffold + Tailwind + Liquid Glass tokens
2. Dropzone + Transactions.csv parser
3. Account.csv parser
4. Positions math + ISIN→ticker mapping
5. Live price API route + price fetch on render
6. Holdings table + KPI row (no chart yet)
7. localStorage persistence

**Phase 2 — Analytics**
8. History API route + value-series math
9. Chart component + time-range tabs
10. Returns decomposition (price/income/cost ratio)
11. Allocation donut
12. **Benchmark overlay** (S&P 500 default, MSCI World / NASDAQ / custom ticker)
13. Error handling polish + empty/error states

**Phase 3 — Ship**
14. Tests (Vitest + Playwright)
15. Deploy to Vercel
16. README + DEGIRO export instructions modal

## Open questions (resolved at spec time)

- ✅ Both Transactions.csv + Account.csv required (dividend/fee data lives only in Account.csv)
- ✅ Chart granularity: daily for all ranges except 1D (5-min)
- ✅ Cost ratio = fees / cost basis (not ETF TER — that would need paid data)
- ✅ Aesthetic: Glass-Minimal hybrid (option A + B)
- ✅ ALL range = since user's first transaction

## Future (out of scope for v1)

- Multi-broker (IBKR, eToro)
- Tax estimation (Irish CGT, deemed disposal on UCITS ETFs)
- Realized P/L on closed positions
- Mobile-first layout
- CSV/PDF export
- Multi-user persistence (Supabase) + cross-device sync
- Position-level dividend timeline chart
