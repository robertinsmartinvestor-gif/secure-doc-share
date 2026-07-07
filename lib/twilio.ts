// lib/twilio.ts
// Wrapper minimo per l'invio SMS via Twilio.
// npm install twilio
// Twilio supporta numeri Cameroon (+237); verifica sempre il pricing/coverage
// aggiornato sulla dashboard Twilio prima di andare in produzione.

import twilio from "twilio";

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export async function sendOtpSms(toPhoneNumber: string, code: string) {
  await client.messages.create({
    body: `Il tuo codice di verifica per accedere ai documenti è: ${code}. Valido 5 minuti. Non condividerlo con nessuno.`,
    from: process.env.TWILIO_FROM_NUMBER,
    to: toPhoneNumber,
  });
}
