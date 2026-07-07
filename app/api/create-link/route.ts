// app/api/create-link/route.ts
// Endpoint che usi TU (protetto, non pubblico) per generare un nuovo link monouso.
// In produzione mettici dietro autenticazione (es. controllo di una tua sessione admin).

import { NextRequest, NextResponse } from "next/server";
import { createAccessLink } from "@/lib/tokens";
import { access } from "fs/promises";
import path from "path";

const FILENAME_RE = /^[a-zA-Z0-9_.\-]+\.pdf$/i;

export async function POST(req: NextRequest) {
  const { phoneNumber, adminSecret, documentFilenames } = await req.json();

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

  if (!Array.isArray(documentFilenames) || documentFilenames.length === 0) {
    return NextResponse.json(
      { error: "documentFilenames mancante: specifica almeno un file di secure-files/" },
      { status: 400 }
    );
  }
  if (!documentFilenames.every((f) => typeof f === "string" && FILENAME_RE.test(f))) {
    return NextResponse.json(
      { error: "documentFilenames contiene nomi file non validi (solo *.pdf, senza percorsi)" },
      { status: 400 }
    );
  }

  const missing: string[] = [];
  for (const filename of documentFilenames) {
    try {
      await access(path.join(process.cwd(), "secure-files", filename));
    } catch {
      missing.push(filename);
    }
  }
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `file non trovati in secure-files/: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  const record = createAccessLink(phoneNumber, documentFilenames, "CM", 60);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  return NextResponse.json({
    link: `${baseUrl}/verify/${record.token}`,
    expiresAt: record.expiresAt,
  });
}
