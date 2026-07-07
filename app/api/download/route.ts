// app/api/download/route.ts
// Serve il file solo dopo verifica OTP completata. Marca il link come "used"
// dopo il primo download riuscito, così non è riutilizzabile.

import { NextRequest, NextResponse } from "next/server";
import { getAccessRecord, markUsed } from "@/lib/tokens";
import { applyWatermark } from "@/lib/watermark";
import { readFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "jeton manquant" }, { status: 400 });

  const record = getAccessRecord(token);
  if (!record) return NextResponse.json({ error: "lien invalide" }, { status: 404 });
  if (!record.verified)
    return NextResponse.json({ error: "vérification OTP non terminée" }, { status: 403 });
  if (!record.consentAcceptedAt || !record.recipientName)
    return NextResponse.json({ error: "clause de confidentialité non acceptée" }, { status: 403 });
  if (record.used)
    return NextResponse.json({ error: "document déjà téléchargé" }, { status: 410 });
  if (Date.now() > record.expiresAt)
    return NextResponse.json({ error: "lien expiré" }, { status: 410 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";

  // Metti i documenti reali fuori da /public, in una cartella non servita
  // direttamente, es. /secure-files, così sono raggiungibili solo da qui.
  const watermarkedFiles: { filename: string; bytes: Uint8Array }[] = [];
  for (const filename of record.documentFilenames) {
    const filePath = path.join(process.cwd(), "secure-files", path.basename(filename));
    const fileBuffer = await readFile(filePath);
    const watermarked = await applyWatermark(fileBuffer, {
      recipientName: record.recipientName,
      ip,
      token: record.token,
      timestamp: Date.now(),
    });
    watermarkedFiles.push({ filename, bytes: watermarked });
  }

  markUsed(token);

  if (watermarkedFiles.length === 1) {
    return new NextResponse(Buffer.from(watermarkedFiles[0].bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${watermarkedFiles[0].filename}"`,
      },
    });
  }

  const zip = new JSZip();
  for (const { filename, bytes } of watermarkedFiles) {
    zip.file(filename, bytes);
  }
  const zipBuffer = await zip.generateAsync({ type: "uint8array" });

  return new NextResponse(Buffer.from(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="documents-${token.slice(0, 8)}.zip"`,
    },
  });
}
