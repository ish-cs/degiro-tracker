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
