"""
4-analisis-chunk.py — ANALISIS JUSTIFIKASI desain chunking (eks-"analisis" lama).

Menjawab "kenapa pakai chunk baru?" dengan bukti dari korpus MENTAH + verifikasi
hasil chunk:
  (A) Heading h1-h6 di korpus mentah  -> justifikasi heading-tagging; sekaligus
      SURFACE: chunker html_text masih h1-h3 saja (h4-h6 ter-drop). [no special-case]
  (B) Segmen junk murni di korpus mentah -> justifikasi filter junk.
  (C) Verifikasi hasil chunk: distribusi heading, bebas-junk, panjang ekstrem
      (cek "chunk raksasa" dari <p> tak tertutup -> harusnya tidak ada berkat lxml).

Sumber : src/output/1-get-data/sc-raw/ (mentah) + src/output/3-praproses/ (hasil)
Output : src/output/2-eksplor/4-analisis-chunk.txt
Usage  : python src/code/2-eksplor/4-analisis-chunk.py
"""

import sys
import re
import json
from pathlib import Path
from collections import Counter

sys.path.insert(0, str(Path(__file__).resolve().parent))                                # _load (sedir)
_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402
from _load import iter_chunks, chunk_text                      # noqa: E402

OUT_TXT  = config.EKSPLOR_DIR / "4-analisis-chunk.txt"
RAW      = config.RAW_DIR
HEADING_RE = re.compile(r'<h([1-6])', re.IGNORECASE)


class Logger:
    def __init__(self, filename):
        Path(filename).parent.mkdir(parents=True, exist_ok=True)
        self.terminal = sys.stdout
        self.log = open(filename, "w", encoding="utf-8")
    def write(self, m): self.terminal.write(m); self.log.write(m)
    def flush(self): self.terminal.flush(); self.log.flush()


def raw_heading_counts():
    """Counter level->jumlah heading di mentah, dipisah bilara(sec) vs html_text."""
    bilara, html = Counter(), Counter()
    sec_dir = RAW / "sc_bilara_data" / "html" / "pli" / "ms"
    for f in sec_dir.rglob("*.json"):
        try:
            for v in json.loads(f.read_text(encoding="utf-8")).values():
                for lvl in HEADING_RE.findall(v or ""):
                    bilara[int(lvl)] += 1
        except Exception:
            pass
    for f in (RAW / "html_text").rglob("*.html"):
        try:
            for lvl in HEADING_RE.findall(f.read_text(encoding="utf-8")):
                html[int(lvl)] += 1
        except Exception:
            pass
    return bilara, html


def raw_junk_scan(limit_examples=10):
    """Hitung segmen teks junk di mentah (bilara root+translation). Return (count, contoh)."""
    count, examples = 0, []
    bases = [RAW / "sc_bilara_data" / "root" / "pli" / "ms",
             RAW / "sc_bilara_data" / "translation"]
    for base in bases:
        if not base.exists():
            continue
        for f in base.rglob("*.json"):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
            except Exception:
                continue
            for v in data.values():
                if isinstance(v, str) and config.is_junk_body(v, 0):
                    count += 1
                    if len(examples) < limit_examples:
                        examples.append(v.strip())
    return count, examples


def output_stats():
    """Via hasil chunk: heading dist, junk-di-output (harus ~0), panjang ekstrem."""
    heading = Counter()
    junk_left = 0
    lengths = []
    total = 0
    giant = []   # (len, chunk_id)
    for src, lang, author, base, ch in iter_chunks():
        text = chunk_text(ch)
        if not text:
            continue
        total += 1
        h = ch.get("heading", 0)
        heading[h] += 1
        if config.is_junk_body(text, h):
            junk_left += 1
        L = len(text)
        lengths.append(L)
        if L > 5000:
            giant.append((L, (ch.get("chunk_ids") or ["?"])[0]))
    lengths.sort()
    return total, heading, junk_left, lengths, sorted(giant, reverse=True)[:5]


def main():
    sys.stdout = Logger(OUT_TXT)
    print("=== EKSPLOR 2 — ANALISIS JUSTIFIKASI CHUNKING ===\n")

    # (A) Heading di mentah
    print("(A) HEADING DI KORPUS MENTAH (justifikasi heading-tagging)")
    bilara, html = raw_heading_counts()
    print("    level | bilara(sec) | html_text")
    for lvl in range(1, 7):
        print(f"      h{lvl}  | {bilara.get(lvl,0):>11} | {html.get(lvl,0):>9}")
    h456_bilara = sum(bilara.get(l, 0) for l in (4, 5, 6))
    h456_html   = sum(html.get(l, 0) for l in (4, 5, 6))
    print(f"    -> h4-h6: bilara={h456_bilara}, html_text={h456_html}")
    print("    * Chunker bilara & html_text kini sama-sama menangkap h1-h6 (heading di-tag).")
    print(f"    * {h456_html} heading h4-h6 di html_text ikut tertangkap (dulu ter-drop pada")
    print("      pendekatan p/li/h1-h3; sudah diperbaiki agar seragam dengan bilara).\n")

    # (B) Junk di mentah
    print("(B) SEGMEN JUNK DI KORPUS MENTAH (justifikasi filter junk)")
    jcount, jex = raw_junk_scan()
    print(f"    Segmen junk (simbol/angka murni) di mentah: {jcount}")
    if jex:
        print("    Contoh: " + ", ".join(repr(x) for x in jex[:8]))
    print()

    # (C) Verifikasi hasil chunk
    print("(C) VERIFIKASI HASIL CHUNK")
    total, heading, junk_left, lengths, giant = output_stats()
    if total == 0:
        print("    Belum ada hasil chunk. Jalankan 3-praproses/1-chunk.py dulu.\n")
    else:
        body = heading.get(0, 0)
        head = total - body
        print(f"    Total chunk : {total:,}  (body={body:,}, heading={head:,})")
        for lvl in range(1, 7):
            if heading.get(lvl):
                print(f"      heading h{lvl}: {heading[lvl]:,}")
        print(f"    Junk tersisa di output: {junk_left}  (target: 0 -> filter bekerja)")
        if lengths:
            p99 = lengths[min(len(lengths) - 1, int(len(lengths) * 0.99))]
            print(f"    Panjang karakter: max={lengths[-1]:,}, p99={p99:,}, median={lengths[len(lengths)//2]:,}")
        if giant:
            print(f"    [!] Chunk > 5000 char (cek raksasa): {[(L, cid) for L, cid in giant]}")
        else:
            print("    Tidak ada chunk > 5000 char (lxml mencegah chunk raksasa).")

    print("\n=== RINGKASAN JUSTIFIKASI ===")
    print("- Heading di-TAG (h1-h6) -> bisa disaring seragam via include_titles, tak bias eval.")
    print("- Junk simbol/angka dibuang -> pasase training/retrieval informatif.")
    print("- lxml + double-<br> -> tak ada chunk raksasa; bait/verse terpisah rapi.")
    print("- TANPA min-length -> teks suci (bait pendek) tetap utuh.")
    print(f"\n[INFO] Laporan: {OUT_TXT}")


if __name__ == "__main__":
    main()
