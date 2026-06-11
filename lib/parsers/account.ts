import Papa from "papaparse";
import type { CashEvent, CashEventKind, Tx, Currency } from "@/lib/types";

// Translate localized DEGIRO column headers (NL/DE/FR/EN) → canonical English.
// DEGIRO emits the user's account language, so headers vary by locale.
const HEADER_ALIASES: Record<string, string> = {
  // Date
  "Datum": "Date", "Date": "Date",
  // Time / Hour
  "Tijd": "Time", "Uhrzeit": "Time", "Heure": "Time", "Time": "Time",
  // Value date
  "Valutadatum": "Value date", "Wertstellungsdatum": "Value date",
  "Date de valeur": "Value date", "Value date": "Value date",
  // Product / Stock
  "Produkt": "Product", "Produit": "Product", "Product": "Product",
  // ISIN
  "ISIN": "ISIN",
  // Description
  "Beschrijving": "Description", "Beschreibung": "Description",
  "Description": "Description",
  // FX rate column
  "FX": "FX", "Wechselkurs": "FX", "Taux de change": "FX",
  // Amount change
  "Mutatie": "Change", "Änderung": "Change", "Aenderung": "Change",
  "Variation": "Change", "Change": "Change",
  // Balance
  "Saldo": "Balance", "Bilanz": "Balance", "Solde": "Balance", "Balance": "Balance",
  // Order ID
  "Order ID": "Order ID", "Order Id": "Order ID",
  "Auftrags-ID": "Order ID", "Auftrag ID": "Order ID",
  "Referentie": "Order ID", "ID de l'ordre": "Order ID",
};

function canonicalHeader(raw: string): string {
  const trimmed = (raw ?? "").trim();
  return HEADER_ALIASES[trimmed] ?? trimmed;
}

const parseEuropeanDate = (raw: string): string => {
  // Handles DD-MM-YYYY (DEGIRO standard); also DD/MM/YYYY and DD.MM.YYYY.
  const parts = raw.split(/[-/.]/);
  if (parts.length !== 3) return raw;
  const [dd, mm, yyyy] = parts;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
};

const num = (raw: string | undefined | null): number => {
  if (!raw) return 0;
  // EU number format: "1.234,56" → "1234.56". US: "1,234.56" → "1234.56".
  let cleaned = raw.replace(/\s/g, "");
  if (cleaned.includes(",") && cleaned.includes(".")) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else {
    cleaned = cleaned.replace(",", ".");
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

// Multi-language description classifier. Common DEGIRO descriptions show up
// in the user's account language: Buy/Koop/Kauf/Achat, Sell/Verkoop/Verkauf/Vente,
// Dividend/Dividende, etc.
function classify(description: string): CashEventKind {
  const d = description.toLowerCase();
  // Order matters: dividend tax → dividend; stock split → split; etc.
  if (d.includes("dividend tax") || d.includes("dividend withholding") ||
      d.includes("dividendbelasting") || d.includes("dividendensteuer") ||
      d.includes("retenue sur dividende"))
    return "dividend_tax";
  if (d.includes("dividend") || d.includes("dividende"))
    return "dividend";
  if (d.includes("deposit") || d.includes("storting") || d.includes("einzahlung") ||
      d.includes("versement") || d.includes("flatex cash sweep transfer") ||
      d.includes("cash sweep transfer"))
    return "deposit";
  if (d.includes("withdrawal") || d.includes("opname") || d.includes("auszahlung") ||
      d.includes("retrait"))
    return "withdrawal";
  if (d.includes("stock split") || d.includes("share split") ||
      d.includes("bonus shares") || d.includes("bonus issue") ||
      d.includes("aktiensplit") || d.includes("aandelensplitsing"))
    return "split";
  if (d.includes("merger") || d.includes("spin-off") || d.includes("spinoff") ||
      d.includes("acquisition") || d.includes("fusion") || d.includes("verschmelzung"))
    return "merger";
  if (d.includes("fee") || d.includes("commission") || d.includes("kosten") ||
      d.includes("gebühr") || d.includes("gebuhr") || d.includes("frais"))
    return "fee";
  if (/^buy\b/.test(d) || /^koop\b/.test(d) || /^kauf\b/.test(d) || /^achat\b/.test(d))
    return "buy";
  if (/^sell\b/.test(d) || /^verkoop\b/.test(d) || /^verkauf\b/.test(d) || /^vente\b/.test(d))
    return "sell";
  if (d.startsWith("fx ") || d.includes("fx credit") || d.includes("fx debit") ||
      d.includes("change credit") || d.includes("change debit") ||
      d.includes("devisenkonvertierung"))
    return "fx";
  return "other";
}

const looksLikeCurrencyCode = (s: string) => /^[A-Z]{3}$/.test((s || "").trim());

export function parseAccountCsv(text: string): CashEvent[] {
  const raw = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true }).data;
  if (raw.length === 0) return [];

  const rawHeaders = (raw[0] ?? []) as string[];
  const headers = rawHeaders.map(canonicalHeader);

  // Re-parse with header:true using canonicalized header names for the first
  // (simple) detection path. Replace first row with canonicalized version.
  const canonicalText = [headers.join(","), ...raw.slice(1).map(
    (r) => r.map((c) => /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(",")
  )].join("\n");
  const { data } = Papa.parse<Record<string, string>>(canonicalText, {
    header: true, skipEmptyLines: true,
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

  // Real DEGIRO format — Change and Balance are split into [ccy, amount] pairs.
  const idxDate = headers.indexOf("Date");
  const idxProduct = headers.indexOf("Product");
  const idxIsin = headers.indexOf("ISIN");
  const idxDesc = headers.indexOf("Description");
  const idxFx = headers.indexOf("FX");
  const idxOrder = headers.findIndex((h) => h === "Order ID");
  const idxChange = headers.indexOf("Change");
  const idxBalance = headers.indexOf("Balance");

  return raw.slice(1)
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

// Extract per-trade transactions from Account.csv. Groups events by orderId
// and parses the canonical "Buy/Sell N Product@Price CCY (ISIN)" pattern.
// Localized variants (Koop/Kauf/Achat, Verkoop/Verkauf/Vente) also match.
const TRADE_RE = /^(Buy|Sell|Koop|Verkoop|Kauf|Verkauf|Achat|Vente)\s+(\d+(?:[.,]\d+)?)\s+(.+?)@([\d.,]+)\s+([A-Z]{3})\s+\(([A-Z0-9]+)\)/;
const BUY_WORDS = new Set(["Buy", "Koop", "Kauf", "Achat"]);

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
    const trades = group.filter(
      (e) => (e.kind === "buy" || e.kind === "sell") && TRADE_RE.test(e.description),
    );
    if (trades.length === 0) continue;

    const firstMatch = trades[0].description.match(TRADE_RE)!;
    const firstSideWord = firstMatch[1];
    const firstSideIsBuy = BUY_WORDS.has(firstSideWord);

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
      const sideIsBuy = BUY_WORDS.has(side);
      if (sideIsBuy !== firstSideIsBuy) { mixedSides = true; continue; }
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
    if (mixedSides) continue;
    if (absQty === 0 || !isin) continue;

    const price = weightedPrice / absQty;
    const quantity = firstSideIsBuy ? absQty : -absQty;

    let valueEur: number;
    if (localCurrency === "EUR") {
      const eurSum = trades
        .filter((t) => (firstSideIsBuy ? t.kind === "buy" : t.kind === "sell"))
        .reduce((s, t) => s + t.amount, 0);
      valueEur = Math.abs(eurSum);
    } else {
      const fxRows = group.filter(
        (e) =>
          e.currency === "EUR" &&
          (e.description.toLowerCase().includes("fx debit") ||
            e.description.toLowerCase().includes("fx credit") ||
            e.description.toLowerCase().includes("change debit") ||
            e.description.toLowerCase().includes("change credit")),
      );
      valueEur = Math.abs(fxRows.reduce((s, e) => s + e.amount, 0));
    }

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
      totalEur: firstSideIsBuy ? -(valueEur + brokerFeeEur) : (valueEur - brokerFeeEur),
      orderId,
    });
  }
  return txs.sort((a, b) => a.date.localeCompare(b.date));
}
