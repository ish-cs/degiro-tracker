import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseAccountCsv, extractTxsFromAccount } from "@/lib/parsers/account";

const load = (name: string) =>
  readFileSync(path.resolve(__dirname, "../../fixtures", name), "utf-8");

describe("Dutch (NL) DEGIRO Account.csv", () => {
  const events = parseAccountCsv(load("Account.nl-degiro.csv"));
  const txs = extractTxsFromAccount(events);

  it("normalizes Dutch headers (Datum/Mutatie/Beschrijving/Saldo)", () => {
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("classifies Koop as buy", () => {
    const buys = events.filter((e) => e.kind === "buy");
    expect(buys.length).toBeGreaterThan(0);
  });

  it("classifies Dividendbelasting as dividend_tax (not dividend)", () => {
    const taxes = events.filter((e) => e.kind === "dividend_tax");
    const divs = events.filter((e) => e.kind === "dividend");
    expect(taxes).toHaveLength(1);
    expect(divs).toHaveLength(1);
  });

  it("classifies flatex Storting as deposit", () => {
    const deposits = events.filter((e) => e.kind === "deposit");
    expect(deposits.length).toBeGreaterThan(0);
  });

  it("extracts a Koop (buy) transaction", () => {
    const ceg = txs.find((t) => t.isin === "US21037T1097");
    expect(ceg).toBeDefined();
    expect(ceg!.quantity).toBe(4);
    expect(ceg!.localCurrency).toBe("USD");
    expect(ceg!.valueEur).toBeCloseTo(846.11, 2);
  });

  it("classifies DEGIRO Transactiekosten as fee", () => {
    const fees = events.filter((e) => e.kind === "fee");
    expect(fees.length).toBeGreaterThan(0);
  });
});

describe("German (DE) DEGIRO Account.csv", () => {
  const events = parseAccountCsv(load("Account.de-degiro.csv"));
  const txs = extractTxsFromAccount(events);

  it("normalizes German headers (Datum/Änderung/Beschreibung/Saldo)", () => {
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("classifies Kauf as buy", () => {
    const buys = events.filter((e) => e.kind === "buy");
    expect(buys.length).toBeGreaterThan(0);
  });

  it("classifies Dividendensteuer as dividend_tax", () => {
    const taxes = events.filter((e) => e.kind === "dividend_tax");
    expect(taxes).toHaveLength(1);
  });

  it("classifies flatex Einzahlung as deposit", () => {
    const deposits = events.filter((e) => e.kind === "deposit");
    expect(deposits.length).toBeGreaterThan(0);
  });

  it("extracts a Kauf (buy) transaction", () => {
    const ceg = txs.find((t) => t.isin === "US21037T1097");
    expect(ceg).toBeDefined();
    expect(ceg!.quantity).toBe(4);
    expect(ceg!.valueEur).toBeCloseTo(846.11, 2);
  });

  it("classifies DEGIRO Transaktionsgebühr as fee", () => {
    const fees = events.filter((e) => e.kind === "fee");
    expect(fees.length).toBeGreaterThan(0);
  });
});
