#!/usr/bin/env python3
"""Cifra (o decifra) il contenuto della pagina /area-riservata.html.

Il contenuto in chiaro NON sta nel repository: in data/area-riservata.json c'e' solo la versione
cifrata (AES-256-GCM, chiave ricavata dalla password con PBKDF2-SHA256, 600.000 iterazioni).
La pagina la decifra nel browser quando si inserisce la password.

Uso (la password si passa con la variabile d'ambiente AREA_PASSWORD):
  AREA_PASSWORD='...' python3 strumenti/cifra_area.py cifra   contenuto.html
  AREA_PASSWORD='...' python3 strumenti/cifra_area.py decifra > contenuto.html
Per cambiare password: decifra con la vecchia, poi cifra con la nuova.
Richiede: cryptography.
"""
import base64, json, os, sys
from pathlib import Path
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

FILE = Path(__file__).resolve().parent.parent / "data" / "area-riservata.json"
ITER = 600_000
b64 = lambda b: base64.b64encode(b).decode()

def chiave(password, sale, iterazioni):
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=sale, iterations=iterazioni).derive(password.encode("utf-8"))

def main():
    password = os.environ.get("AREA_PASSWORD")
    if not password or len(sys.argv) < 2 or sys.argv[1] not in ("cifra", "decifra"):
        sys.exit(__doc__)
    if sys.argv[1] == "cifra":
        testo = Path(sys.argv[2]).read_text(encoding="utf-8").encode("utf-8")
        sale, iv = os.urandom(16), os.urandom(12)
        ct = AESGCM(chiave(password, sale, ITER)).encrypt(iv, testo, None)
        FILE.write_text(json.dumps({"v": 1, "iter": ITER, "sale": b64(sale), "iv": b64(iv), "dati": b64(ct)}) + "\n", encoding="utf-8")
        print(f"Scritto {FILE}")
    else:
        d = json.loads(FILE.read_text(encoding="utf-8"))
        k = chiave(password, base64.b64decode(d["sale"]), d["iter"])
        sys.stdout.write(AESGCM(k).decrypt(base64.b64decode(d["iv"]), base64.b64decode(d["dati"]), None).decode("utf-8"))

if __name__ == "__main__":
    main()
