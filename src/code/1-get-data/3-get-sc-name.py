"""
3-get-sc-name.py — Unduh nama sutta (sc_bilara_data/root/misc/site/name).
Output: src/output/1-get-data/sc-raw/name/
Usage : python src/code/1-get-data/3-get-sc-name.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402
from _sc import sparse_checkout, copy_tree, cleanup            # noqa: E402

NAME_DIR    = config.RAW_DIR / "name"
TMP_DIR     = config.SRC_DIR / "_tmp_name"
SPARSE_PATH = "sc_bilara_data/root/misc/site/name"


def main():
    tmp = sparse_checkout([SPARSE_PATH], TMP_DIR)
    print(f"\n3. Menyalin ke {NAME_DIR} ...")
    n = copy_tree(tmp / SPARSE_PATH, NAME_DIR)
    cleanup(tmp)
    print(f"\nSelesai! {n} file -> {NAME_DIR}")


if __name__ == "__main__":
    main()
