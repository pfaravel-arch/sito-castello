// Motore in locale per provare le pagine: node prenotazioni/test/server-locale.mjs [indirizzo del sito locale]
// Il calendario iniziale e le locandine vengono letti dal sito locale (default http://localhost:8765).
import http from "node:http";
import worker from "../src/index.js";
import { creaD1 } from "./prova.mjs";
const SITO = process.argv[2] || "http://localhost:8765";
const env = { DB: creaD1(), SITO, ORIGINI: "http://localhost:8765", ADMIN_PASSWORD: "prova" };
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const r = await worker.fetch(new Request("http://localhost:8787" + req.url, { method: req.method, headers: req.headers, body: ["GET", "HEAD", "OPTIONS"].includes(req.method) ? undefined : body }), env);
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(8787, () => console.log("motore locale su 8787, sito " + SITO));
