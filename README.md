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

## Eventi

Gli eventi si gestiscono da `/gestione-eventi.html` (area riservata, stessa password delle prenotazioni):
nuovo, modifica, duplica, elimina, locandina, stato (bozza / pubblicato / chiuso), primo piano,
prenotazioni online. Stanno nel database del motore (tabella `eventi`) e compaiono subito sul sito,
senza ripubblicarlo.

La pagina Eventi mostra: l'evento in primo piano (quello segnato, altrimenti il prossimo), gli altri
in programma e l'archivio dei passati (dopo la data di fine, o subito se "Chiuso").

`data/eventi.json` resta come riserva: le pagine lo usano solo se il motore non risponde, e al primo
avvio il motore lo ha importato (con le locandine).

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

Le prenotazioni di un evento si attivano dalla scheda dell'evento in Gestione eventi
(orari, posti per partenza, massimo per prenotazione, chiusura). Sull'evento compare il pulsante
"Prenota online"; le prenotazioni si gestiscono in `/gestione-prenotazioni.html`.

Prova locale del motore: `node prenotazioni/test/prova.mjs`.

## Area riservata

`/area-riservata.html` (link nel piè di pagina) chiede una password. Il contenuto (elenco degli
strumenti di gestione) non è nel repository in chiaro: sta cifrato in `data/area-riservata.json`
e la pagina lo decifra nel browser con la password. Per modificarlo o cambiare password:

```
AREA_PASSWORD='password' python3 strumenti/cifra_area.py decifra > contenuto.html
# modifica contenuto.html, poi:
AREA_PASSWORD='password nuova o uguale' python3 strumenti/cifra_area.py cifra contenuto.html
```

Non salvare contenuto.html nel repository.

### Accesso unico ed e-mail di conferma

Chi entra nell'area riservata riceve (dal contenuto cifrato) un codice che il motore riconosce
tramite la sua impronta `AREA_TOKEN_SHA256` in `prenotazioni/wrangler.toml`: le pagine Gestione
eventi e Gestione prenotazioni non chiedono altre password e, se aperte senza accesso, rimandano
all'area riservata. "Esci" nell'area riservata chiude l'accesso.

Le e-mail di conferma delle prenotazioni (al partecipante e copia all'associazione) partono dalla
Gmail del Castello via SMTP (`smtp.gmail.com:465`, `prenotazioni/src/smtp.js`) quando c'è il secret
`SMTP_PASSWORD` (password per le app di Google, con verifica in due passaggi attiva). Mittente, risposta
e copia si impostano in `wrangler.toml`. In alternativa, senza `SMTP_PASSWORD`, si può usare Brevo con il
secret `BREVO_API_KEY`. Se la password per le app viene revocata, le prenotazioni continuano a
funzionare ma le e-mail non partono.

### Percorsi con posti separati (es. escape room Adulti e Bambini)

Nella scheda dell'evento, spunta «Più percorsi» e una riga per percorso: per chi (es. Adulti), nome della escape e una nota facoltativa (es. età). Gli orari sono
gli stessi, ma ogni percorso ha i suoi «Posti per ogni partenza». Nel modulo si sceglie prima il percorso e poi
l'orario (con i colori per i posti liberi); conferme, annullamenti e Gestione prenotazioni indicano il percorso.

### Prenotazioni da WhatsApp, telefono o di persona

Dal sito l'e-mail è obbligatoria. Chi prenota in altro modo si inserisce da Gestione prenotazioni con
«Aggiungi prenotazione» (basta il telefono; si indica il canale: WhatsApp, telefono, di persona, e-mail).
I posti vengono controllati come per il sito e lo staff può aggiungere anche dopo la chiusura online
(non se l'evento è «Chiuso»). Dopo il salvataggio «Invia la conferma su WhatsApp» apre WhatsApp con il
messaggio pronto (codice, link di annullamento, informativa); lo stesso link c'è su ogni riga con telefono.
Se si inserisce l'e-mail parte anche la conferma automatica. Il canale è nella colonna `origine`.

### Annullamento da parte del partecipante

Ogni e-mail di conferma contiene un link personale `/annulla.html?c=CODICE&k=CHIAVE` (chiave casuale
salvata con la prenotazione). La pagina mostra il riepilogo e chiede conferma; l'annullamento libera
subito i posti e invia "Prenotazione annullata" al partecipante e "Annullata: …" all'associazione.
Funziona finché le prenotazioni dell'evento sono aperte. In Gestione prenotazioni compare
"Annullata dal partecipante".
