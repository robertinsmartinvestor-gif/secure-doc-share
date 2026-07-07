// app/api/list-links/route.ts
// Endpoint che usi TU per vedere lo storico dei link generati (solo metadati,
// nessun token completo né dato sensibile), da mostrare nella pagina /admin.

import { NextRequest, NextResponse } from "next/server";
import { listAllTokens } from "@/lib/tokens";

export async function GET(req: NextRequest) {
  const adminSecret = req.headers.get("x-admin-secret") || req.nextUrl.searchParams.get("adminSecret");

  if (adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ links: await listAllTokens() });
}
