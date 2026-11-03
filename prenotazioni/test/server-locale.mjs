// Motore in locale per provare le pagine: node prenotazioni/test/server-locale.mjs [indirizzo del sito locale]
// Il calendario iniziale e le locandine vengono letti dal sito locale (default http://localhost:8765).
import http from "node:http";
import worker from "../src/index.js";
import { creaD1 } from "./prova.mjs";
import { fintoServer } from "./prova-smtp.mjs";
const SITO = process.argv[2] || "http://localhost:8765";
const posta = fintoServer();
const env = { DB: creaD1(), SITO, ...(process.env.EMAIL_FINTA ? { SMTP_PASSWORD: "x", SMTP_HOST: "finto", EMAIL_MITTENTE: "castellodisilvanopietra@gmail.com", EMAIL_COPIA: "castellodisilvanopietra@gmail.com", __connetti: posta.connetti } : {}), ORIGINI: "http://localhost:8765", ADMIN_PASSWORD: "prova", AREA_TOKEN_SHA256: process.env.AREA_TOKEN_SHA256 || "" };
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const r = await worker.fetch(new Request("http://localhost:8787" + req.url, { method: req.method, headers: req.headers, body: ["GET", "HEAD", "OPTIONS"].includes(req.method) ? undefined : body }), env);
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
  for (const x of posta.ricevuti.splice(0)) if (x.tipo === "DATA") console.log("EMAIL>>" + x.testo.replace(/\r\n/g, "\\n"));
}).listen(8787, () => console.log("motore locale su 8787, sito " + SITO));
