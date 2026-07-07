// app/api/accept-consent/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAccessRecord, recordConsent } from "@/lib/tokens";

export async function POST(req: NextRequest) {
  const { token, recipientName } = await req.json();
  const record = await getAccessRecord(token);

  if (!record) return NextResponse.json({ error: "lien invalide" }, { status: 404 });
  if (!record.verified)
    return NextResponse.json({ error: "vérification OTP non terminée" }, { status: 403 });

  // Se l'admin ha impostato un nome atteso per questo link, quel nome è
  // vincolante: ignoriamo qualsiasi valore inviato dal client, così chi apre
  // il link non può auto-dichiararsi con un nome diverso dopo l'OTP.
  const finalName = record.expectedRecipientName || recipientName;
  if (!finalName || finalName.trim().length < 2) {
    return NextResponse.json({ error: "nom invalide" }, { status: 400 });
  }

  await recordConsent(token, finalName.trim());
  return NextResponse.json({ ok: true, documentFilenames: record.documents.map((d) => d.displayName) });
}
