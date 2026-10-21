# Sito del Castello di Silvano Pietra APS

Sito statico su misura per castellodisilvanopietra.com, ospitato su Aruba.
Ogni modifica caricata sul ramo `main` di GitHub viene costruita e pubblicata
automaticamente via FTP (vedi `.github/workflows/pubblica.yml`).

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

Nel repository GitHub, in Settings > Secrets and variables > Actions, crea:
`FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`, `FTP_DIR`.
I dati sono nel pannello Aruba (Hosting > Gestione FTP). La cartella del sito su Aruba
di solito è `/www.castellodisilvanopietra.com/`.
Se FTPS non funziona, nel workflow cambia `protocol: ftps` in `protocol: ftp`.
