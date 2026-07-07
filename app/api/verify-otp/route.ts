// app/api/verify-otp/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAccessRecord, logAttempt, markVerified } from "@/lib/tokens";

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  const { token, code } = await req.json();
  const record = getAccessRecord(token);

  if (!record) return NextResponse.json({ error: "link non valido" }, { status: 404 });
  if (Date.now() > record.expiresAt)
    return NextResponse.json({ error: "link scaduto" }, { status: 410 });
  if (!record.otpCode || !record.otpExpiresAt || Date.now() > record.otpExpiresAt) {
    return NextResponse.json({ error: "codice scaduto, richiedine uno nuovo" }, { status: 410 });
  }
  if (record.otpAttempts >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "troppi tentativi, link bloccato" }, { status: 429 });
  }

  record.otpAttempts += 1;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";

  if (code !== record.otpCode) {
    logAttempt(token, {
      timestamp: Date.now(),
      ip,
      country: null,
      gpsCountryMatch: null,
      result: "otp_failed",
    });
    return NextResponse.json({ error: "codice errato" }, { status: 401 });
  }

  markVerified(token);
  logAttempt(token, {
    timestamp: Date.now(),
    ip,
    country: null,
    gpsCountryMatch: null,
    result: "otp_verified",
  });

  return NextResponse.json({ verified: true });
}
