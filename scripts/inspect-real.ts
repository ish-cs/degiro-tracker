import { readFileSync } from "node:fs";
import path from "node:path";
import { parseAccountCsv, extractTxsFromAccount } from "../lib/parsers/account";
import { currentPositions } from "../lib/portfolio/positions";
import { extractSplits } from "../lib/portfolio/splits";
import { buildHistoricalFx, makeFxLookup } from "../lib/portfolio/historical-fx";
import {
  totalFeesEur, totalTaxesEur, totalDividendsEur, totalOtherIncomeEur,
  totalMarginInterestEur, estimatedAutoFxFromVolume, totalCostsEur,
  cashBalancesByCurrency, totalCashEur,
} from "../lib/portfolio/cost-ratio";
import { computeReturns } from "../lib/portfolio/returns";
import { findUnrecognizedEvents } from "../lib/portfolio/unrecognized";

const text = readFileSync(path.resolve(__dirname, "../fixtures/Account.real-degiro.csv"), "utf-8");
const events = parseAccountCsv(text);
const txs = extractTxsFromAccount(events);
const splits = extractSplits(events);
const positions = currentPositions(txs, splits);
const fxIndex = buildHistoricalFx(events);
const fxLookup = makeFxLookup(fxIndex, { USD: 0.866 });

// Mock prices roughly matching what user reported live:
const mockPrices: Record<string, { priceEur: number; currency: string }> = {
  US02079K3059: { priceEur: 310, currency: "EUR" },
  IE00BWBXM948: { priceEur: 153, currency: "EUR" },
  US92840M1027: { priceEur: 120 * 0.866, currency: "EUR" },
  US21037T1097: { priceEur: 210 * 0.866, currency: "EUR" },
};

const divs = totalDividendsEur(events, fxLookup);
const costs = totalCostsEur(events, txs, fxLookup, true);
const other = totalOtherIncomeEur(events, fxLookup);
const r = computeReturns(
  positions, divs, mockPrices, costs, other, txs, events, fxLookup, "2026-06-11",
);

console.log("\n=== Real portfolio summary ===");
console.log("Positions:", positions.length);
for (const p of positions) {
  console.log(`  ${p.isin}: ${p.quantity} sh @ €${p.bep.toFixed(2)} BEP (costBasis €${p.costBasisEur.toFixed(2)})`);
}
console.log("\n--- Income ---");
console.log("Dividends gross:", Object.entries(divs).map(([k,v]) => `${k}=€${v.toFixed(3)}`).join(", "));
console.log("Other income (rebate+interest):", `€${other.toFixed(2)}`);
console.log("Total income:", `€${(Object.values(divs).reduce((s,v)=>s+v,0) + other).toFixed(2)}`);
console.log("\n--- Costs ---");
console.log("Broker fees:", `€${totalFeesEur(events).toFixed(2)}`);
console.log("Dividend tax:", `€${totalTaxesEur(events, fxLookup).toFixed(2)}`);
console.log("Margin interest:", `€${totalMarginInterestEur(events, fxLookup).toFixed(2)}`);
console.log("AutoFX (0.25% × vol):", `€${estimatedAutoFxFromVolume(events).toFixed(2)}`);
console.log("Total costs:", `€${costs.toFixed(2)}`);

console.log("\n--- Cash ---");
console.log("Balances by ccy:", cashBalancesByCurrency(events));
console.log("Total cash (EUR):", `€${totalCashEur(events, fxLookup).toFixed(2)}`);

console.log("\n--- Returns ---");
console.log("Cost basis:", `€${r.costBasisEur.toFixed(2)}`);
console.log("Current value:", `€${r.currentValueEur.toFixed(2)}`);
console.log("Total return €:", `€${r.totalReturnEur.toFixed(2)}`);
console.log("Total return %:", `${(r.totalReturnPct * 100).toFixed(2)}% (XIRR annualized)`);
console.log("Simple return %:", `${(r.totalReturnPctSimple * 100).toFixed(2)}%`);
console.log("Cost ratio %:", `${(r.costRatioPct * 100).toFixed(2)}%`);

console.log("\n--- Historical FX ---");
console.log("USD rates observed:", fxIndex.USD?.map((e) => `${e.date}: ${e.eurPerUnit.toFixed(4)}`).join("\n  "));

console.log("\n--- Unrecognized events ---");
const unhandled = findUnrecognizedEvents(events);
if (unhandled.length === 0) {
  console.log("(none — all events handled)");
} else {
  for (const g of unhandled) {
    console.log(`  [${g.kind}] ${g.description} ×${g.count} (€${g.totalEur.toFixed(2)})`);
  }
}
