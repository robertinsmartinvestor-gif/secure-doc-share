// app/api/list-documents/route.ts
// Endpoint che usi TU per elencare i PDF disponibili in secure-files/,
// da mostrare come checkbox list nella pagina /admin.

import { NextRequest, NextResponse } from "next/server";
import { readdir } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  const { adminSecret } = await req.json();

  if (adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dir = path.join(process.cwd(), "secure-files");
  const entries = await readdir(dir);
  const filenames = entries.filter((f) => f.toLowerCase().endsWith(".pdf")).sort();

  return NextResponse.json({ filenames });
}
