const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("en-IE", { style: "percent", maximumFractionDigits: 2 });

export const fmtEur = (n: number) => eur.format(n);
export const fmtPct = (n: number) => pct.format(n);
export const fmtNum = (n: number, dp = 2) => n.toLocaleString("en-IE", { maximumFractionDigits: dp });
export const signCls = (n: number) => n > 0 ? "text-[var(--color-positive)]" : n < 0 ? "text-[var(--color-negative)]" : "";
