#!/usr/bin/env python3
"""Costruisce il sito in dist/ partendo da src/.

Ogni pagina in src/pages/*.html inizia con un commento JSON:
  <!--{"title":"Restauri","nav":"Restauri","order":3,"description":"..."}-->
- "nav": testo nel menu (se manca, la pagina non compare nel menu)
- "order": posizione nel menu
- "scripts": (facoltativo) elenco di file JS extra da caricare

Uso:  python3 build.py
Nessuna libreria esterna richiesta.
"""
import json, re, shutil, time, datetime
from pathlib import Path

ROOT = Path(__file__).parent
SRC, DIST = ROOT / "src", ROOT / "dist"
META = re.compile(r"^\s*<!--(\{.*?\})-->\s*", re.S)

def carica_pagine():
    pagine = []
    for f in sorted((SRC / "pages").glob("*.html")):
        testo = f.read_text(encoding="utf-8")
        m = META.match(testo)
        if not m:
            raise SystemExit(f"{f.name}: manca il commento JSON iniziale")
        meta = json.loads(m.group(1))
        meta.update(file=f.name, slug=f.stem, corpo=testo[m.end():])
        pagine.append(meta)
    return sorted(pagine, key=lambda p: p.get("order", 50))

def menu(pagine, attuale):
    voci = []
    for p in pagine:
        if not p.get("nav"):
            continue
        href = "/" if p["file"] == "index.html" else "/" + p["file"]
        corrente = ' aria-current="page"' if p["file"] == attuale else ""
        voci.append(f'      <li><a href="{href}"{corrente}>{p["nav"]}</a></li>')
    return "\n".join(voci)

def main():
    layout = (SRC / "layout.html").read_text(encoding="utf-8")
    pagine = carica_pagine()
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    versione = str(int(time.time()))
    for p in pagine:
        script = "\n".join(f'<script src="{s}?v={versione}" defer></script>' for s in p.get("scripts", []))
        html = layout
        for chiave, valore in {
            "title": p["title"], "description": p.get("description", ""),
            "slug": p["slug"], "nav": menu(pagine, p["file"]), "content": p["corpo"],
            "scripts": script, "version": versione, "year": str(datetime.date.today().year),
        }.items():
            html = html.replace("{{" + chiave + "}}", valore)
        (DIST / p["file"]).write_text(html, encoding="utf-8")
    for cartella in ("assets", "data"):
        shutil.copytree(ROOT / cartella, DIST / cartella)
    for extra in ("htaccess.txt",):
        shutil.copy(ROOT / extra, DIST / ".htaccess")
    print(f"Costruite {len(pagine)} pagine in {DIST}")

if __name__ == "__main__":
    main()
