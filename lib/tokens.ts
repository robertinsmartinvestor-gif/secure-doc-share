// lib/tokens.ts
// Gestione token monouso + stato di verifica, persistita su Upstash Redis
// (Vercel Marketplace) invece che in una Map in-memory: su Vercel/serverless
// la memoria del processo non persiste tra invocazioni.

import { randomBytes } from "crypto";
import { Redis } from "@upstash/redis";

export type AccessRecord = {
  token: string;
  phoneNumber: string; // numero E.164 della terza persona, es. +237XXXXXXXXX
  expectedCountry: string; // codice ISO a 2 lettere, es. "CM", "IT"
  expectedRecipientName: string | null; // nome atteso impostato dall'admin: se presente, blocca/pre-compila il nome allo step di consenso
  documents: { filename: string; url: string }[]; // documenti inclusi nel link: nome originale + URL Vercel Blob
  ttlMinutes: number; // durata del link (in minuti) usata alla creazione
  otpTtlMinutes: number; // durata dell'OTP (in minuti) da usare quando viene generato
  testMode: boolean; // se true: niente invio SMS reale, il codice OTP torna nella risposta JSON di check-access (per sviluppo/test)
  manualOtpMode: boolean; // se true: niente invio SMS reale, uso reale senza Twilio — l'OTP viene generato subito alla creazione e comunicato dall'admin a mano
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

// Client Redis creato in modo lazy (non al caricamento del modulo) così che
// `next build` non fallisca se le env var non sono ancora configurate in
// questo ambiente: vengono lette solo quando una funzione viene invocata a
// runtime.
let redisClient: Redis | null = null;

function getRedis(): Redis {
  if (redisClient) return redisClient;

  // Il nome esatto delle env var dipende da come Vercel/Upstash le genera
  // al momento dell'installazione dal Marketplace: controlla in
  // Vercel → Storage → il tuo database Upstash → ".env.local" tab.
  // Supportiamo entrambe le convenzioni più comuni.
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.REDIS_REST_API_URL;
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.REDIS_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Redis non configurato: imposta KV_REST_API_URL/KV_REST_API_TOKEN (o UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN) nelle env var. Vedi README.md per l'installazione di Upstash Redis dal Marketplace Vercel."
    );
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

const ALL_TOKENS_KEY = "all_tokens";
const tokenKey = (token: string) => `token:${token}`;

async function saveRecord(record: AccessRecord): Promise<void> {
  // TTL coerente con la scadenza del link: Redis elimina la chiave da solo,
  // niente cron/cleanup manuale da mantenere.
  const ttlSeconds = Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000));
  await getRedis().set(tokenKey(record.token), record, { ex: ttlSeconds });
}

export async function createAccessLink(options: {
  phoneNumber: string;
  documents: { filename: string; url: string }[];
  expectedCountry?: string;
  expectedRecipientName?: string | null;
  ttlMinutes?: number;
  otpTtlMinutes?: number;
  testMode?: boolean;
  manualOtpMode?: boolean;
  skipGeoCheck?: boolean;
}): Promise<AccessRecord> {
  const {
    phoneNumber,
    documents,
    expectedCountry = "CM",
    expectedRecipientName = null,
    ttlMinutes = 60,
    otpTtlMinutes = 5,
    testMode = false,
    manualOtpMode = false,
    skipGeoCheck = false,
  } = options;

  const token = randomBytes(24).toString("hex");
  const now = Date.now();
  const record: AccessRecord = {
    token,
    phoneNumber,
    expectedCountry,
    expectedRecipientName,
    documents,
    ttlMinutes,
    otpTtlMinutes,
    testMode,
    manualOtpMode,
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

  await saveRecord(record);
  // Indice separato per listAllTokens(): Redis non supporta uno scan
  // efficiente per pattern su tutti i piani, quindi teniamo una sorted set
  // ordinata per data di creazione con tutti i token emessi.
  await getRedis().zadd(ALL_TOKENS_KEY, { score: now, member: token });

  return record;
}

export async function getAccessRecord(token: string): Promise<AccessRecord | null> {
  const record = await getRedis().get<AccessRecord>(tokenKey(token));
  return record ?? null;
}

export async function logAttempt(token: string, entry: AccessRecord["attempts"][number]): Promise<void> {
  const r = await getAccessRecord(token);
  if (!r) return;
  r.attempts.push(entry);
  await saveRecord(r);
}

export async function setOtp(token: string, code: string, ttlMinutes = 5): Promise<void> {
  const r = await getAccessRecord(token);
  if (!r) return;
  r.otpCode = code;
  r.otpExpiresAt = Date.now() + ttlMinutes * 60 * 1000;
  r.otpAttempts = 0;
  await saveRecord(r);
}

export async function markVerified(token: string): Promise<void> {
  const r = await getAccessRecord(token);
  if (!r) return;
  r.verified = true;
  await saveRecord(r);
}

export async function markUsed(token: string): Promise<void> {
  const r = await getAccessRecord(token);
  if (!r) return;
  r.used = true;
  await saveRecord(r);
}

export async function recordConsent(token: string, recipientName: string): Promise<void> {
  const r = await getAccessRecord(token);
  if (!r) return;
  r.recipientName = recipientName;
  r.consentAcceptedAt = Date.now();
  await saveRecord(r);
}

export async function setWatermarkCode(token: string, code: string): Promise<void> {
  const r = await getAccessRecord(token);
  if (!r) return;
  r.watermarkCode = code;
  await saveRecord(r);
}

// Redis è remoto: a differenza della vecchia Map in-memory, il contatore
// tentativi OTP non può più essere mutato in-place dal chiamante e va
// incrementato e salvato qui, altrimenti l'aumento andrebbe perso tra una
// richiesta e l'altra (ogni invocazione serverless riparte da zero).
export async function incrementOtpAttempts(token: string): Promise<number> {
  const r = await getAccessRecord(token);
  if (!r) return 0;
  r.otpAttempts += 1;
  await saveRecord(r);
  return r.otpAttempts;
}

function deriveStatus(r: AccessRecord): TokenStatus {
  if (r.used) return "used";
  if (Date.now() > r.expiresAt) return "expired";
  if (r.verified) return "verified";
  if (r.otpCode) return "otp_sent";
  return "created";
}

export async function listAllTokens(): Promise<TokenSummary[]> {
  const redis = getRedis();
  const tokens = await redis.zrange<string[]>(ALL_TOKENS_KEY, 0, -1);
  if (tokens.length === 0) return [];

  // Più recenti prima, come nel vecchio ordinamento in-memory.
  const orderedTokens = [...tokens].reverse();
  const records = await redis.mget<(AccessRecord | null)[]>(...orderedTokens.map(tokenKey));

  const summaries: TokenSummary[] = [];
  const staleTokens: string[] = [];

  records.forEach((r, i) => {
    if (!r) {
      // La chiave token:* è scaduta via TTL ma il riferimento nella sorted
      // set è rimasto: lo ripuliamo qui invece di lasciarlo crescere.
      staleTokens.push(orderedTokens[i]);
      return;
    }
    summaries.push({
      token: `${r.token.slice(0, 8)}...`,
      phoneNumber: r.phoneNumber,
      status: deriveStatus(r),
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      testMode: r.testMode,
      // Non esposto più una volta che il link è stato usato: serve solo
      // come comodità per i test, non deve restare visibile a tempo indeterminato.
      testCode: r.testMode && !r.used ? r.otpCode : null,
    });
  });

  if (staleTokens.length > 0) {
    await redis.zrem(ALL_TOKENS_KEY, ...staleTokens);
  }

  return summaries;
}
