"""
_gpl.py — Helper bersama pipeline GPL (path, IO, loader pasase, prefix e5).

Train = SUTTA saja, bahasa config.GPL_TRAIN_LANGS (en+id). PLI tidak di-GPL
(lihat rencana.txt bagian 4-5). Dipakai 1-query-gen .. 4-train-marginmse.
"""

import sys
import json
from pathlib import Path

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402

GPL_DIR    = config.TRAINING_DIR / "gpl"
MODELS_DIR = config.TRAINING_DIR / "models"
PASSAGES   = GPL_DIR / "passages.jsonl"    # {pid, text, lang}
QUERIES    = GPL_DIR / "queries.jsonl"     # {query, pid}
TRIPLES    = GPL_DIR / "triples.jsonl"     # {query, pos_pid, neg_pid}
TRAIN      = GPL_DIR / "train.jsonl"       # {query, pos, neg, margin}

TEXT_KEYS = ("pli_text", "en_text", "id_text")


def write_jsonl(path, rows):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def read_jsonl(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def chunk_text(chunk):
    for k in TEXT_KEYS:
        v = chunk.get(k, "")
        if v and v.strip():
            return v.strip()
    return ""


def build_passages():
    """Kumpulkan pasase Sutta (bahasa GPL_TRAIN_LANGS) -> PASSAGES, return list.
    pid = '<lang>:<chunk_id>' (unik lintas bahasa). Lewati heading & junk."""
    rows, seen = [], set()
    for jsonl in sorted(config.PRAPROSES_DIR.rglob("*_chunked.jsonl")):
        parts = jsonl.relative_to(config.PRAPROSES_DIR).parts
        if len(parts) < 3:
            continue
        lang = parts[1]
        if lang not in config.GPL_TRAIN_LANGS:
            continue
        for doc in read_jsonl(jsonl):
            base = doc.get("file_base_name", "")
            if not config.is_sutta(base):
                continue
            for ch in doc.get("chunks", []):
                if ch.get("heading", 0):                       # heading bukan pasase konten
                    continue
                text = chunk_text(ch)
                if not text or config.is_junk_body(text, 0):
                    continue
                pid = f"{lang}:{(ch.get('chunk_ids') or [base])[0]}"
                if pid in seen:
                    continue
                seen.add(pid)
                rows.append({"pid": pid, "text": text, "lang": lang})
    write_jsonl(PASSAGES, rows)
    return rows


def load_passages():
    return list(read_jsonl(PASSAGES)) if PASSAGES.exists() else build_passages()


def with_prefix(model_name, text, kind):
    """e5 butuh 'query: '/'passage: '. kind in {'query','passage'}. Lainnya apa adanya."""
    return f"{kind}: {text}" if config.NEEDS_PREFIX.get(model_name, False) else text
