// Prova locale del motore con un database SQLite in memoria che imita D1.
// Uso: node prenotazioni/test/prova.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fintoServer } from "./prova-smtp.mjs";
import worker, { fasceDi, prenotazioniAperte, slug, dataEstesa, avvisoPerEmail } from "../src/index.js";

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
  const email = [];
  globalThis.fetch = async (u, o) => {
    const s = String(u);
    if (s.startsWith("https://api.brevo.com/")) { email.push({ key: o.headers["api-key"], ...JSON.parse(o.body) }); return new Response("{}", { status: 201 }); }
    if (s.endsWith("/data/eventi.json")) return new Response(JSON.stringify(ARCHIVIO));
    if (s.endsWith("/d.jpg")) return new Response(PNG, { headers: { "Content-Type": "image/jpeg" } });
    return new Response("no", { status: 404 });
  };

  const TOKEN = "codice-area-di-prova";
  const env = { DB: creaD1(), SITO: "https://sito", ORIGINI: "https://www.castellodisilvanopietra.com", ADMIN_PASSWORD: "segreta",
    AREA_TOKEN_SHA256: createHash("sha256").update(TOKEN).digest("hex"), BREVO_API_KEY: "chiave-prova",
    SMTP_HOST: "smtp.gmail.com", SMTP_PORTA: "465", SMTP_UTENTE: "castellodisilvanopietra@gmail.com", EMAIL_NOME: "Castello di Silvano Pietra APS",
    EMAIL_MITTENTE: "castellodisilvanopietra@gmail.com", EMAIL_RISPOSTA: "castellodisilvanopietra@gmail.com", EMAIL_COPIA: "castellodisilvanopietra@gmail.com" };
  const attese = [];
  const ctx = { waitUntil: (p) => attese.push(p) };
  const A = { "X-Password": "segreta" };
  const chiama = async (metodo, path, body, headers = {}) => {
    const isBin = body instanceof Uint8Array;
    const res = await worker.fetch(new Request("https://w" + path, {
      method: metodo, body: body == null ? undefined : isBin ? body : JSON.stringify(body),
      headers: { "Content-Type": isBin ? "image/png" : "application/json", Origin: "https://www.castellodisilvanopietra.com", ...headers },
    }), env, ctx);
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
  assert.equal((await chiama("GET", "/eventi/" + id)).status, 404, "bozza non prenotabile dal pubblico");
  r = await chiama("GET", "/eventi/" + id, null, A); assert.equal(r.status, 200); assert.equal(r.dati.bozza, true);
  r = await chiama("POST", "/prenotazioni", { evento: id, fascia: "15:30", nome: "Prova", cognome: "Prova", email: "prova@example.com", telefono: "3330000000", persone: 2, consenso: true }, A);
  assert.equal(r.status, 201, "prova sulla bozza dall'area riservata");
  assert.equal((await chiama("POST", "/prenotazioni", { evento: id, fascia: "15:00", nome: "X", cognome: "Y", telefono: "3330000000", persone: 1, consenso: true })).status, 404);
  // la bozza con prenotazioni di prova si elimina insieme alle prenotazioni
  r = await chiama("POST", "/admin/eventi", { titolo: "Prova bozza", data: giorno(9), pren_attive: true }, A);
  const idProva = r.dati.id;
  await chiama("POST", "/prenotazioni", { evento: idProva, fascia: "unica", nome: "P", cognome: "Q", email: "p@example.com", persone: 1, consenso: true }, A);
  r = await chiama("DELETE", "/admin/eventi/" + idProva, null, A);
  assert.equal(r.status, 200); assert.equal(r.dati.prenotazioni_eliminate, 1);
  assert.equal((await chiama("GET", "/admin/prenotazioni?evento=" + idProva, null, A)).dati.length, 0);
  await Promise.all(attese); attese.length = 0;

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

  // numero di tessera ed e-mail di conferma
  email.length = 0;
  r = await chiama("POST", "/prenotazioni", { ...base, fascia: "16:00", persone: 2, socio: "si", tessera: "n. 2026-7" });
  assert.equal(r.status, 201, JSON.stringify(r.dati)); assert.equal(r.dati.email_conferma, true);
  assert.equal((await chiama("POST", "/prenotazioni", { ...base, fascia: "16:00", socio: "si", tessera: "abc" })).status, 400);
  await Promise.all(attese);
  assert.equal(email.length, 2, "conferma + copia all'associazione");
  const conf = email.find((e) => e.to[0].email === "mario@example.com");
  assert.equal(conf.key, "chiave-prova"); assert.equal(conf.replyTo.email, "castellodisilvanopietra@gmail.com");
  assert.match(conf.subject, new RegExp(r.dati.codice)); assert.match(conf.textContent, /2026-007/); assert.match(conf.textContent, /partenza alle 16:00/);
  assert.match(conf.htmlContent, /Prenotazione confermata/);
  assert.match(email.find((e) => e.to[0].email === "castellodisilvanopietra@gmail.com").subject, /Nuova prenotazione/);

  // annullamento dal link nell'e-mail: libera i posti e avvisa
  const link = conf.textContent.match(/https:\/\/\S+\/annulla\.html\?c=([A-Z0-9]{6})&k=([a-z0-9]+)/);
  assert.ok(link, "link di annullamento nell'e-mail"); assert.match(conf.htmlContent, /Annulla la prenotazione/);
  const [, cod, k] = link;
  assert.equal((await chiama("GET", `/prenotazioni/${cod}?k=sbagliata`)).status, 404);
  r = await chiama("GET", `/prenotazioni/${cod}?k=${k}`);
  assert.equal(r.status, 200); assert.equal(r.dati.annullabile, true); assert.equal(r.dati.persone, 2); assert.equal(r.dati.fascia, "16:00");
  const liberiPrima = (await chiama("GET", "/eventi/" + id)).dati.fasce.find((f) => f.ora === "16:00").liberi;
  email.length = 0;
  assert.equal((await chiama("POST", `/prenotazioni/${cod}/annulla`, { k: "no" })).status, 404);
  r = await chiama("POST", `/prenotazioni/${cod}/annulla`, { k });
  assert.equal(r.status, 200); assert.equal(r.dati.stato, "annullata");
  assert.equal((await chiama("GET", "/eventi/" + id)).dati.fasce.find((f) => f.ora === "16:00").liberi, liberiPrima + 2, "posti liberati");
  await Promise.all(attese);
  assert.ok(email.some((e) => e.to[0].email === "mario@example.com" && /^Prenotazione annullata/.test(e.subject)));
  assert.ok(email.some((e) => e.to[0].email === "castellodisilvanopietra@gmail.com" && /^Annullata:/.test(e.subject)));
  r = await chiama("POST", `/prenotazioni/${cod}/annulla`, { k }); assert.equal(r.dati.gia, true, "doppio clic innocuo");
  assert.equal((await chiama("GET", `/prenotazioni/${cod}?k=${k}`)).dati.annullabile, false);
  email.length = 0;
  email.length = 0;
  // dal sito l'e-mail e' obbligatoria
  r = await chiama("POST", "/prenotazioni", { ...base, fascia: "16:00", persone: 1, email: "", telefono: "333 1112223" });
  assert.equal(r.status, 400); assert.match(r.dati.errore, /e-mail/);
  assert.equal((await chiama("POST", "/prenotazioni", { ...base, fascia: "16:00", persone: 1, email: "", telefono: "333 1112223", staff: true })).status, 400, "staff senza password");
  // inserita dallo staff (WhatsApp): basta il telefono, niente consenso dal modulo, torna il link di annullamento
  r = await chiama("POST", "/prenotazioni", { ...base, fascia: "16:00", persone: 1, email: "", telefono: "333 1112223", consenso: false, socio: "richiesta", tessera: "2026-001", staff: true, origine: "whatsapp" }, A);
  assert.equal(r.status, 201, JSON.stringify(r.dati)); assert.equal(r.dati.email_conferma, false);
  assert.match(r.dati.link_annullo, /annulla\.html\?c=[A-Z0-9]{6}&k=/); assert.equal(r.dati.telefono, "333 1112223");
  await Promise.all(attese); assert.equal(email.length, 1, "solo copia all'associazione se manca l'e-mail");
  assert.match(dataEstesa("2026-12-08"), /^martedì 8 dicembre 2026$/);
  assert.equal(avvisoPerEmail("Prenotazione consigliata. Arriva 15 minuti prima."), "Arriva 15 minuti prima.");
  assert.equal(avvisoPerEmail("Ingresso dal cortile. Prenotazione obbligatoria, posti limitati! Consigliato ai coraggiosi."), "Ingresso dal cortile. Consigliato ai coraggiosi.");
  assert.equal(avvisoPerEmail("Prenotazione consigliata"), "");

  // modulo senza socio, tessera e note: niente riga "Tessera" nelle e-mail
  email.length = 0;
  r = await chiama("POST", "/prenotazioni", { ...base, fascia: "16:00", persone: 1, email: "anna@example.com", note: undefined });
  assert.equal(r.status, 201); await Promise.all(attese);
  assert.equal(email.length, 2);
  assert.ok(email.every((e) => !/Tessera/.test(e.textContent)), "nessuna riga Tessera senza la domanda sul socio");

  // accesso con il codice dell'area riservata
  assert.equal((await chiama("GET", "/admin/eventi", null, { "X-Password": TOKEN })).status, 200);
  assert.equal((await chiama("GET", "/admin/eventi", null, { "X-Password": TOKEN + "x" })).status, 401);

  // area riservata prenotazioni
  r = await chiama("GET", "/admin/eventi?prenotabili=1", null, A);
  assert.equal(r.dati.length, 1); assert.equal(r.dati[0].persone, 19); assert.equal(r.dati[0].aperte, true);
  assert.equal((await chiama("GET", "/admin/eventi", null, A)).dati.length, 2);
  const elenco = (await chiama("GET", "/admin/prenotazioni?evento=" + id, null, A)).dati;
  assert.equal(elenco.length, 7); assert.equal(elenco.find((x) => x.email === "anna@example.com").socio, "");
  assert.equal(elenco.find((x) => x.telefono === "333 1112223").origine, "whatsapp"); assert.equal(elenco.find((x) => x.email === "anna@example.com").origine, "sito");
  assert.ok(elenco.every((x) => !("chiave_annullo" in x)) && elenco.find((x) => x.origine === "whatsapp").link_annullo); assert.equal(elenco.find((x) => x.tessera === "2026-007").persone, 2);
  assert.equal(elenco.find((x) => x.socio === "richiesta").tessera, null, "chi chiede di aderire non ha tessera");
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

  // e-mail via Gmail (SMTP) quando c'e' SMTP_PASSWORD: ha la precedenza su Brevo
  const gm = fintoServer();
  r = await chiama("POST", "/admin/eventi", { titolo: "Visita guidata", data: giorno(12), stato: "pubblicato", pren_attive: true, pren_posti: 30 }, A);
  const env2 = { ...env, SMTP_PASSWORD: "abcdefghijklmnop", __connetti: gm.connetti };
  const r2 = await worker.fetch(new Request("https://w/prenotazioni", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evento: r.dati.id, fascia: "unica", nome: "Anna", cognome: "Neri", email: "anna@example.com", persone: 2, consenso: true }) }), env2, ctx);
  const d2 = await r2.json();
  assert.equal(r2.status, 201, JSON.stringify(d2)); assert.equal(d2.email_conferma, true);
  email.length = 0; await Promise.all(attese);
  assert.equal(email.length, 0, "con Gmail non usa Brevo");
  const messaggi = gm.ricevuti.filter((x) => x.tipo === "DATA").map((x) => x.testo);
  assert.equal(messaggi.length, 2, "conferma + copia");
  assert.ok(messaggi.some((m) => m.includes("To: \"Anna Neri\" <anna@example.com>")));
  assert.ok(gm.ricevuti.some((x) => x.testo === "MAIL FROM:<castellodisilvanopietra@gmail.com>"));
  assert.ok(!messaggi[0].includes("Reply-To"), "mittente e risposta coincidono: niente Reply-To");

  console.log("Tutte le prove superate.");
}
