// app/api/create-link/route.ts
// Endpoint che usi TU (protetto, non pubblico) per generare un nuovo link monouso.
// In produzione mettici dietro autenticazione (es. controllo di una tua sessione admin).

import { NextRequest, NextResponse } from "next/server";
import { createAccessLink } from "@/lib/tokens";

export async function POST(req: NextRequest) {
  const { phoneNumber, adminSecret } = await req.json();

  // Protezione minima: solo tu conosci ADMIN_SECRET
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!phoneNumber || !phoneNumber.startsWith("+237")) {
    return NextResponse.json(
      { error: "phoneNumber mancante o non nel formato +237XXXXXXXXX" },
      { status: 400 }
    );
  }

  const record = createAccessLink(phoneNumber, "CM", 60);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  return NextResponse.json({
    link: `${baseUrl}/verify/${record.token}`,
    expiresAt: record.expiresAt,
  });
}
