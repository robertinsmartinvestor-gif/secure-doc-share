// app/api/verify-otp/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAccessRecord, incrementOtpAttempts, logAttempt, markVerified } from "@/lib/tokens";

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  const { token, code } = await req.json();
  const record = await getAccessRecord(token);

  if (!record) return NextResponse.json({ error: "lien invalide" }, { status: 404 });
  if (Date.now() > record.expiresAt)
    return NextResponse.json({ error: "lien expiré" }, { status: 410 });
  if (!record.otpCode || !record.otpExpiresAt || Date.now() > record.otpExpiresAt) {
    return NextResponse.json({ error: "code expiré, veuillez en demander un nouveau" }, { status: 410 });
  }
  if (record.otpAttempts >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "trop de tentatives, lien bloqué" }, { status: 429 });
  }

  await incrementOtpAttempts(token);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const userAgent = req.headers.get("user-agent");

  if (code !== record.otpCode) {
    await logAttempt(token, {
      timestamp: Date.now(),
      ip,
      country: null,
      gpsCountryMatch: null,
      result: "otp_failed",
      userAgent,
    });
    return NextResponse.json({ error: "code incorrect" }, { status: 401 });
  }

  await markVerified(token);
  await logAttempt(token, {
    timestamp: Date.now(),
    ip,
    country: null,
    gpsCountryMatch: null,
    result: "otp_verified",
    userAgent,
  });

  return NextResponse.json({ verified: true, expectedRecipientName: record.expectedRecipientName });
}
