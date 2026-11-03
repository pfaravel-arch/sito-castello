// Motore delle prenotazioni del Castello di Silvano Pietra APS.
// Gira su Cloudflare Workers, salva le prenotazioni nel database D1 "DB".
//
// Pubblico:
//   GET  /eventi/:id         fasce orarie e posti liberi di un evento
//   POST /prenotazioni       crea una prenotazione (controlla i posti in modo atomico)
// Riservato (intestazione "X-Password" = segreto ADMIN_PASSWORD):
//   GET   /admin/eventi                  eventi prenotabili con i totali
//   GET   /admin/prenotazioni?evento=ID  elenco prenotazioni
//   PATCH /admin/prenotazioni/:codice    { pagato: true|false, stato: "confermata"|"annullata" }

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // senza 0/O e 1/I

export default {
  async fetch(request, env) {
    const cors = intestazioniCors(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      const risposta = await instrada(request, env);
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

async function instrada(request, env) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, "") || "/";
  const m = request.method;

  if (m === "GET" && p === "/") return json({ servizio: "Prenotazioni Castello di Silvano Pietra", stato: "attivo" });

  let r;
  if (m === "GET" && (r = p.match(/^\/eventi\/([a-z0-9-]{1,60})$/))) return disponibilita(env, r[1]);
  if (m === "POST" && p === "/prenotazioni") return prenota(env, await leggiJson(request));

  if (p.startsWith("/admin/")) {
    await controllaPassword(request, env);
    if (m === "GET" && p === "/admin/eventi") return adminEventi(env);
    if (m === "GET" && p === "/admin/prenotazioni") return adminElenco(env, url.searchParams.get("evento"));
    if (m === "PATCH" && (r = p.match(/^\/admin\/prenotazioni\/([A-Z0-9]{6})$/))) return adminAggiorna(env, r[1], await leggiJson(request));
  }
  throw new Errore("Indirizzo non trovato.", 404);
}

// ---------- eventi ----------

async function eventiPrenotabili(env) {
  const res = await fetch(env.SITO + "/data/eventi.json", { cf: { cacheTtl: 60 } });
  if (!res.ok) throw new Errore("Il calendario eventi non è raggiungibile.", 502);
  const lista = await res.json();
  return lista.filter((e) => e.prenotazioni && e.prenotazioni.id);
}

async function trovaEvento(env, id) {
  const ev = (await eventiPrenotabili(env)).find((e) => e.prenotazioni.id === id);
  if (!ev) throw new Errore("Evento non trovato o non prenotabile.", 404);
  return ev;
}

// Fasce orarie: elenco esplicito ["17:00", ...] oppure { dalle, alle, ogni (minuti) }
export function fasceDi(ev) {
  const f = ev.prenotazioni.fasce;
  if (Array.isArray(f)) return f;
  if (f && f.dalle && f.alle && f.ogni) {
    const min = (s) => { const [h, mm] = s.split(":").map(Number); return h * 60 + mm; };
    const out = [];
    for (let t = min(f.dalle); t <= min(f.alle); t += Number(f.ogni)) {
      out.push(String(Math.floor(t / 60) % 24).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0"));
    }
    return out;
  }
  return ["unica"];
}

// Le prenotazioni chiudono all'orario "chiusura" (ora italiana) o, se manca, alla fine del giorno dell'evento
export function prenotazioniAperte(ev, adesso = new Date()) {
  const chiusura = ev.prenotazioni.chiusura || (ev.fine || ev.data) + "T23:59";
  return adesso < oraItaliana(chiusura);
}

function oraItaliana(s) {
  // "2026-12-07T12:00" letto come ora di Roma, con il cambio ora legale gestito da Intl
  const [d, t = "00:00"] = s.split("T");
  const utc = new Date(d + "T" + t + ":00Z");
  const roma = new Date(utc.toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  const base = new Date(utc.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(utc.getTime() - (roma - base));
}

async function occupati(env, evento) {
  const { results } = await env.DB.prepare(
    "SELECT fascia, COALESCE(SUM(persone),0) AS occupati FROM prenotazioni WHERE evento = ? AND stato != 'annullata' GROUP BY fascia"
  ).bind(evento).all();
  const mappa = {};
  for (const r of results) mappa[r.fascia] = Number(r.occupati);
  return mappa;
}

async function disponibilita(env, id) {
  const ev = await trovaEvento(env, id);
  const posti = Number(ev.prenotazioni.posti) || 15;
  const occ = await occupati(env, id);
  return json({
    id,
    titolo: ev.titolo,
    data: ev.data,
    luogo: ev.luogo || "",
    aperte: prenotazioniAperte(ev),
    max_per_prenotazione: Number(ev.prenotazioni.max_per_prenotazione) || posti,
    fasce: fasceDi(ev).map((ora) => ({ ora, totale: posti, liberi: Math.max(0, posti - (occ[ora] || 0)) })),
  });
}

// ---------- prenotazione ----------

const testo = (v, max) => String(v == null ? "" : v).trim().replace(/\s+/g, " ").slice(0, max);

async function prenota(env, d) {
  if (d.sito_web) throw new Errore("Richiesta non valida."); // campo esca per i robot
  const ev = await trovaEvento(env, testo(d.evento, 60));
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
  const posti = Number(ev.prenotazioni.posti) || 15;
  const maxPer = Math.min(posti, Number(ev.prenotazioni.max_per_prenotazione) || posti);
  const persone = Number.parseInt(d.persone, 10);
  if (!Number.isInteger(persone) || persone < 1 || persone > maxPer) throw new Errore(`Il numero di persone deve essere tra 1 e ${maxPer}.`);
  const socio = d.socio === "richiesta" ? "richiesta" : "si";
  if (d.consenso !== true) throw new Errore("Per prenotare serve il consenso al trattamento dei dati.");
  const note = testo(d.note, 300);

  for (let tentativo = 0; tentativo < 3; tentativo++) {
    const codice = nuovoCodice();
    try {
      // Inserisce solo se c'è ancora posto: controllo e scrittura in un'unica istruzione
      const res = await env.DB.prepare(
        `INSERT INTO prenotazioni (codice, evento, fascia, nome, cognome, email, telefono, persone, socio, note)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE (SELECT COALESCE(SUM(persone),0) FROM prenotazioni
                WHERE evento = ? AND fascia = ? AND stato != 'annullata') + ? <= ?`
      ).bind(codice, ev.prenotazioni.id, fascia, nome, cognome, email || null, telefono || null, persone, socio, note || null,
             ev.prenotazioni.id, fascia, persone, posti).run();
      if (!res.meta || res.meta.changes !== 1) {
        const liberi = Math.max(0, posti - ((await occupati(env, ev.prenotazioni.id))[fascia] || 0));
        throw new Errore(liberi
          ? `In questa fascia restano solo ${liberi} posti: riduci il numero di persone o scegli un altro orario.`
          : "Questa fascia oraria è appena stata completata: scegline un'altra.", 409);
      }
      return json({ codice, evento: ev.prenotazioni.id, titolo: ev.titolo, data: ev.data, fascia, persone }, 201);
    } catch (e) {
      if (e instanceof Errore) throw e;
      if (!/UNIQUE/i.test(String(e && e.message))) throw e; // codice già usato: ne genera un altro
    }
  }
  throw new Errore("Errore temporaneo, riprova.", 503);
}

function nuovoCodice() {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => ALFABETO[x % ALFABETO.length]).join("");
}

// ---------- area riservata ----------

async function controllaPassword(request, env) {
  const data = request.headers.get("X-Password") || "";
  const attesa = env.ADMIN_PASSWORD || "";
  if (!attesa) throw new Errore("Area riservata non ancora configurata.", 503);
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([data, attesa].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))));
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  if (diff !== 0) throw new Errore("Password non corretta.", 401);
}

async function adminEventi(env) {
  const eventi = await eventiPrenotabili(env);
  const { results } = await env.DB.prepare(
    "SELECT evento, COUNT(*) AS prenotazioni, COALESCE(SUM(persone),0) AS persone, COALESCE(SUM(CASE WHEN pagato=1 THEN persone ELSE 0 END),0) AS pagati FROM prenotazioni WHERE stato != 'annullata' GROUP BY evento"
  ).all();
  const tot = Object.fromEntries(results.map((r) => [r.evento, r]));
  return json(eventi.map((e) => ({
    id: e.prenotazioni.id, titolo: e.titolo, data: e.data, aperte: prenotazioniAperte(e),
    posti_per_fascia: Number(e.prenotazioni.posti) || 15, fasce: fasceDi(e),
    prenotazioni: Number(tot[e.prenotazioni.id]?.prenotazioni || 0),
    persone: Number(tot[e.prenotazioni.id]?.persone || 0),
    pagati: Number(tot[e.prenotazioni.id]?.pagati || 0),
  })));
}

async function adminElenco(env, evento) {
  if (!evento) throw new Errore("Indica l'evento.");
  const { results } = await env.DB.prepare(
    "SELECT codice, fascia, nome, cognome, email, telefono, persone, socio, note, stato, pagato, creata FROM prenotazioni WHERE evento = ? ORDER BY fascia, creata"
  ).bind(evento).all();
  return json(results.map((r) => ({ ...r, pagato: !!r.pagato })));
}

async function adminAggiorna(env, codice, d) {
  const campi = [], valori = [];
  if (typeof d.pagato === "boolean") { campi.push("pagato = ?"); valori.push(d.pagato ? 1 : 0); }
  if (d.stato === "confermata" || d.stato === "annullata") { campi.push("stato = ?"); valori.push(d.stato); }
  if (!campi.length) throw new Errore("Niente da aggiornare.");
  const res = await env.DB.prepare(`UPDATE prenotazioni SET ${campi.join(", ")}, aggiornata = datetime('now') WHERE codice = ?`)
    .bind(...valori, codice).run();
  if (!res.meta || res.meta.changes !== 1) throw new Errore("Prenotazione non trovata.", 404);
  return json({ codice, aggiornata: true });
}

// ---------- utilità ----------

async function leggiJson(request) {
  const t = await request.text();
  if (t.length > 5000) throw new Errore("Richiesta troppo grande.", 413);
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
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Password",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (ammesse.includes(origine)) h["Access-Control-Allow-Origin"] = origine;
  return h;
}
