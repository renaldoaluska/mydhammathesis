"""
2-statistik.py — Statistik deskriptif + VERIFIKASI chunk hasil 3-praproses.

POST-chunking (untuk bab Data): distribusi dokumen & chunk per bahasa, ketersediaan
per koleksi, panjang karakter/kata, + verifikasi (heading ter-tag, junk bersih).
Sumber: src/output/3-praproses/**/*_chunked.jsonl
Output: src/output/3-praproses/2-statistik.txt + 2-statistik/*.png
Usage : python src/code/3-praproses/2-statistik.py
"""

import sys
import re
from pathlib import Path
from collections import defaultdict, Counter

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt                                # noqa: E402
import pandas as pd                                            # noqa: E402
import seaborn as sns                                          # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))                                # _load (sedir)
_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402
from _load import iter_chunks, chunk_text, LANG_NAMA           # noqa: E402

sns.set_theme(style="whitegrid")
OUT_DIR = config.PRAPROSES_DIR
FIG_DIR = OUT_DIR / "2-statistik"
OUT_TXT = OUT_DIR / "2-statistik.txt"
FIG_DIR.mkdir(parents=True, exist_ok=True)


class Logger:
    def __init__(self, fn):
        Path(fn).parent.mkdir(parents=True, exist_ok=True)
        self.t = sys.stdout; self.f = open(fn, "w", encoding="utf-8")
    def write(self, m): self.t.write(m); self.f.write(m)
    def flush(self): self.t.flush(); self.f.flush()
    def __getattr__(self, name): return getattr(self.t, name)   # proxy isatty/fileno/encoding dll


def simpan(fig, nama):
    path = FIG_DIR / nama
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"   [grafik] {path}")


def koleksi(base):
    m = re.match(r"([a-zA-Z]+)", base or "")
    return m.group(1).upper() if m else "LAINNYA"


def main():
    sys.stdout = Logger(OUT_TXT)
    print("=== PRAPROSES 2 — STATISTIK & VERIFIKASI CHUNK ===\n")

    docs   = defaultdict(set)
    nchunk = defaultdict(int)
    kitab  = defaultdict(lambda: defaultdict(set))
    heading = Counter()
    htag = Counter()          # rincian heading=1: <h1> asli vs judul <li>/<p> di <header>
    junk_left = 0
    char_rows, word_rows, char_lens = [], [], []

    for src, lang, author, base, ch in iter_chunks():
        text = chunk_text(ch)
        if not text:
            continue
        h = ch.get("heading", 0)
        heading[h] += 1
        if h == 1:
            htag["header" if ch.get("tag") in ("li", "p") else "h1"] += 1
        if config.is_junk_body(text, h):
            junk_left += 1
        docs[lang].add(base)
        nchunk[lang] += 1
        kitab[lang][koleksi(base)].add(base)
        nm = LANG_NAMA.get(lang, lang)
        char_rows.append({"Bahasa": nm, "Karakter": len(text)})
        word_rows.append({"Bahasa": nm, "Kata": len(text.split())})
        char_lens.append(len(text))

    if not nchunk:
        print("Tidak ada chunk. Jalankan 1-chunk.py dulu.")
        return

    # 1. Dokumen & chunk per bahasa
    print("1. Dokumen & chunk per bahasa")
    df_lang = pd.DataFrame([{"Bahasa": LANG_NAMA.get(l, l), "Dokumen": len(docs[l]), "Chunk": nchunk[l]}
                            for l in sorted(nchunk)])
    print(df_lang.to_string(index=False))
    print(f"   Total chunk: {sum(nchunk.values()):,}")
    fig, ax = plt.subplots(figsize=(8, 5))
    sns.barplot(data=df_lang, x="Bahasa", y="Chunk", palette="viridis", ax=ax)
    ax.set_title("Jumlah Chunk per Bahasa")
    for i, r in df_lang.iterrows():
        ax.text(i, r["Chunk"], f"{r['Chunk']:,}", ha="center", va="bottom")
    simpan(fig, "1-chunk-per-bahasa.png")

    # 2. Per koleksi
    print("\n2. Dokumen per koleksi (nikaya/pitaka)")
    df_k = pd.DataFrame([{"Koleksi": k, "Bahasa": LANG_NAMA.get(l, l), "Dokumen": len(b)}
                         for l in kitab for k, b in kitab[l].items()])
    print(df_k.pivot(index="Koleksi", columns="Bahasa", values="Dokumen").fillna(0).astype(int).to_string())
    fig, ax = plt.subplots(figsize=(12, 6))
    sns.barplot(data=df_k, x="Koleksi", y="Dokumen", hue="Bahasa", palette="Set2", ax=ax)
    ax.set_title("Dokumen per Koleksi"); plt.xticks(rotation=45, ha="right")
    simpan(fig, "2-dokumen-per-koleksi.png")

    # 3. Panjang karakter & kata
    print("\n3. Distribusi panjang (karakter)")
    df_c = pd.DataFrame(char_rows)
    print(df_c.groupby("Bahasa")["Karakter"].describe().round(1).to_string())
    fig, ax = plt.subplots(figsize=(10, 6))
    for nm, sub in df_c.groupby("Bahasa"):
        sns.kdeplot(sub["Karakter"], label=nm, fill=True, ax=ax)
    ax.set_title("Distribusi Panjang Karakter Chunk"); ax.set_xlim(0, 1000); ax.legend()
    simpan(fig, "3-panjang-karakter.png")

    print("\n4. Distribusi panjang (kata)")
    df_w = pd.DataFrame(word_rows)
    print(df_w.groupby("Bahasa")["Kata"].describe().round(1).to_string())
    fig, ax = plt.subplots(figsize=(10, 6))
    sns.boxplot(data=df_w, x="Bahasa", y="Kata", palette="Set2", ax=ax)
    ax.set_title("Distribusi Jumlah Kata per Chunk"); ax.set_ylim(0, df_w["Kata"].quantile(0.99))
    simpan(fig, "4-panjang-kata.png")

    # 5. VERIFIKASI
    print("\n5. VERIFIKASI CHUNK")
    body = heading.get(0, 0)
    print(f"   body (heading=0): {body:,}")
    for lvl in range(1, 7):
        if heading.get(lvl):
            print(f"   heading h{lvl}: {heading[lvl]:,}")
            if lvl == 1 and htag:
                print(f"      - <h1> asli             : {htag.get('h1', 0):,}")
                print(f"      - judul <li>/<p> header : {htag.get('header', 0):,}  (di-tag heading=1 utk exclude dari body)")
    print(f"   Junk tersisa di output: {junk_left}")
    char_lens.sort()
    p99 = char_lens[min(len(char_lens) - 1, int(len(char_lens) * 0.99))]
    big = sum(1 for x in char_lens if x > 5000)
    print(f"   Panjang char: max={char_lens[-1]:,}, p99={p99:,}; chunk >5000 char: {big}")

    print(f"\n[INFO] Ringkasan: {OUT_TXT}\n[INFO] Grafik: {FIG_DIR}/\n=== SELESAI ===")


if __name__ == "__main__":
    main()
