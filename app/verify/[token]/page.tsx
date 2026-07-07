"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

type Step = "start" | "otp" | "consent" | "ready" | "error";

export default function VerifyPage() {
  const params = useParams();
  const token = params.token as string;

  const [step, setStep] = useState<Step>("start");
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [agreed, setAgreed] = useState(false);

  async function handleStart() {
    setLoading(true);
    setError(null);

    // Prova a leggere la posizione GPS reale del dispositivo.
    // Se l'utente nega il permesso, procediamo comunque solo con l'IP
    // (il backend lo tratta come segnale più debole).
    let gpsCountry: string | null = null;
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
      });
      gpsCountry = await reverseGeocodeCountry(
        position.coords.latitude,
        position.coords.longitude
      );
    } catch {
      // permesso negato o timeout: gpsCountry resta null
    }

    const res = await fetch("/api/check-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, gpsCountry }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Errore imprevisto");
      setStep("error");
      return;
    }
    setStep("otp");
  }

  async function handleVerifyOtp() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, code }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Codice non valido");
      return;
    }
    setStep("consent");
  }

  async function handleAcceptConsent() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/accept-consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, recipientName }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Errore imprevisto");
      return;
    }
    setStep("ready");
  }

  return (
    <main style={{ maxWidth: 480, margin: "80px auto", fontFamily: "system-ui", padding: 24 }}>
      <h1 style={{ fontSize: 20, marginBottom: 24 }}>Accesso ai documenti</h1>

      {step === "start" && (
        <>
          <p style={{ color: "#555", marginBottom: 16 }}>
            Per procedere ti chiederemo di condividere la posizione del dispositivo
            e ti invieremo un codice via SMS.
          </p>
          <button onClick={handleStart} disabled={loading} style={buttonStyle}>
            {loading ? "Verifica in corso..." : "Continua"}
          </button>
        </>
      )}

      {step === "otp" && (
        <>
          <p style={{ color: "#555", marginBottom: 16 }}>
            Ti abbiamo inviato un codice via SMS. Inseriscilo qui sotto.
          </p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            placeholder="Codice a 6 cifre"
            style={inputStyle}
          />
          <button onClick={handleVerifyOtp} disabled={loading} style={buttonStyle}>
            {loading ? "Verifica..." : "Conferma codice"}
          </button>
        </>
      )}

      {step === "consent" && (
        <>
          <p style={{ color: "#555", marginBottom: 12 }}>Identità verificata.</p>
          <input
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder="Il tuo nome completo"
            style={inputStyle}
          />
          <label style={{ display: "flex", gap: 8, fontSize: 14, color: "#333", marginBottom: 16 }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            Confermo di essere {recipientName || "[nome sopra]"}, riconosco che questo
            documento è riservato e mi impegno a non condividerlo con terzi in
            nessuna forma. Il documento riporterà il mio nome, IP e orario di
            scaricamento.
          </label>
          <button
            onClick={handleAcceptConsent}
            disabled={loading || !agreed || recipientName.trim().length < 2}
            style={{ ...buttonStyle, opacity: loading || !agreed ? 0.5 : 1 }}
          >
            {loading ? "Attendere..." : "Accetto e continuo"}
          </button>
        </>
      )}

      {step === "ready" && (
        <>
          <p style={{ color: "#2a7", marginBottom: 16 }}>Pronto per il download.</p>
          <a href={`/api/download?token=${token}`} style={buttonStyle}>
            Scarica documenti
          </a>
        </>
      )}

      {(step === "error" || error) && (
        <p style={{ color: "#c33", marginTop: 16 }}>{error}</p>
      )}
    </main>
  );
}

async function reverseGeocodeCountry(lat: number, lon: number): Promise<string | null> {
  try {
    // Nominatim (OpenStreetMap), gratuito. In produzione considera un servizio
    // con SLA se il volume cresce.
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`
    );
    const data = await res.json();
    return data?.address?.country_code?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}

const buttonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 20px",
  background: "#111",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  textDecoration: "none",
};

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "10px 12px",
  marginBottom: 12,
  fontSize: 16,
  border: "1px solid #ccc",
  borderRadius: 6,
};
