import { describe, it, expect } from "vitest";
import { isinToTicker } from "@/lib/portfolio/isin-to-ticker";

describe("isinToTicker — manual overrides", () => {
  it("GOOGL on NASDAQ (USD) → GOOGL", () => {
    expect(isinToTicker("US02079K3059", "USD", "Alphabet Inc Class A")).toBe("GOOGL");
  });
  it("GOOGL on Tradegate (EUR) → ABEA.DE", () => {
    expect(isinToTicker("US02079K3059", "EUR", "Alphabet Inc Class A")).toBe("ABEA.DE");
  });
  it("ZPDT (IE ETF in EUR) → ZPDT.DE", () => {
    expect(isinToTicker("IE00BWBXM948", "EUR", "SPDR S&P US Technology")).toBe("ZPDT.DE");
  });
});

describe("isinToTicker — currency-suffix fallback", () => {
  it("SEK → .ST suffix", () => {
    expect(isinToTicker("SE0015192067", "SEK", "Save Group")).toBe("SAVE.ST");
  });
  it("CHF → .SW suffix", () => {
    expect(isinToTicker("CH0024608827", "CHF", "Partners Group")).toBe("PARTNERS.SW");
  });
  it("GBP → .L suffix", () => {
    expect(isinToTicker("GB00B1YW4409", "GBP", "III plc")).toBe("III.L");
  });
  it("JPY → .T suffix", () => {
    expect(isinToTicker("JP3389510003", "JPY", "Pegasus Co")).toBe("PEGASUS.T");
  });
  it("AUD → .AX suffix", () => {
    expect(isinToTicker("AU000000BHP4", "AUD", "BHP Group")).toBe("BHP.AX");
  });
  it("CAD → .TO suffix", () => {
    expect(isinToTicker("CA0641491075", "CAD", "Bank of Nova Scotia")).toBe("BANK.TO");
  });
});

describe("isinToTicker — country-suffix fallback (EUR ambiguous)", () => {
  it("French ISIN (FR) → .PA", () => {
    expect(isinToTicker("FR0000131104", "EUR", "BNP Paribas")).toBe("BNP.PA");
  });
  it("Italian ISIN (IT) → .MI", () => {
    expect(isinToTicker("IT0003132476", "EUR", "Eni SpA")).toBe("ENI.MI");
  });
  it("Spanish ISIN (ES) → .MC", () => {
    expect(isinToTicker("ES0113900J37", "EUR", "Banco Santander")).toBe("BANCO.MC");
  });
  it("Greek ISIN (GR) → .AT", () => {
    expect(isinToTicker("GRS469003024", "EUR", "Kri Kri Milk")).toBe("KRI.AT");
  });
  it("Finnish ISIN (FI) → .HE", () => {
    expect(isinToTicker("FI0009000681", "EUR", "Nokia Oyj")).toBe("NOKIA.HE");
  });
});

describe("isinToTicker — US bare ticker", () => {
  it("US ISIN + USD → bare ticker", () => {
    expect(isinToTicker("US5949181045", "USD", "Microsoft Corp")).toBe("MICROSOFT");
  });
});

describe("isinToTicker — sanitization", () => {
  it("strips punctuation from product name", () => {
    expect(isinToTicker("US12345A6789", "USD", "Berkshire Hathaway Inc. Class B")).toBe("BERKSHIRE");
  });
  it("falls back to ISIN prefix when product is empty", () => {
    expect(isinToTicker("US12345A6789", "USD", "")).toBe("US12");
  });
});
