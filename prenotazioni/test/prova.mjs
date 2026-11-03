// Prova locale del motore con un database SQLite in memoria che imita D1.
// Uso: node prenotazioni/test/prova.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import worker, { fasceDi, prenotazioniAperte } from "../src/index.js";

const db = new DatabaseSync(":memory:");
db.exec(readFileSync(new URL("../migrations/0001_prenotazioni.sql", import.meta.url), "utf8"));
const D1 = {
  prepare(sql) {
    let args = [];
    const st = {
      bind(...a) { args = a; return st; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    };
    return st;
  },
};

const domani = new Date(Date.now() + 86400e3).toISOString().slice(0, 10);
const EVENTI = [
  { titolo: "Prova", data: domani, prenotazioni: { id: "prova", fasce: { dalle: "17:00", alle: "18:00", ogni: 30 }, posti: 15, max_per_prenotazione: 10 } },
  { titolo: "Passato", data: "2020-01-01", prenotazioni: { id: "passato", fasce: ["17:00"], posti: 5 } },
  { titolo: "Senza prenotazioni", data: domani },
];
globalThis.fetch = async () => new Response(JSON.stringify(EVENTI));

const env = { DB: D1, SITO: "https://x", ORIGINI: "https://www.castellodisilvanopietra.com", ADMIN_PASSWORD: "segreta" };
const chiama = async (metodo, path, body, headers = {}) => {
  const res = await worker.fetch(new Request("https://w" + path, {
    method: metodo, body: body ? JSON.stringify(body) : undefined,
    headers: { "Content-Type": "application/json", Origin: "https://www.castellodisilvanopietra.com", ...headers },
  }), env);
  return { status: res.status, dati: await res.json().catch(() => null), h: res.headers };
};
const base = { evento: "prova", fascia: "17:00", nome: "Mario", cognome: "Rossi", email: "mario@example.com", persone: 4, consenso: true };

// fasce
assert.deepEqual(fasceDi(EVENTI[0]), ["17:00", "17:30", "18:00"]);
assert.equal(prenotazioniAperte(EVENTI[1]), false);

let r = await chiama("GET", "/eventi/prova");
assert.equal(r.status, 200); assert.equal(r.dati.fasce.length, 3); assert.equal(r.dati.fasce[0].liberi, 15);
assert.equal(r.h.get("Access-Control-Allow-Origin"), "https://www.castellodisilvanopietra.com");
assert.equal((await chiama("GET", "/eventi/senza")).status, 404);

// prenotazione valida
r = await chiama("POST", "/prenotazioni", base);
assert.equal(r.status, 201, JSON.stringify(r.dati)); assert.match(r.dati.codice, /^[A-Z0-9]{6}$/);
const codice = r.dati.codice;

// errori di validazione
assert.equal((await chiama("POST", "/prenotazioni", { ...base, consenso: false })).status, 400);
assert.equal((await chiama("POST", "/prenotazioni", { ...base, email: "", telefono: "" })).status, 400);
assert.equal((await chiama("POST", "/prenotazioni", { ...base, persone: 11 })).status, 400);
assert.equal((await chiama("POST", "/prenotazioni", { ...base, fascia: "19:00" })).status, 400);
assert.equal((await chiama("POST", "/prenotazioni", { ...base, sito_web: "spam" })).status, 400);
r = await chiama("POST", "/prenotazioni", { ...base, evento: "passato", fascia: "17:00" });
assert.equal(r.status, 409); assert.match(r.dati.errore, /chiuse/);

// riempimento: 4 + 10 = 14, poi 2 non ci stanno (resta 1)
assert.equal((await chiama("POST", "/prenotazioni", { ...base, persone: 10 })).status, 201);
r = await chiama("POST", "/prenotazioni", { ...base, persone: 2 });
assert.equal(r.status, 409); assert.match(r.dati.errore, /restano solo 1/);

// gara per l'ultimo posto: due richieste insieme, una sola passa
const [a, b] = await Promise.all([chiama("POST", "/prenotazioni", { ...base, persone: 1 }), chiama("POST", "/prenotazioni", { ...base, persone: 1 })]);
assert.deepEqual([a.status, b.status].sort(), [201, 409]);
r = await chiama("GET", "/eventi/prova");
assert.equal(r.dati.fasce[0].liberi, 0); assert.equal(r.dati.fasce[1].liberi, 15);

// area riservata
assert.equal((await chiama("GET", "/admin/eventi")).status, 401);
assert.equal((await chiama("GET", "/admin/eventi", null, { "X-Password": "sbagliata" })).status, 401);
r = await chiama("GET", "/admin/eventi", null, { "X-Password": "segreta" });
assert.equal(r.status, 200); assert.equal(r.dati.length, 2); assert.equal(r.dati[0].persone, 15);
r = await chiama("GET", "/admin/prenotazioni?evento=prova", null, { "X-Password": "segreta" });
assert.equal(r.dati.length, 3);
assert.equal((await chiama("PATCH", "/admin/prenotazioni/" + codice, { pagato: true }, { "X-Password": "segreta" })).status, 200);
assert.equal((await chiama("PATCH", "/admin/prenotazioni/" + codice, { stato: "annullata" }, { "X-Password": "segreta" })).status, 200);
r = await chiama("GET", "/eventi/prova");
assert.equal(r.dati.fasce[0].liberi, 4, "annullare libera i posti");
assert.equal((await chiama("PATCH", "/admin/prenotazioni/ZZZZZZ", { pagato: true }, { "X-Password": "segreta" })).status, 404);

// origine non ammessa: niente CORS
const res = await worker.fetch(new Request("https://w/eventi/prova", { headers: { Origin: "https://altro.it" } }), env);
assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);

console.log("Tutte le prove superate.");
