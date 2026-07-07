// lib/twilio.ts
// Wrapper minimo per l'invio SMS via Twilio.
// npm install twilio
// Twilio supporta numeri Cameroon (+237); verifica sempre il pricing/coverage
// aggiornato sulla dashboard Twilio prima di andare in produzione.

import twilio from "twilio";

let client: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (!client) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      throw new Error("TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN non configurati");
    }
    client = twilio(accountSid, authToken);
  }
  return client;
}

export async function sendOtpSms(toPhoneNumber: string, code: string) {
  await getClient().messages.create({
    body: `Il tuo codice di verifica per accedere ai documenti è: ${code}. Valido 5 minuti. Non condividerlo con nessuno.`,
    from: process.env.TWILIO_FROM_NUMBER,
    to: toPhoneNumber,
  });
}
