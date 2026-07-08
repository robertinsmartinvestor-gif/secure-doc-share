"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

type Step = "start" | "otp" | "consent" | "ready" | "error";

// Testo della clausola di riservatezza, spezzato in segmenti per evidenziare
// in grassetto/rosso solo le porzioni più critiche senza usare HTML grezzo.
const CONSENT_SEGMENTS: { text: string; highlight?: boolean }[] = [
  { text: "Ce document est " },
  { text: "strictement confidentiel et personnel", highlight: true },
  {
    text:
      " : il est destiné exclusivement à votre dossier de demande de visa auprès de l'ambassade. Le partager, le transmettre ou le copier à un tiers, sous quelque forme que ce soit, ",
  },
  { text: "est interdit", highlight: true },
  { text: " et peut " },
  {
    text: "compromettre la validité de votre dossier ainsi que la poursuite de vos études en Italie",
    highlight: true,
  },
  { text: ". " },
  {
    text: "Chaque copie de ce document porte une trace permettant d'en identifier l'origine",
    highlight: true,
  },
  { text: "." },
];

export default function VerifyPage() {
  const params = useParams();
  const token = params.token as string;

  const [step, setStep] = useState<Step>("start");
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [expectedRecipientName, setExpectedRecipientName] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [documentFilenames, setDocumentFilenames] = useState<string[]>([]);

  async function handleStart() {
    setLoading(true);
    setError(null);

    // Prova a leggere la posizione GPS reale del dispositivo.
    // Se l'utente nega il permesso, procediamo comunque solo con l'IP
    // (il backend lo tratta come segnale più debole).
    let gpsCountry: string | null = null;
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 15000 });
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
      setError(data.error || "Erreur inattendue");
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
      setError(data.error || "Code invalide");
      return;
    }
    if (data.expectedRecipientName) {
      setExpectedRecipientName(data.expectedRecipientName);
      setRecipientName(data.expectedRecipientName);
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
      setError(data.error || "Erreur inattendue");
      return;
    }
    setDocumentFilenames(data.documentFilenames || []);
    setStep("ready");
  }

  return (
    <main style={{ maxWidth: 480, margin: "80px auto", fontFamily: "system-ui", padding: 24 }}>
      <h1 style={{ fontSize: 20, marginBottom: 24 }}>Accès aux documents</h1>

      {step === "start" && (
        <>
          <p style={{ color: "#555", fontSize: 13, marginBottom: 12 }}>
            ⚠️ Votre navigateur peut afficher un avertissement de sécurité
            avant l&apos;ouverture de cette page. Ce n&apos;est pas une erreur :
            vous pouvez continuer en toute confiance.
          </p>
          <p style={{ color: "#555", fontSize: 13, marginBottom: 12 }}>
            📍 Nous vous demanderons l&apos;accès à votre position pour
            vérifier que vous vous trouvez bien dans le pays autorisé à
            recevoir ce document. Cette information n&apos;est utilisée que
            pour cette vérification et n&apos;est pas conservée.
          </p>
          <p style={{ color: "#555", marginBottom: 16 }}>
            Pour continuer, nous vous enverrons également un code de
            vérification par SMS.
          </p>
          <button onClick={handleStart} disabled={loading} style={buttonStyle}>
            {loading ? "Vérification en cours..." : "Continuer"}
          </button>
        </>
      )}

      {step === "otp" && (
        <>
          <p style={{ color: "#555", marginBottom: 16 }}>
            Nous vous avons envoyé un code par SMS. Saisissez-le ci-dessous.
          </p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            placeholder="Code à 6 chiffres"
            style={inputStyle}
          />
          <button onClick={handleVerifyOtp} disabled={loading} style={buttonStyle}>
            {loading ? "Vérification..." : "Confirmer le code"}
          </button>
        </>
      )}

      {step === "consent" && (
        <>
          <p style={{ color: "#555", marginBottom: 12 }}>Identité vérifiée.</p>
          <input
            value={recipientName}
            onChange={(e) => !expectedRecipientName && setRecipientName(e.target.value)}
            placeholder="Votre nom complet"
            readOnly={!!expectedRecipientName}
            style={{
              ...inputStyle,
              ...(expectedRecipientName ? { background: "#eee", color: "#555" } : {}),
            }}
          />
          {expectedRecipientName && (
            <p style={{ color: "#888", fontSize: 12, marginTop: -8, marginBottom: 12 }}>
              Nom pré-renseigné par l&apos;expéditeur, non modifiable.
            </p>
          )}
          <label style={{ display: "flex", gap: 8, fontSize: 14, color: "#333", marginBottom: 16 }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              {CONSENT_SEGMENTS.map((seg, i) =>
                seg.highlight ? (
                  <strong key={i} style={{ color: "#c33" }}>
                    {seg.text}
                  </strong>
                ) : (
                  <span key={i}>{seg.text}</span>
                )
              )}
            </span>
          </label>
          <button
            onClick={handleAcceptConsent}
            disabled={loading || !agreed || recipientName.trim().length < 2}
            style={{ ...buttonStyle, opacity: loading || !agreed ? 0.5 : 1 }}
          >
            {loading ? "Veuillez patienter..." : "J'accepte et je continue"}
          </button>
        </>
      )}

      {step === "ready" && (
        <>
          <p style={{ color: "#2a7", marginBottom: 12 }}>Prêt pour le téléchargement.</p>
          <p style={{ color: "#555", fontSize: 14, marginBottom: 16 }}>
            {documentFilenames.length === 1
              ? `Ce lien contient 1 document : ${documentFilenames[0]}`
              : `Ce lien contient ${documentFilenames.length} documents : ${documentFilenames.join(", ")}`}
          </p>
          <a href={`/api/download?token=${token}`} style={buttonStyle}>
            Télécharger les documents
          </a>
        </>
      )}

      {(step === "error" || error) && (
        <>
          {error?.includes("Accès refusé") && (
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#c33"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ display: "block", marginTop: 16, marginBottom: 4 }}
              aria-hidden="true"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
              <line x1="4" y1="20" x2="20" y2="4" />
            </svg>
          )}
          <p style={{ color: "#c33", marginTop: 16 }}>{error}</p>
        </>
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
