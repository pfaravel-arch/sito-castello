# Sito del Castello di Silvano Pietra APS

Sito statico su misura per castellodisilvanopietra.com, ospitato gratis su GitHub Pages.
Il dominio resta registrato su Aruba (anche la posta), e i suoi DNS puntano a GitHub.
Ogni modifica caricata sul ramo `main` viene costruita e pubblicata da sola
(vedi `.github/workflows/pubblica.yml`).

## Struttura

```
src/layout.html        testata, menu e piè di pagina comuni a tutte le pagine
src/pages/*.html       una pagina per file
data/eventi.json       calendario eventi (letto dalle pagine Home ed Eventi)
assets/css/sito.css    colori, caratteri e componenti
assets/js/sito.js      menu su telefono e calendario eventi
assets/img/            logo, foto, immagini
build.py               costruisce il sito in dist/
htaccess.txt           regole Apache copiate in dist/.htaccess
```

## Aggiungere una pagina

1. Crea `src/pages/nome-pagina.html`.
2. Nella prima riga metti il commento con i dati della pagina:
   `<!--{"title":"Visite guidate","nav":"Visite","order":4,"description":"..."}-->`
   Senza `"nav"` la pagina esiste ma non compare nel menu.
3. Sotto, il contenuto fatto di sezioni (vedi sotto).

## Sezioni disponibili

Ogni sezione è un blocco `<section class="fascia ...">` con dentro `<div class="fascia-stretta">`.

| Classe           | Aspetto                               |
|------------------|---------------------------------------|
| `fascia`         | sfondo intonaco                       |
| `fascia-chiara`  | sfondo più chiaro, per alternare      |
| `fascia-verde`   | terra verde, per inviti ad agire      |
| `fascia-notte`   | scuro, per eventi serali              |

Dentro una sezione: `colonne` (testo + foto affiancati), `cronologia` (date in sequenza),
`cantieri` (schede restauro con `stato`), `sostegno`, `elenco-semplice` (coppie etichetta/valore),
`foto-segnaposto` (da sostituire con `<img>`).

## Aggiungere un evento

Aggiungi un oggetto in `data/eventi.json`:

```json
{
  "titolo": "Visita guidata agli affreschi",
  "data": "2026-12-08",
  "fine": "2026-12-08",
  "orario": "Ore 15:00",
  "luogo": "Castello di Silvano Pietra",
  "descrizione": "Breve descrizione.",
  "avviso": "Facoltativo, in corsivo.",
  "link": "/eventi.html",
  "etichetta_link": "Come prenotare"
}
```

Gli eventi passano da solo da "Prossimi" a "Passati" dopo la data (o dopo `fine`).

## Provare in locale

```
python3 build.py
python3 -m http.server -d dist 8000
```
e apri http://localhost:8000

## Pubblicazione

Automatica a ogni modifica di `main`. Lo stato si vede nella scheda Actions del repository.

Impostazioni una tantum:
- GitHub: Settings > Pages > Source: GitHub Actions; Custom domain: www.castellodisilvanopietra.com; Enforce HTTPS.
- Aruba, Gestione DNS: record A su `@` verso 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153;
  record CNAME `www` verso `pfaravel-arch.github.io`. I record MX della posta non vanno toccati.

Nota: `.htaccess` serve solo su server Apache; su GitHub Pages viene ignorato
(la pagina 404.html funziona comunque).

## Tessere soci NFC

Ogni tessera contiene l'indirizzo `https://castellodisilvanopietra.com/t/CODICE`.
GitHub Pages non ha quell'indirizzo, quindi risponde con `404.html`, che rimanda a
`/tessera.html#CODICE` (pagina di verifica, fuori dal menu).

`data/tessere.json` viene rigenerato in automatico da un'attività pianificata di Claude, che
esporta il gestionale soci e lancia `strumenti/genera_tessere.py`. Per ogni tessera contiene l'impronta SHA-256 del codice
e la scheda (numero, nome, stato, fine validità) cifrata in AES-GCM con una chiave ricavata dal
codice: solo chi ha la tessera può leggere la propria scheda. Il file non contiene mai i codici.

## Prenotazioni online

Il motore delle prenotazioni sta in `prenotazioni/` e gira su Cloudflare Workers (gratuito),
con le prenotazioni salvate in un database Cloudflare D1. Si pubblica da solo con
`.github/workflows/prenotazioni.yml` quando ci sono i secrets `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID` e `PRENOTAZIONI_PASSWORD`.

L'indirizzo del motore va scritto in `data/prenotazioni.json` (`"api": "https://...workers.dev"`).

Per rendere prenotabile un evento, in `data/eventi.json` aggiungi:

```json
"prenotazioni": {
  "id": "mercatini-2026",
  "fasce": { "dalle": "15:00", "alle": "18:30", "ogni": 30 },
  "posti": 15,
  "max_per_prenotazione": 10,
  "chiusura": "2026-12-07T12:00"
}
```

- `id`: nome breve dell'evento, solo lettere minuscole, numeri e trattini; non cambiarlo dopo le prime prenotazioni.
- `fasce`: orari di partenza; in alternativa un elenco `["17:00","17:30"]`. Senza `fasce` c'è un'unica prenotazione per l'evento.
- `posti`: posti per ogni fascia. `chiusura` (facoltativa): ora italiana in cui chiudono le prenotazioni.

Sull'evento compare il pulsante "Prenota online". Le prenotazioni si gestiscono in
`/gestione-prenotazioni.html` (pagina non indicizzata, protetta da password).

Prova locale del motore: `node prenotazioni/test/prova.mjs`.
