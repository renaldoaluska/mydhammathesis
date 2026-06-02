"""
search.py — Engine pencarian myDhamma. Dipakai app.py (Flask) & 5-eval/1-precompute.py.

  Makna     = semantic (dense, embedding cache web/precompute; e5 pakai prefix)
  Kata Kunci= BM25 (rank_bm25 BM25Okapi)  -- upgrade dari substring dhammakathika
  Hybrid    = RRF(semantic, keyword), k=60

Korpus SATU sumber = 3-praproses (via _corpus). Embedding semantic dari cache.
Entry hasil: {ref, text, heading, parts?, file_base_name, author, source, lang, score}
"""

import os
os.environ["HF_HUB_TRUST_REMOTE_CODE"] = "1"

import sys
import re
import pickle
import unicodedata
from pathlib import Path

_SRC = next(p / "src" for p in Path(__file__).resolve().parents if (p / "src" / "config.py").exists())
sys.path.insert(0, str(_SRC))
import config                                                  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _corpus import load_corpus                                # noqa: E402

EMB_DIR = config.EMBEDDINGS_DIR / "web"
RRF_K   = 60

_model_cache: dict = {}
_emb_cache: dict = {}      # (clean_model, lang) -> (corpus, embeddings)
_bm25_cache: dict = {}     # lang -> (corpus, bm25)


# ── teks util ──────────────────────────────────────────────────────────────
def _strip(t):
    t = unicodedata.normalize("NFD", t or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t).strip().lower()


def _tok(t):
    return [w for w in _strip(t).split() if w]


def _needs_prefix(name):
    return "e5" in name.lower()


def _ok(entry, include_titles, include_blurb):
    if not include_titles and entry.get("heading", 0) > 0:
        return False
    if not include_blurb and entry.get("author") == "blurb":
        return False
    return True


# ── loaders (cached) ─────────────────────────────────────────────────────────
def _load_model(name):
    from sentence_transformers import SentenceTransformer
    if name not in _model_cache:
        _model_cache[name] = SentenceTransformer(config.resolve_model(name), trust_remote_code=True)
    return _model_cache[name]


def _load_semantic(model_clean, lang):
    """(corpus, embeddings) dari cache web/precompute; (None,None) kalau belum ada."""
    key = (model_clean, lang)
    if key in _emb_cache:
        return _emb_cache[key]
    emb_p  = EMB_DIR / f"embed_{lang}_{model_clean}.pt"
    meta_p = EMB_DIR / f"meta_{lang}_{model_clean}.pkl"
    if not (emb_p.exists() and meta_p.exists()):
        _emb_cache[key] = (None, None)
        return None, None
    import torch
    emb = torch.load(emb_p, map_location="cpu")
    with open(meta_p, "rb") as f:
        corpus = pickle.load(f)
    _emb_cache[key] = (corpus, emb)
    return corpus, emb


def _load_bm25(lang):
    if lang in _bm25_cache:
        return _bm25_cache[lang]
    from rank_bm25 import BM25Okapi
    corpus = load_corpus(lang)
    bm25 = BM25Okapi([_tok(c["text"]) for c in corpus]) if corpus else None
    _bm25_cache[lang] = (corpus, bm25)
    return corpus, bm25


# ── metode ───────────────────────────────────────────────────────────────────
def semantic_search(query, model_name, lang, top_k=10, include_titles=True, include_blurb=True):
    import torch
    from sentence_transformers import util
    corpus, emb = _load_semantic(Path(model_name).name, lang)
    if corpus is None:
        return []   # belum di-precompute
    model = _load_model(model_name)
    q = f"query: {query}" if _needs_prefix(model_name) else query
    qe = model.encode(q, convert_to_tensor=True, normalize_embeddings=True)
    scores = util.cos_sim(qe, emb)[0]
    idx = torch.topk(scores, min(len(corpus), top_k * 5)).indices.tolist()
    out = []
    for i in idx:
        e = corpus[i]
        if not _ok(e, include_titles, include_blurb):
            continue
        out.append({**e, "score": float(scores[i])})
        if len(out) >= top_k:
            break
    return out


def keyword_search(query, lang, top_k=10, include_titles=True, include_blurb=True):
    corpus, bm25 = _load_bm25(lang)
    if not bm25:
        return []
    scores = bm25.get_scores(_tok(query))
    order = sorted(range(len(corpus)), key=lambda i: -scores[i])
    out = []
    for i in order:
        if scores[i] <= 0:
            break
        e = corpus[i]
        if not _ok(e, include_titles, include_blurb):
            continue
        out.append({**e, "score": float(scores[i])})
        if len(out) >= top_k:
            break
    return out


def rrf_fuse(result_lists, top_k=10, k=RRF_K):
    agg = {}
    for results in result_lists:
        for rank, e in enumerate(results):
            ref = tuple(e.get("ref") or [e.get("file_base_name")])
            if ref not in agg:
                agg[ref] = {"entry": e, "rrf": 0.0}
            agg[ref]["rrf"] += 1.0 / (k + rank + 1)
    fused = sorted(agg.values(), key=lambda x: -x["rrf"])
    return [{**x["entry"], "score": round(x["rrf"], 6)} for x in fused[:top_k]]


def search(query, method, model_name, lang, top_k=10, include_titles=True, include_blurb=True):
    """method: 'semantic' | 'keyword' | 'hybrid'. lang: satu korpus (id/en/pli)."""
    if method == "semantic":
        return semantic_search(query, model_name, lang, top_k, include_titles, include_blurb)
    if method == "keyword":
        return keyword_search(query, lang, top_k, include_titles, include_blurb)
    # hybrid
    sem = semantic_search(query, model_name, lang, top_k * 3, include_titles, include_blurb)
    kw  = keyword_search(query, lang, top_k * 3, include_titles, include_blurb)
    return rrf_fuse([sem, kw], top_k)
