import { NextResponse } from "next/server";
import { history } from "@/lib/api-clients/yahoo";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol");
  const range = url.searchParams.get("range") ?? "5y";
  if (!symbol) return NextResponse.json({ error: "no symbol" }, { status: 400 });
  try {
    const points = await history(symbol, range);
    return NextResponse.json({ symbol, points });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
