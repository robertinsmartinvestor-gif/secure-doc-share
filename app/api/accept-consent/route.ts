// app/api/accept-consent/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAccessRecord, recordConsent } from "@/lib/tokens";

export async function POST(req: NextRequest) {
  const { token, recipientName } = await req.json();
  const record = getAccessRecord(token);

  if (!record) return NextResponse.json({ error: "lien invalide" }, { status: 404 });
  if (!record.verified)
    return NextResponse.json({ error: "vérification OTP non terminée" }, { status: 403 });
  if (!recipientName || recipientName.trim().length < 2) {
    return NextResponse.json({ error: "nom invalide" }, { status: 400 });
  }

  recordConsent(token, recipientName.trim());
  return NextResponse.json({ ok: true, documentFilenames: record.documentFilenames });
}
