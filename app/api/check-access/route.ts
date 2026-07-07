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

  const record = getAccessRecord(token);
  if (!record) {
    return NextResponse.json({ error: "link non valido" }, { status: 404 });
  }
  if (Date.now() > record.expiresAt) {
    return NextResponse.json({ error: "link scaduto" }, { status: 410 });
  }
  if (record.used) {
    logAttempt(token, {
      timestamp: Date.now(),
      ip: getIp(req),
      country: null,
      gpsCountryMatch: null,
      result: "already_used",
    });
    return NextResponse.json({ error: "documento già scaricato in precedenza" }, { status: 410 });
  }

  const ip = getIp(req);
  const ipCountry = await lookupIpCountry(ip);

  const gpsMatch = gpsCountry ? gpsCountry === record.expectedCountry : null;
  const ipMatch = ipCountry === record.expectedCountry;

  // Blocchi se ENTRAMBI i segnali disponibili dicono "non è il paese giusto".
  // Se il GPS non è disponibile (permesso negato), ci si basa solo sull'IP
  // ma lo segnaliamo come rischio più alto nel log.
  const blocked = !ipMatch && (gpsMatch === false || gpsMatch === null);

  logAttempt(token, {
    timestamp: Date.now(),
    ip,
    country: ipCountry,
    gpsCountryMatch: gpsMatch,
    result: blocked ? "blocked_country" : "otp_sent",
  });

  if (blocked) {
    return NextResponse.json(
      { error: "Accesso non consentito da questa posizione." },
      { status: 403 }
    );
  }

  // Genera OTP a 6 cifre e invialo via SMS al numero registrato per questo link
  const code = String(Math.floor(100000 + Math.random() * 900000));
  setOtp(token, code, 5);
  await sendOtpSms(record.phoneNumber, code);

  return NextResponse.json({ otpSent: true });
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
