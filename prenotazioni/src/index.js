// Motore eventi e prenotazioni del Castello di Silvano Pietra APS.
// Gira su Cloudflare Workers; eventi, locandine e prenotazioni stanno nel database D1 "DB".
//
// Pubblico:
//   GET  /calendario             eventi pubblicati (per le pagine Home ed Eventi)
//   GET  /locandine/:id          immagine della locandina
//   GET  /eventi/:id             fasce orarie e posti liberi di un evento prenotabile
//   POST /prenotazioni           crea una prenotazione (controlla i posti in modo atomico)
//   GET  /prenotazioni/:codice?k=CHIAVE          riepilogo per la pagina di annullamento
//   POST /prenotazioni/:codice/annulla {k}       annulla dal link nell'e-mail e libera i posti
// Riservato (intestazione "X-Password" = segreto ADMIN_PASSWORD):
//   GET    /admin/eventi[?prenotabili=1]     eventi con i totali delle prenotazioni
//   GET    /admin/eventi/:id                 scheda completa di un evento
//   POST   /admin/eventi                     nuovo evento
//   PUT    /admin/eventi/:id                 modifica evento
//   DELETE /admin/eventi/:id                 elimina (solo senza prenotazioni)
//   PUT    /admin/eventi/:id/locandina       carica locandina (corpo = immagine)
//   DELETE /admin/eventi/:id/locandina       toglie la locandina
//   GET    /admin/prenotazioni?evento=ID     elenco prenotazioni
//   PATCH  /admin/prenotazioni/:codice       { pagato, stato }
//
// Al primo uso, se la tabella eventi e' vuota, importa data/eventi.json del sito (con le locandine).

import { componiMessaggio, inviaSmtp } from "./smtp.js";

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // senza 0/O e 1/I
const STATI = ["bozza", "pubblicato", "chiuso"];
const TIPI_IMMAGINE = ["image/jpeg", "image/png", "image/webp"];
const MAX_LOCANDINA = 1_800_000;

export default {
  async fetch(request, env, ctx) {
    const cors = intestazioniCors(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      const risposta = await instrada(request, env, ctx || { waitUntil: (p) => p.catch(() => {}) });
      for (const [k, v] of Object.entries(cors)) risposta.headers.set(k, v);
      return risposta;
    } catch (e) {
      if (e instanceof Errore) return json({ errore: e.message }, e.status, cors);
      console.error(e);
      return json({ errore: "Errore interno. Riprova tra poco o scrivici." }, 500, cors);
    }
  },
};

class Errore extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

async function instrada(request, env, ctx) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, "") || "/";
  const m = request.method;
  let r;

  if (m === "GET" && p === "/") return json({ servizio: "Eventi e prenotazioni Castello di Silvano Pietra", stato: "attivo" });
  if (m === "GET" && p === "/calendario") return calendario(env, url);
  if (m === "GET" && (r = p.match(/^\/locandine\/([a-z0-9-]{1,60})$/))) return locandina(env, r[1]);
  if (m === "GET" && (r = p.match(/^\/eventi\/([a-z0-9-]{1,60})$/))) return disponibilita(env, r[1], await eAdmin(request, env));
  if (m === "POST" && p === "/prenotazioni") return prenota(env, await leggiJson(request), ctx, await eAdmin(request, env));
  if (m === "GET" && (r = p.match(/^\/prenotazioni\/([A-Z0-9]{6})$/))) return datiPerAnnullo(env, r[1], url.searchParams.get("k"));
  if (m === "POST" && (r = p.match(/^\/prenotazioni\/([A-Z0-9]{6})\/annulla$/))) return annullaDalPartecipante(env, r[1], (await leggiJson(request)).k, ctx);

  if (p.startsWith("/admin/")) {
    await controllaPassword(request, env);
    if (m === "GET" && p === "/admin/eventi") return adminEventi(env, url.searchParams.get("prenotabili") === "1");
    if (m === "POST" && p === "/admin/eventi") return adminCrea(env, await leggiJson(request));
    if ((r = p.match(/^\/admin\/eventi\/([a-z0-9-]{1,60})\/locandina$/))) {
      if (m === "PUT") return adminCaricaLocandina(env, r[1], request);
      if (m === "DELETE") return adminTogliLocandina(env, r[1]);
    }
    if ((r = p.match(/^\/admin\/eventi\/([a-z0-9-]{1,60})$/))) {
      if (m === "GET") return json(perAdmin(await rigaEvento(env, r[1]), url.origin));
      if (m === "PUT") return adminModifica(env, r[1], await leggiJson(request), url.origin);
      if (m === "DELETE") return adminElimina(env, r[1]);
    }
    if (m === "GET" && p === "/admin/prenotazioni") return adminElenco(env, url.searchParams.get("evento"));
    if (m === "PATCH" && (r = p.match(/^\/admin\/prenotazioni\/([A-Z0-9]{6})$/))) return adminAggiorna(env, r[1], await leggiJson(request));
  }
  throw new Errore("Indirizzo non trovato.", 404);
}

// ---------- eventi: lettura ----------

const COLONNE = "id, titolo, data, fine, orario, luogo, descrizione, avviso, stato, in_evidenza, pren_attive, pren_fasce, pren_posti, pren_max, pren_chiusura, locandina_tipo, locandina_ver";

async function rigaEvento(env, id) {
  await importaSeVuoto(env);
  const r = await env.DB.prepare(`SELECT ${COLONNE} FROM eventi WHERE id = ?`).bind(id).first();
  if (!r) throw new Errore("Evento non trovato.", 404);
  return r;
}

function fasceDaRiga(r) {
  if (!r.pren_fasce) return null;
  try { return JSON.parse(r.pren_fasce); } catch { return null; }
}

// Forma comune usata da prenotazioni e pagine: { ..., prenotazioni: {id, fasce, posti, ...} | null }
function evento(r, origine) {
  return {
    id: r.id, titolo: r.titolo, data: r.data, fine: r.fine || null, orario: r.orario || "", luogo: r.luogo || "",
    descrizione: r.descrizione || "", avviso: r.avviso || "", stato: r.stato, in_evidenza: !!r.in_evidenza,
    locandina: r.locandina_tipo ? `${origine}/locandine/${r.id}?v=${r.locandina_ver}` : null,
    prenotazioni: r.pren_attive ? {
      id: r.id, fasce: fasceDaRiga(r), posti: Number(r.pren_posti) || 15,
      max_per_prenotazione: Number(r.pren_max) || Number(r.pren_posti) || 15, chiusura: r.pren_chiusura || null,
    } : null,
  };
}

function perAdmin(r, origine) {
  return { ...evento(r, origine), pren_attive: !!r.pren_attive, pren_fasce: fasceDaRiga(r),
    pren_posti: Number(r.pren_posti), pren_max: Number(r.pren_max), pren_chiusura: r.pren_chiusura || "" };
}

async function calendario(env, url) {
  await importaSeVuoto(env);
  const { results } = await env.DB.prepare(
    `SELECT ${COLONNE} FROM eventi WHERE stato != 'bozza' ORDER BY data`
  ).all();
  return json(results.map((r) => {
    const e = evento(r, url.origin);
    if (e.prenotazioni) e.prenotazioni = { aperte: r.stato === "pubblicato" && prenotazioniAperte(e) };
    return e;
  }), 200, { "Cache-Control": "public, max-age=30" });
}

async function locandina(env, id) {
  const r = await env.DB.prepare("SELECT locandina, locandina_tipo FROM eventi WHERE id = ?").bind(id).first();
  if (!r || !r.locandina) throw new Errore("Locandina non trovata.", 404);
  const corpo = r.locandina instanceof ArrayBuffer ? r.locandina : new Uint8Array(r.locandina);
  return new Response(corpo, { headers: { "Content-Type": r.locandina_tipo, "Cache-Control": "public, max-age=31536000, immutable" } });
}

// Le bozze si possono prenotare solo da chi e' entrato nell'area riservata (per le prove)
async function eventoPrenotabile(env, id, admin = false, origine = "") {
  const r = await rigaEvento(env, id).catch(() => null);
  if (!r || !r.pren_attive || (r.stato === "bozza" && !admin)) throw new Errore("Evento non trovato o non prenotabile.", 404);
  const e = evento(r, origine);
  e.chiuso = r.stato === "chiuso";
  return e;
}

// Fasce orarie: elenco esplicito ["17:00", ...] oppure { dalle, alle, ogni (minuti) }; senza fasce: "unica"
export function fasceDi(ev) {
  const f = ev.prenotazioni.fasce;
  if (Array.isArray(f) && f.length) return f;
  if (f && f.dalle && f.alle && f.ogni) {
    const min = (s) => { const [h, mm] = s.split(":").map(Number); return h * 60 + mm; };
    const out = [];
    for (let t = min(f.dalle); t <= min(f.alle); t += Number(f.ogni)) {
      out.push(String(Math.floor(t / 60) % 24).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0"));
    }
    if (out.length) return out;
  }
  return ["unica"];
}

// Le prenotazioni chiudono all'orario "chiusura" (ora italiana) o, se manca, alla fine del giorno dell'evento
export function prenotazioniAperte(ev, adesso = new Date()) {
  if (ev.chiuso || ev.stato === "chiuso") return false;
  const chiusura = ev.prenotazioni.chiusura || (ev.fine || ev.data) + "T23:59";
  return adesso < oraItaliana(chiusura);
}

function oraItaliana(s) {
  const [d, t = "00:00"] = s.split("T");
  const utc = new Date(d + "T" + t + ":00Z");
  const roma = new Date(utc.toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  const base = new Date(utc.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(utc.getTime() - (roma - base));
}

// ---------- import iniziale da data/eventi.json ----------

let importato = false;
async function importaSeVuoto(env) {
  if (importato) return;
  const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM eventi").first();
  if (Number(c.n) > 0) { importato = true; return; }
  let lista = [];
  try {
    const res = await fetch(env.SITO + "/data/eventi.json");
    if (res.ok) lista = await res.json();
  } catch { /* sito irraggiungibile: si riprova alla prossima richiesta */ return; }
  for (const e of lista) {
    if (!e.titolo || !/^\d{4}-\d{2}-\d{2}$/.test(e.data || "")) continue;
    const id = (e.prenotazioni && e.prenotazioni.id) || slug(e.titolo, e.data);
    const p = e.prenotazioni || null;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO eventi (id, titolo, data, fine, orario, luogo, descrizione, avviso, stato, pren_attive, pren_fasce, pren_posti, pren_max, pren_chiusura)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pubblicato', ?, ?, ?, ?, ?)`
    ).bind(id, e.titolo, e.data, e.fine || null, e.orario || null, e.luogo || null, e.descrizione || null, e.avviso || null,
      p ? 1 : 0, p && p.fasce ? JSON.stringify(p.fasce) : null, Number(p && p.posti) || 15, Number(p && p.max_per_prenotazione) || 10,
      (p && p.chiusura) || null).run();
    if (e.locandina) {
      try {
        const img = await fetch(new URL(e.locandina, env.SITO).toString());
        const tipo = (img.headers.get("Content-Type") || "").split(";")[0];
        if (img.ok && TIPI_IMMAGINE.includes(tipo)) {
          const b = await img.arrayBuffer();
          if (b.byteLength <= MAX_LOCANDINA) {
            await env.DB.prepare("UPDATE eventi SET locandina = ?, locandina_tipo = ?, locandina_ver = 1 WHERE id = ?").bind(b, tipo, id).run();
          }
        }
      } catch { /* locandina non essenziale */ }
    }
  }
  importato = true;
}

export function slug(titolo, data) {
  const base = String(titolo).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 45).replace(/-+$/, "") || "evento";
  return `${base}-${String(data).slice(0, 4)}`;
}

// ---------- eventi: gestione ----------

const testo = (v, max) => String(v == null ? "" : v).trim().replace(/\s+/g, " ").slice(0, max);
const testoLungo = (v, max) => String(v == null ? "" : v).replace(/\r\n/g, "\n").trim().slice(0, max);
const ORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function validaEvento(d) {
  const titolo = testo(d.titolo, 120);
  if (!titolo) throw new Errore("Il titolo è obbligatorio.");
  const data = testo(d.data, 10);
  if (!DATA.test(data)) throw new Errore("La data dell'evento non è valida.");
  const fine = testo(d.fine, 10) || null;
  if (fine && (!DATA.test(fine) || fine < data)) throw new Errore("La data di fine deve essere uguale o successiva alla data di inizio.");
  const stato = STATI.includes(d.stato) ? d.stato : "bozza";
  const pren = !!d.pren_attive;
  let fasce = null;
  if (pren && d.pren_fasce) {
    if (Array.isArray(d.pren_fasce)) {
      fasce = d.pren_fasce.map((x) => testo(x, 5)).filter((x) => ORA.test(x));
      if (!fasce.length) fasce = null;
    } else {
      const f = d.pren_fasce;
      if (!ORA.test(f.dalle || "") || !ORA.test(f.alle || "")) throw new Errore("Indica gli orari della prima e dell'ultima partenza (es. 17:00).");
      const ogni = Number.parseInt(f.ogni, 10);
      if (!(ogni >= 5 && ogni <= 600)) throw new Errore("L'intervallo tra le partenze deve essere tra 5 e 600 minuti.");
      if (f.alle < f.dalle) throw new Errore("L'ultima partenza deve essere dopo la prima.");
      fasce = { dalle: f.dalle, alle: f.alle, ogni };
    }
  }
  const posti = Number.parseInt(d.pren_posti, 10) || 15;
  if (pren && (posti < 1 || posti > 2000)) throw new Errore("I posti devono essere tra 1 e 2000.");
  const max = Math.min(posti, Number.parseInt(d.pren_max, 10) || posti);
  const chiusura = testo(d.pren_chiusura, 16) || null;
  if (chiusura && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(chiusura)) throw new Errore("La data di chiusura delle prenotazioni non è valida.");
  return {
    titolo, data, fine, stato, orario: testo(d.orario, 160) || null, luogo: testo(d.luogo, 160) || null,
    descrizione: testoLungo(d.descrizione, 3000) || null, avviso: testoLungo(d.avviso, 600) || null,
    in_evidenza: d.in_evidenza ? 1 : 0, pren_attive: pren ? 1 : 0, pren_fasce: fasce ? JSON.stringify(fasce) : null,
    pren_posti: posti, pren_max: Math.max(1, max), pren_chiusura: chiusura,
  };
}

async function adminCrea(env, d) {
  await importaSeVuoto(env);
  const v = validaEvento(d);
  let id = slug(v.titolo, v.data);
  for (let i = 2; await env.DB.prepare("SELECT 1 FROM eventi WHERE id = ?").bind(id).first(); i++) id = `${slug(v.titolo, v.data)}-${i}`;
  if (v.in_evidenza) await env.DB.prepare("UPDATE eventi SET in_evidenza = 0").run();
  await env.DB.prepare(
    `INSERT INTO eventi (id, titolo, data, fine, orario, luogo, descrizione, avviso, stato, in_evidenza, pren_attive, pren_fasce, pren_posti, pren_max, pren_chiusura)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, v.titolo, v.data, v.fine, v.orario, v.luogo, v.descrizione, v.avviso, v.stato, v.in_evidenza,
    v.pren_attive, v.pren_fasce, v.pren_posti, v.pren_max, v.pren_chiusura).run();
  return json({ id }, 201);
}

async function adminModifica(env, id, d, origine) {
  await rigaEvento(env, id);
  const v = validaEvento(d);
  if (v.in_evidenza) await env.DB.prepare("UPDATE eventi SET in_evidenza = 0 WHERE id != ?").bind(id).run();
  await env.DB.prepare(
    `UPDATE eventi SET titolo = ?, data = ?, fine = ?, orario = ?, luogo = ?, descrizione = ?, avviso = ?, stato = ?, in_evidenza = ?,
       pren_attive = ?, pren_fasce = ?, pren_posti = ?, pren_max = ?, pren_chiusura = ?, aggiornato = datetime('now') WHERE id = ?`
  ).bind(v.titolo, v.data, v.fine, v.orario, v.luogo, v.descrizione, v.avviso, v.stato, v.in_evidenza,
    v.pren_attive, v.pren_fasce, v.pren_posti, v.pren_max, v.pren_chiusura, id).run();
  return json(perAdmin(await rigaEvento(env, id), origine));
}

// Un evento con prenotazioni si elimina solo se e' ancora in bozza (prenotazioni di prova, cancellate con lui)
async function adminElimina(env, id) {
  const r = await rigaEvento(env, id);
  const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM prenotazioni WHERE evento = ?").bind(id).first();
  if (Number(c.n) > 0 && r.stato !== "bozza") throw new Errore("L'evento ha delle prenotazioni: invece di eliminarlo, impostalo come «Chiuso».", 409);
  await env.DB.prepare("DELETE FROM prenotazioni WHERE evento = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM eventi WHERE id = ?").bind(id).run();
  return json({ id, eliminato: true, prenotazioni_eliminate: Number(c.n) });
}

async function adminCaricaLocandina(env, id, request) {
  await rigaEvento(env, id);
  const tipo = (request.headers.get("Content-Type") || "").split(";")[0].trim();
  if (!TIPI_IMMAGINE.includes(tipo)) throw new Errore("La locandina deve essere un'immagine JPG, PNG o WebP.");
  const b = await request.arrayBuffer();
  if (!b.byteLength) throw new Errore("Immagine vuota.");
  if (b.byteLength > MAX_LOCANDINA) throw new Errore("Immagine troppo grande (massimo 1,8 MB).", 413);
  await env.DB.prepare("UPDATE eventi SET locandina = ?, locandina_tipo = ?, locandina_ver = locandina_ver + 1, aggiornato = datetime('now') WHERE id = ?")
    .bind(b, tipo, id).run();
  return json({ id, locandina: true });
}

async function adminTogliLocandina(env, id) {
  await rigaEvento(env, id);
  await env.DB.prepare("UPDATE eventi SET locandina = NULL, locandina_tipo = NULL, locandina_ver = locandina_ver + 1 WHERE id = ?").bind(id).run();
  return json({ id, locandina: false });
}

// ---------- prenotazioni ----------

async function occupati(env, evento) {
  const { results } = await env.DB.prepare(
    "SELECT fascia, COALESCE(SUM(persone),0) AS occupati FROM prenotazioni WHERE evento = ? AND stato != 'annullata' GROUP BY fascia"
  ).bind(evento).all();
  const mappa = {};
  for (const r of results) mappa[r.fascia] = Number(r.occupati);
  return mappa;
}

async function disponibilita(env, id, admin) {
  const ev = await eventoPrenotabile(env, id, admin);
  const posti = ev.prenotazioni.posti;
  const occ = await occupati(env, id);
  return json({
    id, titolo: ev.titolo, data: ev.data, luogo: ev.luogo, aperte: prenotazioniAperte(ev), bozza: ev.stato === "bozza",
    max_per_prenotazione: Math.min(posti, ev.prenotazioni.max_per_prenotazione),
    fasce: fasceDi(ev).map((ora) => ({ ora, totale: posti, liberi: Math.max(0, posti - (occ[ora] || 0)) })),
  });
}

async function prenota(env, d, ctx, admin) {
  if (d.sito_web) throw new Errore("Richiesta non valida."); // campo esca per i robot
  const ev = await eventoPrenotabile(env, testo(d.evento, 60), admin);
  if (!prenotazioniAperte(ev)) throw new Errore("Le prenotazioni per questo evento sono chiuse.", 409);

  const fascia = testo(d.fascia, 10);
  if (!fasceDi(ev).includes(fascia)) throw new Errore("Scegli una fascia oraria valida.");
  const nome = testo(d.nome, 60), cognome = testo(d.cognome, 60);
  if (!nome || !cognome) throw new Errore("Inserisci nome e cognome.");
  const email = testo(d.email, 120).toLowerCase();
  const telefono = testo(d.telefono, 30);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Errore("L'indirizzo e-mail non sembra corretto.");
  if (telefono && !/^[+0-9 ().-]{6,30}$/.test(telefono)) throw new Errore("Il numero di telefono non sembra corretto.");
  if (!email && !telefono) throw new Errore("Lascia almeno un'e-mail o un numero di telefono, così possiamo contattarti.");
  const posti = ev.prenotazioni.posti;
  const maxPer = Math.min(posti, ev.prenotazioni.max_per_prenotazione);
  const persone = Number.parseInt(d.persone, 10);
  if (!Number.isInteger(persone) || persone < 1 || persone > maxPer) throw new Errore(`Il numero di persone deve essere tra 1 e ${maxPer}.`);
  // il modulo non chiede piu' se e' socio ne' la tessera: si registra vuoto ("")
  const socio = d.socio === "richiesta" ? "richiesta" : d.socio === "si" ? "si" : "";
  let tessera = null;
  if (socio === "si" && testo(d.tessera, 20)) {
    const t = testo(d.tessera, 20).toUpperCase().replace(/^N\.?\s*/, "").replace(/\s+/g, "");
    const m = t.match(/^(\d{4})[-/.]?(\d{1,4})$/);
    if (!m) throw new Errore("Il numero di tessera non sembra corretto: scrivilo come sulla tessera, per esempio 2026-001.");
    tessera = `${m[1]}-${m[2].padStart(3, "0")}`;
  }
  if (d.consenso !== true) throw new Errore("Per prenotare serve il consenso al trattamento dei dati.");
  const note = testo(d.note, 300);

  const chiave = nuovaChiave();
  for (let tentativo = 0; tentativo < 3; tentativo++) {
    const codice = nuovoCodice();
    try {
      // Inserisce solo se c'è ancora posto: controllo e scrittura in un'unica istruzione
      const res = await env.DB.prepare(
        `INSERT INTO prenotazioni (codice, evento, fascia, nome, cognome, email, telefono, persone, socio, tessera, note, chiave_annullo)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE (SELECT COALESCE(SUM(persone),0) FROM prenotazioni
                WHERE evento = ? AND fascia = ? AND stato != 'annullata') + ? <= ?`
      ).bind(codice, ev.id, fascia, nome, cognome, email || null, telefono || null, persone, socio, tessera, note || null, chiave,
             ev.id, fascia, persone, posti).run();
      if (!res.meta || res.meta.changes !== 1) {
        const liberi = Math.max(0, posti - ((await occupati(env, ev.id))[fascia] || 0));
        throw new Errore(liberi
          ? `In questa fascia restano solo ${liberi} posti: riduci il numero di persone o scegli un altro orario.`
          : "Questa fascia oraria è appena stata completata: scegline un'altra.", 409);
      }
      const p = { codice, chiave, nome, cognome, email, telefono, persone, fascia, socio, tessera, note };
      const conferma = !!(email && emailAttiva(env));
      if (emailAttiva(env)) ctx.waitUntil(inviaEmailPrenotazione(env, ev, p).catch((e) => console.error("e-mail", e)));
      return json({ codice, evento: ev.id, titolo: ev.titolo, data: ev.data, fascia, persone, email_conferma: conferma }, 201);
    } catch (e) {
      if (e instanceof Errore) throw e;
      if (!/UNIQUE/i.test(String(e && e.message))) throw e; // codice già usato: ne genera un altro
    }
  }
  throw new Errore("Errore temporaneo, riprova.", 503);
}

function nuovaChiave() {
  const b = new Uint8Array(15);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => "abcdefghijkmnpqrstuvwxyz23456789"[x % 32]).join("");
}

function nuovoCodice() {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => ALFABETO[x % ALFABETO.length]).join("");
}

// ---------- e-mail di conferma (Brevo) ----------

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
export function dataEstesa(d) { const x = new Date(d + "T12:00:00Z"); return `${GIORNI[x.getUTCDay()]} ${x.getUTCDate()} ${MESI[x.getUTCMonth()]} ${x.getUTCFullYear()}`; }
const h = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function linkAnnullo(env, p) {
  return `${env.SITO || "https://www.castellodisilvanopietra.com"}/annulla.html?c=${p.codice}&k=${p.chiave}`;
}

export function testoEmail(ev, p, link) {
  const quando = dataEstesa(ev.data) + (p.fascia !== "unica" ? `, partenza alle ${p.fascia}` : ev.orario ? `, ${ev.orario}` : "");
  const righe = [
    ["Evento", ev.titolo], ["Quando", quando], ["Dove", ev.luogo || "Castello di Silvano Pietra"],
    ["Persone", String(p.persone)], ["Nome", `${p.nome} ${p.cognome}`],
  ];
  if (p.socio) righe.push(["Tessera", p.socio === "richiesta" ? "chiede di aderire all'associazione" : p.tessera || "socio"]);
  const oggetto = `Prenotazione confermata: ${ev.titolo} (codice ${p.codice})`;
  const testo = `Ciao ${p.nome},\n\nla tua prenotazione è confermata.\n\nCodice di prenotazione: ${p.codice}\n\n` +
    righe.map(([k, v]) => `${k}: ${v}`).join("\n") +
    (ev.avviso ? `\n\n${ev.avviso}` : "") +
    `\n\nMostra questo codice all'arrivo. Ti chiediamo di arrivare con 15-30 minuti di anticipo.\n` +
    (link ? `Se non puoi più venire, annulla la prenotazione da qui (i posti tornano disponibili per altri):\n${link}\n` : "") +
    `Per domande o modifiche rispondi a questa e-mail.\n\nA presto al Castello!\nCastello di Silvano Pietra APS\nPiazza Vittorio Veneto 4, 27050 Silvano Pietra (PV)\nwww.castellodisilvanopietra.com`;
  const html = `<!doctype html><html lang="it"><body style="margin:0;background:#E8E6E3;font-family:Georgia,serif;color:#2F3336">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#F3F2F0;border:1px solid #CBC7C1">
<tr><td style="padding:28px 28px 8px;text-align:center"><img src="https://www.castellodisilvanopietra.com/assets/img/logo.png" width="200" alt="Castello di Silvano Pietra APS" style="width:200px;height:auto"></td></tr>
<tr><td style="padding:8px 28px 0"><h1 style="font-weight:normal;font-size:26px;margin:16px 0 8px">Prenotazione confermata</h1>
<p style="font-size:16px;line-height:1.6;margin:0 0 16px">Ciao ${h(p.nome)}, ti aspettiamo al Castello.</p>
<p style="margin:0 0 4px;font-size:14px;color:#5B6064">Il tuo codice di prenotazione</p>
<p style="font-size:34px;letter-spacing:6px;margin:0 0 20px;color:#2A4366">${h(p.codice)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;line-height:1.5;border-top:1px solid #CBC7C1">
${righe.map(([k, v]) => `<tr><td style="padding:8px 12px 8px 0;color:#5B6064;border-bottom:1px solid #CBC7C1;width:90px;vertical-align:top">${h(k)}</td><td style="padding:8px 0;border-bottom:1px solid #CBC7C1">${h(v)}</td></tr>`).join("")}
</table>
${ev.avviso ? `<p style="font-style:italic;font-size:15px;line-height:1.6;margin:18px 0 0">${h(ev.avviso)}</p>` : ""}
<p style="font-size:15px;line-height:1.6;margin:18px 0 0">Mostra questo codice all'arrivo. Ti chiediamo di arrivare con 15-30 minuti di anticipo.</p>
${link ? `<p style="font-size:15px;line-height:1.6;margin:18px 0 8px">Se non puoi più venire, annulla la prenotazione: i posti tornano disponibili per altri.</p>
<p style="margin:0"><a href="${h(link)}" style="display:inline-block;padding:10px 18px;border:1px solid #2F3336;color:#2F3336;text-decoration:none;font-size:15px">Annulla la prenotazione</a></p>` : ""}
<p style="font-size:15px;line-height:1.6;margin:16px 0 0">Per domande o modifiche <strong>rispondi a questa e-mail</strong>.</p>
</td></tr>
<tr><td style="padding:24px 28px 28px;font-size:13px;line-height:1.6;color:#5B6064">Castello di Silvano Pietra APS<br>Piazza Vittorio Veneto 4, 27050 Silvano Pietra (PV)<br><a href="https://www.castellodisilvanopietra.com" style="color:#2A4366">www.castellodisilvanopietra.com</a></td></tr>
</table></td></tr></table></body></html>`;
  return { oggetto, testo, html };
}

// Invio: posta via SMTP (Gmail del Castello) se c'e' SMTP_PASSWORD, altrimenti Brevo se c'e' BREVO_API_KEY
const emailAttiva = (env) => !!(env.SMTP_PASSWORD || env.BREVO_API_KEY);

async function invia(env, a, nomeA, oggetto, testo, html) {
  if (env.SMTP_PASSWORD) {
    const da = env.EMAIL_MITTENTE;
    const messaggio = componiMessaggio({ da, nomeDa: env.EMAIL_NOME || "Castello di Silvano Pietra APS", a, nomeA,
      rispondiA: env.EMAIL_RISPOSTA && env.EMAIL_RISPOSTA !== da ? env.EMAIL_RISPOSTA : null, oggetto, testo, html });
    const connetti = env.__connetti || (await import("cloudflare:sockets")).connect;
    return inviaSmtp({ host: env.SMTP_HOST, porta: Number(env.SMTP_PORTA) || 465, utente: env.SMTP_UTENTE || da,
      password: env.SMTP_PASSWORD, da, a }, messaggio, connetti);
  }
  return inviaBrevo(env, a, nomeA, oggetto, testo, html);
}

async function inviaBrevo(env, a, nomeA, oggetto, testo, html) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { email: env.EMAIL_MITTENTE, name: env.EMAIL_NOME || "Castello di Silvano Pietra APS" },
      to: [{ email: a, name: nomeA || undefined }],
      replyTo: { email: env.EMAIL_RISPOSTA || env.EMAIL_MITTENTE },
      subject: oggetto, textContent: testo, ...(html ? { htmlContent: html } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
}

async function inviaEmailPrenotazione(env, ev, p) {
  const m = testoEmail(ev, p, p.chiave ? linkAnnullo(env, p) : null);
  const invii = [];
  if (p.email) invii.push(invia(env, p.email, `${p.nome} ${p.cognome}`, m.oggetto, m.testo, m.html));
  if (env.EMAIL_COPIA) {
    const contatti = [p.email, p.telefono].filter(Boolean).join(" · ");
    invii.push(invia(env, env.EMAIL_COPIA, "", `Nuova prenotazione: ${ev.titolo}, ${p.fascia !== "unica" ? "ore " + p.fascia + ", " : ""}${p.persone} pers. (${p.codice})`,
      `${p.cognome} ${p.nome}, ${p.persone} persone\n${contatti}\n` +
      (p.socio ? `Tessera: ${p.socio === "richiesta" ? "chiede di aderire" : p.tessera || "socio, numero non indicato"}\n` : "") + (p.note ? `Note: ${p.note}\n` : "") +
      `\nCodice ${p.codice}. Elenco completo: https://www.castellodisilvanopietra.com/gestione-prenotazioni.html`));
  }
  await Promise.all(invii);
}

// ---------- annullamento dal link nell'e-mail ----------

async function prenotazioneConChiave(env, codice, k) {
  const r = await env.DB.prepare("SELECT * FROM prenotazioni WHERE codice = ?").bind(codice).first();
  if (!r || !r.chiave_annullo || typeof k !== "string" || k !== r.chiave_annullo) throw new Errore("Link non valido. Controlla di aver aperto il link completo dall'e-mail.", 404);
  return r;
}

async function annullabile(env, r) {
  const ev = await eventoPrenotabile(env, r.evento, true).catch(() => null);
  return { ev, puo: r.stato === "confermata" && !!ev && prenotazioniAperte(ev) };
}

async function datiPerAnnullo(env, codice, k) {
  const r = await prenotazioneConChiave(env, codice, k);
  const { ev, puo } = await annullabile(env, r);
  return json({ codice, nome: r.nome, persone: r.persone, fascia: r.fascia, stato: r.stato, annullabile: puo,
    titolo: ev ? ev.titolo : "", data: ev ? ev.data : "", orario: ev ? ev.orario : "", luogo: ev ? ev.luogo : "" });
}

async function annullaDalPartecipante(env, codice, k, ctx) {
  const r = await prenotazioneConChiave(env, codice, k);
  if (r.stato === "annullata") return json({ codice, stato: "annullata", gia: true });
  const { ev, puo } = await annullabile(env, r);
  if (!puo) throw new Errore("Non è più possibile annullare online: scrivici e ti aiutiamo.", 409);
  const res = await env.DB.prepare("UPDATE prenotazioni SET stato = 'annullata', annullata_da = 'partecipante', aggiornata = datetime('now') WHERE codice = ? AND stato = 'confermata'").bind(codice).run();
  if (res.meta && res.meta.changes === 1 && emailAttiva(env)) ctx.waitUntil(inviaEmailAnnullo(env, ev, r).catch((e) => console.error("e-mail", e)));
  return json({ codice, stato: "annullata" });
}

export function testoEmailAnnullo(ev, p) {
  const quando = dataEstesa(ev.data) + (p.fascia !== "unica" ? `, partenza alle ${p.fascia}` : "");
  const oggetto = `Prenotazione annullata: ${ev.titolo} (codice ${p.codice})`;
  const testo = `Ciao ${p.nome},\n\nabbiamo annullato la tua prenotazione ${p.codice} per ${ev.titolo}, ${quando}, ${p.persone} ${p.persone === 1 ? "persona" : "persone"}.\n` +
    `I posti sono di nuovo disponibili per altri. Se cambi idea puoi prenotare di nuovo dal sito, finché ci sono posti.\n\n` +
    `Grazie di averci avvisato.\nCastello di Silvano Pietra APS\nwww.castellodisilvanopietra.com`;
  const html = `<!doctype html><html lang="it"><body style="margin:0;background:#E8E6E3;font-family:Georgia,serif;color:#2F3336">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#F3F2F0;border:1px solid #CBC7C1">
<tr><td style="padding:28px 28px 8px;text-align:center"><img src="https://www.castellodisilvanopietra.com/assets/img/logo.png" width="200" alt="Castello di Silvano Pietra APS" style="width:200px;height:auto"></td></tr>
<tr><td style="padding:8px 28px 28px"><h1 style="font-weight:normal;font-size:26px;margin:16px 0 8px">Prenotazione annullata</h1>
<p style="font-size:16px;line-height:1.6;margin:0 0 12px">Ciao ${h(p.nome)}, abbiamo annullato la prenotazione <strong>${h(p.codice)}</strong> per <strong>${h(ev.titolo)}</strong>, ${h(quando)}, ${p.persone} ${p.persone === 1 ? "persona" : "persone"}.</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 12px">I posti sono di nuovo disponibili per altri. Se cambi idea puoi prenotare di nuovo dal sito, finché ci sono posti.</p>
<p style="font-size:15px;line-height:1.6;margin:0">Grazie di averci avvisato.</p>
<p style="font-size:13px;line-height:1.6;color:#5B6064;margin:24px 0 0">Castello di Silvano Pietra APS<br><a href="https://www.castellodisilvanopietra.com" style="color:#2A4366">www.castellodisilvanopietra.com</a></p>
</td></tr></table></td></tr></table></body></html>`;
  return { oggetto, testo, html };
}

async function inviaEmailAnnullo(env, ev, p) {
  const m = testoEmailAnnullo(ev, p);
  const invii = [];
  if (p.email) invii.push(invia(env, p.email, `${p.nome} ${p.cognome}`, m.oggetto, m.testo, m.html));
  if (env.EMAIL_COPIA) invii.push(invia(env, env.EMAIL_COPIA, "",
    `Annullata: ${ev.titolo}, ${p.fascia !== "unica" ? "ore " + p.fascia + ", " : ""}${p.persone} pers. (${p.codice})`,
    `${p.cognome} ${p.nome} ha annullato la prenotazione ${p.codice} (${p.persone} ${p.persone === 1 ? "persona" : "persone"}). I posti sono tornati disponibili.\n\nElenco: https://www.castellodisilvanopietra.com/gestione-prenotazioni.html`));
  await Promise.all(invii);
}

// ---------- area riservata ----------

async function eAdmin(request, env) {
  if (!request.headers.get("X-Password")) return false;
  try { await controllaPassword(request, env); return true; } catch { return false; }
}

// Accesso con la password ADMIN_PASSWORD oppure con il codice custodito nell'area riservata del sito
async function controllaPassword(request, env) {
  const data = request.headers.get("X-Password") || "";
  if (!env.ADMIN_PASSWORD && !env.AREA_TOKEN_SHA256) throw new Errore("Area riservata non ancora configurata.", 503);
  const enc = new TextEncoder();
  const impronta = async (s) => new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  const uguali = (x, y) => { let diff = x.length ^ y.length; for (let i = 0; i < Math.min(x.length, y.length); i++) diff |= x[i] ^ y[i]; return diff === 0; };
  const hData = await impronta(data);
  if (env.ADMIN_PASSWORD && uguali(hData, await impronta(env.ADMIN_PASSWORD))) return;
  if (env.AREA_TOKEN_SHA256) {
    const atteso = Uint8Array.from(String(env.AREA_TOKEN_SHA256).match(/../g) || [], (h) => parseInt(h, 16));
    if (uguali(hData, atteso)) return;
  }
  throw new Errore("Accesso non valido: entra dall'area riservata.", 401);
}

async function adminEventi(env, soloPrenotabili) {
  await importaSeVuoto(env);
  const { results: righe } = await env.DB.prepare(`SELECT ${COLONNE} FROM eventi ORDER BY data DESC`).all();
  const { results } = await env.DB.prepare(
    "SELECT evento, COUNT(*) AS prenotazioni, COALESCE(SUM(persone),0) AS persone, COALESCE(SUM(CASE WHEN pagato=1 THEN persone ELSE 0 END),0) AS pagati FROM prenotazioni WHERE stato != 'annullata' GROUP BY evento"
  ).all();
  const tot = Object.fromEntries(results.map((r) => [r.evento, r]));
  return json(righe
    .filter((r) => !soloPrenotabili || r.pren_attive || tot[r.id])
    .map((r) => {
      const e = perAdmin(r, "");
      const conPren = r.pren_attive ? e : { ...e, prenotazioni: { fasce: e.pren_fasce, posti: e.pren_posti } };
      return {
        ...e, locandina: !!r.locandina_tipo, locandina_ver: Number(r.locandina_ver),
        aperte: !!r.pren_attive && r.stato === "pubblicato" && prenotazioniAperte(conPren),
        posti_per_fascia: e.pren_posti, fasce: fasceDi(conPren),
        prenotazioni: Number(tot[r.id]?.prenotazioni || 0),
        persone: Number(tot[r.id]?.persone || 0),
        pagati: Number(tot[r.id]?.pagati || 0),
      };
    }));
}

async function adminElenco(env, evento) {
  if (!evento) throw new Errore("Indica l'evento.");
  const { results } = await env.DB.prepare(
    "SELECT codice, fascia, nome, cognome, email, telefono, persone, socio, tessera, note, stato, annullata_da, pagato, creata FROM prenotazioni WHERE evento = ? ORDER BY fascia, creata"
  ).bind(evento).all();
  return json(results.map((r) => ({ ...r, pagato: !!r.pagato })));
}

async function adminAggiorna(env, codice, d) {
  const campi = [], valori = [];
  if (typeof d.pagato === "boolean") { campi.push("pagato = ?"); valori.push(d.pagato ? 1 : 0); }
  if (d.stato === "confermata" || d.stato === "annullata") { campi.push("stato = ?", "annullata_da = ?"); valori.push(d.stato, d.stato === "annullata" ? "staff" : null); }
  if (!campi.length) throw new Errore("Niente da aggiornare.");
  const res = await env.DB.prepare(`UPDATE prenotazioni SET ${campi.join(", ")}, aggiornata = datetime('now') WHERE codice = ?`)
    .bind(...valori, codice).run();
  if (!res.meta || res.meta.changes !== 1) throw new Errore("Prenotazione non trovata.", 404);
  return json({ codice, aggiornata: true });
}

// ---------- utilità ----------

async function leggiJson(request) {
  const t = await request.text();
  if (t.length > 20000) throw new Errore("Richiesta troppo grande.", 413);
  try { return JSON.parse(t || "{}"); } catch { throw new Errore("Richiesta non valida."); }
}

function json(dati, status = 200, extra = {}) {
  return new Response(JSON.stringify(dati), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
}

function intestazioniCors(request, env) {
  const origine = request.headers.get("Origin") || "";
  const ammesse = String(env.ORIGINI || "").split(",").map((s) => s.trim()).filter(Boolean);
  const h = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Password",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (ammesse.includes(origine)) h["Access-Control-Allow-Origin"] = origine;
  return h;
}
