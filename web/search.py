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
import threading
import unicodedata
from pathlib import Path

_SRC = next(p / "src" for p in Path(__file__).resolve().parents if (p / "src" / "config.py").exists())
sys.path.insert(0, str(_SRC))
import config                                                  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _corpus import load_corpus                                # noqa: E402

EMB_DIR = config.EMBEDDINGS_DIR / "web"
RRF_K   = 60

# ── Kata-Kunci sadar-frasa (HANYA web-md, BUKAN baseline eval) ────────────────
# web-eval & metrik (5-eval/1-build-cache.py) pakai keyword_search() MURNI = BM25
# Okapi [12], beku. keyword_search_phrase() di bawah = peningkatan PRODUK web-md:
# BM25 + bonus frasa-utuh + bonus cakupan-kata. Bobot di-skala idf biar adil
# lintas-kueri & length-independent (nambal Ud 8.3 yg ke-penalti panjang).
W_PHRASE    = 3.0   # bonus per kemunculan frasa query utuh (× idf frasa)
W_COVERAGE  = 1.0   # bonus per kata-query distinct yg hadir   (× idf kata)
PHRASE_CAP  = 3     # saturasi: frasa berulang >3× tak nambah skor

_model_cache: dict = {}
_emb_cache: dict = {}      # (clean_model, lang) -> (corpus, embeddings)
_bm25_cache: dict = {}     # lang -> (corpus, bm25)
_load_lock = threading.Lock()  # serialize cold-load lintas thread (gunicorn --threads):
                               # tanpa ini 2 request bisa dobel-load model yg sama -> spike VRAM/OOM


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
        
    # Buang semua chunk yang kurang dari 3 kata, TAPI KHUSUS dari kitab Vinaya
    # (karena Vinaya yang paling banyak isi sub-judul pendek kayak "Definisi", "Brahmana")
    words = [w for w in entry.get("text", "").split() if w.strip()]
    
    # 1. Buang judul yang cuma sepotong huruf/simbol/angka di SEMUA kitab
    if len(words) == 1 and len(words[0]) <= 1:
        return False
        
    # 2. Buang judul pendek (< 3 kata) khusus Vinaya
    if len(words) < 3 and entry.get("file_base_name", "").startswith(("pli-tv-", "pli-vi-")):
        return False
        
    if not include_blurb and entry.get("author") == "blurb":
        return False
    return True


# ── loaders (cached) ─────────────────────────────────────────────────────────
def _load_model(name):
    m = _model_cache.get(name)
    if m is not None:
        return m
    with _load_lock:                       # re-check di dalam lock (double-checked)
        if name not in _model_cache:
            # EMBED_DEVICE (mis. "cpu") -> taruh embedding di CPU; default biarkan ST auto-pilih
            # (cuda kalau ada). web-md set "cpu" supaya GPU 12GB dipakai penuh chat LLM 14b.
            _dev = os.environ.get("EMBED_DEVICE")
            _kw = {"device": _dev} if _dev else {}
            _model_cache[name] = config.load_st_model(name, **_kw)
    return _model_cache[name]


def _load_semantic(model_clean, lang):
    """(corpus, embeddings) dari cache web/precompute; (None,None) kalau belum ada."""
    key = (model_clean, lang)
    if key in _emb_cache:
        return _emb_cache[key]
    with _load_lock:
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
    with _load_lock:
        if lang in _bm25_cache:
            return _bm25_cache[lang]
        from rank_bm25 import BM25Okapi
        corpus = load_corpus(lang)
        bm25 = BM25Okapi([_tok(c["text"]) for c in corpus]) if corpus else None
        # teks ter-normalisasi (lower/no-diakritik/1-spasi) utk substring frasa & cek kata.
        # keyword_search() murni tak memakainya; cuma keyword_search_phrase (web-md).
        stripped = [_strip(c["text"]) for c in corpus]
        _bm25_cache[lang] = (corpus, bm25, stripped)
        return corpus, bm25, stripped


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
    # Samakan device DAN dtype query ke embedding korpus sebelum cos_sim:
    # - device: cache korpus selalu CPU, query bisa mendarat di GPU (model cuda).
    # - dtype : embedding gte di-precompute fp16, e5/bge fp32. Loader kini pin model
    #   ke fp32 (kompat transformers v5) → query fp32; cast ke dtype korpus biar
    #   torch.mm tak "Float != Half". Cast di query (kecil) → korpus tak disalin.
    qe = qe.to(device=emb.device, dtype=emb.dtype)
    scores = util.cos_sim(qe, emb)[0]
    idx = torch.topk(scores, min(len(corpus), top_k * 5)).indices.tolist()
    out = []
    for i in idx:
        e = corpus[i]
        if not _ok(e, include_titles, include_blurb):
            continue
        # corpus_idx = posisi chunk di korpus (dibangun urut dokumen per-file),
        # dipakai konsumen utk sort fragmen dalam-sutta secara urutan-baca.
        out.append({**e, "score": float(scores[i]), "score_type": "cosine", "corpus_idx": i})
        if len(out) >= top_k:
            break
    return out


def keyword_search(query, lang, top_k=10, include_titles=True, include_blurb=True):
    corpus, bm25, _stripped = _load_bm25(lang)
    if not bm25:
        return []
    scores = bm25.get_scores(_tok(query))
    import torch
    import numpy as np
    scores_t = torch.tensor(np.array(scores))
    k_needed = min(len(corpus), top_k * 5)
    if k_needed == 0:
        return []
    top = torch.topk(scores_t, k_needed)
    
    out = []
    for i, score in zip(top.indices.tolist(), top.values.tolist()):
        if score <= 0:
            break
        e = corpus[i]
        if not _ok(e, include_titles, include_blurb):
            continue
        out.append({**e, "score": float(score), "score_type": "bm25", "corpus_idx": i})
        if len(out) >= top_k:
            break
    return out


def keyword_search_phrase(query, lang, top_k=10, include_titles=True, include_blurb=True):
    """Kata-Kunci sadar-frasa untuk web-md (BUKAN baseline eval).
    skor = BM25 + W_PHRASE·frasa_utuh·idf_frasa + W_COVERAGE·Σidf(kata hadir).
    Bonus di-skala idf → length-independent: pasase yg memuat frasa query utuh
    (mis. Ud 8.3 'yang tidak dilahirkan') terangkat walau panjang/ke-saturasi BM25.
    Tiap entri membawa kw_count (kata-query distinct hadir) & phrase_count (frasa)."""
    import numpy as np
    corpus, bm25, stripped = _load_bm25(lang)
    if not bm25:
        return []
    q_tokens = _tok(query)
    if not q_tokens:
        return []
    q_terms   = list(dict.fromkeys(q_tokens))            # distinct, urutan dipertahankan
    q_phrase  = _strip(query)
    multiword = len(q_tokens) > 1
    term_idf  = {t: max(bm25.idf.get(t, 0.0), 0.0) for t in q_terms}
    phrase_idf = sum(term_idf.values()) or 1.0

    bm = bm25.get_scores(q_tokens)
    if len(corpus) == 0:
        return []
    # Kandidat = top-N BM25 ∪ semua dokumen yg memuat frasa utuh (yg BM25 mungkin
    # kubur karena penalti panjang). Sisanya tak mungkin menang setelah bonus.
    n_top = min(len(corpus), max(top_k * 8, 80))
    cand = set(np.argsort(-bm)[:n_top].tolist())
    if multiword:
        cand.update(i for i, s in enumerate(stripped) if q_phrase in s)

    # Hitung kata/frasa pakai word-boundary regex (BUKAN split) supaya tanda baca
    # yg nempel — "dilahirkan," — tetap kehitung. _strip tak buang tanda baca; itu
    # bug laten tokenisasi lama, TAPI baseline BM25 (_tok) tak diutak agar eval beku.
    term_re   = {t: re.compile(r"(?<!\w)" + re.escape(t) + r"(?!\w)") for t in q_terms}
    phrase_re = re.compile(r"(?<!\w)" + re.escape(q_phrase) + r"(?!\w)") if multiword else None

    scored = []
    for i in cand:
        text = stripped[i]
        pc = min(len(phrase_re.findall(text)), PHRASE_CAP) if phrase_re else 0
        present = [t for t in q_terms if term_re[t].search(text)]
        kc = len(present)
        cov_idf = sum(term_idf[t] for t in present)
        score = float(bm[i]) + W_PHRASE * pc * phrase_idf + W_COVERAGE * cov_idf
        scored.append((score, i, kc, pc))
    scored.sort(key=lambda x: -x[0])

    out = []
    for score, i, kc, pc in scored:
        if score <= 0:
            break
        e = corpus[i]
        if not _ok(e, include_titles, include_blurb):
            continue
        out.append({**e, "score": float(score), "score_type": "bm25",
                    "corpus_idx": i, "kw_count": kc, "phrase_count": pc})
        if len(out) >= top_k:
            break
    return out


def exact_sutta_match(sutta_id, lang, max_chunks=5, query=None, headings_first=False):
    """Pencarian eksak (bypass) untuk memaksa sutta ID spesifik selalu nomor 1.

    headings_first=True (dipakai jalur @mention 'bahas apa' = overview): JANGAN buang
    segmen judul yang pendek; kembalikan blurb + SEMUA judul section (heading>0, urut
    dokumen, di-sampling rata kalau kebanyakan) sbg KERANGKA struktur + sebagian isi.
    Tanpa ini sutta panjang cuma kebaca bagian depan (body kepotong max_len di hilir) ->
    section ekor (mis. perenungan perasaan/pikiran/dhamma) hilang dari konteks."""
    corpus, bm25, _ = _load_bm25(lang)
    if not corpus:
        return []
    out = []

    # 1. Cari blurb/sinopsis dulu (karena secara abjad file author mungkin di bawah)
    # File blurb itu gabungan koleksi (misal mn-blurbs), jadi cek dari ref-nya
    for i, e in enumerate(corpus):
        if e.get("author") == "blurb" and sutta_id in e.get("ref", []):
            out.append({**e, "score": 1.0, "score_type": "exact", "corpus_idx": i})

    # 2. Pisah teks utama: judul (heading>0) vs isi. Mode overview pertahankan judul
    #    walau pendek; mode biasa buang chunk <5 kata (biasanya cuma judul/nomor urut).
    main_chunks, head_chunks = [], []
    for i, e in enumerate(corpus):
        if e.get("file_base_name") != sutta_id or e.get("author") == "blurb":
            continue
        words = e.get("text", "").split()
        if headings_first and e.get("heading", 0) > 0:
            if words:                       # buang garbage 0-kata; judul valid tetap masuk
                head_chunks.append((i, e))
            continue
        if len(words) < 5:                  # isi terlalu pendek -> lewati
            continue
        main_chunks.append((i, e))

    # 3. Urutkan isi: jika ada kueri, pakai relevansi BM25; jika tidak, berdasar panjang teks
    if query and bm25 and main_chunks:
        q_tokens = _tok(query)
        if q_tokens:
            scores = bm25.get_scores(q_tokens)
            # Pasangkan score dengan chunk, urutkan berdasar score BM25 tertinggi
            scored_chunks = [(scores[i], i, e) for i, e in main_chunks]
            scored_chunks.sort(key=lambda x: (x[0], len(x[2].get("text", ""))), reverse=True)
            main_chunks = [(i, e) for s, i, e in scored_chunks]
        else:
            main_chunks.sort(key=lambda x: len(x[1].get("text", "")), reverse=True)
    else:
        main_chunks.sort(key=lambda x: len(x[1].get("text", "")), reverse=True)

    # 4. Kerangka judul (urut dokumen) selalu ikut DULU di mode overview. Sampling rata
    #    kalau melebihi cap, supaya ujung sutta tetap terwakili (bukan cuma 40 judul awal).
    head_chunks.sort(key=lambda x: x[0])
    _HCAP = 40
    if len(head_chunks) > _HCAP:
        step = len(head_chunks) / _HCAP
        head_chunks = [head_chunks[int(k * step)] for k in range(_HCAP)]
    for i, e in head_chunks:
        out.append({**e, "score": 1.0 - (len(out) * 0.001), "score_type": "exact", "corpus_idx": i})
    for i, e in main_chunks[:max_chunks]:
        out.append({**e, "score": 1.0 - (len(out) * 0.001), "score_type": "exact", "corpus_idx": i})

    return out


def rrf_fuse(result_lists, top_k=10, k=RRF_K):
    agg = {}
    for results in result_lists:
        for rank, e in enumerate(results):
            ref = tuple(e.get("ref") or [e.get("file_base_name")])
            slot = agg.get(ref)
            if slot is None:
                slot = agg[ref] = {"entry": dict(e), "rrf": 0.0}
            else:
                # RRF cuma menggabung skor; entri yg disimpan = yg pertama terlihat
                # (mis. kaki semantik di hybrid). Tapi kw_count/phrase_count cuma
                # ada di kaki Kata-Kunci → bawa-serta dari entri manapun yg punya,
                # jika slot belum punya, biar badge frasa/kata tak ikut hilang.
                for kf in ("kw_count", "phrase_count"):
                    if slot["entry"].get(kf) is None and e.get(kf) is not None:
                        slot["entry"][kf] = e[kf]
            slot["rrf"] += 1.0 / (k + rank + 1)
    fused = sorted(agg.values(), key=lambda x: -x["rrf"])
    return [{**x["entry"], "score": round(x["rrf"], 6), "score_type": "rrf"} for x in fused[:top_k]]


def search(query, method, model_name, lang, top_k=10, include_titles=True, include_blurb=True,
           phrase_aware=False):
    """method: 'semantic' | 'keyword' | 'hybrid'. lang: satu korpus (id/en/pli).
    phrase_aware=True → kaki keyword pakai keyword_search_phrase (HANYA web-md)."""
    _kw = keyword_search_phrase if phrase_aware else keyword_search
    if method == "semantic":
        return semantic_search(query, model_name, lang, top_k, include_titles, include_blurb)
    if method == "keyword":
        return _kw(query, lang, top_k, include_titles, include_blurb)
    # hybrid
    sem = semantic_search(query, model_name, lang, top_k * 3, include_titles, include_blurb)
    kw  = _kw(query, lang, top_k * 3, include_titles, include_blurb)
    return rrf_fuse([sem, kw], top_k)
