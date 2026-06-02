"""
2-get-sc-htmltext.py — Unduh html_text (terjemahan format HTML) dari SuttaCentral.

Mengambil html_text/id/pli (ID, mis. Anggara) & html_text/en/pli (EN non-bilara).
Output: src/output/1-get-data/sc-raw/html_text/...
Usage : python src/code/1-get-data/2-get-sc-htmltext.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                              # noqa: E402
from _sc import sparse_checkout, copy_tree, cleanup                        # noqa: E402

HTMLTEXT_DIR = config.RAW_DIR / "html_text"
TMP_DIR      = config.SRC_DIR / "_tmp_htmltext"

SPARSE_PATHS = ["html_text/id/pli", "html_text/en/pli"]


def main():
    tmp = sparse_checkout(SPARSE_PATHS, TMP_DIR)
    print(f"\n3. Menyalin ke {HTMLTEXT_DIR} ...")

    total = 0
    for sp in SPARSE_PATHS:
        rel = sp.replace("html_text/", "", 1)
        n = copy_tree(tmp / sp, HTMLTEXT_DIR / rel, pattern="*.html")
        print(f"   {rel}: {n} file")
        total += n

    cleanup(tmp)
    if total == 0:
        print("\nERROR: tidak ada file tersalin.")
        sys.exit(1)
    print(f"\nSelesai! Total {total} file -> {HTMLTEXT_DIR}")


if __name__ == "__main__":
    main()
