"""
_load.py — Iterator chunk dari 3-praproses (dipakai skrip eksplor; no redundan).

Format chunk myDhamma: tiap *_chunked.jsonl punya baris {file_base_name, chunks[]},
tiap chunk punya salah satu text_key (pli_text/en_text/id_text) + (bilara/html) heading.
Path: 3-praproses/<source>/<lang>/<author>_chunked.jsonl
"""

import sys
import json
from pathlib import Path

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402

PRAPROSES_DIR = config.PRAPROSES_DIR
TEXT_KEYS = ("pli_text", "en_text", "id_text")
LANG_NAMA = {"pli": "Pali", "en": "Inggris", "id": "Indonesia"}


def chunk_text(chunk):
    for k in TEXT_KEYS:
        v = chunk.get(k, "")
        if v and v.strip():
            return v.strip()
    return ""


def iter_chunks(source=None):
    """Yield (source, lang, author, file_base, chunk) dari semua *_chunked.jsonl."""
    for jsonl in sorted(PRAPROSES_DIR.rglob("*_chunked.jsonl")):
        parts = jsonl.relative_to(PRAPROSES_DIR).parts        # (source, lang, file)
        if len(parts) < 3:
            continue
        src, lang = parts[0], parts[1]
        if source and src != source:
            continue
        author = jsonl.stem[:-8] if jsonl.stem.endswith("_chunked") else jsonl.stem
        with open(jsonl, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                doc = json.loads(line)
                for ch in doc.get("chunks", []):
                    yield src, lang, author, doc.get("file_base_name", "?"), ch
