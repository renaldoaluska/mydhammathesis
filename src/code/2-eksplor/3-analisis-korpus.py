"""
3-analisis-korpus.py — Karakteristik struktural korpus mentah (PRA-chunking).

Melaporkan TEMUAN netral (angka) — interpretasi & keputusan desain ada di laporan
(rangkuman.txt), bukan di-hardcode di sini. Tidak butuh 3-praproses.
  (A) distribusi heading per level (h1-h6)
  (B) jumlah segmen non-konten (simbol/angka murni)
  (C) jumlah file html dengan <p> tak tertutup
  (D) distribusi panjang karakter segmen

Sumber: src/output/1-get-data/sc-raw | Output: src/output/2-eksplor/3-analisis-korpus.txt
Usage : python src/code/2-eksplor/3-analisis-korpus.py   (cepat, tanpa GPU)
"""

import sys
import re
import json
from pathlib import Path
from collections import Counter

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402

OUT_TXT    = config.EKSPLOR_DIR / "3-analisis-korpus.txt"
RAW        = config.RAW_DIR
HEADING_RE = re.compile(r'<h([1-6])', re.IGNORECASE)
P_OPEN     = re.compile(r'<p[\s>]', re.IGNORECASE)
P_CLOSE    = re.compile(r'</p>', re.IGNORECASE)
HTML_BLOCK = re.compile(r'<(p|li|h[1-6])[^>]*>(.*?)</\1>', re.IGNORECASE | re.DOTALL)


class Logger:
    def __init__(self, fn):
        Path(fn).parent.mkdir(parents=True, exist_ok=True)
        self.t = sys.stdout; self.f = open(fn, "w", encoding="utf-8")
    def write(self, m): self.t.write(m); self.f.write(m)
    def flush(self): self.t.flush(); self.f.flush()
    def __getattr__(self, name): return getattr(self.t, name)   # proxy isatty/fileno/encoding dll


def raw_heading_counts():
    # [POV Peneliti] 
    # Cek kedalaman heading (H1-H6). Buat arsitektur RAG nanti, konteks semantik bergantung 
    # banget sama posisi hirarki teksnya. Kalo ada H4-H6, berarti metadata JSON kita 
    # harus dirancang cukup dalam buat nangkep konteks utuhnya.
    bilara, html = Counter(), Counter()
    for f in (RAW / "sc_bilara_data" / "html" / "pli" / "ms").rglob("*.json"):
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


def raw_junk_scan(limit=10):
    # [POV Peneliti]
    # Cek segmen sampah (simbol/1 huruf). Model vektor macam e5-base gampang "halu" 
    # kalau dikasih noise ginian. Ruang vektornya bisa berantakan. Harus tau seberapa 
    # kotor data mentahnya sebelum masuk mesin embedding.
    count, ex = 0, []
    for base in (RAW / "sc_bilara_data" / "root" / "pli" / "ms",
                 RAW / "sc_bilara_data" / "translation"):
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
                    if len(ex) < limit:
                        ex.append(v.strip())
    return count, ex


def raw_pclose_check():
    """File html_text dengan <p> tak tertutup (open != close) -> risiko chunk raksasa."""
    # [POV Peneliti]
    # Validasi malformed HTML (tag <p> lupa ditutup). Parsing DOM itu sensitif banget, 
    # satu tag bocor bisa bikin algoritma ekstraksi teks gagal total dan gabungin 
    # paragraf jadi satu chunk buta (kayak kasus Thig 14.1).
    files = unclosed = 0
    for f in (RAW / "html_text").rglob("*.html"):
        files += 1
        try:
            txt = f.read_text(encoding="utf-8")
        except Exception:
            continue
        if len(P_OPEN.findall(txt)) > len(P_CLOSE.findall(txt)):
            unclosed += 1
    return files, unclosed


def raw_seg_lengths():
    # Ini yg paling penting...
    # Model transformer punya context window terbatas (biasanya 512 token). 
    # Harus ngukur p99 & max length untuk nge-detect paragraf raksasa yg bakal 
    # bikin model nge-drop konteks sembarangan. Ini yang jadi cikal bakal perlunya chunking rules.
    json_lens = []
    for base in (RAW / "sc_bilara_data" / "root" / "pli" / "ms",
                 RAW / "sc_bilara_data" / "translation"):
        if not base.exists():
            continue
        for f in base.rglob("*.json"):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
            except Exception:
                continue
            for v in data.values():
                if isinstance(v, str) and v.strip():
                    json_lens.append(len(v.strip()))
    
    html_lens = []
    for f in (RAW / "html_text").rglob("*.html"):
        try:
            txt = f.read_text(encoding="utf-8")
        except Exception:
            continue
        for tag, content in HTML_BLOCK.findall(txt):
            clean = re.sub(r'<[^>]+>', '', content).strip()
            if clean:
                html_lens.append(len(clean))
                
    json_lens.sort()
    html_lens.sort()
    return json_lens, html_lens


def main():
    sys.stdout = Logger(OUT_TXT)
    print("=== EKSPLOR 3 — KARAKTERISTIK STRUKTURAL KORPUS MENTAH ===\n")

    print("(A) Distribusi heading per level")
    bilara, html = raw_heading_counts()
    print("    level | bilara(sec) | html_text")
    for lvl in range(1, 7):
        print(f"      h{lvl}  | {bilara.get(lvl,0):>11} | {html.get(lvl,0):>9}")
    h456 = sum(bilara.get(l, 0) for l in (4, 5, 6)) + sum(html.get(l, 0) for l in (4, 5, 6))
    print(f"    h4-h6 (di luar rentang p/li/h1-h3): {h456}\n")

    print("(B) Segmen non-konten (hanya simbol/angka/1 huruf)")
    jc, jex = raw_junk_scan()
    print(f"    Jumlah: {jc}")
    if jex:
        print("    Contoh: " + ", ".join(repr(x) for x in jex[:8]))
    print()

    print("(C) <p> tak tertutup (open != close) di html_text")
    nfile, nunclosed = raw_pclose_check()
    print(f"    File html: {nfile:,}; dengan <p> tak tertutup: {nunclosed:,}\n")

    print("(D) Panjang karakter segmen mentah")
    json_lens, html_lens = raw_seg_lengths()
    
    def print_stats(name, lens):
        if not lens: return 0, 0
        n = len(lens)
        def pct(p): return lens[min(n - 1, int(n * p / 100))]
        p50, p99, mx = pct(50), pct(99), lens[-1]
        print(f"    [{name}] n={n:,}  min={lens[0]}  p50={p50}  p95={pct(95)}  p99={p99}  max={mx:,}")
        print(f"           Segmen <=15 char: {sum(1 for x in lens if x <= 15):,}")
        return p50, mx
        
    j_p50, j_mx = print_stats("JSON", json_lens)
    h_p50, h_mx = print_stats("HTML", html_lens)

    print("\n=== TEMUAN ===")
    print(f"- Heading h1-h6 hadir; {h456} di antaranya h4-h6.")
    print(f"- Segmen non-konten murni: {jc}.")
    print(f"- File html dengan <p> tak tertutup: {nunclosed} dari {nfile}.")
    print(f"- Panjang segmen JSON: median {j_p50}, max {j_mx} karakter (Aman).")
    print(f"- Panjang segmen HTML: median {h_p50}, max {h_mx} karakter (Beresiko jadi Chunk Raksasa!).")
    print(f"\n[INFO] {OUT_TXT}")


if __name__ == "__main__":
    main()
