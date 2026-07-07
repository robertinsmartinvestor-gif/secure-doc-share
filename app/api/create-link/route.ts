// app/api/create-link/route.ts
// Endpoint che usi TU (protetto, non pubblico) per generare un nuovo link monouso.
// In produzione mettici dietro autenticazione (es. controllo di una tua sessione admin).

import { NextRequest, NextResponse } from "next/server";
import { createAccessLink } from "@/lib/tokens";
import { access } from "fs/promises";
import path from "path";

const PHONE_RE = /^\+[1-9]\d{7,14}$/;
const COUNTRY_RE = /^[A-Za-z]{2}$/;
const ALLOWED_TTL_MINUTES = [30, 60, 360, 1440];
const ALLOWED_OTP_TTL_MINUTES = [5, 15];

export async function POST(req: NextRequest) {
  const {
    phoneNumber,
    adminSecret,
    documentFilenames,
    expectedCountry,
    expectedRecipientName,
    ttlMinutes,
    otpTtlMinutes,
    testMode,
    skipGeoCheck,
  } = await req.json();

  // Protezione minima: solo tu conosci ADMIN_SECRET
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!phoneNumber || !PHONE_RE.test(phoneNumber)) {
    return NextResponse.json(
      { error: "numero mancante o non in formato internazionale valido (es. +391234567890)" },
      { status: 400 }
    );
  }

  if (!expectedCountry || !COUNTRY_RE.test(expectedCountry)) {
    return NextResponse.json(
      { error: "expectedCountry mancante o non valido: usa un codice ISO a 2 lettere (es. CM, IT)" },
      { status: 400 }
    );
  }

  if (ttlMinutes !== undefined && !ALLOWED_TTL_MINUTES.includes(ttlMinutes)) {
    return NextResponse.json(
      { error: `ttlMinutes non valido: valori ammessi ${ALLOWED_TTL_MINUTES.join(", ")}` },
      { status: 400 }
    );
  }

  if (otpTtlMinutes !== undefined && !ALLOWED_OTP_TTL_MINUTES.includes(otpTtlMinutes)) {
    return NextResponse.json(
      { error: `otpTtlMinutes non valido: valori ammessi ${ALLOWED_OTP_TTL_MINUTES.join(", ")}` },
      { status: 400 }
    );
  }

  if (!Array.isArray(documentFilenames) || documentFilenames.length === 0) {
    return NextResponse.json(
      { error: "documentFilenames mancante: specifica almeno un file di secure-files/" },
      { status: 400 }
    );
  }
  if (!documentFilenames.every((f) => typeof f === "string" && isValidFilename(f))) {
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

  const record = createAccessLink({
    phoneNumber,
    documentFilenames,
    expectedCountry: expectedCountry.toUpperCase(),
    expectedRecipientName: expectedRecipientName?.trim() || null,
    ttlMinutes: ttlMinutes ?? 60,
    otpTtlMinutes: otpTtlMinutes ?? 5,
    testMode: testMode === true,
    skipGeoCheck: skipGeoCheck === true,
  });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  return NextResponse.json({
    link: `${baseUrl}/verify/${record.token}`,
    phoneNumber: record.phoneNumber,
    expectedCountry: record.expectedCountry,
    expectedRecipientName: record.expectedRecipientName,
    documentFilenames: record.documentFilenames,
    expiresAt: record.expiresAt,
    testMode: record.testMode,
    skipGeoCheck: record.skipGeoCheck,
  });
}

// Accetta qualsiasi nome file *.pdf (spazi, accenti, parentesi inclusi),
// purché non contenga separatori di percorso o riferimenti relativi che
// permetterebbero di uscire da secure-files/.
function isValidFilename(name: string): boolean {
  if (!name.toLowerCase().endsWith(".pdf")) return false;
  if (name.includes("/") || name.includes("\\")) return false;
  if (name === "." || name === "..") return false;
  return name === path.basename(name);
}
