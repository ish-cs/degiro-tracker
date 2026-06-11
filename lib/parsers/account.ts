import Papa from "papaparse";
import type { CashEvent, CashEventKind, Tx, Currency } from "@/lib/types";

const parseEuropeanDate = (raw: string): string => {
  const [dd, mm, yyyy] = raw.split("-");
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
};

const num = (raw: string | undefined | null): number => {
  if (!raw) return 0;
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

function classify(description: string): CashEventKind {
  const d = description.toLowerCase();
  if (d.includes("dividend tax") || d.includes("dividend withholding")) return "dividend_tax";
  if (d.includes("dividend")) return "dividend";
  if (d.includes("deposit") || d.includes("flatex cash sweep transfer") || d.includes("cash sweep transfer")) return "deposit";
  if (d.includes("withdrawal")) return "withdrawal";
  if (d.includes("fee") || d.includes("commission")) return "fee";
  if (/^buy\b/.test(d)) return "buy";
  if (/^sell\b/.test(d)) return "sell";
  if (d.includes("fx")) return "fx";
  return "other";
}

const looksLikeCurrencyCode = (s: string) => /^[A-Z]{3}$/.test((s || "").trim());

export function parseAccountCsv(text: string): CashEvent[] {
  const { data } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  if (data.length === 0) return [];

  const sample = data[0];
  const changeIsCurrency =
    looksLikeCurrencyCode(sample["Change"]) ||
    (!sample["Change"] && sample[""] !== undefined);

  if (!changeIsCurrency) {
    // Legacy/fixture format — Change is numeric, all EUR.
    return data
      .filter((row) => row["Date"] && row["Description"])
      .map((row) => {
        const amt = num(row["Change"]);
        const bal = num(row["Balance"]);
        return {
          date: parseEuropeanDate(row["Date"]),
          product: row["Product"] ?? "",
          isin: row["ISIN"] || null,
          description: row["Description"],
          kind: classify(row["Description"]),
          currency: "EUR",
          amount: amt,
          amountEur: amt,
          balanceCurrency: "EUR",
          balance: bal,
          balanceEur: bal,
          orderId: row["Order ID"] || row["Order Id"] || null,
          fxRate: num(row["FX"]) || null,
        };
      });
  }

  // Real DEGIRO format — re-parse without header so we can read by column index.
  const rows = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true }).data;
  const headers = (rows[0] ?? []) as string[];
  const idxDate = headers.indexOf("Date");
  const idxProduct = headers.indexOf("Product");
  const idxIsin = headers.indexOf("ISIN");
  const idxDesc = headers.indexOf("Description");
  const idxFx = headers.indexOf("FX");
  const idxOrder = headers.findIndex((h) => h === "Order ID" || h === "Order Id");
  const idxChange = headers.indexOf("Change");     // currency code column
  const idxBalance = headers.indexOf("Balance");   // currency code column

  return rows.slice(1)
    .filter((r) => r[idxDate] && r[idxDesc])
    .map((r) => {
      const desc = r[idxDesc];
      const currency = (r[idxChange] || "EUR").trim();
      const balanceCurrency = (r[idxBalance] || "EUR").trim();
      const amount = num(r[idxChange + 1] ?? "");
      const balance = num(r[idxBalance + 1] ?? "");
      return {
        date: parseEuropeanDate(r[idxDate]),
        product: r[idxProduct] ?? "",
        isin: r[idxIsin] || null,
        description: desc,
        kind: classify(desc),
        currency,
        amount,
        amountEur: currency === "EUR" ? amount : 0,
        balanceCurrency,
        balance,
        balanceEur: balanceCurrency === "EUR" ? balance : 0,
        orderId: idxOrder >= 0 ? (r[idxOrder] || null) : null,
        fxRate: idxFx >= 0 ? (num(r[idxFx]) || null) : null,
      };
    });
}

// Extract per-trade transactions purely from Account.csv. Groups events by
// orderId and parses the canonical "Buy N Product@Price CCY (ISIN)" pattern.
// EUR buys → cost = buy event EUR amount. USD/foreign buys → cost = FX Debit
// EUR amount (which already includes the AutoFX spread the broker charges).
const BUY_RE = /^Buy\s+(\d+(?:[.,]\d+)?)\s+(.+?)@([\d.,]+)\s+([A-Z]{3})\s+\(([A-Z0-9]+)\)/;

export function extractTxsFromAccount(events: CashEvent[]): Tx[] {
  const byOrder = new Map<string, CashEvent[]>();
  for (const e of events) {
    if (!e.orderId) continue;
    const list = byOrder.get(e.orderId) ?? [];
    list.push(e);
    byOrder.set(e.orderId, list);
  }

  const txs: Tx[] = [];
  for (const [orderId, group] of byOrder) {
    const buy = group.find((e) => e.kind === "buy");
    if (!buy) continue;
    const m = buy.description.match(BUY_RE);
    if (!m) continue;
    const [, qtyStr, productName, priceStr, ccyStr, isin] = m;
    const quantity = num(qtyStr);
    const price = num(priceStr);
    const localCurrency = ccyStr as Currency;

    let valueEur: number;
    if (localCurrency === "EUR") {
      valueEur = Math.abs(buy.amount); // buy event itself is EUR
    } else {
      const fxDebit = group.find((e) => e.description === "FX Debit" && e.currency === "EUR");
      valueEur = fxDebit ? Math.abs(fxDebit.amount) : 0;
    }

    const fee = group.find((e) => e.kind === "fee" && e.currency === "EUR");
    const brokerFeeEur = fee ? Math.abs(fee.amount) : 0;

    txs.push({
      date: buy.date,
      time: "",
      product: productName.trim(),
      isin,
      exchange: "",
      quantity,
      price,
      localCurrency,
      valueLocal: quantity * price,
      valueEur,
      fxRate: null,
      feeEur: brokerFeeEur,
      brokerFeeEur,
      autoFxFeeEur: 0, // implicit in valueEur for FX buys
      totalEur: -(valueEur + brokerFeeEur),
      orderId,
    });
  }
  return txs.sort((a, b) => a.date.localeCompare(b.date));
}
