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
