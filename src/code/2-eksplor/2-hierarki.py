"""
2-hierarki.py — Struktur & cakupan korpus mentah (SuttaCentral sc-data).

Gambaran organisasi korpus (sumber -> bahasa -> pitaka/koleksi) + jumlah berkas
per cabang — dasar penentuan cakupan data.
Sumber: src/output/1-get-data/sc-raw | Output: src/output/2-eksplor/2-hierarki.txt
Usage : python src/code/2-eksplor/2-hierarki.py
"""

import os
import sys
from pathlib import Path

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402

TARGET    = config.RAW_DIR
OUT_TXT   = config.EKSPLOR_DIR / "2-hierarki.txt"
MAX_DEPTH = 4


class Logger:
    def __init__(self, fn):
        Path(fn).parent.mkdir(parents=True, exist_ok=True)
        self.t = sys.stdout; self.f = open(fn, "w", encoding="utf-8")
    def write(self, m): self.t.write(m); self.f.write(m)
    def flush(self): self.t.flush(); self.f.flush()
    def __getattr__(self, name): return getattr(self.t, name)   # proxy isatty/fileno/encoding dll


def hitung_berkas(folder):
    return sum(len(files) for _, _, files in os.walk(folder))


def cetak_struktur(startpath, max_depth):
    startpath = str(startpath)
    for root, dirs, files in os.walk(startpath):
        dirs[:] = [d for d in sorted(dirs) if not d.startswith(".")]
        level = root.replace(startpath, "").count(os.sep)
        indent = "    " * level
        nama = os.path.basename(os.path.abspath(root))
        if root == startpath:
            nama += " (ROOT)"
        print(f"{indent}[DIR] {nama}/  ({hitung_berkas(root):,} berkas)")
        if level >= max_depth - 1:
            dirs[:] = []


BASKETS = ("sutta", "vinaya", "abhidhamma")


def matriks_cakupan():
    """Jumlah file html_text per bahasa x pitaka -> surface gap cakupan (mis. Abhidhamma id=0)."""
    htmltext = TARGET / "html_text"
    if not htmltext.exists():
        return
    langs = sorted(d.name for d in htmltext.iterdir() if d.is_dir())
    print("\n--- CAKUPAN html_text per bahasa x pitaka (jumlah file) ---")
    print(f"  {'lang':<6}" + "".join(f"{b:>12}" for b in BASKETS))
    for lang in langs:
        row = [len(list((htmltext / lang / "pli" / b).rglob("*.html")))
               if (htmltext / lang / "pli" / b).exists() else 0 for b in BASKETS]
        print(f"  {lang:<6}" + "".join(f"{v:>12,}" for v in row))
    print("  (0 = tak ada terjemahan pitaka tsb di bahasa itu; pli-original ada di bilara-root)")


def main():
    sys.stdout = Logger(OUT_TXT)
    print("=== EKSPLOR 2 — HIERARKI & STRUKTUR KORPUS ===\n")
    if not TARGET.exists():
        print(f"[ERROR] korpus tidak ada: {TARGET}\nJalankan 1-get-data/ dulu.")
        return
    print(f"Sumber       : {TARGET}")
    print(f"Total berkas : {hitung_berkas(TARGET):,}")
    print(f"Kedalaman    : dibatasi {MAX_DEPTH} level\n")
    cetak_struktur(TARGET, MAX_DEPTH)
    matriks_cakupan()
    print(f"\n[INFO] {OUT_TXT}")


if __name__ == "__main__":
    main()
