"""
5-get-sc-info.py — Unduh metadata: author_edition.json (atribusi penerjemah) &
language.json. Output: src/output/1-get-data/sc-raw/
Usage : python src/code/1-get-data/5-get-sc-info.py
"""

import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402
from _sc import sparse_checkout, copy_file, cleanup            # noqa: E402

TMP_DIR = config.SRC_DIR / "_tmp_info"

# (sparse dir, file relatif, nama output)
FILES = [
    ("additional-info", "author_edition.json", "author_edition.json"),
    ("structure",       "language.json",       "language.json"),
]


def main():
    sparse_dirs = sorted({f[0] for f in FILES})
    tmp = sparse_checkout(sparse_dirs, TMP_DIR)
    print(f"\n3. Menyalin ke {config.RAW_DIR} ...")
    for sparse_dir, src_name, out_name in FILES:
        dst = config.RAW_DIR / out_name
        if copy_file(tmp / sparse_dir / src_name, dst):
            data = json.loads(dst.read_text(encoding="utf-8"))
            print(f"   {out_name} — {len(data)} records")
    cleanup(tmp)
    print("\nSelesai!")


if __name__ == "__main__":
    main()
