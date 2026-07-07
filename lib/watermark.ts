// lib/watermark.ts
// Applica un watermark visivo minimo (un codice breve in basso a destra su
// ogni pagina, discreto anche stampato) e incorpora i dati identificativi
// completi (nome, IP, timestamp, token) nei metadati PDF: invisibili a
// schermo/stampa ma recuperabili con strumenti come exiftool.
// npm install pdf-lib

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { createHash } from "crypto";

// Codice breve deterministico derivato dal token e dal momento del
// download: non contiene nome/IP per esteso, serve solo come riferimento
// da poter incrociare in seguito con lib/tokens.ts (AccessRecord.watermarkCode).
export function generateWatermarkCode(token: string, timestamp: number): string {
  return createHash("sha256")
    .update(`${token}:${timestamp}`)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase();
}

export async function applyWatermark(
  originalBytes: Buffer,
  info: {
    recipientName: string;
    ip: string;
    token: string;
    timestamp: number;
    watermarkCode: string;
  }
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const dateStr = new Date(info.timestamp).toLocaleString("fr-FR");

  // Metadati invisibili a schermo e in stampa, recuperabili con exiftool o
  // strumenti equivalenti in caso di dispute sulla provenienza del documento.
  pdfDoc.setAuthor(info.recipientName);
  pdfDoc.setSubject(`IP: ${info.ip} — téléchargé le ${dateStr}`);
  pdfDoc.setKeywords([
    `token:${info.token}`,
    `code:${info.watermarkCode}`,
    `ip:${info.ip}`,
    `timestamp:${info.timestamp}`,
  ]);

  const pages = pdfDoc.getPages();
  for (const page of pages) {
    const { width } = page.getSize();
    const size = 6;
    const textWidth = font.widthOfTextAtSize(info.watermarkCode, size);

    // Tag unico in basso a destra, nessuna ripetizione né diagonale: discreto
    // anche su documenti amministrativi stampati.
    page.drawText(info.watermarkCode, {
      x: width - textWidth - 12,
      y: 8,
      size,
      font,
      color: rgb(0.75, 0.75, 0.75),
    });
  }

  return pdfDoc.save();
}
