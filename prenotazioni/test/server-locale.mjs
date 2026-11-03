// Motore in locale per provare le pagine: node prenotazioni/test/server-locale.mjs <eventi.json>
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import http from "node:http";
import worker from "../src/index.js";
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(new URL("../migrations/0001_prenotazioni.sql", import.meta.url), "utf8"));
const DB = { prepare(sql){ let a=[]; const st={ bind(...x){a=x;return st;}, async all(){return {results:db.prepare(sql).all(...a)};}, async run(){const r=db.prepare(sql).run(...a);return {meta:{changes:Number(r.changes)}};} }; return st; } };
const eventi = readFileSync(process.argv[2], "utf8");
const fetchVero = globalThis.fetch;
globalThis.fetch = async (u, o) => String(u).endsWith("/data/eventi.json") ? new Response(eventi) : fetchVero(u, o);
const env = { DB, SITO: "http://x", ORIGINI: "http://localhost:8765", ADMIN_PASSWORD: "prova" };
http.createServer(async (req, res) => {
  const body = await new Promise(r => { let d=""; req.on("data", c => d += c); req.on("end", () => r(d)); });
  const r = await worker.fetch(new Request("http://localhost:8787" + req.url, { method: req.method, headers: req.headers, body: ["GET","HEAD","OPTIONS"].includes(req.method) ? undefined : body }), env);
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(8787, () => console.log("motore locale su 8787"));
