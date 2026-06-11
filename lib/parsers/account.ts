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
// orderId and parses the canonical "Buy N Product@Price CCY (ISIN)" pattern
// (and the matching "Sell N Product@Price CCY (ISIN)" pattern).
//
// EUR trades → cost/proceeds = buy/sell event EUR amount.
// USD/foreign trades → cost = FX Debit (buy) / FX Credit (sell) EUR amount,
//   which already includes the AutoFX spread the broker charges.
const TRADE_RE = /^(Buy|Sell)\s+(\d+(?:[.,]\d+)?)\s+(.+?)@([\d.,]+)\s+([A-Z]{3})\s+\(([A-Z0-9]+)\)/;

const KNOWN_CCYS = new Set<Currency>(["EUR", "USD", "GBP", "CHF", "JPY"]);

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
    // DEGIRO splits some orders into multiple buy/sell events (partial
    // fills at different prices). Collapse them into one Tx weighted by
    // share count.
    const trades = group.filter(
      (e) => (e.kind === "buy" || e.kind === "sell") && TRADE_RE.test(e.description),
    );
    if (trades.length === 0) continue;

    const firstSide = trades[0].description.startsWith("Sell") ? "Sell" : "Buy";
    let absQty = 0;
    let weightedPrice = 0;
    let isin = "";
    let productName = "";
    let localCurrency: Currency = "EUR";
    let sumLocalAbs = 0;
    let mixedSides = false;

    for (const trade of trades) {
      const m = trade.description.match(TRADE_RE)!;
      const [, side, qtyStr, name, priceStr, ccyStr, parsedIsin] = m;
      if (side !== firstSide) { mixedSides = true; continue; }
      const q = num(qtyStr);
      const px = num(priceStr);
      absQty += q;
      weightedPrice += q * px;
      sumLocalAbs += q * px;
      isin = parsedIsin;
      productName = name.trim();
      const ccy = ccyStr as Currency;
      if (KNOWN_CCYS.has(ccy)) localCurrency = ccy;
    }
    if (mixedSides) continue; // unusual; skip rather than mis-classify
    if (absQty === 0 || !isin) continue;

    const price = weightedPrice / absQty;
    const isBuy = firstSide === "Buy";
    const quantity = isBuy ? absQty : -absQty;

    let valueEur: number;
    if (localCurrency === "EUR") {
      // Sum signed amounts of all matching-side trade events (EUR direct).
      const eurSum = trades
        .filter((t) => (isBuy ? t.kind === "buy" : t.kind === "sell"))
        .reduce((s, t) => s + t.amount, 0);
      valueEur = Math.abs(eurSum);
    } else {
      // For FX trades, sum every FX Debit (for buys) or FX Credit (for sells) in EUR.
      const fxRows = group.filter(
        (e) =>
          e.currency === "EUR" &&
          (e.description === "FX Debit" || e.description === "FX Credit"),
      );
      valueEur = Math.abs(fxRows.reduce((s, e) => s + e.amount, 0));
    }

    // All broker fee events tied to this order, summed.
    const brokerFeeEur = Math.abs(
      group
        .filter((e) => e.kind === "fee" && e.currency === "EUR")
        .reduce((s, e) => s + e.amount, 0),
    );

    txs.push({
      date: trades[0].date,
      time: "",
      product: productName,
      isin,
      exchange: "",
      quantity,
      price,
      localCurrency,
      valueLocal: sumLocalAbs,
      valueEur,
      fxRate: null,
      feeEur: brokerFeeEur,
      brokerFeeEur,
      autoFxFeeEur: 0,
      totalEur: isBuy ? -(valueEur + brokerFeeEur) : (valueEur - brokerFeeEur),
      orderId,
    });
  }
  return txs.sort((a, b) => a.date.localeCompare(b.date));
}
