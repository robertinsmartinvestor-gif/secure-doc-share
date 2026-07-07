// lib/watermark.ts
// Applica una filigrana dinamica su ogni pagina del PDF con i dati
// di chi lo sta scaricando: nome, data/ora, IP, token.
// npm install pdf-lib

import { PDFDocument, rgb, degrees, StandardFonts } from "pdf-lib";

export async function applyWatermark(
  originalBytes: Buffer,
  info: { recipientName: string; ip: string; token: string; timestamp: number }
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const dateStr = new Date(info.timestamp).toLocaleString("it-IT");
  const shortToken = info.token.slice(0, 8);
  const line1 = `${info.recipientName} — ${dateStr}`;
  const line2 = `IP: ${info.ip} — ref: ${shortToken}`;

  const pages = pdfDoc.getPages();
  for (const page of pages) {
    const { width, height } = page.getSize();

    // Filigrana diagonale ripetuta, semi-trasparente, sopra il contenuto:
    // ripetuta più volte così ritagliare una singola istanza non basta a
    // eliminarla dalla pagina.
    const rows = 4;
    const cols = 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (width / cols) * c + 20;
        const y = (height / rows) * r + 20;
        page.drawText(`${line1}  |  ${line2}`, {
          x,
          y,
          size: 9,
          font,
          color: rgb(0.6, 0.6, 0.6),
          opacity: 0.35,
          rotate: degrees(35),
        });
      }
    }

    // Riga leggibile a piè di pagina, per riferimento veloce senza dover
    // cercare nella filigrana diagonale
    page.drawText(`Copia riservata per ${info.recipientName} — ${dateStr} — ${shortToken}`, {
      x: 20,
      y: 10,
      size: 7,
      font,
      color: rgb(0.4, 0.4, 0.4),
      opacity: 0.6,
    });
  }

  return pdfDoc.save();
}
