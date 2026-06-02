"""
4-get-sc-tree.py — Unduh hierarki nikaya (structure/tree) untuk browse.
Output: src/output/1-get-data/sc-raw/tree/
Usage : python src/code/1-get-data/4-get-sc-tree.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402
from _sc import sparse_checkout, copy_tree, cleanup            # noqa: E402

TREE_DIR    = config.RAW_DIR / "tree"
TMP_DIR     = config.SRC_DIR / "_tmp_tree"
SPARSE_PATH = "structure/tree"


def main():
    tmp = sparse_checkout([SPARSE_PATH], TMP_DIR)
    print(f"\n3. Menyalin ke {TREE_DIR} ...")
    n = copy_tree(tmp / SPARSE_PATH, TREE_DIR)
    cleanup(tmp)
    print(f"\nSelesai! {n} file -> {TREE_DIR}")


if __name__ == "__main__":
    main()
