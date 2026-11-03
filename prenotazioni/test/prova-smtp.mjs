// Prova del client SMTP con un finto server (dialogo come Gmail, porta 465).
// Uso: node prenotazioni/test/prova-smtp.mjs
import assert from "node:assert/strict";
import { componiMessaggio, inviaSmtp } from "../src/smtp.js";

export function fintoServer({ rifiutaPassword = false } = {}) {
  const ricevuti = [];
  const conn = { aperta: null };
  const connetti = (dest, opz) => {
    conn.aperta = { dest, opz };
    let controller;
    const readable = new ReadableStream({ start(c) { controller = c; } });
    const enc = new TextEncoder(), dec = new TextDecoder();
    const manda = (s) => controller.enqueue(enc.encode(s));
    let inDati = false, dati = "", n = 0;
    manda("220 smtp.gmail.com ESMTP pronto\r\n");
    const writable = new WritableStream({
      write(chunk) {
        const t = dec.decode(chunk);
        if (inDati) {
          dati += t;
          if (dati.endsWith("\r\n.\r\n")) { inDati = false; ricevuti.push({ tipo: "DATA", testo: dati }); manda("250 2.0.0 OK accettato\r\n"); }
          return;
        }
        const riga = t.replace(/\r\n$/, "");
        ricevuti.push({ tipo: "CMD", testo: riga }); n++;
        if (riga.startsWith("EHLO")) manda("250-smtp.gmail.com al tuo servizio\r\n250-AUTH LOGIN PLAIN\r\n250 SMTPUTF8\r\n");
        else if (riga === "AUTH LOGIN") manda("334 VXNlcm5hbWU6\r\n");
        else if (n === 3) manda("334 UGFzc3dvcmQ6\r\n");
        else if (n === 4) manda(rifiutaPassword ? "535 5.7.8 Username and Password not accepted\r\n" : "235 2.7.0 Accepted\r\n");
        else if (riga.startsWith("MAIL FROM") || riga.startsWith("RCPT TO")) manda("250 2.1.0 OK\r\n");
        else if (riga === "DATA") { inDati = true; dati = ""; manda("354 Go ahead\r\n"); }
        else if (riga === "QUIT") { manda("221 2.0.0 closing\r\n"); controller.close(); }
      },
    });
    return { readable, writable, close: async () => {} };
  };
  return { connetti, ricevuti, conn };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = fintoServer();
  const msg = componiMessaggio({ da: "castellodisilvanopietra@gmail.com", nomeDa: "Castello di Silvano Pietra APS", a: "lucia@example.com",
    nomeA: "Lucia Verdi", oggetto: "Prenotazione confermata: Mercatini di Natale (codice ABC234)", testo: "Ciao Lucia,\nè confermata.", html: "<p>Ciao <b>Lucia</b>, è confermata.</p>" });
  await inviaSmtp({ host: "smtp.gmail.com", porta: 465, utente: "castellodisilvanopietra@gmail.com", password: "abcd efgh ijkl mnop",
    da: "castellodisilvanopietra@gmail.com", a: "lucia@example.com" }, msg, s.connetti);
  assert.deepEqual(s.conn.aperta.dest, { hostname: "smtp.gmail.com", port: 465 });
  assert.equal(s.conn.aperta.opz.secureTransport, "on");
  const cmd = s.ricevuti.filter((x) => x.tipo === "CMD").map((x) => x.testo);
  assert.equal(cmd[0], "EHLO gmail.com"); assert.equal(cmd[1], "AUTH LOGIN");
  assert.equal(Buffer.from(cmd[2], "base64").toString(), "castellodisilvanopietra@gmail.com");
  assert.equal(Buffer.from(cmd[3], "base64").toString(), "abcd efgh ijkl mnop");
  assert.equal(cmd[4], "MAIL FROM:<castellodisilvanopietra@gmail.com>"); assert.equal(cmd[5], "RCPT TO:<lucia@example.com>");
  assert.equal(cmd.at(-1), "QUIT");
  const dati = s.ricevuti.find((x) => x.tipo === "DATA").testo;
  assert.match(dati, /^From: "Castello di Silvano Pietra APS" <castellodisilvanopietra@gmail.com>\r\n/);
  assert.match(dati, /\r\nTo: "Lucia Verdi" <lucia@example.com>\r\n/);
  assert.match(dati, /\r\nSubject: Prenotazione confermata: Mercatini di Natale \(codice ABC234\)\r\n/);
  assert.match(dati, /multipart\/alternative/);
  const parti = [...dati.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/g)].map((m) => Buffer.from(m[1].replace(/\r\n/g, ""), "base64").toString());
  assert.equal(parti[0], "Ciao Lucia,\nè confermata."); assert.match(parti[1], /<b>Lucia<\/b>, è confermata/);
  assert.ok(dati.endsWith("\r\n.\r\n"));
  // oggetto con accenti codificato
  assert.match(componiMessaggio({ da: "a@b.it", a: "c@d.it", oggetto: "Città", testo: "x" }), /Subject: =\?UTF-8\?B\?/);
  // password rifiutata: errore chiaro
  const r = fintoServer({ rifiutaPassword: true });
  await assert.rejects(inviaSmtp({ host: "smtp.gmail.com", utente: "u@gmail.com", password: "x", da: "u@gmail.com", a: "z@x.it" }, "Subject: x\r\n\r\nx", r.connetti), /SMTP 535/);
  console.log("Prove SMTP superate.");
}
