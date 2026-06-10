"""
periksa.py — PEMERIKSAAN (audit) data GPL: jembatan netral sebelum filter/training.

Cetak ANGKA netral saja (tanpa kesimpulan) -> src/output/4-training/gpl/periksa.txt.
Kesimpulan/justifikasi ditulis TERPISAH di rangkuman.txt (grounded ke output run).

Memeriksa:
  A. Passage  : komposisi lang & skema (bilara/md/lain), distribusi panjang (kata),
                tabel ambang pendek, proxy judul-struktural (heading bocor).
  B. Lintas-bahasa : audit alignment md# (dok punya en&id -> beda jumlah chunk?).
  C. Query    : (otomatis bila queries.jsonl ada) query/passage, panjang, duplikat,
                echo-rate (Jaccard query vs passage), cross-tab per bucket panjang.

Usage: python src/code/4-training/periksa.py
Read-only: AMAN dijalankan sambil query-gen berjalan.
"""

import sys
import re
import json  # noqa: F401  (read_jsonl pakai modul json via _gpl)
import statistics as st
from pathlib import Path
from collections import Counter, defaultdict

sys.path.insert(0, str(Path(__file__).resolve().parent))                                # _gpl (sedir)
_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402
import _gpl                                                    # noqa: E402

OUT  = _gpl.GPL_DIR / "periksa.txt"
SEG  = re.compile(r":\d+\.\d+$")            # Bilara segmen  (..:0.1 / :5.1)
MD   = re.compile(r":md\d+$")               # chunk md/html  (..:md01)
TERM = re.compile(r"""[.!?…"')\]]\s*$""")   # akhiran kalimat (proxy: BUKAN judul)
WORD_THRESHOLDS = (3, 5, 8, 10, 15, 20)
ECHO_J = 0.8                                # ambang Jaccard query~passage = "echo"


def _w(t):
    return t.split()


def _jacc(a, b):
    sa, sb = set(a), set(b)
    return len(sa & sb) / len(sa | sb) if (sa or sb) else 0.0


def periksa_passage():
    rows = list(_gpl.read_jsonl(_gpl.PASSAGES))
    N = len(rows)
    L = [f"PASSAGE total: {N:,}", f"per-lang: {dict(Counter(r['lang'] for r in rows))}"]

    scheme = defaultdict(Counter)
    for r in rows:
        s = "bilara" if SEG.search(r["pid"]) else "md" if MD.search(r["pid"]) else "lain"
        scheme[r["lang"]][s] += 1
    for lg in sorted(scheme):
        L.append(f"  skema[{lg}]: {dict(scheme[lg])}")

    wc = sorted(len(_w(r["text"])) for r in rows)
    pct = lambda p: wc[min(N - 1, int(p / 100 * N))]                                     # noqa: E731
    L.append(f"kata/passage: mean={sum(wc)/N:.1f} median={st.median(wc)} "
             f"p10/25/50/75/90/99={pct(10)}/{pct(25)}/{pct(50)}/{pct(75)}/{pct(90)}/{pct(99)} max={wc[-1]}")
    for thr in WORD_THRESHOLDS:
        c = sum(1 for x in wc if x < thr)
        L.append(f"  < {thr:>2} kata: {c:>7,} ({100*c/N:5.1f}%)")

    title = sum(1 for r in rows if len(_w(r["text"])) < 8 and not TERM.search(r["text"].strip()))
    L.append(f"proxy judul-struktural (kata<8 & tanpa akhiran kalimat): {title:,} ({100*title/N:.1f}%)")
    return rows, L


def periksa_lintas_bahasa(rows):
    L = ["", "LINTAS-BAHASA (audit alignment md#):"]
    cnt = defaultdict(lambda: {"en": 0, "id": 0})
    for r in rows:
        if not MD.search(r["pid"]):
            continue
        base = r["pid"][3:].rsplit(":md", 1)[0]
        cnt[base][r["lang"]] += 1
    both = [b for b, c in cnt.items() if c["en"] and c["id"]]
    if not both:
        L.append("  (tidak ada dok md dengan en & id)")
        return L
    same = sum(1 for b in both if cnt[b]["en"] == cnt[b]["id"])
    L.append(f"  dok punya en&id (md): {len(both):,}")
    L.append(f"  jumlah chunk SAMA: {same:,} ({100*same/len(both):.1f}%) | "
             f"BEDA: {len(both)-same:,} ({100*(len(both)-same)/len(both):.1f}%)")
    return L


def periksa_query(rows):
    if not _gpl.QUERIES.exists():
        return ["", "QUERY: queries.jsonl belum ada (query-gen masih jalan?) -> dilewati."]
    pid2text = {r["pid"]: r["text"] for r in rows}
    qs = list(_gpl.read_jsonl(_gpl.QUERIES))
    L = ["", f"QUERY total: {len(qs):,}"]

    perp = list(Counter(q["pid"] for q in qs).values())
    L.append(f"  query/passage: mean={sum(perp)/len(perp):.2f} (target {config.GPL_QUERIES_PER_PASSAGE})")
    ql = sorted(len(_w(q["query"])) for q in qs)
    L.append(f"  panjang query: median={st.median(ql)} p90={ql[int(0.9*len(ql))]}")
    dup = len(qs) - len({(q["query"], q["pid"]) for q in qs})
    L.append(f"  duplikat (query,pid): {dup:,} ({100*dup/len(qs):.1f}%)")

    buck = {"<8": [0, 0], ">=8": [0, 0]}        # [echo, total] per bucket panjang passage
    for q in qs:
        pt = pid2text.get(q["pid"])
        if pt is None:
            continue
        b = "<8" if len(_w(pt)) < 8 else ">=8"
        buck[b][1] += 1
        if _jacc(_w(q["query"].lower()), _w(pt.lower())) >= ECHO_J:
            buck[b][0] += 1
    L.append(f"  echo-rate (Jaccard>={ECHO_J}) per panjang passage:")
    for b, (e, t) in buck.items():
        if t:
            L.append(f"    passage {b:>3} kata: {e:,}/{t:,} ({100*e/t:.1f}%)")
    return L


def main():
    rows, L1 = periksa_passage()
    out = "\n".join(["=== PERIKSA DATA GPL (netral; angka saja) ===", ""]
                    + L1 + periksa_lintas_bahasa(rows) + periksa_query(rows)) + "\n"
    print(out)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(out, encoding="utf-8")
    print(f"[saved] {OUT}")


if __name__ == "__main__":
    main()
