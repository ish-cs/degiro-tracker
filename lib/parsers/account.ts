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
