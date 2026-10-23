#!/usr/bin/env python3
"""Genera data/tessere.json per la pagina di verifica delle tessere soci.

Uso:  python3 strumenti/genera_tessere.py CARTELLA_DB [data/tessere.json]

CARTELLA_DB contiene l'esportazione del gestionale soci, un file JSON per documento:
  tessere/<numero>.json   {token, hash, stato, socio_id}
  soci/<id>.json          {nome, cognome, ...}
  quote/<id>.json         {socio_id, anno, ...}

Ogni scheda e' cifrata in AES-GCM con chiave SHA-256("CSP-tessera|" + codice) e IV ricavato
da chiave e contenuto: lo stesso contenuto produce lo stesso file, quindi il sito cambia solo
quando cambiano i dati. Il file prodotto non contiene mai i codici. Richiede: cryptography.
"""
import base64, hashlib, json, sys
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def carica(cartella):
    return {f.stem: json.loads(f.read_text(encoding="utf-8")) for f in sorted(Path(cartella).glob("*.json"))} if Path(cartella).exists() else {}

def scheda(numero, t, soci, quote):
    """Stato fisso della tessera; la validita' (01/01-31/12 di ogni anno pagato) la calcola la pagina."""
    s = soci.get(t.get("socio_id") or "")
    anni = sorted({int(q["anno"]) for q in quote.values() if s and q.get("socio_id") == t.get("socio_id") and q.get("anno")})
    if t.get("stato") == "bloccata":
        return {"n": numero, "st": "bloccata", "nome": (s or {}).get("nome", ""), "cognome": (s or {}).get("cognome", "")}
    if t.get("stato") != "assegnata" or not s:
        return {"n": numero, "st": "libera"}
    return {"n": numero, "st": "assegnata", "nome": s.get("nome", ""), "cognome": s.get("cognome", ""), "anni": anni}

def stato_oggi(sc):
    import datetime
    if sc["st"] != "assegnata":
        return sc["st"]
    return "valida" if datetime.date.today().year in sc["anni"] else "scaduta"

def main():
    db = Path(sys.argv[1]); uscita = Path(sys.argv[2] if len(sys.argv) > 2 else "data/tessere.json")
    tessere, soci, quote = carica(db / "tessere"), carica(db / "soci"), carica(db / "quote")
    if len(tessere) < 1:
        sys.exit("Nessuna tessera nell'esportazione: non sovrascrivo il file.")
    out = {"v": 3, "tessere": {}}
    for numero, t in sorted(tessere.items()):
        tok = t.get("token")
        if not tok:
            continue
        chiave = hashlib.sha256(("CSP-tessera|" + tok).encode()).digest()
        testo = json.dumps(scheda(numero, t, soci, quote), ensure_ascii=False, sort_keys=True).encode()
        iv = hashlib.sha256(chiave + testo).digest()[:12]
        ct = AESGCM(chiave).encrypt(iv, testo, None)
        out["tessere"][hashlib.sha256(tok.encode()).hexdigest()] = {"iv": base64.b64encode(iv).decode(), "ct": base64.b64encode(ct).decode()}
    uscita.write_text(json.dumps(out, separators=(",", ":"), sort_keys=True), encoding="utf-8")
    n = {k: 0 for k in ("valida", "scaduta", "bloccata", "libera")}
    for numero, t in tessere.items():
        n[stato_oggi(scheda(numero, t, soci, quote))] += 1
    print(f"{uscita}: {len(out['tessere'])} tessere ({', '.join(f'{v} {k}' for k, v in n.items())})")

if __name__ == "__main__":
    main()
