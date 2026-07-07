// app/api/download/route.ts
// Serve il file solo dopo verifica OTP completata. Marca il link come "used"
// dopo il primo download riuscito, così non è riutilizzabile.

import { NextRequest, NextResponse } from "next/server";
import { getAccessRecord, markUsed } from "@/lib/tokens";
import { applyWatermark } from "@/lib/watermark";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token mancante" }, { status: 400 });

  const record = getAccessRecord(token);
  if (!record) return NextResponse.json({ error: "link non valido" }, { status: 404 });
  if (!record.verified)
    return NextResponse.json({ error: "verifica OTP non completata" }, { status: 403 });
  if (!record.consentAcceptedAt || !record.recipientName)
    return NextResponse.json({ error: "clausola di riservatezza non accettata" }, { status: 403 });
  if (record.used)
    return NextResponse.json({ error: "documento già scaricato" }, { status: 410 });
  if (Date.now() > record.expiresAt)
    return NextResponse.json({ error: "link scaduto" }, { status: 410 });

  // Metti i documenti reali fuori da /public, in una cartella non servita
  // direttamente, es. /secure-files, così sono raggiungibili solo da qui.
  const filePath = path.join(process.cwd(), "secure-files", "documenti.pdf");
  const fileBuffer = await readFile(filePath);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const watermarked = await applyWatermark(fileBuffer, {
    recipientName: record.recipientName,
    ip,
    token: record.token,
    timestamp: Date.now(),
  });

  markUsed(token);

  return new NextResponse(Buffer.from(watermarked), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="documenti.pdf"',
    },
  });
}
