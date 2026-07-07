// lib/tokens.ts
// Gestione token monouso + stato di verifica.
// NOTA: in produzione sostituisci la Map in-memory con Redis/Postgres,
// perché su Vercel/serverless la memoria non persiste tra invocazioni.

import { randomBytes } from "crypto";

export type AccessRecord = {
  token: string;
  phoneNumber: string; // numero Cameroon della terza persona, es. +237XXXXXXXXX
  expectedCountry: string; // "CM"
  createdAt: number;
  expiresAt: number;
  otpCode: string | null;
  otpExpiresAt: number | null;
  otpAttempts: number;
  verified: boolean;
  used: boolean; // una volta scaricato il documento, non riapribile
  recipientName: string | null; // nome dichiarato dalla terza persona, usato nel watermark
  consentAcceptedAt: number | null; // timestamp di accettazione della clausola di riservatezza
  attempts: {
    timestamp: number;
    ip: string;
    country: string | null;
    gpsCountryMatch: boolean | null;
    result: "blocked_country" | "otp_sent" | "otp_verified" | "otp_failed" | "expired" | "already_used";
  }[];
};

const store = new Map<string, AccessRecord>();

export function createAccessLink(phoneNumber: string, expectedCountry = "CM", ttlMinutes = 60) {
  const token = randomBytes(24).toString("hex");
  const now = Date.now();
  const record: AccessRecord = {
    token,
    phoneNumber,
    expectedCountry,
    createdAt: now,
    expiresAt: now + ttlMinutes * 60 * 1000,
    otpCode: null,
    otpExpiresAt: null,
    otpAttempts: 0,
    verified: false,
    used: false,
    recipientName: null,
    consentAcceptedAt: null,
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
