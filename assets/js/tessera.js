/* Verifica tessera socio: il chip NFC apre /t/CODICE, la pagina 404 rimanda qui con #CODICE.
   Il file /data/tessere.json contiene solo l'impronta SHA-256 dei codici, mai i codici stessi. */
(function () {
  var GESTIONALE = "https://claude.ai/artifact/PmJxTN3rtozD6d6UMtfqZK";
  var esito = document.getElementById("tessera-esito");
  var titolo = document.getElementById("tessera-numero");
  if (!esito) return;
  function data(d) { return d.split("-").reverse().join("/"); }
  function mostra(classe, testo, dettaglio) {
    esito.className = "esito esito-" + classe;
    esito.innerHTML = "";
    var h = document.createElement("p"); h.className = "esito-titolo"; h.textContent = testo;
    var p = document.createElement("p"); p.textContent = dettaglio;
    esito.appendChild(h); esito.appendChild(p);
  }
  function sha256(testo) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(testo)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
    });
  }
  function verifica() {
    var codice = decodeURIComponent(location.hash.slice(1)).trim().toUpperCase();
    if (!codice) return;
    Promise.all([fetch("/data/tessere.json", { cache: "no-store" }).then(function (r) { return r.json(); }), sha256(codice)])
      .then(function (ris) {
        var dati = ris[0], numero = dati.tessere[ris[1]];
        var staff = document.getElementById("tessera-staff");
        if (!numero) {
          titolo.textContent = "Tessera non riconosciuta";
          mostra("no", "Non risulta tra le tessere emesse", "Se pensi sia un errore, scrivi a castellodisilvanopietra@gmail.com.");
          staff.hidden = true; return;
        }
        titolo.textContent = "N. " + numero;
        var scaduta = new Date() > new Date(dati.scadenza + "T23:59:59");
        if (dati.bloccate.indexOf(numero) >= 0) mostra("no", "Tessera non più valida", "La tessera è stata sostituita o bloccata. Rivolgiti all'associazione.");
        else if (scaduta) mostra("no", "Tessera scaduta", "Era valida fino al " + data(dati.scadenza) + ". Rinnova la quota per l'anno in corso.");
        else mostra("si", "Socio in regola", "Tessera valida fino al " + data(dati.scadenza) + ".");
        document.getElementById("tessera-staff-link").href = GESTIONALE + "#" + encodeURIComponent(codice);
        staff.hidden = false;
      })
      .catch(function () { mostra("no", "Verifica non riuscita", "Controlla la connessione e riprova."); });
  }
  window.addEventListener("hashchange", verifica);
  verifica();
})();
