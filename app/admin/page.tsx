"use client";

import { useState } from "react";

type CountryOption = "CM" | "IT" | "OTHER";

type GenerateResult = {
  link: string;
  phoneNumber: string;
  expectedCountry: string;
  expectedRecipientName: string | null;
  documentFilenames: string[];
  expiresAt: number;
  testMode: boolean;
  skipGeoCheck: boolean;
};

type LinkStatus = "created" | "otp_sent" | "verified" | "used" | "expired";

type LinkSummary = {
  token: string;
  phoneNumber: string;
  status: LinkStatus;
  createdAt: number;
  expiresAt: number;
  testMode: boolean;
  testCode: string | null;
};

const STATUS_LABELS: Record<LinkStatus, string> = {
  created: "Creato",
  otp_sent: "OTP inviato",
  verified: "Verificato",
  used: "Usato",
  expired: "Scaduto",
};

const TTL_OPTIONS = [
  { value: 30, label: "30 minuti" },
  { value: 60, label: "1 ora" },
  { value: 360, label: "6 ore" },
  { value: 1440, label: "24 ore" },
];

const OTP_TTL_OPTIONS = [
  { value: 5, label: "5 minuti" },
  { value: 15, label: "15 minuti" },
];

export default function AdminPage() {
  const [adminSecret, setAdminSecret] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("+");
  const [countryOption, setCountryOption] = useState<CountryOption>("CM");
  const [customCountry, setCustomCountry] = useState("");
  const [expectedRecipientName, setExpectedRecipientName] = useState("");
  const [ttlMinutes, setTtlMinutes] = useState(60);
  const [otpTtlMinutes, setOtpTtlMinutes] = useState(5);
  const [testMode, setTestMode] = useState(false);
  const [skipGeoCheck, setSkipGeoCheck] = useState(false);

  const [availableFiles, setAvailableFiles] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [copied, setCopied] = useState(false);

  const [links, setLinks] = useState<LinkSummary[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [linksError, setLinksError] = useState<string | null>(null);

  const expectedCountry = countryOption === "OTHER" ? customCountry.toUpperCase() : countryOption;
  const countryValid = /^[A-Z]{2}$/.test(expectedCountry);

  async function handleLoadFiles() {
    setFilesLoading(true);
    setFilesError(null);
    setAvailableFiles([]);
    setSelectedFiles([]);

    try {
      const res = await fetch("/api/list-documents", {
        headers: { "x-admin-secret": adminSecret },
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
        body: JSON.stringify({
          adminSecret,
          phoneNumber,
          documentFilenames: selectedFiles,
          expectedCountry,
          expectedRecipientName: expectedRecipientName.trim() || undefined,
          ttlMinutes,
          otpTtlMinutes,
          testMode,
          skipGeoCheck,
        }),
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
      handleLoadLinks();
    } catch {
      setError("Errore di rete: impossibile contattare il server. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadLinks() {
    setLinksLoading(true);
    setLinksError(null);

    try {
      const res = await fetch("/api/list-links", {
        headers: { "x-admin-secret": adminSecret },
      });

      let data;
      try {
        data = await res.json();
      } catch {
        setLinksError(`Errore ${res.status}: richiesta non riuscita`);
        return;
      }

      if (!res.ok) {
        setLinksError(data.error || "Errore imprevisto");
        return;
      }
      setLinks(data.links || []);
    } catch {
      setLinksError("Errore di rete: impossibile contattare il server. Riprova.");
    } finally {
      setLinksLoading(false);
    }
  }

  function handleCopy() {
    if (!result) return;
    navigator.clipboard.writeText(result.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const canGenerate =
    !loading &&
    !!adminSecret &&
    phoneNumber.length >= 9 &&
    countryValid &&
    selectedFiles.length > 0;

  return (
    <main style={{ maxWidth: 560, margin: "80px auto", fontFamily: "system-ui", padding: 24 }}>
      <h1 style={{ fontSize: 20, marginBottom: 24 }}>Genera link di accesso</h1>

      <label style={labelStyle}>Admin secret</label>
      <input
        type="password"
        value={adminSecret}
        onChange={(e) => setAdminSecret(e.target.value)}
        placeholder="Il tuo ADMIN_SECRET"
        style={inputStyle}
      />

      <label style={labelStyle}>Numero di telefono (formato internazionale, es. +391234567890)</label>
      <input
        value={phoneNumber}
        onChange={(e) => setPhoneNumber(e.target.value)}
        placeholder="+391234567890"
        style={inputStyle}
      />

      <label style={labelStyle}>Paese atteso</label>
      <select
        value={countryOption}
        onChange={(e) => setCountryOption(e.target.value as CountryOption)}
        style={inputStyle}
      >
        <option value="CM">Cameroon (CM)</option>
        <option value="IT">Italia (IT)</option>
        <option value="OTHER">Altro</option>
      </select>
      {countryOption === "OTHER" && (
        <input
          value={customCountry}
          onChange={(e) => setCustomCountry(e.target.value)}
          placeholder="Codice paese a 2 lettere (es. FR)"
          maxLength={2}
          style={inputStyle}
        />
      )}

      <label style={labelStyle}>Nome atteso del destinatario (opzionale)</label>
      <input
        value={expectedRecipientName}
        onChange={(e) => setExpectedRecipientName(e.target.value)}
        placeholder="Se impostato, blocca il nome nello step di consenso"
        style={inputStyle}
      />

      <label style={labelStyle}>Durata del link</label>
      <select
        value={ttlMinutes}
        onChange={(e) => setTtlMinutes(Number(e.target.value))}
        style={inputStyle}
      >
        {TTL_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <label style={labelStyle}>Durata OTP</label>
      <select
        value={otpTtlMinutes}
        onChange={(e) => setOtpTtlMinutes(Number(e.target.value))}
        style={inputStyle}
      >
        {OTP_TTL_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#333", marginTop: 12 }}>
        <input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} />
        Modalità test (nessun SMS reale, il codice OTP viene mostrato qui)
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#333", marginTop: 8 }}>
        <input
          type="checkbox"
          checked={skipGeoCheck}
          onChange={(e) => setSkipGeoCheck(e.target.checked)}
        />
        Disattiva check geografico (IP/GPS)
      </label>

      <label style={labelStyle}>Documenti da includere (da secure-files/)</label>
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

      <button onClick={handleGenerate} disabled={!canGenerate} style={{ ...buttonStyle, opacity: loading ? 0.6 : 1 }}>
        {loading ? "Generazione..." : "Genera link"}
      </button>

      {error && <p style={{ color: "#c33", marginTop: 16 }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 24, padding: 16, background: "#f5f5f5", borderRadius: 8 }}>
          <p style={{ fontSize: 13, color: "#555", marginBottom: 8 }}>Link generato:</p>
          <code style={{ display: "block", wordBreak: "break-all", fontSize: 13, marginBottom: 12 }}>
            {result.link}
          </code>
          <button onClick={handleCopy} style={{ ...buttonStyle, background: "#333", marginTop: 0 }}>
            {copied ? "Copiato!" : "Copia link"}
          </button>

          <ul style={{ fontSize: 13, color: "#333", marginTop: 16, paddingLeft: 20, lineHeight: 1.7 }}>
            <li>Numero destinatario: {result.phoneNumber}</li>
            <li>Paese atteso: {result.expectedCountry}</li>
            {result.expectedRecipientName && <li>Nome atteso: {result.expectedRecipientName}</li>}
            <li>Documenti inclusi: {result.documentFilenames.join(", ")}</li>
            <li>Scadenza: {new Date(result.expiresAt).toLocaleString("it-IT")}</li>
            <li>Modalità test: {result.testMode ? "attiva" : "disattiva"}</li>
            {result.skipGeoCheck && <li>Check geografico: disattivato</li>}
          </ul>
        </div>
      )}

      <hr style={{ margin: "40px 0", border: "none", borderTop: "1px solid #ddd" }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ fontSize: 16 }}>Storico link generati</h2>
        <button
          onClick={handleLoadLinks}
          disabled={linksLoading || !adminSecret}
          style={{ ...buttonStyle, background: "#555", marginTop: 0, opacity: linksLoading ? 0.6 : 1 }}
        >
          {linksLoading ? "Aggiornamento..." : "Aggiorna"}
        </button>
      </div>

      {linksError && <p style={{ color: "#c33", marginBottom: 12 }}>{linksError}</p>}

      {links.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={thStyle}>Token</th>
              <th style={thStyle}>Numero</th>
              <th style={thStyle}>Stato</th>
              <th style={thStyle}>Creato</th>
              <th style={thStyle}>Scadenza</th>
              <th style={thStyle}>Codice test</th>
            </tr>
          </thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.token}>
                <td style={tdStyle}><code>{l.token}</code></td>
                <td style={tdStyle}>{l.phoneNumber}</td>
                <td style={tdStyle}>{STATUS_LABELS[l.status]}</td>
                <td style={tdStyle}>{new Date(l.createdAt).toLocaleString("it-IT")}</td>
                <td style={tdStyle}>{new Date(l.expiresAt).toLocaleString("it-IT")}</td>
                <td style={tdStyle}>
                  {l.testCode ? <code>{l.testCode}</code> : l.testMode ? "—" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        !linksLoading && !linksError && (
          <p style={{ fontSize: 13, color: "#888" }}>
            Nessun link in elenco. Premi &quot;Aggiorna&quot;.
          </p>
        )
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

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 6px",
  borderBottom: "2px solid #ddd",
  color: "#555",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 6px",
  borderBottom: "1px solid #eee",
};
