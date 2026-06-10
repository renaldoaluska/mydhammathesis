"""
4-analisis-lanjutan.py — Analisis struktural LANJUTAN: pola struktur PER-GENRE (PRA-chunk).

Lanjutan langsung dari 3-analisis-korpus (struktur umum: heading-level, panjang,
non-konten). Di sini digali pola struktur KHAS GENRE yang tidak tertangkap statistik
umum dan yang menentukan rule chunking. (Cakupan bahasa x pitaka ada di 2-hierarki;
audit hasil POST-chunk ada di 7-audit-struktural.)

TEMUAN NETRAL (angka saja). Kesimpulan/keputusan -> rangkuman.txt (grounded ke output ini),
BUKAN di-hardcode di sini.
  (A) inventaris <p class='...'> per pitaka (penanda struktural mentah)
  (B) pola LEMMA-TEBAL <p>/<li> yang seluruh teksnya di dalam <b>/<strong>
      (= rule label chunker; mis. padabhajaniya Vinaya "<p><b>istilah:</b></p>")
  (C) pola TANYA-JAWAB <p class='question'> per kitab (mis. Pp Abhidhamma gaya Sutta)

Sumber: src/output/1-get-data/sc-raw/html_text | Output: src/output/2-eksplor/4-analisis-lanjutan.txt
Usage : python src/code/2-eksplor/4-analisis-lanjutan.py   (cepat, tanpa GPU)
"""

import sys
from pathlib import Path
from collections import Counter, defaultdict

from bs4 import BeautifulSoup

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402

OUT      = config.EKSPLOR_DIR / "4-analisis-lanjutan.txt"
HTMLTEXT = config.RAW_DIR / "html_text"
LANGS    = ("id", "en")                                        # "multibahasa" = bahasa terjemahan
BASKETS  = ("sutta", "vinaya", "abhidhamma")


def is_bold_label(tag) -> bool:
    """Sama persis dgn rule chunker (1-chunk.py): <p>/<li> yg SELURUH teksnya di <b>/<strong>."""
    b = tag.find(["b", "strong"])
    t = tag.get_text(strip=True)
    return tag.name in ("p", "li") and b is not None and t != "" and t == b.get_text(strip=True)


def book_of(stem: str) -> str:
    """Kitab dari nama file (ds/vb/pp/kv/...) — prefix huruf sebelum angka."""
    i = 0
    while i < len(stem) and (stem[i].isalpha() or stem[i] == "-"):
        i += 1
    return stem[:i].rstrip("-") or stem


def main():
    pclass   = defaultdict(Counter)                            # basket -> Counter(class)
    bold     = Counter()                                       # basket -> jumlah lemma-tebal
    bold_samp = []
    question = Counter()                                       # kitab -> jumlah <p class=question>
    q_samp   = []

    for lang in LANGS:
        for basket in BASKETS:
            root = HTMLTEXT / lang / "pli" / basket
            if not root.exists():
                continue
            for f in root.rglob("*.html"):
                soup = BeautifulSoup(f.read_text(encoding="utf-8"), "lxml")
                for tag in soup.find_all(["p", "li"]):
                    cls = tag.get("class")
                    if tag.name == "p" and cls:
                        pclass[basket][" ".join(cls)] += 1
                    if is_bold_label(tag):
                        bold[basket] += 1
                        if basket == "vinaya" and len(bold_samp) < 8:
                            bold_samp.append(f"{f.stem} | {tag.get_text(strip=True)[:50]}")
                    if tag.name == "p" and cls and "question" in cls:
                        question[book_of(f.stem)] += 1
                        if len(q_samp) < 8:
                            q_samp.append(f"{f.stem} | {tag.get_text(' ', strip=True)[:70]}")

    L = ["=== ANALISIS STRUKTURAL LANJUTAN (pola per-genre; PRA-chunk; NETRAL) ===", ""]

    L.append("[A] INVENTARIS <p class='...'> per pitaka (id+en digabung)")
    allcls = sorted({c for bk in pclass.values() for c in bk}, key=lambda c: -sum(pclass[b][c] for b in BASKETS))
    L.append(f"    {'class':<16}" + "".join(f"{b:>12}" for b in BASKETS) + f"{'TOTAL':>10}")
    for c in allcls:
        row = [pclass[b][c] for b in BASKETS]
        L.append(f"    {c:<16}" + "".join(f"{v:>12,}" for v in row) + f"{sum(row):>10,}")
    L.append("")

    L.append("[B] POLA LEMMA-TEBAL <p>/<li> (isi = cuma <b>/<strong>)  -> rule label chunker")
    for b in BASKETS:
        L.append(f"    {b:<12}: {bold[b]:,}")
    L.append("    sample (vinaya):")
    for s in bold_samp:
        L.append(f"      - {s}")
    L.append("")

    L.append("[C] POLA TANYA-JAWAB <p class='question'> per kitab")
    for bk, n in question.most_common():
        L.append(f"    {bk:<10}: {n:,}")
    L.append("    sample:")
    for s in q_samp:
        L.append(f"      - {s}")
    L.append("")

    out = "\n".join(L) + "\n"
    print(out)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(out, encoding="utf-8")
    print(f"[saved] {OUT}")


if __name__ == "__main__":
    main()
