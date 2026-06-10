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

const num = (raw: string | undefined | null): number => {
  if (!raw) return 0;
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const pick = (row: Record<string, string>, ...keys: string[]): string => {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== "") return v;
  }
  return "";
};

export function parseTransactionsCsv(text: string): Tx[] {
  const { data } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  return data
    .filter((row) => row["ISIN"] && row["Date"])
    .map((row) => {
      const exchange = (pick(row, "Reference exchange", "Exchange") || "").toUpperCase();
      const localCurrency = exchangeCurrency[exchange] ?? "EUR";
      const qty = num(pick(row, "Quantity"));
      const fxRate = num(pick(row, "Exchange rate")) || 1.0;
      const autoFxFee = Math.abs(num(pick(row, "AutoFX Fee")));
      const txFee = Math.abs(num(pick(row, "Transaction and/or third party fees EUR", "Fee")));
      const feeEur = autoFxFee + txFee;

      return {
        date: parseEuropeanDate(row["Date"]),
        time: row["Time"] ?? "",
        product: row["Product"] ?? "",
        isin: row["ISIN"],
        exchange,
        quantity: qty,
        price: num(pick(row, "Price")),
        localCurrency,
        valueLocal: Math.abs(num(pick(row, "Local value"))),
        valueEur: Math.abs(num(pick(row, "Value EUR", "Value"))),
        fxRate,
        feeEur,
        totalEur: num(pick(row, "Total EUR", "Total")),
        orderId: pick(row, "Order ID", "Order Id"),
      } as Tx;
    });
}
