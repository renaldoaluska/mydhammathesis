"""
4-spot-check.py — Spot-check chunk outlier (> 5.000 karakter).

POST-statistik: identifikasi chunk sangat panjang yang mungkin artefak parsing
(<p> tak tertutup / segmen tanpa <br>) vs teks panjang yang sah (Jataka, uddana).
Sumber: src/output/3-praproses (via _load) | Output: src/output/3-praproses/4-spot-check.txt
Usage : python src/code/3-praproses/4-spot-check.py
"""

import sys
from pathlib import Path
from textwrap import shorten

sys.path.insert(0, str(Path(__file__).resolve().parent))                                # _load (sedir)
_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402
from _load import iter_chunks, chunk_text, LANG_NAMA           # noqa: E402

CHAR_THRESHOLD = 5000
OUT_TXT = config.PRAPROSES_DIR / "4-spot-check.txt"


class Logger:
    def __init__(self, fn):
        Path(fn).parent.mkdir(parents=True, exist_ok=True)
        self.t = sys.stdout; self.f = open(fn, "w", encoding="utf-8")
    def write(self, m): self.t.write(m); self.f.write(m)
    def flush(self): self.t.flush(); self.f.flush()
    def __getattr__(self, name): return getattr(self.t, name)   # proxy isatty/fileno/encoding dll


def main():
    sys.stdout = Logger(OUT_TXT)
    print(f"=== PRAPROSES 4 — SPOT-CHECK CHUNK > {CHAR_THRESHOLD:,} KARAKTER ===\n")

    outliers = []
    total = 0
    for src, lang, author, base, ch in iter_chunks():
        text = chunk_text(ch)
        if not text:
            continue
        total += 1
        clen = len(text)
        if clen > CHAR_THRESHOLD:
            uid = ch.get("uid", "")
            heading = ch.get("heading", 0)
            outliers.append({
                "chars": clen,
                "words": len(text.split()),
                "uid": uid,
                "base": base,
                "src": src,
                "lang": lang,
                "author": author,
                "heading": heading,
                "preview": shorten(text, width=200, placeholder=" …"),
            })

    outliers.sort(key=lambda x: -x["chars"])

    print(f"Total chunk diproses : {total:,}")
    print(f"Chunk > {CHAR_THRESHOLD:,} char  : {len(outliers)}")
    if not outliers:
        print("\nTidak ada chunk outlier — LANJUT ke training AMAN.")
        print(f"\n[INFO] {OUT_TXT}")
        return

    pct = len(outliers) / total * 100
    print(f"Persentase            : {pct:.4f}%")
    print(f"Max karakter          : {max(o['chars'] for o in outliers):,}")
    print()

    # --- tabel ringkas ---
    hdr = (f"{'#':>3} {'Chars':>6} {'Words':>6} {'H':>2} {'Lang':<4} "
           f"{'Source':<7} {'Author':<18} {'Base/UID':<40}")
    print(hdr)
    print("-" * len(hdr))
    for i, o in enumerate(outliers, 1):
        label = o["uid"] if o["uid"] else o["base"]
        print(f"{i:>3} {o['chars']:>6,} {o['words']:>6,} {o['heading']:>2} "
              f"{o['lang']:<4} {o['src']:<7} {o['author']:<18} {label:<40}")
    print("-" * len(hdr))

    # --- detail per outlier (preview teks) ---
    print(f"\n{'='*80}")
    print("PREVIEW TEKS (maks 200 char)")
    print(f"{'='*80}\n")
    for i, o in enumerate(outliers, 1):
        label = o["uid"] if o["uid"] else o["base"]
        print(f"[{i}] {label}  ({o['chars']:,} char, {o['lang']}, {o['src']}/{o['author']})")
        print(f"    {o['preview']}")
        print()

    print(f"[INFO] {OUT_TXT}")
    print("=== SELESAI ===")


if __name__ == "__main__":
    main()
