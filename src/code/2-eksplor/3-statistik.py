"""
3-statistik.py — Statistik deskriptif korpus hasil chunking (untuk bab Data).

Pertanyaan : Seperti apa sebaran korpus Tipitaka setelah chunking?
Menghasilkan: distribusi dokumen & chunk per bahasa, ketersediaan per koleksi
              (nikaya/pitaka), distribusi panjang karakter & kata.
Sumber     : src/output/3-praproses/**/*_chunked.jsonl
Output     : src/output/2-eksplor/3-statistik.txt + 3-statistik/*.png
Usage      : python src/code/2-eksplor/3-statistik.py
"""

import sys
import re
from pathlib import Path
from collections import defaultdict

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
OUT_DIR = config.EKSPLOR_DIR
FIG_DIR = OUT_DIR / "3-statistik"
OUT_TXT = OUT_DIR / "3-statistik.txt"
FIG_DIR.mkdir(parents=True, exist_ok=True)


class Logger:
    def __init__(self, filename):
        Path(filename).parent.mkdir(parents=True, exist_ok=True)
        self.terminal = sys.stdout
        self.log = open(filename, "w", encoding="utf-8")
    def write(self, m): self.terminal.write(m); self.log.write(m)
    def flush(self): self.terminal.flush(); self.log.flush()


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
    print("=== EKSPLOR 1 — STATISTIK DESKRIPTIF KORPUS ===\n")

    docs   = defaultdict(set)          # lang -> {base}
    nchunk = defaultdict(int)          # lang -> jumlah chunk
    kitab  = defaultdict(lambda: defaultdict(set))  # lang -> koleksi -> {base}
    char_rows, word_rows = [], []

    for src, lang, author, base, ch in iter_chunks():
        text = chunk_text(ch)
        if not text:
            continue
        docs[lang].add(base)
        nchunk[lang] += 1
        kitab[lang][koleksi(base)].add(base)
        nm = LANG_NAMA.get(lang, lang)
        char_rows.append({"Bahasa": nm, "Karakter": len(text)})
        word_rows.append({"Bahasa": nm, "Kata": len(text.split())})

    if not nchunk:
        print("Tidak ada chunk ditemukan. Jalankan 3-praproses/1-chunk.py dulu.")
        return

    # 1. Dokumen & chunk per bahasa
    print("1. Dokumen & chunk per bahasa")
    df_lang = pd.DataFrame([
        {"Bahasa": LANG_NAMA.get(l, l), "Dokumen": len(docs[l]), "Chunk": nchunk[l]}
        for l in sorted(nchunk)
    ])
    print(df_lang.to_string(index=False))
    print(f"   Total chunk: {sum(nchunk.values()):,}")
    fig, ax = plt.subplots(figsize=(8, 5))
    sns.barplot(data=df_lang, x="Bahasa", y="Chunk", palette="viridis", ax=ax)
    ax.set_title("Jumlah Chunk per Bahasa")
    for i, r in df_lang.iterrows():
        ax.text(i, r["Chunk"], f"{r['Chunk']:,}", ha="center", va="bottom")
    simpan(fig, "1-chunk-per-bahasa.png")

    # 2. Ketersediaan dokumen per koleksi
    print("\n2. Dokumen per koleksi (nikaya/pitaka)")
    rows = [{"Koleksi": k, "Bahasa": LANG_NAMA.get(l, l), "Dokumen": len(b)}
            for l in kitab for k, b in kitab[l].items()]
    df_k = pd.DataFrame(rows)
    print(df_k.pivot(index="Koleksi", columns="Bahasa", values="Dokumen").fillna(0).astype(int).to_string())
    fig, ax = plt.subplots(figsize=(12, 6))
    sns.barplot(data=df_k, x="Koleksi", y="Dokumen", hue="Bahasa", palette="Set2", ax=ax)
    ax.set_title("Dokumen per Koleksi"); plt.xticks(rotation=45, ha="right")
    simpan(fig, "2-dokumen-per-koleksi.png")

    # 3. Distribusi panjang karakter & kata
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
    ax.set_title("Distribusi Jumlah Kata per Chunk")
    ax.set_ylim(0, df_w["Kata"].quantile(0.99))
    simpan(fig, "4-panjang-kata.png")

    print(f"\n[INFO] Ringkasan: {OUT_TXT}\n[INFO] Grafik: {FIG_DIR}/\n=== SELESAI ===")


if __name__ == "__main__":
    main()
