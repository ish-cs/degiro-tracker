import Papa from "papaparse";
import type { CashEvent, CashEventKind } from "@/lib/types";

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
  // DEGIRO real export uses currency-code columns BEFORE the numeric amounts:
  //   Description, FX, [ChangeCcy], Change, [BalanceCcy], Balance, Order Id
  // ...but mislabels the currency column as "Change" / "Balance" in the header.
  // Detect by checking if the first row's "Change" parses as a currency code.

  const { data } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  if (data.length === 0) return [];

  const sample = data[0];
  const changeIsCurrency = looksLikeCurrencyCode(sample["Change"]) || (!sample["Change"] && sample[""] !== undefined);

  if (!changeIsCurrency) {
    // Old/fixture format — Change is numeric.
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
        orderId: row["Order ID"] || row["Order Id"] || null,
      }));
  }

  // Real DEGIRO format — re-parse without header so we can read by column index.
  const rows = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true }).data;
  const headers = (rows[0] ?? []) as string[];
  const idxDate = headers.indexOf("Date");
  const idxProduct = headers.indexOf("Product");
  const idxIsin = headers.indexOf("ISIN");
  const idxDesc = headers.indexOf("Description");
  const idxOrder = headers.findIndex((h) => h === "Order ID" || h === "Order Id");
  const idxChange = headers.indexOf("Change");
  const idxBalance = headers.indexOf("Balance");

  return rows.slice(1)
    .filter((r) => r[idxDate] && r[idxDesc])
    .map((r) => {
      const amountStr = r[idxChange + 1] ?? "";
      const balanceStr = r[idxBalance + 1] ?? "";
      const desc = r[idxDesc];
      return {
        date: parseEuropeanDate(r[idxDate]),
        product: r[idxProduct] ?? "",
        isin: r[idxIsin] || null,
        description: desc,
        kind: classify(desc),
        amountEur: num(amountStr),
        balanceEur: num(balanceStr),
        orderId: idxOrder >= 0 ? (r[idxOrder] || null) : null,
      };
    });
}
