"""
1-get-sc-bilara.py — Unduh sc_bilara_data dari SuttaCentral (mirror struktur asli).

Mengambil (Theravada/pli-ms saja):
  - sc_bilara_data/html/pli/ms          (sec: JSON struktur HTML)
  - sc_bilara_data/root/pli/ms          (pli: teks akar Pali)
  - sc_bilara_data/root/en/blurb        (blurb EN: ringkasan sutta)
  - sc_bilara_data/translation/id/blurb (blurb ID)
  - sc_bilara_data/translation/en       (EN, difilter ke ID kanon Pali)
  - sc_bilara_data/_author.json

Output: src/output/1-get-data/sc-raw/sc_bilara_data/...
Usage : python src/code/1-get-data/1-get-sc-bilara.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))                                # _sc (sedir)
_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                                            # noqa: E402
from _sc import sparse_checkout, copy_tree, copy_file, cleanup                           # noqa: E402

BILARA_DIR = config.RAW_DIR / "sc_bilara_data"
TMP_DIR    = config.SRC_DIR / "_tmp_bilara"

SPARSE_PATHS = [
    "sc_bilara_data/html/pli/ms",
    "sc_bilara_data/root/pli/ms",
    "sc_bilara_data/root/en/blurb",
    "sc_bilara_data/translation/id/blurb",
    "sc_bilara_data/translation/en",
    "sc_bilara_data/_author.json",
]


def main():
    tmp = sparse_checkout(SPARSE_PATHS, TMP_DIR)
    print(f"\n3. Menyalin ke {BILARA_DIR} ...")

    valid_bases = set()   # ID kanon Pali — diisi dari pli/ms, dipakai filter terjemahan
    total = 0
    for sp in SPARSE_PATHS:
        src = tmp / sp
        rel = sp.replace("sc_bilara_data/", "", 1)
        dst = BILARA_DIR / rel

        if src.is_file():                                   # _author.json
            n = copy_file(src, dst)
        elif "pli/ms" in sp:                                # html(sec) + root pli: kumpulkan ID
            for f in src.rglob("*.json"):
                valid_bases.add(f.name.split('_')[0])
            n = copy_tree(src, dst)
        elif "blurb" in sp:                                 # blurb tidak difilter
            n = copy_tree(src, dst)
        elif "translation" in sp:                           # hanya ID yang ada di kanon Pali
            n = copy_tree(src, dst, keep=lambda b: b in valid_bases)
        else:
            n = copy_tree(src, dst)

        print(f"   {rel}: {n} file")
        total += n

    cleanup(tmp)
    print(f"\nSelesai! Total {total} file -> {BILARA_DIR}")


if __name__ == "__main__":
    main()
