// XIRR — money-weighted, annualized return for irregular cashflows.
// Newton-Raphson on NPV(r) = sum(CF_i / (1+r)^(years_i)) = 0.
//
// Sign convention (portfolio view):
//   negative = capital committed (buy, fee, withholding tax)
//   positive = capital returned (sell, dividend, terminal mark-to-market value)
//
// Matches the "Personal Rate of Return" / "Time-weighted equivalent" shown by
// IBKR, Schwab, Fidelity, Vanguard, and Simple Portfolio.

export type Cashflow = { dateIso: string; amount: number };

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365;

function parseUtc(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

function npv(rate: number, flows: Cashflow[], t0: number): number {
  let s = 0;
  for (const f of flows) {
    const years = (parseUtc(f.dateIso) - t0) / MS_PER_DAY / DAYS_PER_YEAR;
    s += f.amount / Math.pow(1 + rate, years);
  }
  return s;
}

function dnpv(rate: number, flows: Cashflow[], t0: number): number {
  let s = 0;
  for (const f of flows) {
    const years = (parseUtc(f.dateIso) - t0) / MS_PER_DAY / DAYS_PER_YEAR;
    s -= (years * f.amount) / Math.pow(1 + rate, years + 1);
  }
  return s;
}

// Newton-Raphson, falling back to bisection if it diverges. Returns null only
// for inputs where no IRR exists (all-positive or all-negative flows).
export function xirr(flows: Cashflow[], guess: number = 0.1): number | null {
  if (flows.length < 2) return null;
  const hasNeg = flows.some((f) => f.amount < -1e-9);
  const hasPos = flows.some((f) => f.amount > 1e-9);
  if (!hasNeg || !hasPos) return null;

  const times = flows.map((f) => parseUtc(f.dateIso));
  const t0 = Math.min(...times);
  if (!Number.isFinite(t0)) return null;

  // Newton-Raphson — usually converges in <10 iterations.
  let r = guess;
  for (let i = 0; i < 100; i++) {
    const f = npv(r, flows, t0);
    if (Math.abs(f) < 1e-9) return r;
    const df = dnpv(r, flows, t0);
    if (!Number.isFinite(df) || df === 0) break;
    const next = r - f / df;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - r) < 1e-10) return next;
    // Keep r > -1 so (1+r)^x stays defined.
    r = Math.max(-0.9999, next);
  }

  // Bisection fallback — guaranteed convergence on bracketed root.
  let lo = -0.9999;
  let hi = 10;
  let fLo = npv(lo, flows, t0);
  let fHi = npv(hi, flows, t0);
  if (fLo * fHi > 0) {
    // Expand upper bound — extremely high returns
    for (let k = 0; k < 5; k++) {
      hi *= 10;
      fHi = npv(hi, flows, t0);
      if (fLo * fHi <= 0) break;
    }
    if (fLo * fHi > 0) return null;
  }
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid, flows, t0);
    if (Math.abs(fm) < 1e-9 || (hi - lo) < 1e-10) return mid;
    if (fLo * fm < 0) {
      hi = mid;
      fHi = fm;
    } else {
      lo = mid;
      fLo = fm;
    }
  }
  return (lo + hi) / 2;
}
