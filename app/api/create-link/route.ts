// app/api/create-link/route.ts
// Endpoint che usi TU (protetto, non pubblico) per generare un nuovo link monouso.
// In produzione mettici dietro autenticazione (es. controllo di una tua sessione admin).

import { NextRequest, NextResponse } from "next/server";
import { createAccessLink, setOtp } from "@/lib/tokens";

const PHONE_RE = /^\+[1-9]\d{7,14}$/;
const COUNTRY_RE = /^[A-Za-z]{2}$/;
const ALLOWED_TTL_MINUTES = [30, 60, 360, 1440];
const ALLOWED_MANUAL_OTP_TTL_MINUTES = [15, 30, 60, 720, 1440];
const NORMAL_OTP_TTL_MINUTES = 5;

export async function POST(req: NextRequest) {
  const {
    phoneNumber,
    adminSecret,
    documents,
    expectedCountry,
    expectedRecipientName,
    ttlMinutes,
    otpTtlMinutes,
    testMode,
    manualOtpMode,
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

  if (testMode === true && manualOtpMode === true) {
    return NextResponse.json(
      { error: "Modalità test e Invio manuale OTP sono mutuamente esclusive: attivane solo una" },
      { status: 400 }
    );
  }

  const manualOtpModeFlag = manualOtpMode === true;
  if (
    manualOtpModeFlag &&
    otpTtlMinutes !== undefined &&
    !ALLOWED_MANUAL_OTP_TTL_MINUTES.includes(otpTtlMinutes)
  ) {
    return NextResponse.json(
      { error: `otpTtlMinutes non valido per l'invio manuale: valori ammessi ${ALLOWED_MANUAL_OTP_TTL_MINUTES.join(", ")}` },
      { status: 400 }
    );
  }
  const resolvedOtpTtlMinutes = manualOtpModeFlag
    ? otpTtlMinutes ?? ALLOWED_MANUAL_OTP_TTL_MINUTES[0]
    : NORMAL_OTP_TTL_MINUTES;

  // Un OTP che sopravvive più a lungo del link stesso non avrebbe senso: il
  // link bloccherebbe l'accesso prima che l'OTP scada. Se la durata OTP
  // scelta supera il TTL del link, estendiamo il TTL del link al più
  // piccolo valore ammesso che copre l'intera durata OTP.
  let resolvedTtlMinutes = ttlMinutes ?? 60;
  if (manualOtpModeFlag && resolvedTtlMinutes < resolvedOtpTtlMinutes) {
    const bumped = ALLOWED_TTL_MINUTES.find((t) => t >= resolvedOtpTtlMinutes);
    resolvedTtlMinutes = bumped ?? ALLOWED_TTL_MINUTES[ALLOWED_TTL_MINUTES.length - 1];
  }

  if (!Array.isArray(documents) || documents.length === 0) {
    return NextResponse.json(
      { error: "documents mancante: carica almeno un PDF prima di generare il link" },
      { status: 400 }
    );
  }
  if (!documents.every(isValidDocument)) {
    return NextResponse.json(
      { error: "documents contiene voci non valide: ogni documento deve avere displayName (*.pdf) e url Blob validi" },
      { status: 400 }
    );
  }

  const record = await createAccessLink({
    phoneNumber,
    documents,
    expectedCountry: expectedCountry.toUpperCase(),
    expectedRecipientName: expectedRecipientName?.trim() || null,
    ttlMinutes: resolvedTtlMinutes,
    otpTtlMinutes: resolvedOtpTtlMinutes,
    testMode: testMode === true,
    manualOtpMode: manualOtpModeFlag,
    skipGeoCheck: skipGeoCheck === true,
  });

  // In modalità "invio manuale" l'OTP viene generato subito, non al primo
  // check-access del destinatario, così l'admin può comunicarlo da subito
  // sul canale che preferisce (telefonata, WhatsApp...) senza tempi morti.
  let manualOtpCode: string | null = null;
  if (record.manualOtpMode) {
    manualOtpCode = String(Math.floor(100000 + Math.random() * 900000));
    await setOtp(record.token, manualOtpCode, record.otpTtlMinutes);
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  return NextResponse.json({
    link: `${baseUrl}/verify/${record.token}`,
    phoneNumber: record.phoneNumber,
    expectedCountry: record.expectedCountry,
    expectedRecipientName: record.expectedRecipientName,
    documentFilenames: record.documents.map((d) => d.displayName),
    expiresAt: record.expiresAt,
    testMode: record.testMode,
    manualOtpMode: record.manualOtpMode,
    manualOtpCode,
    otpTtlMinutes: record.otpTtlMinutes,
    skipGeoCheck: record.skipGeoCheck,
  });
}

// I documenti arrivano già caricati su Vercel Blob via POST /api/upload:
// qui validiamo solo la forma dei dati (nessun path traversal, url Blob
// plausibile), non il contenuto del file.
function isValidDocument(doc: unknown): doc is { url: string; displayName: string } {
  if (typeof doc !== "object" || doc === null) return false;
  const { displayName, url } = doc as { displayName?: unknown; url?: unknown };
  if (typeof displayName !== "string" || !isValidDisplayName(displayName)) return false;
  if (typeof url !== "string" || !isValidBlobUrl(url)) return false;
  return true;
}

// Accetta qualsiasi nome file *.pdf (spazi, accenti, parentesi inclusi),
// purché non contenga separatori di percorso o riferimenti relativi.
function isValidDisplayName(name: string): boolean {
  if (!name.toLowerCase().endsWith(".pdf")) return false;
  if (name.includes("/") || name.includes("\\")) return false;
  if (name === "." || name === "..") return false;
  return true;
}

function isValidBlobUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Copre sia store pubblici (<id>.public.blob.vercel-storage.com) sia
    // privati (<id>.private.blob.vercel-storage.com).
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}
