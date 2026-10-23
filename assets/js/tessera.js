/* Verifica tessera socio.
   Il chip NFC apre /t/CODICE; la pagina 404 rimanda a /tessera.html#CODICE.
   data/tessere.json (generato dal gestionale) contiene, per ogni tessera, l'impronta SHA-256 del codice
   e la scheda del socio cifrata (AES-GCM) con una chiave ricavata dal codice stesso:
   solo chi ha la tessera puo' leggere la propria scheda. */
(function () {
  var GESTIONALE = "https://claude.ai/artifact/PmJxTN3rtozD6d6UMtfqZK";
  var $ = function (id) { return document.getElementById(id); };
  if (!$("tessera-esito")) return;
  var enc = new TextEncoder();
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ("0" + x.toString(16)).slice(-2); }).join(""); }
  function bytes(b64) { var s = atob(b64), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function decifra(codice, voce) {
    return crypto.subtle.digest("SHA-256", enc.encode("CSP-tessera|" + codice))
      .then(function (k) { return crypto.subtle.importKey("raw", k, "AES-GCM", false, ["decrypt"]); })
      .then(function (key) { return crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(voce.iv) }, key, bytes(voce.ct)); })
      .then(function (pt) { return JSON.parse(new TextDecoder().decode(pt)); });
  }
  function mostra(o) {
    $("tessera-numero").textContent = o.titolo;
    $("tessera-numero-piccolo").textContent = o.numero ? "Tessera N. " + o.numero : "Tessera socio";
    var e = $("tessera-esito"); e.className = "esito esito-" + o.classe; e.innerHTML = "";
    var st = document.createElement("p"); st.className = "esito-stato"; st.textContent = o.stato; e.appendChild(st);
    if (o.riga) { var dl = document.createElement("p"); dl.className = "esito-riga"; dl.textContent = o.riga; e.appendChild(dl); }
    if (o.nota) { var n = document.createElement("p"); n.className = "esito-nota"; n.textContent = o.nota; e.appendChild(n); }
  }
  function verifica() {
    var codice = decodeURIComponent(location.hash.slice(1)).trim().toUpperCase();
    if (!codice) return;
    var staff = $("tessera-staff");
    Promise.all([
      fetch("/data/tessere.json", { cache: "no-store" }).then(function (r) { return r.json(); }),
      crypto.subtle.digest("SHA-256", enc.encode(codice)).then(hex)
    ]).then(function (r) {
      var voce = r[0].tessere[r[1]];
      if (!voce) {
        staff.hidden = true;
        return mostra({ titolo: "Tessera non riconosciuta", classe: "no", stato: "Non valida", nota: "Non risulta tra le tessere emesse dall'associazione." });
      }
      $("tessera-staff-link").href = GESTIONALE + "#" + encodeURIComponent(codice);
      staff.hidden = false;
      return decifra(codice, voce).then(function (s) {
        var nome = ((s.nome || "") + " " + (s.cognome || "")).trim();
        if (s.st === "libera") return mostra({ titolo: "Tessera da attivare", numero: s.n, classe: "attesa", stato: "Non ancora assegnata", nota: "La tessera sarà attiva appena registrata l'iscrizione." });
        if (s.st === "bloccata") return mostra({ titolo: nome || "Tessera bloccata", numero: s.n, classe: "no", stato: "Bloccata", nota: "La tessera è stata sostituita o bloccata. Rivolgiti all'associazione." });
        /* La quota di un anno vale dal 1° gennaio al 31 dicembre di quell'anno */
        var anni = s.anni || [], oggi = new Date().getFullYear();
        if (anni.indexOf(oggi) >= 0) return mostra({ titolo: nome, numero: s.n, classe: "si", stato: "Valida", riga: "Validità: 01/01/" + oggi + " – 31/12/" + oggi });
        var passati = anni.filter(function (a) { return a < oggi; }), futuri = anni.filter(function (a) { return a > oggi; });
        mostra({ titolo: nome, numero: s.n, classe: "no", stato: "Scaduta",
                 riga: passati.length ? "Scaduta il 31/12/" + passati[passati.length - 1] : "Nessuna quota versata",
                 nota: futuri.length ? "Rinnovata per il " + futuri[0] + ": valida dal 01/01/" + futuri[0] + "." : "Rinnova la quota associativa per l'anno " + oggi + "." });
      });
    }).catch(function () {
      mostra({ titolo: "Verifica non riuscita", classe: "no", stato: "Riprova", nota: "Controlla la connessione e tocca di nuovo la tessera." });
    });
  }
  window.addEventListener("hashchange", verifica);
  verifica();
})();
