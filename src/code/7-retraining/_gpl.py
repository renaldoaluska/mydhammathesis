"""
_gpl.py — Helper bersama pipeline GPL (path, IO, loader pasase, prefix e5).

Train = bahasa config.GPL_TRAIN_LANGS (en+id); cakupan pitaka diatur
config.GPL_SUTTA_ONLY (default False = CANON-WIDE: Vinaya+Sutta+Abhidhamma,
sesuai judul "Kanon Pali"). PLI (original) tidak di-GPL (lihat rencana.txt
bagian 4-5). Dipakai 1-query-gen .. 4-train-marginmse.
"""

import os
import sys
import json
from pathlib import Path

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402

exp_dir = os.environ.get("GPL_EXP_DIR", "gpl")
GPL_DIR    = config.OUTPUT_DIR / "7-retraining" / exp_dir
MODELS_DIR = config.OUTPUT_DIR / "7-retraining" / "models"
PASSAGES   = GPL_DIR / "passages.jsonl"    # {pid, text, lang}
QUERIES    = GPL_DIR / "queries.jsonl"     # {query, pid}
TRIPLES    = GPL_DIR / "triples.jsonl"     # {query, pos_pid, neg_pid}
TRAIN      = GPL_DIR / "train.jsonl"       # {query, pos, neg, margin}

TEXT_KEYS = ("pli_text", "en_text", "id_text")

# Guard: pipeline retraining HANYA boleh nulis di bawah output/7-retraining/.
# Cegah clobber data base (4-training/gpl) gara-gara salah import _gpl / GPL_EXP_DIR.
_WRITE_ROOT = (config.OUTPUT_DIR / "7-retraining").resolve()


def write_jsonl(path, rows):
    path = Path(path).resolve()
    if _WRITE_ROOT != path and _WRITE_ROOT not in path.parents:
        raise SystemExit(f"[_gpl guard] TOLAK nulis di luar 7-retraining: {path}\n"
                         f"            cek `import _gpl` (harus yg lokal 7-retraining) & GPL_EXP_DIR.")
    path.parent.mkdir(parents=True, exist_ok=True)
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
    """Kumpulkan pasase (bahasa GPL_TRAIN_LANGS) -> PASSAGES, return list.
    Cakupan pitaka ikut config.GPL_SUTTA_ONLY (False = canon-wide; True = Sutta saja).
    pid = '<lang>:<author>:<chunk_id>' (author dari nama file -> unik per terjemahan,
    cegah tabrakan md#/seg antar author). Lewati heading & junk."""
    rows, seen = [], set()
    for jsonl in sorted(config.PRAPROSES_DIR.rglob("*_chunked.jsonl")):
        parts = jsonl.relative_to(config.PRAPROSES_DIR).parts
        if len(parts) < 3:
            continue
        lang = parts[1]
        if lang not in config.GPL_TRAIN_LANGS:
            continue
        if jsonl.stem.startswith("blurb"):          # ringkasan editorial (EN-only), bukan teks
            continue                                # kanonik -> tidak dilatih (tetap di-indeks web)
        author = jsonl.stem[:-len("_chunked")]      # author dari nama file -> id unik per terjemahan
        for doc in read_jsonl(jsonl):
            base = doc.get("file_base_name", "")
            if config.GPL_SUTTA_ONLY and not config.is_sutta(base):   # canon-wide bila False
                continue
            for ch in doc.get("chunks", []):
                if ch.get("heading", 0) or ch.get("structural"):   # heading/kolofon bukan pasase konten
                    continue
                text = chunk_text(ch)
                if not text or config.is_junk_body(text, 0):
                    continue
                if len(text.split()) < config.GPL_MIN_WORDS:       # sumber latih lemah (judul/fragmen)
                    continue
                pid = f"{lang}:{author}:{(ch.get('chunk_ids') or [base])[0]}"
                if pid in seen:
                    continue
                seen.add(pid)
                rows.append({"pid": pid, "text": text, "lang": lang, "author": author})
    write_jsonl(PASSAGES, rows)
    return rows


def load_passages():
    return list(read_jsonl(PASSAGES)) if PASSAGES.exists() else build_passages()


def load_queries(valid_pids=None):
    """Baca queries.jsonl. Bila valid_pids diberi -> hanya kueri yang pid-nya lolos
    filter passage (mis. setelah min-words). Jaga sinkron query<->passage bersih."""
    qs = list(read_jsonl(QUERIES)) if QUERIES.exists() else []
    if valid_pids is not None:
        qs = [q for q in qs if q["pid"] in valid_pids]
    return qs


def with_prefix(model_name, text, kind):
    """e5 butuh 'query: '/'passage: '. kind in {'query','passage'}. Lainnya apa adanya."""
    return f"{kind}: {text}" if config.NEEDS_PREFIX.get(model_name, False) else text
