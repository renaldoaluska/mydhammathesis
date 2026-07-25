"""
1-build-cache.py — Bangun search_cache.pkl BEKU untuk web-eval (offline retrieval run).

Untuk tiap (query, model, db): jalankan web/search top-10 sutta -> susun struktur
sutta->fragments (FRAGMEN FOKUS + texts lintas-bahasa) yang ditelan web-eval/eval_app.py.
DISPLAY A (sesuai riset): pakar menilai FRAGMEN yg di-retrieve apa adanya, TANPA konteks
tetangga -> cegah "extraneous information" yg nurunin grade (cf. TREC DL).
CACHE-ONLY: di-freeze sekali -> ngedit engine tidak ngubah grade pakar.

Jembatan: web/search balikin list FLAT (per-chunk); script ini grup per-sutta +
lengkapi teks lintas-bahasa (segmen yg SAMA, bukan tetangga) dari korpus 3-praproses.

Prasyarat: embedding korpus sudah dibuat (python src/code/4-training/5-embed.py) utk model
           yg dieval. Kombinasi yg embeddingnya belum ada -> hasil kosong (isi belakangan).
Output   : src/output/5-eval/search_cache.pkl  key=(query,model,db,TOP_K,INCLUDE_TITLES)
Usage    : python src/code/5-eval/1-build-cache.py
"""

import os
os.environ["HF_HUB_TRUST_REMOTE_CODE"] = "1"

# REPRODUSIBILITAS lintas-mesin: cache eval di-FREEZE sekali & jadi acuan grade pakar,
# jadi siapa pun rebuild HARUS dapat ranking identik. Skor di GPU/fp16 bisa meleset
# ~1e-5 dari CPU/fp32 -> pasangan near-tie ke-shuffle -> pool & rank geser -> anotasi
# lama rusak diam-diam. Paksa CPU (path numerik paling portabel; query encode cuma 30
# kueri/model jadi murah). Override eksplisit: set EMBED_DEVICE sebelum run.
os.environ.setdefault("EMBED_DEVICE", "cpu")

import sys
import json
import pickle
from pathlib import Path
from collections import defaultdict

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())   # mydhamma/src
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402
sys.path.insert(0, str(_BASE.parent / "web"))                  # engine search + _corpus
import search as websearch                                     # noqa: E402
from _corpus import load_corpus                                # noqa: E402
sys.path.insert(0, str(_BASE.parent / "web-md"))               # reader: format id + nama/pitaka
import reader                                                  # noqa: E402

TOP_K          = 10         # top-10 sutta per (query,model,db) — mydhamma: pool top-10, nDCG@10
INCLUDE_TITLES = False      # heading>0 dibuang dari hasil eval (seragam)
FETCH_CHUNK    = TOP_K * 6  # over-fetch chunk lalu grup ke TOP_K sutta
CORPUS_MAP     = {"multi": ["id", "en"], "en": ["en"], "indo": ["id"]}
LANGS          = ("id", "en", "pli")

EVAL_DIR   = config.EVAL_DIR
CACHE_FILE = EVAL_DIR / "search_cache.pkl"
_ECFG      = json.loads((_BASE.parent / "web-eval" / "eval_config.json").read_text(encoding="utf-8"))
MODEL_VERSI = _ECFG["model_versi"]
MODEL_LANGS = _ECFG["model_langs"]


# ── index korpus per bahasa: ref->teks (utk teks lintas-bahasa fragmen yg SAMA) ──
_REF_TEXT: dict = {}


def _build_index():
    for lang in LANGS:
        _REF_TEXT[lang] = {r: e["text"] for e in load_corpus(lang) for r in (e.get("ref") or [])}
    print(f"[index] {{lang: chunks}} = " + ", ".join(f"{l}:{len(_REF_TEXT[l]):,}" for l in LANGS))


def _texts_for(ref):
    return {lang: _REF_TEXT.get(lang, {}).get(ref, "") for lang in LANGS}


def _meta(sutta):
    """Display id + nama Pāli + pitaka + nama kitab/koleksi — SATU sumber kebenaran =
    web-md reader (DRY). format_sutta_id: cuma dn/mn/sn/an full-caps, sisanya
    Capitalize (mis. Snp, Dhp, Cp)."""
    sid = sutta or ""
    short = reader.shorten_sutta_id(sid)
    book = reader._SUTTA_BOOK.get(sid) or reader._SUTTA_BOOK.get(short, "")
    return (reader.format_sutta_id(sid),
            reader._sutta_names.get(sid) or reader._sutta_names.get(short, ""),
            reader._SUTTA_PITAKA.get(sid) or reader._SUTTA_PITAKA.get(short, ""),
            reader._sutta_names.get(book, "") if book else "")


def _sid_for(e):
    """uid sutta utk grouping. Blurb = pseudo-file level-koleksi (file_base_name=
    "xx-blurbs"); uid asli ada di chunk ref. Non-blurb (termasuk file range Vinaya)
    di-key via file_base_name. Sama spt web-md _group_suttas (konsisten lintas-app)."""
    refs = e.get("ref") or []
    if e.get("author") == "blurb" and refs:
        return refs[0].split(":")[0]
    return e.get("file_base_name", "?")


def _build_results(flat):
    """List FLAT (per-chunk) dari web.search -> struktur sutta->fragments (top-K sutta)."""
    by_sutta = defaultdict(list)
    for e in flat:
        by_sutta[_sid_for(e)].append(e)

    suttas = []
    for sutta, frags in by_sutta.items():
        frag_objs, best = [], 0.0
        # sort key pakai skor DIBULATKAN (4dp = presisi yg disimpan) + tiebreak
        # (ref, author) deterministik: noise numerik <1e-4 lintas-mesin tak boleh
        # ngubah urutan fragmen.
        for e in sorted(frags, key=lambda x: (-round(float(x.get("score", 0)), 4),
                                              (x.get("ref") or [""])[0], x.get("author", ""))):
            ref0 = (e.get("ref") or [sutta])[0]
            sc = float(e.get("score", 0))
            best = max(best, sc)
            # ref TIDAK unik lintas penerjemah: mdN milik author berbeda = potongan
            # berbeda. Pakai TEKS chunk yg beneran ke-retrieve (e["text"]) utk bahasa
            # yg di-search; _texts_for cuma fallback lintas-bahasa (best-effort, bisa
            # ambiguus kalau multi-author). author/source dibawa biar fragmen ke-dedup
            # & ditampilkan per penerjemah, bukan di-collapse jadi satu.
            texts = _texts_for(ref0)
            lang = e.get("lang", "")
            if lang:
                texts[lang] = e.get("text", "")
            frag_objs.append({
                "score": round(sc, 4),
                "ref": e.get("ref") or [ref0],
                "ref_display": ref0,
                "author": e.get("author", ""),
                "source": e.get("source", ""),
                "db_source": lang,
                "texts": texts,
            })
        fid, sname, pit, coll = _meta(sutta)
        suttas.append({"sutta_id": sutta, "formatted_id": fid, "sutta_name": sname,
                       "pitaka": pit, "collection_name": coll,
                       "max_score": round(best, 4), "fragments": frag_objs})

    # max_score sudah round(4); tiebreak sutta_id supaya RANK stabil & identik tiap
    # rebuild di mesin mana pun (kalau cuma sort skor, near-tie -> rank ke-shuffle).
    suttas.sort(key=lambda s: (-s["max_score"], s["sutta_id"]))
    suttas = suttas[:TOP_K]
    for rank, s in enumerate(suttas, 1):
        s["rank"] = rank
    return suttas


def _search_model(name):
    """Nama eval -> identifier utk web.search. GPL -> path folder model; lainnya apa adanya."""
    if name.startswith("gpl-"):
        return str(config.MODELS_DIR / name)          # 4-training/models/gpl-<short>
    return name                                       # base/baseline (resolve_model handle snapshot)


def main():
    import torch
    torch.use_deterministic_algorithms(True, warn_only=True)  # crash-free kalau ada op tanpa impl deterministik
    torch.manual_seed(0)
    print(f"[deterministik] EMBED_DEVICE={os.environ.get('EMBED_DEVICE')}  torch={torch.__version__}")
    reader.init()          # isi _sutta_names / _SUTTA_PITAKA utk _meta()
    _build_index()
    queries = [q for q in json.loads((config.EVAL_INPUT_DIR / "queries_pakar.json").read_text(encoding="utf-8"))
               if q.get("query", "").strip()]
    models = list(MODEL_VERSI.keys())

    cache = pickle.load(open(CACHE_FILE, "rb")) if CACHE_FILE.exists() else {}
    combos = [(q["query"].strip(), m, db) for q in queries for m in models
              for db in CORPUS_MAP.get(MODEL_LANGS.get(m, "multi"), ["id"])]
    todo = [c for c in combos if (c[0], c[1], c[2], TOP_K, INCLUDE_TITLES) not in cache]
    print(f"[combos] total={len(combos):,}  sudah-cache={len(combos)-len(todo):,}  sisa={len(todo):,}")

    done = empty = 0
    for qt, m, db in todo:
        if m == "BM25":
            flat = websearch.keyword_search(qt, db, top_k=FETCH_CHUNK, include_titles=INCLUDE_TITLES)
        else:
            flat = websearch.semantic_search(qt, _search_model(m), db,
                                             top_k=FETCH_CHUNK, include_titles=INCLUDE_TITLES)
        if not flat:
            empty += 1                                  # embedding belum di-precompute utk model ini
        cache[(qt, m, db, TOP_K, INCLUDE_TITLES)] = _build_results(flat)
        done += 1
        if done % 20 == 0:
            print(f"  {done}/{len(todo)} ... (kosong: {empty})")

    EVAL_DIR.mkdir(parents=True, exist_ok=True)
    with open(CACHE_FILE, "wb") as f:
        pickle.dump(cache, f)
    print(f"[done] {len(cache):,} entri -> {CACHE_FILE}  ({empty} kombinasi kosong = embedding belum ada)")


if __name__ == "__main__":
    main()