// Prova locale del motore con un database SQLite in memoria che imita D1.
// Uso: node prenotazioni/test/prova.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import worker, { fasceDi, prenotazioniAperte, slug } from "../src/index.js";

export function creaD1() {
  const db = new DatabaseSync(":memory:");
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of readdirSync(dir).sort()) db.exec(readFileSync(new URL(f, dir), "utf8"));
  const conv = (a) => a.map((x) => (x instanceof ArrayBuffer ? new Uint8Array(x) : x === undefined ? null : x));
  return {
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) { args = conv(a); return st; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
      };
      return st;
    },
  };
}

// solo se eseguito direttamente
if (import.meta.url === `file://${process.argv[1]}`) {
  const giorno = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
  const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  const ARCHIVIO = [
    { titolo: "Delirium al Castello", data: "2026-10-31", descrizione: "Horror tour", locandina: "/assets/img/eventi/d.jpg" },
  ];
  globalThis.fetch = async (u) => {
    const s = String(u);
    if (s.endsWith("/data/eventi.json")) return new Response(JSON.stringify(ARCHIVIO));
    if (s.endsWith("/d.jpg")) return new Response(PNG, { headers: { "Content-Type": "image/jpeg" } });
    return new Response("no", { status: 404 });
  };

  const env = { DB: creaD1(), SITO: "https://sito", ORIGINI: "https://www.castellodisilvanopietra.com", ADMIN_PASSWORD: "segreta" };
  const A = { "X-Password": "segreta" };
  const chiama = async (metodo, path, body, headers = {}) => {
    const isBin = body instanceof Uint8Array;
    const res = await worker.fetch(new Request("https://w" + path, {
      method: metodo, body: body == null ? undefined : isBin ? body : JSON.stringify(body),
      headers: { "Content-Type": isBin ? "image/png" : "application/json", Origin: "https://www.castellodisilvanopietra.com", ...headers },
    }), env);
    const ct = res.headers.get("Content-Type") || "";
    return { status: res.status, dati: ct.includes("json") ? await res.json() : new Uint8Array(await res.arrayBuffer()), h: res.headers };
  };

  // utilità
  assert.equal(slug("Mercatini di Natale & Più!", "2026-12-08"), "mercatini-di-natale-piu-2026");
  assert.deepEqual(fasceDi({ prenotazioni: { fasce: { dalle: "17:00", alle: "18:00", ogni: 30 } } }), ["17:00", "17:30", "18:00"]);
  assert.deepEqual(fasceDi({ prenotazioni: { fasce: null } }), ["unica"]);
  assert.equal(prenotazioniAperte({ data: "2020-01-01", prenotazioni: {} }), false);

  // import iniziale dall'archivio, con locandina
  let r = await chiama("GET", "/calendario");
  assert.equal(r.status, 200); assert.equal(r.dati.length, 1); assert.equal(r.dati[0].id, "delirium-al-castello-2026");
  assert.match(r.dati[0].locandina, /\/locandine\/delirium-al-castello-2026\?v=1$/);
  r = await chiama("GET", "/locandine/delirium-al-castello-2026");
  assert.equal(r.status, 200); assert.equal(r.h.get("Content-Type"), "image/jpeg"); assert.deepEqual([...r.dati], [...PNG]);

  // gestione eventi: protetta
  assert.equal((await chiama("POST", "/admin/eventi", { titolo: "X", data: giorno(5) })).status, 401);
  assert.equal((await chiama("POST", "/admin/eventi", { titolo: "", data: giorno(5) }, A)).status, 400);
  assert.equal((await chiama("POST", "/admin/eventi", { titolo: "X", data: "domani" }, A)).status, 400);
  assert.equal((await chiama("POST", "/admin/eventi", { titolo: "X", data: giorno(5), fine: giorno(1) }, A)).status, 400);

  // bozza: non visibile al pubblico
  r = await chiama("POST", "/admin/eventi", { titolo: "Mercatini di Natale", data: giorno(30), stato: "bozza",
    pren_attive: true, pren_fasce: { dalle: "15:00", alle: "16:00", ogni: 30 }, pren_posti: 15, pren_max: 10 }, A);
  assert.equal(r.status, 201); const id = r.dati.id; assert.match(id, /^mercatini-di-natale-\d{4}$/);
  r = await chiama("POST", "/admin/eventi", { titolo: "Mercatini di Natale", data: giorno(30) }, A);
  assert.equal(r.dati.id, id + "-2", "id unico");
  assert.equal((await chiama("DELETE", "/admin/eventi/" + id + "-2", null, A)).status, 200);
  assert.equal((await chiama("GET", "/calendario")).dati.length, 1);
  assert.equal((await chiama("GET", "/eventi/" + id)).status, 404, "bozza non prenotabile");

  // pubblicazione e locandina
  r = await chiama("GET", "/admin/eventi/" + id, null, A);
  r = await chiama("PUT", "/admin/eventi/" + id, { ...r.dati, stato: "pubblicato", in_evidenza: true }, A);
  assert.equal(r.status, 200); assert.equal(r.dati.stato, "pubblicato"); assert.equal(r.dati.in_evidenza, true);
  assert.equal((await chiama("PUT", "/admin/eventi/" + id + "/locandina", PNG, A)).status, 200);
  assert.equal((await chiama("PUT", "/admin/eventi/" + id + "/locandina", "testo", { ...A, "Content-Type": "text/plain" })).status, 400);
  r = await chiama("GET", "/calendario");
  const m = r.dati.find((e) => e.id === id);
  assert.ok(m.locandina.endsWith("?v=1")); assert.equal(m.prenotazioni.aperte, true); assert.equal(m.in_evidenza, true);
  assert.equal(r.h.get("Access-Control-Allow-Origin"), "https://www.castellodisilvanopietra.com");

  // prenotazioni
  const base = { evento: id, fascia: "15:00", nome: "Mario", cognome: "Rossi", email: "mario@example.com", persone: 4, consenso: true };
  r = await chiama("GET", "/eventi/" + id);
  assert.equal(r.dati.fasce.length, 3); assert.equal(r.dati.fasce[0].liberi, 15); assert.equal(r.dati.max_per_prenotazione, 10);
  r = await chiama("POST", "/prenotazioni", base); assert.equal(r.status, 201); const codice = r.dati.codice;
  assert.equal((await chiama("POST", "/prenotazioni", { ...base, consenso: false })).status, 400);
  assert.equal((await chiama("POST", "/prenotazioni", { ...base, email: "", telefono: "" })).status, 400);
  assert.equal((await chiama("POST", "/prenotazioni", { ...base, persone: 11 })).status, 400);
  assert.equal((await chiama("POST", "/prenotazioni", { ...base, fascia: "19:00" })).status, 400);
  assert.equal((await chiama("POST", "/prenotazioni", { ...base, sito_web: "spam" })).status, 400);
  assert.equal((await chiama("POST", "/prenotazioni", { ...base, persone: 10 })).status, 201);
  r = await chiama("POST", "/prenotazioni", { ...base, persone: 2 });
  assert.equal(r.status, 409); assert.match(r.dati.errore, /restano solo 1/);
  const [a, b] = await Promise.all([chiama("POST", "/prenotazioni", { ...base, persone: 1 }), chiama("POST", "/prenotazioni", { ...base, persone: 1 })]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);

  // area riservata prenotazioni
  r = await chiama("GET", "/admin/eventi?prenotabili=1", null, A);
  assert.equal(r.dati.length, 1); assert.equal(r.dati[0].persone, 15); assert.equal(r.dati[0].aperte, true);
  assert.equal((await chiama("GET", "/admin/eventi", null, A)).dati.length, 2);
  assert.equal((await chiama("GET", "/admin/prenotazioni?evento=" + id, null, A)).dati.length, 3);
  assert.equal((await chiama("PATCH", "/admin/prenotazioni/" + codice, { stato: "annullata" }, A)).status, 200);
  assert.equal((await chiama("GET", "/eventi/" + id)).dati.fasce[0].liberi, 4);

  // con prenotazioni non si elimina; chiuso = prenotazioni chiuse e evento tra i passati
  assert.equal((await chiama("DELETE", "/admin/eventi/" + id, null, A)).status, 409);
  r = await chiama("GET", "/admin/eventi/" + id, null, A);
  await chiama("PUT", "/admin/eventi/" + id, { ...r.dati, stato: "chiuso" }, A);
  r = await chiama("POST", "/prenotazioni", { ...base, fascia: "15:30", persone: 1 });
  assert.equal(r.status, 409); assert.match(r.dati.errore, /chiuse/);
  assert.equal((await chiama("GET", "/calendario")).dati.find((e) => e.id === id).stato, "chiuso");

  // in evidenza: uno solo
  r = await chiama("POST", "/admin/eventi", { titolo: "Concerto", data: giorno(40), stato: "pubblicato", in_evidenza: true }, A);
  const lista = (await chiama("GET", "/admin/eventi", null, A)).dati;
  assert.equal(lista.filter((e) => e.in_evidenza).length, 1); assert.equal(lista.find((e) => e.in_evidenza).id, r.dati.id);

  // CORS da origine non ammessa
  const res = await worker.fetch(new Request("https://w/calendario", { headers: { Origin: "https://altro.it" } }), env);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);

  console.log("Tutte le prove superate.");
}
