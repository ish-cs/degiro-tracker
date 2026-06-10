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
npm install --legacy-peer-deps
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Test

```bash
npm test               # vitest unit tests
npx playwright test    # e2e
```

## Deploy

Standard Next.js app. No env vars required.

```bash
npx vercel --prod
```
