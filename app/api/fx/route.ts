import { NextResponse } from "next/server";
import { fx } from "@/lib/api-clients/yahoo";

export async function GET(req: Request) {
  const pair = new URL(req.url).searchParams.get("pair") ?? "USDEUR";
  try {
    return NextResponse.json(await fx(pair));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
