"""
4-spot-check.py — Verifikasi POST-chunk menyeluruh atas hasil 3-praproses.

Semua dari hasil chunk (satu lintasan). Tiga hal:
  (A) OUTLIER PANJANG: chunk > 5.000 karakter — artefak parsing (<p> tak tertutup /
      segmen tanpa <br>) vs teks panjang yang sah (Jataka, uddana).
  (B) VERIFIKASI TAGGING: distribusi heading + penanda `structural` (label, end*, namo,
      pe, ...) -> buktikan "potongan struktural" (rule chunk_rules.json + bold-label)
      BENAR ke-tag, bukan bocor jadi body.
  (C) SISA LEAKAGE: pola non-konten (kolofon, judul pendek) yang MASIH lolos sebagai
      body murni (heading=0 & tanpa structural) -> idealnya kecil.

NETRAL: angka + sample. Kesimpulan/keputusan -> rangkuman.
Sumber: src/output/3-praproses (via _load) | Output: src/output/3-praproses/4-spot-check.txt
Usage : python src/code/3-praproses/4-spot-check.py
"""

import sys
import re
from pathlib import Path
from textwrap import shorten
from collections import Counter, defaultdict

sys.path.insert(0, str(Path(__file__).resolve().parent))                                # _load (sedir)
_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402
from _load import iter_chunks, chunk_text, LANG_NAMA           # noqa: E402

CHAR_THRESHOLD = 5000
OUT_TXT = config.PRAPROSES_DIR / "4-spot-check.txt"
TERM = re.compile(r"""[.!?…"')\]]\s*$""")


class Logger:
    def __init__(self, fn):
        Path(fn).parent.mkdir(parents=True, exist_ok=True)
        self.t = sys.stdout; self.f = open(fn, "w", encoding="utf-8")
    def write(self, m): self.t.write(m); self.f.write(m)
    def flush(self): self.t.flush(); self.f.flush()
    def __getattr__(self, name): return getattr(self.t, name)   # proxy isatty/fileno/encoding dll


def pitaka(base):
    b = (base or "").lower()
    if b.startswith("pli-tv") or b.startswith("pli-vi"):
        return "vinaya"
    m = re.match(r"[a-z]+", b)
    if m and m.group(0) in config._ABHIDHAMMA:
        return "abhidhamma"
    return "sutta"


def main():
    sys.stdout = Logger(OUT_TXT)
    print("=== PRAPROSES 4 — VERIFIKASI POST-CHUNK ===\n")

    outliers = []
    heading_dist = Counter()
    structural_dist = Counter()
    leak = defaultdict(lambda: {"n": 0, "pit": Counter(), "samp": []})
    total = body_total = 0

    for src, lang, author, base, ch in iter_chunks():
        text = chunk_text(ch)
        if not text:
            continue
        total += 1
        heading_dist[ch.get("heading", 0)] += 1
        st = ch.get("structural")
        if st:
            structural_dist[st] += 1

        # (A) outlier panjang
        if len(text) > CHAR_THRESHOLD:
            outliers.append({"chars": len(text), "words": len(text.split()),
                             "uid": ch.get("uid", ""), "base": base, "src": src,
                             "lang": lang, "author": author, "heading": ch.get("heading", 0),
                             "preview": shorten(text, width=200, placeholder=" …")})

        # (C) sisa leakage: hanya body MURNI (heading=0 & tanpa structural)
        if ch.get("heading", 0) or ch.get("structural"):
            continue
        body_total += 1
        nw = len(text.split())
        key = None
        if config.is_colophon(text):
            key = "kolofon (End of../Akhir../Selesai..)"
        elif nw <= 5 and not TERM.search(text) and text[:1].isupper():
            key = "judul-pendek (<=5 kata, tanpa akhiran kalimat)"
        if key:
            c = leak[key]
            c["n"] += 1
            c["pit"][pitaka(base)] += 1
            if len(c["samp"]) < 10:
                cid = (ch.get("chunk_ids") or [base])[0]
                c["samp"].append(f"{cid} | {text[:60]}")

    # ── (A) OUTLIER PANJANG ───────────────────────────────────────────────────
    outliers.sort(key=lambda x: -x["chars"])
    print(f"Total chunk diproses : {total:,}\n")
    print(f"[A] OUTLIER > {CHAR_THRESHOLD:,} karakter : {len(outliers)}"
          + (f"  ({len(outliers)/total*100:.4f}%)" if total else ""))
    if outliers:
        print(f"    max karakter         : {max(o['chars'] for o in outliers):,}")
        hdr = (f"    {'#':>3} {'Chars':>6} {'Words':>6} {'H':>2} {'Lang':<4} "
               f"{'Source':<7} {'Author':<16} {'Base/UID':<32}")
        print(hdr); print("    " + "-" * (len(hdr) - 4))
        for i, o in enumerate(outliers, 1):
            label = o["uid"] or o["base"]
            print(f"    {i:>3} {o['chars']:>6,} {o['words']:>6,} {o['heading']:>2} "
                  f"{o['lang']:<4} {o['src']:<7} {o['author']:<16} {label:<32}")
        print("\n    preview teks (maks 200 char):")
        for i, o in enumerate(outliers, 1):
            print(f"     [{i}] {o['uid'] or o['base']} ({o['chars']:,} char, {o['lang']}, {o['src']}/{o['author']})")
            print(f"         {o['preview']}")
    else:
        print("    (tidak ada outlier — aman dari artefak parsing)")
    print()

    # ── (B) VERIFIKASI TAGGING ────────────────────────────────────────────────
    print("[B] VERIFIKASI TAGGING")
    print("    distribusi heading:")
    for h in sorted(heading_dist):
        lab = "body(0)" if h == 0 else f"heading={h}"
        print(f"      {lab:<12}: {heading_dist[h]:,}")
    print("    penanda structural (ke-tag -> kebuang dari body-default + SUMBER latih):")
    if structural_dist:
        for st, n in structural_dist.most_common():
            print(f"      {st:<14}: {n:,}")
    else:
        print("      (TIDAK ADA chunk ber-structural — cek chunk_rules.json & 1-chunk!)")
    print()

    # ── (C) SISA LEAKAGE ──────────────────────────────────────────────────────
    print(f"[C] SISA LEAKAGE di body murni (heading=0 & tanpa structural) — total body: {body_total:,}")
    if leak:
        for key, c in sorted(leak.items(), key=lambda kv: -kv[1]["n"]):
            print(f"    [{key}]  {c['n']:,}  ({100*c['n']/max(body_total,1):.2f}% dari body)")
            print(f"       sebaran pitaka: {dict(c['pit'])}")
            for s in c["samp"]:
                print(f"       - {s}")
    else:
        print("    (tidak ada pola leakage terdeteksi)")

    print(f"\n[INFO] {OUT_TXT}")
    print("=== SELESAI ===")


if __name__ == "__main__":
    main()
