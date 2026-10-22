import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return NextResponse.json({ error: "OPENROUTER_API_KEY missing" }, { status: 503 });
  const body = await request.text().catch(() => "{}");
  try {
    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body,
    });
    return new NextResponse(upstream.body, { status: upstream.status, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return NextResponse.json({ error: "proxy error" }, { status: 502 });
  }
}
