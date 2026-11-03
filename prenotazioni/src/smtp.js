// Invio e-mail via SMTP con TLS implicito (porta 465), per Cloudflare Workers (cloudflare:sockets).
// Usato con la posta Aruba del dominio: smtps.aruba.it:465, utente = indirizzo completo della casella.
// Nessuna libreria esterna. "connetti" e' iniettabile per le prove locali.

const enc = new TextEncoder();
const b64 = (s) => btoa(String.fromCharCode(...enc.encode(s)));
const parolaCodificata = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const righe76 = (s) => s.replace(/.{1,76}/g, "$&\r\n");

export function componiMessaggio({ da, nomeDa, a, nomeA, rispondiA, oggetto, testo, html, dominio }) {
  const confine = "csp" + crypto.randomUUID().replace(/-/g, "");
  const id = `<${crypto.randomUUID()}@${dominio || da.split("@")[1]}>`;
  const intestazioni = [
    `From: ${nomeDa ? `"${parolaCodificata(nomeDa)}" ` : ""}<${da}>`,
    `To: ${nomeA ? `"${parolaCodificata(nomeA)}" ` : ""}<${a}>`,
    ...(rispondiA ? [`Reply-To: <${rispondiA}>`] : []),
    `Subject: ${parolaCodificata(oggetto)}`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: ${id}`,
    "MIME-Version: 1.0",
  ];
  const parte = (tipo, corpo) => `--${confine}\r\nContent-Type: ${tipo}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${righe76(b64(corpo))}`;
  const corpo = html
    ? [`Content-Type: multipart/alternative; boundary="${confine}"`, "", parte("text/plain", testo), parte("text/html", html), `--${confine}--`, ""].join("\r\n")
    : ["Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", righe76(b64(testo))].join("\r\n");
  // base64 non contiene mai una riga con il solo "." quindi non serve il dot-stuffing
  return intestazioni.join("\r\n") + "\r\n" + corpo;
}

export async function inviaSmtp({ host, porta = 465, utente, password, da, a }, messaggio, connetti) {
  const socket = connetti({ hostname: host, port: porta }, { secureTransport: "on", allowHalfOpen: false });
  const lettore = socket.readable.getReader();
  const scrittore = socket.writable.getWriter();
  const dec = new TextDecoder();
  let buffer = "";

  async function risposta() {
    for (;;) {
      const righe = buffer.split("\r\n");
      for (let i = 0; i < righe.length - 1; i++) {
        if (/^\d{3} /.test(righe[i])) {
          const testo = righe.slice(0, i + 1).join("\n");
          buffer = righe.slice(i + 1).join("\r\n");
          return { codice: Number(righe[i].slice(0, 3)), testo };
        }
      }
      const { value, done } = await lettore.read();
      if (done) throw new Error("SMTP: connessione chiusa dal server");
      buffer += dec.decode(value, { stream: true });
    }
  }
  async function comando(riga, attesi) {
    if (riga != null) await scrittore.write(enc.encode(riga + "\r\n"));
    const r = await risposta();
    if (!attesi.includes(r.codice)) throw new Error(`SMTP ${r.codice}: ${r.testo}`);
    return r;
  }

  try {
    await comando(null, [220]);
    await comando(`EHLO ${da.split("@")[1]}`, [250]);
    await comando("AUTH LOGIN", [334]);
    await comando(b64(utente), [334]);
    await comando(b64(password), [235]);
    await comando(`MAIL FROM:<${da}>`, [250]);
    for (const x of [].concat(a)) await comando(`RCPT TO:<${x}>`, [250, 251]);
    await comando("DATA", [354]);
    await comando(messaggio + "\r\n.", [250]);
    await comando("QUIT", [221]).catch(() => {});
  } finally {
    try { lettore.releaseLock(); scrittore.releaseLock(); await socket.close(); } catch { /* gia' chiuso */ }
  }
}
