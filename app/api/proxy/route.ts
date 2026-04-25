import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const { url, apiKey, body } = await req.json()

  if (!url || !body) {
    return NextResponse.json({ error: "Missing url or body" }, { status: 400 })
  }

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey || ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    const data = await resp.text()

    return new NextResponse(data, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") || "application/json" },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
