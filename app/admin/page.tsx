"use client";

import { useState } from "react";

export default function AdminPage() {
  const [adminSecret, setAdminSecret] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("+237");
  const [availableFiles, setAvailableFiles] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ link: string; expiresAt: number } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleLoadFiles() {
    setFilesLoading(true);
    setFilesError(null);
    setAvailableFiles([]);
    setSelectedFiles([]);

    try {
      const res = await fetch("/api/list-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminSecret }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        setFilesError(`Errore ${res.status}: richiesta non riuscita`);
        return;
      }

      if (!res.ok) {
        setFilesError(data.error || "Errore imprevisto");
        return;
      }
      setAvailableFiles(data.filenames || []);
    } catch {
      setFilesError("Errore di rete: impossibile contattare il server. Riprova.");
    } finally {
      setFilesLoading(false);
    }
  }

  function toggleFile(filename: string) {
    setSelectedFiles((prev) =>
      prev.includes(filename) ? prev.filter((f) => f !== filename) : [...prev, filename]
    );
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);

    try {
      const res = await fetch("/api/create-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminSecret, phoneNumber, documentFilenames: selectedFiles }),
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

      <label style={labelStyle}>File da includere (da secure-files/)</label>
      <button
        onClick={handleLoadFiles}
        disabled={filesLoading || !adminSecret}
        style={{ ...buttonStyle, background: "#555", marginTop: 0, opacity: filesLoading ? 0.6 : 1 }}
      >
        {filesLoading ? "Caricamento..." : "Carica elenco file"}
      </button>

      {filesError && <p style={{ color: "#c33", marginTop: 8 }}>{filesError}</p>}

      {availableFiles.length > 0 && (
        <div style={{ marginTop: 12, marginBottom: 8 }}>
          {availableFiles.map((filename) => (
            <label
              key={filename}
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#333", marginBottom: 6 }}
            >
              <input
                type="checkbox"
                checked={selectedFiles.includes(filename)}
                onChange={() => toggleFile(filename)}
              />
              {filename}
            </label>
          ))}
        </div>
      )}

      {availableFiles.length === 0 && !filesLoading && !filesError && (
        <p style={{ fontSize: 13, color: "#888", marginTop: 8 }}>
          Nessun file caricato. Premi &quot;Carica elenco file&quot;.
        </p>
      )}

      <button
        onClick={handleGenerate}
        disabled={loading || !adminSecret || phoneNumber.length < 9 || selectedFiles.length === 0}
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
