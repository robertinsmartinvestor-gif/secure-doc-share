# Secure Doc Share

Sistema per condividere documenti sensibili con un link monouso, protetto da:
1. Check geografico (IP + GPS del dispositivo)
2. OTP via SMS su un numero verificato della terza persona
3. Link a scadenza, usabile una sola volta

## Setup

```bash
npm install twilio pdf-lib
cp .env.example .env.local
# compila .env.local con le tue credenziali Twilio
```

Metti il documento reale in `secure-files/documenti.pdf` (cartella NON dentro `public/`,
così non è raggiungibile direttamente via URL).

## Come si usa

1. Tu chiami `POST /api/create-link` con il numero di telefono Cameroon
   della terza persona (`+237...`) e il tuo `ADMIN_SECRET`. Ottieni un link tipo
   `https://tuodominio.com/verify/<token>`.
2. Mandi quel link (non i documenti) alla terza persona, sul canale che ritieni
   più sicuro.
3. La terza persona apre il link, concede il permesso GPS (o no), riceve un
   SMS con un codice a 6 cifre, lo inserisce, inserisce il proprio nome e
   accetta la clausola di riservatezza, e solo allora può scaricare il PDF.
4. Il PDF scaricato ha un watermark diagonale ripetuto su ogni pagina con
   nome, data/ora e IP di chi lo ha scaricato — visibile anche stampato.
5. Il link diventa inutilizzabile dopo un download o dopo la scadenza (default 1h).

## Cosa NON risolve questo sistema

- Se il telefono +237 della terza persona è compromesso o è nelle mani della
  persona di mezzo, l'OTP non serve a nulla. **Il numero di telefono deve
  arrivarti da un canale verificato in modo indipendente** (una videochiamata,
  una chiamata vocale che riconosci, un documento ufficiale) — non fidarti di
  un numero fornito dalla stessa persona di cui sospetti.
- La geolocalizzazione (IP o GPS) è un filtro aggiuntivo, non un'autenticazione:
  è aggirabile con VPN/spoofing. Il vero fattore di sicurezza qui è l'OTP sul
  numero verificato.
- Considera di aggiungere, se il rischio è alto, una domanda di sicurezza a cui
  solo la vera terza persona saprebbe rispondere, in aggiunta all'OTP.

## Prossimi passi consigliati

- Sostituire lo store in-memory (`lib/tokens.ts`) con Redis o Postgres se
  fai il deploy su Vercel/serverless (la memoria non persiste tra invocazioni).
- Aggiungere rate limiting sull'endpoint `/api/check-access` e `/api/verify-otp`
  per prevenire brute force.
- Loggare tutti i tentativi (già previsto in `attempts[]`) e controllarli dopo
  l'invio, per avere evidenza in caso di dispute.
