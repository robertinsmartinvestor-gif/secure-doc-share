// lib/blob.ts
// Upload/download dei PDF su Vercel Blob (Storage → Blob nel dashboard
// Vercel). Sostituisce la vecchia cartella locale secure-files/.
//
// Lo store è privato: i blob non sono raggiungibili con un fetch() anonimo
// sul loro URL, serve autenticarsi con BLOB_READ_WRITE_TOKEN tramite get().

import { put, get } from "@vercel/blob";

export async function uploadDocument(file: Buffer, filename: string): Promise<string> {
  const blob = await put(`documents/${filename}`, file, {
    access: "private",
    contentType: "application/pdf",
    addRandomSuffix: true,
  });
  return blob.url;
}

export async function downloadDocument(url: string): Promise<Buffer> {
  const result = await get(url, { access: "private" });
  if (!result || result.statusCode !== 200) {
    throw new Error(`Impossibile scaricare il documento da Blob: ${url}`);
  }
  const arrayBuffer = await new Response(result.stream).arrayBuffer();
  return Buffer.from(arrayBuffer);
}
