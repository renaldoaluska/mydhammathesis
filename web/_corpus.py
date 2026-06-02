"""
_corpus.py — Muat korpus web dari hasil 3-praproses (SATU sumber chunk).

myDhamma TIDAK rebuild korpus dari raw di app.py (beda dgn dhammakathika yang
punya 2 jalur chunking -> sumber bug heading). Di sini korpus web = output
3-praproses, dipakai precompute (semantic) DAN search (BM25/semantic).

Entry: {ref:[chunk_ids], text, heading, parts?, file_base_name, author, source, lang}
"""

import sys
import json
from pathlib import Path

_SRC = next(p / "src" for p in Path(__file__).resolve().parents if (p / "src" / "config.py").exists())
sys.path.insert(0, str(_SRC))
import config                                                  # noqa: E402

TEXT_KEYS = {"pli": "pli_text", "en": "en_text", "id": "id_text"}


def load_corpus(lang, include_blurb=True):
    """List entry korpus satu bahasa (pli/en/id) dari 3-praproses."""
    tk = TEXT_KEYS[lang]
    out = []
    for jsonl in sorted(config.PRAPROSES_DIR.rglob("*_chunked.jsonl")):
        parts = jsonl.relative_to(config.PRAPROSES_DIR).parts
        if len(parts) < 3 or parts[1] != lang:
            continue
        source = parts[0]
        author = jsonl.stem[:-8] if jsonl.stem.endswith("_chunked") else jsonl.stem
        if author == "blurb" and not include_blurb:
            continue
        with open(jsonl, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                doc = json.loads(line)
                base = doc.get("file_base_name", "?")
                for ch in doc.get("chunks", []):
                    t = ch.get(tk, "").strip()
                    if not t:
                        continue
                    e = {"ref": ch.get("chunk_ids", []), "text": t,
                         "heading": ch.get("heading", 0), "file_base_name": base,
                         "author": author, "source": source, "lang": lang}
                    if ch.get("parts"):
                        e["parts"] = ch["parts"]
                    out.append(e)
    return out
