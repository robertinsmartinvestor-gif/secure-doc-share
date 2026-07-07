"use client";

import { useState } from "react";

export default function AdminPage() {
  const [adminSecret, setAdminSecret] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("+237");
  const [documentFilenames, setDocumentFilenames] = useState("documenti.pdf");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ link: string; expiresAt: number } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);

    const filenames = documentFilenames
      .split(",")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);

    try {
      const res = await fetch("/api/create-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminSecret, phoneNumber, documentFilenames: filenames }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        setError(`Errore ${res.status}: richiesta non riuscita`);
        return;
      }

      if (!res.ok) {
        setError(data.error || "Errore imprevisto");
        return;
      }
      setResult(data);
    } catch {
      setError("Errore di rete: impossibile contattare il server. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!result) return;
    navigator.clipboard.writeText(result.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main style={{ maxWidth: 480, margin: "80px auto", fontFamily: "system-ui", padding: 24 }}>
      <h1 style={{ fontSize: 20, marginBottom: 24 }}>Genera link di accesso</h1>

      <label style={labelStyle}>Admin secret</label>
      <input
        type="password"
        value={adminSecret}
        onChange={(e) => setAdminSecret(e.target.value)}
        placeholder="Il tuo ADMIN_SECRET"
        style={inputStyle}
      />

      <label style={labelStyle}>Numero di telefono (Cameroon, formato +237...)</label>
      <input
        value={phoneNumber}
        onChange={(e) => setPhoneNumber(e.target.value)}
        placeholder="+237XXXXXXXXX"
        style={inputStyle}
      />

      <label style={labelStyle}>
        File da includere (nomi in secure-files/, separati da virgola)
      </label>
      <input
        value={documentFilenames}
        onChange={(e) => setDocumentFilenames(e.target.value)}
        placeholder="documenti.pdf, allegato.pdf"
        style={inputStyle}
      />

      <button
        onClick={handleGenerate}
        disabled={loading || !adminSecret || phoneNumber.length < 9 || documentFilenames.trim().length === 0}
        style={{ ...buttonStyle, opacity: loading ? 0.6 : 1 }}
      >
        {loading ? "Generazione..." : "Genera link"}
      </button>

      {error && <p style={{ color: "#c33", marginTop: 16 }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 24, padding: 16, background: "#f5f5f5", borderRadius: 8 }}>
          <p style={{ fontSize: 13, color: "#555", marginBottom: 8 }}>
            Link (scade il {new Date(result.expiresAt).toLocaleString("it-IT")}):
          </p>
          <code style={{ display: "block", wordBreak: "break-all", fontSize: 13, marginBottom: 12 }}>
            {result.link}
          </code>
          <button onClick={handleCopy} style={{ ...buttonStyle, background: "#333" }}>
            {copied ? "Copiato!" : "Copia link"}
          </button>
        </div>
      )}
    </main>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "#555",
  marginBottom: 6,
  marginTop: 12,
};

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "10px 12px",
  marginBottom: 8,
  fontSize: 16,
  border: "1px solid #ccc",
  borderRadius: 6,
  boxSizing: "border-box",
};

const buttonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 20px",
  background: "#111",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  marginTop: 12,
};
