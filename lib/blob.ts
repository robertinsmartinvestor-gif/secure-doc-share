// lib/blob.ts
// Upload/download dei PDF su Vercel Blob (Storage → Blob nel dashboard
// Vercel). Sostituisce la vecchia cartella locale secure-files/.

import { put } from "@vercel/blob";

export async function uploadDocument(file: Buffer, filename: string): Promise<string> {
  const blob = await put(`documents/${filename}`, file, {
    access: "public",
    contentType: "application/pdf",
    addRandomSuffix: true,
  });
  return blob.url;
}

export async function downloadDocument(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Impossibile scaricare il documento da Blob (${res.status}): ${url}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
