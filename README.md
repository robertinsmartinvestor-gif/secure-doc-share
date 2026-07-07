# Secure Doc Share

Sistema per condividere documenti sensibili con un link monouso, protetto da:
1. Check geografico (IP + GPS del dispositivo)
2. OTP via SMS su un numero verificato della terza persona
3. Link a scadenza, usabile una sola volta

## Setup

```bash
npm install twilio pdf-lib jszip
cp .env.example .env.local
# compila .env.local con le tue credenziali Twilio
```

Metti i documenti reali dentro `secure-files/` (cartella NON dentro `public/`,
così non sono raggiungibili direttamente via URL). Puoi caricare più file PDF
in questa cartella, e scegliere quali includere in ciascun link al momento
della generazione.

## Come si usa

### Pagina admin (`/admin`)

`/admin` è ora lo strumento centrale sia per generare link reali sia per
testarli, senza dover chiamare le API a mano:

1. Inserisci il tuo `ADMIN_SECRET` e premi **"Carica elenco file"**: la lista
   dei PDF viene letta dinamicamente da `secure-files/` (via `GET
   /api/list-documents`) e mostrata come checkbox, invece di doverli scrivere
   a mano.
2. Compila il form:
   - **Numero di telefono**: qualsiasi numero in formato internazionale
     E.164 (es. `+391234567890`, `+237XXXXXXXXX`), non solo Cameroon.
   - **Paese atteso**: select con `Cameroon (CM)`, `Italia (IT)` oppure
     `Altro` (in tal caso inserisci il codice ISO a 2 lettere, es. `FR`).
   - **Nome atteso del destinatario** (opzionale): se lo valorizzi, questo
     nome viene salvato nel link e mostrato **precompilato e non
     modificabile** nello step di consenso che il destinatario vede dopo
     l'OTP — così chi apre il link non può dichiarare un nome diverso.
   - **Documenti da includere**: seleziona uno o più PDF dalla checkbox list.
   - **Durata del link**: 30 minuti / 1 ora / 6 ore / 24 ore.
   - **Durata OTP**: fissa a 5 minuti, tranne quando è attiva la modalità
     "Invio manuale OTP" (vedi sotto), dove diventa selezionabile.
   - **Modalità test**: pensata per lo **sviluppo**. Se attiva, l'SMS reale
     non viene inviato; quando il destinatario del link arriva allo step OTP,
     il codice generato torna nella risposta JSON (`testCode`) e viene
     mostrato solo qui, mai nella pagina pubblica `/verify/<token>`.
   - **Invio manuale OTP**: pensata per l'**uso reale** quando non vuoi (o
     non puoi) usare Twilio a pagamento. Mutuamente esclusiva con la
     modalità test: attivandola si disattiva l'altra e viceversa. A
     differenza della modalità test, il codice OTP viene generato **subito
     alla creazione del link** (non al primo accesso del destinatario) e
     mostrato nel riepilogo, così puoi comunicarlo tu stesso al destinatario
     sul canale che preferisci (telefonata, WhatsApp...) insieme al link,
     evitando tempi morti. Compare anche un select **"Durata OTP (invio
     manuale)"** con 15 / 30 / 60 minuti: usa un valore più alto della
     modalità automatica perché qui il codice deve restare valido per tutto
     il tempo che impieghi a comunicarlo e il destinatario a usarlo.
   - **Disattiva check geografico**: se attiva, salta interamente il
     controllo IP/GPS e procede sempre all'invio dell'OTP (utile per test da
     reti/paesi diversi da quello atteso).
3. Premi **"Genera link"**. Sotto compare un riepilogo completo: link,
   numero destinatario, paese atteso, nome atteso (se impostato), documenti
   inclusi, data/ora di scadenza, se la modalità test è attiva e se l'invio
   manuale OTP è attivo — in tal caso il codice OTP stesso è mostrato in
   evidenza, pronto da copiare e comunicare.
4. In fondo alla pagina trovi lo **storico dei link generati** (via `GET
   /api/list-links`), con token troncato, numero, stato dedotto
   (`Creato` / `OTP inviato` / `Verificato` / `Usato` / `Scaduto`), data di
   creazione e scadenza. Premi **"Aggiorna"** per ricaricarlo.

In alternativa puoi chiamare direttamente `POST /api/create-link` con
`{ adminSecret, phoneNumber, documentFilenames, expectedCountry,
expectedRecipientName?, ttlMinutes?, otpTtlMinutes?, testMode?,
manualOtpMode?, skipGeoCheck? }`.

### Flusso del destinatario

1. Mandi il link generato (non i documenti) alla terza persona, sul canale
   che ritieni più sicuro.
2. La terza persona apre il link (interfaccia in francese, essendo il
   destinatario francofono), concede il permesso GPS (o no, a meno che il
   check geografico sia stato disattivato), poi inserisce il codice OTP: via
   SMS in modalità normale, oppure quello che tu (admin) le hai già
   comunicato a mano se il link è in modalità "Invio manuale OTP" (in
   modalità test, il codice è visibile solo lato admin). Poi vede il nome
   (libero, oppure precompilato e bloccato se l'admin ne ha impostato uno) e
   accetta la clausola di riservatezza. Prima di scaricare, vede quanti e
   quali documenti sono inclusi nel link.
3. Ogni PDF scaricato riceve un piccolo codice identificativo discreto in
   basso a destra su ogni pagina (nessuna diagonale, nessuna ripetizione),
   mentre nome del destinatario, IP e data/ora completi vengono incorporati
   solo nei metadati del PDF (invisibili a schermo e in stampa, recuperabili
   con strumenti come `exiftool` in caso di dispute).
   - Se il link include **un solo documento**, il download restituisce
     direttamente il PDF con watermark.
   - Se il link include **più documenti**, tutti i PDF vengono prima
     marchiati con il watermark e poi impacchettati in un unico file
     `.zip` da scaricare.
4. Il link diventa inutilizzabile dopo un download o dopo la scadenza
   scelta alla creazione (default 1h).

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
