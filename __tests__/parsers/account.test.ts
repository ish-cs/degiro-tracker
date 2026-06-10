import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseAccountCsv } from "@/lib/parsers/account";

const sample = readFileSync(
  path.resolve(__dirname, "../../fixtures/Account.sample.csv"),
  "utf-8"
);

describe("parseAccountCsv", () => {
  it("parses all rows", () => {
    const events = parseAccountCsv(sample);
    expect(events).toHaveLength(5);
  });

  it("classifies dividend (not tax) as dividend", () => {
    const events = parseAccountCsv(sample);
    const div = events.find((e) => e.kind === "dividend")!;
    expect(div.amountEur).toBeCloseTo(5.4);
  });

  it("classifies dividend tax separately", () => {
    const events = parseAccountCsv(sample);
    const tax = events.find((e) => e.kind === "dividend_tax")!;
    expect(tax.amountEur).toBeCloseTo(-0.81);
  });

  it("classifies deposit", () => {
    const events = parseAccountCsv(sample);
    expect(events.some((e) => e.kind === "deposit" && e.amountEur === 1000)).toBe(true);
  });

  it("classifies fee", () => {
    const events = parseAccountCsv(sample);
    const fee = events.find((e) => e.kind === "fee")!;
    expect(fee.amountEur).toBeCloseTo(-2.5);
  });

  it("classifies buy from description", () => {
    const events = parseAccountCsv(sample);
    expect(events.some((e) => e.kind === "buy")).toBe(true);
  });
});
