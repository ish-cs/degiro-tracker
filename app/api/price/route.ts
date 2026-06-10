import { NextResponse } from "next/server";
import { quote } from "@/lib/api-clients/yahoo";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbols = (url.searchParams.get("symbols") ?? "").split(",").filter(Boolean);
  if (symbols.length === 0) return NextResponse.json({ error: "no symbols" }, { status: 400 });
  try {
    const results = await Promise.all(symbols.map(async (s) => [s, await quote(s)] as const));
    return NextResponse.json(Object.fromEntries(results));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
