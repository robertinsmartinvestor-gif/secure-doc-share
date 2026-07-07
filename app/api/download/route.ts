// app/api/download/route.ts
// Serve il file solo dopo verifica OTP completata. Marca il link come "used"
// dopo il primo download riuscito, così non è riutilizzabile.

import { NextRequest, NextResponse } from "next/server";
import { getAccessRecord, markUsed, setWatermarkCode } from "@/lib/tokens";
import { applyWatermark, generateWatermarkCode } from "@/lib/watermark";
import { downloadDocument } from "@/lib/blob";
import JSZip from "jszip";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "jeton manquant" }, { status: 400 });

  const record = await getAccessRecord(token);
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

  // Un solo codice per l'intero download (stesso token, stesso istante),
  // salvato nel record così da poter risalire in futuro dal codice stampato
  // sul PDF a questo download specifico.
  const downloadTimestamp = Date.now();
  const watermarkCode = generateWatermarkCode(record.token, downloadTimestamp);
  await setWatermarkCode(token, watermarkCode);

  // I documenti sono su Vercel Blob (URL salvato nel record al momento della
  // creazione del link), non più su filesystem locale.
  const watermarkedFiles: { filename: string; bytes: Uint8Array }[] = [];
  for (const doc of record.documents) {
    const fileBuffer = await downloadDocument(doc.url);
    const watermarked = await applyWatermark(fileBuffer, {
      recipientName: record.recipientName,
      ip,
      token: record.token,
      timestamp: downloadTimestamp,
      watermarkCode,
    });
    watermarkedFiles.push({ filename: doc.filename, bytes: watermarked });
  }

  await markUsed(token);

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
