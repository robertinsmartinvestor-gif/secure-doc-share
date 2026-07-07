// lib/tokens.ts
// Gestione token monouso + stato di verifica.
// NOTA: in produzione sostituisci la Map in-memory con Redis/Postgres,
// perché su Vercel/serverless la memoria non persiste tra invocazioni.

import { randomBytes } from "crypto";

export type AccessRecord = {
  token: string;
  phoneNumber: string; // numero E.164 della terza persona, es. +237XXXXXXXXX
  expectedCountry: string; // codice ISO a 2 lettere, es. "CM", "IT"
  expectedRecipientName: string | null; // nome atteso impostato dall'admin: se presente, blocca/pre-compila il nome allo step di consenso
  documentFilenames: string[]; // nomi file dentro secure-files/ inclusi in questo link
  ttlMinutes: number; // durata del link (in minuti) usata alla creazione
  otpTtlMinutes: number; // durata dell'OTP (in minuti) da usare quando viene generato
  testMode: boolean; // se true: niente invio SMS reale, il codice OTP torna nella risposta JSON di check-access
  skipGeoCheck: boolean; // se true: salta interamente il controllo IP/GPS
  createdAt: number;
  expiresAt: number;
  otpCode: string | null;
  otpExpiresAt: number | null;
  otpAttempts: number;
  verified: boolean;
  used: boolean; // una volta scaricato il documento, non riapribile
  recipientName: string | null; // nome dichiarato dalla terza persona, usato nel watermark
  consentAcceptedAt: number | null; // timestamp di accettazione della clausola di riservatezza
  watermarkCode: string | null; // codice breve stampato sul PDF scaricato, per risalire al download da una copia fisica
  attempts: {
    timestamp: number;
    ip: string;
    country: string | null;
    gpsCountryMatch: boolean | null;
    result: "blocked_country" | "otp_sent" | "otp_verified" | "otp_failed" | "expired" | "already_used";
  }[];
};

export type TokenStatus = "created" | "otp_sent" | "verified" | "used" | "expired";

export type TokenSummary = {
  token: string; // troncato, per riferimento visuale senza esporre il token completo
  phoneNumber: string;
  status: TokenStatus;
  createdAt: number;
  expiresAt: number;
  testMode: boolean;
  testCode: string | null; // OTP visibile solo per link in modalità test, e solo finché non usati
};

const store = new Map<string, AccessRecord>();

export function createAccessLink(options: {
  phoneNumber: string;
  documentFilenames: string[];
  expectedCountry?: string;
  expectedRecipientName?: string | null;
  ttlMinutes?: number;
  otpTtlMinutes?: number;
  testMode?: boolean;
  skipGeoCheck?: boolean;
}) {
  const {
    phoneNumber,
    documentFilenames,
    expectedCountry = "CM",
    expectedRecipientName = null,
    ttlMinutes = 60,
    otpTtlMinutes = 5,
    testMode = false,
    skipGeoCheck = false,
  } = options;

  const token = randomBytes(24).toString("hex");
  const now = Date.now();
  const record: AccessRecord = {
    token,
    phoneNumber,
    expectedCountry,
    expectedRecipientName,
    documentFilenames,
    ttlMinutes,
    otpTtlMinutes,
    testMode,
    skipGeoCheck,
    createdAt: now,
    expiresAt: now + ttlMinutes * 60 * 1000,
    otpCode: null,
    otpExpiresAt: null,
    otpAttempts: 0,
    verified: false,
    used: false,
    recipientName: null,
    consentAcceptedAt: null,
    watermarkCode: null,
    attempts: [],
  };
  store.set(token, record);
  return record;
}

export function getAccessRecord(token: string) {
  return store.get(token) ?? null;
}

export function logAttempt(token: string, entry: AccessRecord["attempts"][number]) {
  const r = store.get(token);
  if (!r) return;
  r.attempts.push(entry);
}

export function setOtp(token: string, code: string, ttlMinutes = 5) {
  const r = store.get(token);
  if (!r) return;
  r.otpCode = code;
  r.otpExpiresAt = Date.now() + ttlMinutes * 60 * 1000;
  r.otpAttempts = 0;
}

export function markVerified(token: string) {
  const r = store.get(token);
  if (!r) return;
  r.verified = true;
}

export function markUsed(token: string) {
  const r = store.get(token);
  if (!r) return;
  r.used = true;
}

export function recordConsent(token: string, recipientName: string) {
  const r = store.get(token);
  if (!r) return;
  r.recipientName = recipientName;
  r.consentAcceptedAt = Date.now();
}

export function setWatermarkCode(token: string, code: string) {
  const r = store.get(token);
  if (!r) return;
  r.watermarkCode = code;
}

function deriveStatus(r: AccessRecord): TokenStatus {
  if (r.used) return "used";
  if (Date.now() > r.expiresAt) return "expired";
  if (r.verified) return "verified";
  if (r.otpCode) return "otp_sent";
  return "created";
}

export function listAllTokens(): TokenSummary[] {
  return Array.from(store.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) => ({
      token: `${r.token.slice(0, 8)}...`,
      phoneNumber: r.phoneNumber,
      status: deriveStatus(r),
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      testMode: r.testMode,
      // Non esposto più una volta che il link è stato usato: serve solo
      // come comodità per i test, non deve restare visibile a tempo indeterminato.
      testCode: r.testMode && !r.used ? r.otpCode : null,
    }));
}
