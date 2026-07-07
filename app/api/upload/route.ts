// app/api/upload/route.ts
// Endpoint che usi TU per caricare un PDF su Vercel Blob prima di includerlo
// in un link (chiamato dalla pagina /admin al posto della vecchia lettura
// da secure-files/).

import { NextRequest, NextResponse } from "next/server";
import { uploadDocument } from "@/lib/blob";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const adminSecret = formData.get("adminSecret");

  if (adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file mancante" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "sono ammessi solo file PDF" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await uploadDocument(buffer, file.name);

  return NextResponse.json({ filename: file.name, url });
}
