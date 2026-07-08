// app/api/check-access/route.ts
// Primo filtro: controlla il paese via IP (server-side) e riceve il paese dedotto
// dal GPS lato client (se l'utente ha concesso il permesso). Se tutto combacia
// con "CM", genera e invia l'OTP via SMS. Non è ancora l'autenticazione vera:
// quella è l'OTP.

import { NextRequest, NextResponse } from "next/server";
import { getAccessRecord, logAttempt, setOtp } from "@/lib/tokens";
import { sendOtpSms } from "@/lib/twilio";

export async function POST(req: NextRequest) {
  const { token, gpsCountry } = await req.json();

  const record = await getAccessRecord(token);
  if (!record) {
    return NextResponse.json({ error: "lien invalide" }, { status: 404 });
  }
  if (Date.now() > record.expiresAt) {
    return NextResponse.json({ error: "lien expiré" }, { status: 410 });
  }
  const userAgent = req.headers.get("user-agent");

  if (record.used) {
    await logAttempt(token, {
      timestamp: Date.now(),
      ip: getIp(req),
      country: null,
      gpsCountryMatch: null,
      result: "already_used",
      userAgent,
    });
    return NextResponse.json({ error: "document déjà téléchargé précédemment" }, { status: 410 });
  }

  const ip = getIp(req);

  if (record.skipGeoCheck) {
    await logAttempt(token, {
      timestamp: Date.now(),
      ip,
      country: null,
      gpsCountryMatch: null,
      result: "otp_sent",
      userAgent,
    });
    return sendOtp(record);
  }

  const ipCountry = await lookupIpCountry(ip);

  // DEBUG TEMPORANEO — da rimuovere dopo aver individuato la causa del falso
  // blocco geografico segnalato: mostra i tre valori grezzi prima di ogni
  // normalizzazione/confronto, visibili nei Function Logs di Vercel.
  console.log("[check-access] geo debug", {
    token,
    ip,
    ipCountry,
    gpsCountry,
    expectedCountry: record.expectedCountry,
  });

  // Normalizza entrambi i lati di ogni confronto: i valori dovrebbero già
  // arrivare in maiuscolo (lookupIpCountry/reverseGeocodeCountry/create-link
  // applicano .toUpperCase() a monte), ma normalizziamo di nuovo qui — punto
  // in cui avviene il confronto effettivo — per non dipendere silenziosamente
  // da quell'invariante e per coprire eventuali record legacy in Redis.
  const expectedCountry = normalizeCountry(record.expectedCountry);
  const normalizedGpsCountry = normalizeCountry(gpsCountry);
  const normalizedIpCountry = normalizeCountry(ipCountry);

  const gpsMatch = normalizedGpsCountry ? normalizedGpsCountry === expectedCountry : null;
  const ipMatch = normalizedIpCountry === expectedCountry;

  // Blocchi se ENTRAMBI i segnali disponibili dicono "non è il paese giusto".
  // Se il GPS non è disponibile (permesso negato), ci si basa solo sull'IP
  // ma lo segnaliamo come rischio più alto nel log.
  const blocked = !ipMatch && (gpsMatch === false || gpsMatch === null);

  await logAttempt(token, {
    timestamp: Date.now(),
    ip,
    country: ipCountry,
    gpsCountryMatch: gpsMatch,
    result: blocked ? "blocked_country" : "otp_sent",
    userAgent,
  });

  if (blocked) {
    return NextResponse.json(
      {
        error:
          "Accès refusé : votre position ne correspond pas au pays autorisé pour ce document. Si vous utilisez un VPN, désactivez-le et réessayez. Si le problème persiste, contactez la personne qui vous a envoyé ce lien.",
      },
      { status: 403 }
    );
  }

  return sendOtp(record);
}

async function sendOtp(record: NonNullable<Awaited<ReturnType<typeof getAccessRecord>>>) {
  if (record.manualOtpMode) {
    // Il codice è già stato generato alla creazione del link e comunicato
    // manualmente dall'admin: non lo rigeneriamo qui, altrimenti quello già
    // condiviso col destinatario diventerebbe invalido.
    const code = record.otpCode ?? (await generateAndSetOtp(record));
    return NextResponse.json({ otpSent: true, manualCode: code });
  }

  // Genera OTP a 6 cifre. In modalità test non viene inviato via SMS: torna
  // direttamente nella risposta JSON, così la pagina admin può mostrarlo
  // senza consumare credito Twilio durante i test.
  const code = await generateAndSetOtp(record);

  if (record.testMode) {
    return NextResponse.json({ otpSent: true, testCode: code });
  }

  await sendOtpSms(record.phoneNumber, code);
  return NextResponse.json({ otpSent: true });
}

async function generateAndSetOtp(record: NonNullable<Awaited<ReturnType<typeof getAccessRecord>>>): Promise<string> {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await setOtp(record.token, code, record.otpTtlMinutes);
  return code;
}

// Normalizza un codice paese per il confronto: maiuscolo + trim, tollerante
// a null/undefined/stringa vuota (usato sia per il valore atteso salvato sul
// record sia per i valori rilevati via IP/GPS).
function normalizeCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

function getIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "unknown";
}

async function lookupIpCountry(ip: string): Promise<string | null> {
  if (ip === "unknown") return null;
  try {
    // Sostituibile con MaxMind GeoLite2 locale per non dipendere da un servizio esterno
    const res = await fetch(`https://ipapi.co/${ip}/country/`);
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text.length === 2 ? text.toUpperCase() : null;
  } catch {
    return null;
  }
}
