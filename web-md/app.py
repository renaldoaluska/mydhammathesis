"""
web-md — APP produk myDhamma (search + reader). md.renaldo.my.id

Arsitektur (rencana.txt §14[D]):
  - SEARCH didelegasi ke engine bersama web/search.py (semantic emb-cache + BM25 + RRF).
    web-md memanggil engine lalu mengelompokkan hit per-sutta (Max-P) untuk presentasi.
  - READER baca korpus MENTAH (sc_bilara_data + html_text) lewat reader.py -> viewer
    per-segmen (parts), multi-bahasa, breadcrumb, prev/next, browse tree.

Keyword (BM25) jalan tanpa GPU/embedding; semantic/hybrid nyala setelah 4-training/5-embed.py.
"""

import os
os.environ["HF_HUB_TRUST_REMOTE_CODE"] = "1"

import re
import sys
import json
import unicodedata
import typing
import threading
from pathlib import Path
from urllib.parse import urlencode

import requests 

from flask import (Flask, jsonify, request, redirect, render_template,
                   send_from_directory, abort)

# ── bootstrap: src/config.py (anchor) + web/ (engine) + reader.py (sedir) ─────
BASE_DIR = Path(__file__).resolve().parent                 # mydhamma/web-md
_SRC = next(p / "src" for p in BASE_DIR.parents if (p / "src" / "config.py").exists())
sys.path.insert(0, str(_SRC))
import config                                               # noqa: E402
sys.path.insert(0, str(_SRC.parent / "web"))               # engine bersama
# GPU 12GB dipakai penuh chat LLM (qwen2.5:14b // qwen3.5:9b) -> embedding model ke CPU biar tak rebutan VRAM.
# Query encoding ringan & vektor korpus sudah precomputed (cache CPU), jadi CPU aman/cepat.
# Override eksplisit lewat env EMBED_DEVICE bila perlu (mis. EMBED_DEVICE=cuda).
os.environ.setdefault("EMBED_DEVICE", "cpu")
import search as engine                                    # noqa: E402  (web/search.py)
sys.path.insert(0, str(BASE_DIR))
import reader                                               # noqa: E402

STATIC_DIR = BASE_DIR / "static"
VALID_DB = ("id", "en", "pli")
PITAKAS  = reader.PITAKAS

app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static",
            template_folder=str(BASE_DIR / "templates"))
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.json.sort_keys = False  # type: ignore

# Setup Secret Key for Sessions.
# Prioritas: env FLASK_SECRET_KEY (.env, bareng LLM_API_KEY) -> file .flask_secret -> generate.
# Jadi rahasia bisa ngumpul di .env; file cuma fallback (dev tetap jalan tanpa set env).
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "").strip()
if not app.secret_key:
    secret_file = BASE_DIR / ".flask_secret"
    if not secret_file.exists():
        secret_file.write_text(os.urandom(24).hex())
    app.secret_key = secret_file.read_text().strip()

# Access Gate
import gate
app.register_blueprint(gate.gate_bp)

reader.init()

# ============================================================
# Registry model untuk dropdown + resolusi nama -> engine
# ============================================================
RETRAIN_MODELS_DIR = config.OUTPUT_DIR / "7-retraining" / "models"   # gpl-exp*-{e5,gte}


def _gpl_models():
    out = []
    if config.MODELS_DIR.exists():
        for d in sorted(config.MODELS_DIR.iterdir()):
            if d.is_dir() and (d / "config.json").exists() and d.name.startswith("gpl-"):
                out.append(d.name)
    return out


def _model_web_langs(value: str) -> list:
    """Bahasa korpus yang embedding web-nya tersedia utk model ini (embed_<lang>_<clean>.pt).
    Dipakai /api/model-langs supaya dialog Konfig Mesin menandai model yg cuma punya
    sebagian korpus. Per 2026-07-08 semua model (termasuk gpl-exp4-*) punya 3 korpus;
    mekanisme ini tetap sbg pengaman kalau ada embedding yg belum/gagal dibangun."""
    clean = Path(value).name
    emb = config.EMBEDDINGS_DIR / "web"
    return [l for l in VALID_DB if (emb / f"embed_{l}_{clean}.pt").exists()]


def _retrain_models():
    """Model eksperimen 7-retraining (gpl-exp*) yg SIAP dipakai web: punya folder model
    + minimal embedding korpus id. exp5 TIDAK di sini (bukan model; base + stage rerank)."""
    out = []
    if RETRAIN_MODELS_DIR.exists():
        for d in sorted(RETRAIN_MODELS_DIR.iterdir()):
            if d.is_dir() and (d / "config.json").exists() and d.name.startswith("gpl-exp") \
                    and "id" in _model_web_langs(d.name):
                out.append(d.name)
    return out


def _all_models():
    return [m["name"] for m in config.REGISTRY] + _gpl_models() + _retrain_models() + ["BM25"]


def _engine_model(value: str) -> str:
    """gpl-exp* -> 7-retraining/models; gpl-* -> 4-training/models; lainnya apa adanya
    (resolve_model handle snapshot)."""
    if value and value.startswith("gpl-exp"):
        return str(RETRAIN_MODELS_DIR / value)
    if value and value.startswith("gpl-"):
        return str(config.MODELS_DIR / value)
    return value


def _model_entry(value: str) -> dict:
    return {"value": value, "display": value.split("/")[-1]}


# ============================================================
# Search: delegasi ke engine + grouping per-sutta (Max-P)
# ============================================================
def _parse_db(db_choice: str) -> list:
    if "," in (db_choice or ""):
        dbs = [d.strip() for d in db_choice.split(",") if d.strip() in VALID_DB]
    else:
        dbs = {"id": ["id"], "en": ["en"], "pli": ["pli"], "all": list(VALID_DB)}.get(db_choice, ["id"])
    return dbs or ["id"]


def _config_path() -> Path:
    return BASE_DIR / "config.json"


def _load_engine_config() -> dict:
    try:
        cfg = json.loads(_config_path().read_text(encoding="utf-8"))
    except Exception:
        cfg = {}
    
    for k in ["id", "en", "pli"]:
        if not cfg.get(k):
            cfg[k] = ["intfloat/multilingual-e5-base"]
    return cfg

def _ensemble_models(db: str, cfg: dict | None = None) -> list:
    """Model semantik utk korpus `db` dari konfig FLAT {target:[models]}.
    `cfg` = override per-request (ensemble_config dari browser); None -> config.json server."""
    cfg = cfg if isinstance(cfg, dict) else _load_engine_config()
    models = [m for m in (cfg.get(db) or []) if m]
    if not models:
        models = ["intfloat/multilingual-e5-base"]
    return models


def _available_links(sid: str) -> dict:
    """{lang: /<short>/<lang>/<author0>} dari peta file mentah (untuk link 'baca')."""
    la = {}
    for k in reader._RAW_FILE_MAP.get(sid, {}):
        if "_" not in k or k == "sec":
            continue
        l, a = k.split("_", 1)
        if a == "blurb":
            continue
        la.setdefault(l, [])
        if a not in la[l]:
            la[l].append(a)
    for (l, a) in reader._HTML_FILE_MAP.get(sid, {}):
        la.setdefault(l, [])
        if a not in la[l]:
            la[l].append(a)
    short = reader.shorten_sutta_id(sid)
    return {l: f"/{short}/{l}/{auths[0]}" for l, auths in la.items() if auths}


def _sutta_translations(sid: str, include_pli: bool = False) -> list:
    """Daftar terjemahan KEBACA utk picker @mention chat: [{lang, author, source}].
    Pali (pli) & blurb dikecualikan (jika include_pli=False) — qwen tak bisa baca Pali (poin 6), blurb cuma sinopsis.
    Urut: id dulu (default Indo), lalu en. Dipakai endpoint /api/sutta-translations."""
    seen, out = set(), []

    def _add(l, a, src):
        if (not include_pli and l == "pli") or a == "blurb":
            return
        if (l, a) in seen:
            return
        seen.add((l, a))
        
        name = a
        if src == "bilara":
            name = reader._BILARA_AUTHOR_LONG_NAMES.get(a, a)
        else:
            name = reader._EDITION_AUTHOR_LONG_NAMES.get(a, a)
            
        out.append({"lang": l, "author": a, "author_name": name, "source": src})

    for k in reader._RAW_FILE_MAP.get(sid, {}):
        if "_" not in k or k == "sec":
            continue
        l, a = k.split("_", 1)
        _add(l, a, "bilara")
    for (l, a) in reader._HTML_FILE_MAP.get(sid, {}):
        _add(l, a, "html")
    order = {"pli": -1, "id": 0, "en": 1}
    out.sort(key=lambda e: (order.get(e["lang"], 9), e["author"]))
    return out


def _run_one(query, eng_method, model_value, db, pool, inc_titles, inc_blurb):
    if eng_method == "keyword":
        flat = engine.keyword_search(query, db, top_k=pool,
                                     include_titles=inc_titles, include_blurb=inc_blurb)
        tag = "BM25"
    else:
        flat = engine.search(query, eng_method, _engine_model(model_value), db, top_k=pool,
                             include_titles=inc_titles, include_blurb=inc_blurb)
        tag = model_value
    for e in flat:
        e["db_source"] = db
        e["models"] = [tag]
    return flat


def _group_suttas(entries: list) -> list:
    by_sutta = {}
    for hit_idx, e in enumerate(entries):
        refs = e.get("ref") or []
        # File blurb itu pseudo-file level-koleksi (file_base_name="xx-blurbs"); uid sutta
        # asli ada di chunk ref. File non-blurb (termasuk file range Vinaya spt
        # pli-tv-bi-vb-as1-7) = file teks asli yg di-key/di-link via file_base_name -> biarkan.
        if e.get("author") == "blurb" and refs:
            sid = refs[0].split(":")[0]
        else:
            sid = e.get("file_base_name") or (refs[0].split(":")[0] if refs else "?")
        db = e.get("db_source", e.get("lang", "id"))
        texts = {"id": "", "en": "", "pli": ""}
        texts[db] = (e.get("text") or "").strip()
        frag = {
            "score": round(float(e.get("score", 0)), 4),
            "ref": refs,
            "ref_display": reader.ringkas_referensi(refs),
            "hit_idx": hit_idx,
            "texts": texts,
            "context_before": {"id": "", "en": "", "pli": ""},
            "context_after": {"id": "", "en": "", "pli": ""},
            "context_before_parts": None,
            "context_after_parts": None,
            "models": e.get("models", []),
            "db_source": db,
            "author": e.get("author"),
            "source": e.get("source"),
            "file_base_name": e.get("file_base_name"),
            "parts": e.get("parts"),
            "heading": e.get("heading", 0),   # >0 = judul section/sub-section (utk skeleton @mention overview)
            "score_type": e.get("score_type", "cosine"),
        }
        g = by_sutta.setdefault(sid, {"max_score": -1e9, "fragments": []})
        g["fragments"].append(frag)
        g["max_score"] = max(g["max_score"], frag["score"])

    suttas = []
    for sid, g in by_sutta.items():
        frags = sorted(g["fragments"],
                       key=lambda x: (0 if x.get("author") == "blurb" else 1, x.get("hit_idx", 0)))
        suttas.append({
            "sutta_id": sid,
            "formatted_id": reader.format_sutta_id(sid),
            "sutta_name": reader._sutta_names.get(sid, ""),
            "pitaka": reader._SUTTA_PITAKA.get(sid, "sutta"),
            "collection_name": reader._sutta_names.get(reader._SUTTA_BOOK.get(sid, ""), ""),
            "available_links": _available_links(sid),
            "max_score": round(g["max_score"], 4),
            "fragments": frags,
        })
    suttas.sort(key=lambda s: -s["max_score"])
    return suttas


def _normalize_rrf_scores(suttas):
    """Normalisasi skor RRF ke rentang 0-1 agar frontend bisa tampilkan sebagai persen.
    Skor tertinggi jadi ~100%, sisanya proporsional."""
    if not suttas:
        return
    has_rrf = any(f.get("score_type") == "rrf"
                  for s in suttas for f in s["fragments"])
    if not has_rrf:
        return
    max_score = max((f["score"] for s in suttas for f in s["fragments"]), default=0)
    if max_score <= 0:
        return
    for s in suttas:
        for f in s["fragments"]:
            f["score"] = round(f["score"] / max_score, 4)
        if s["fragments"]:
            s["max_score"] = round(max(f["score"] for f in s["fragments"]), 4)


def _fill_frag_context(frag, cache):
    """Isi context_before/after fragment dgn teks chunk TETANGGA (n-1 & n+1) dari
    korpus, pada bahasa db_source-nya — untuk checkbox "Konteks" di hasil search.
    No-op utk blurb / bila chunk sumber tak ditemukan (degradasi senyap, bukan error).
    `cache` = memo per (sid, lang, author, source) sepanjang satu request."""
    if frag.get("author") == "blurb":
        return
    refs = frag.get("ref") or []
    if not refs:
        return
    lang = frag.get("db_source")
    author = frag.get("author")
    source = frag.get("source")
    # Seg-prefix bisa meleset utk file range (mis. an2.62 -> file an2.x-y); file_base_name
    # adalah kunci file yang benar. resolve_sutta_id menormalkan short-id -> full.
    sid = reader.resolve_sutta_id(frag.get("file_base_name") or refs[0].split(":")[0])
    key = (sid, lang, author, source)
    if key not in cache:
        if source == "html":
            cache[key] = (reader._get_sutta_from_html(sid, lang, author), f"{lang}_text")
        else:
            cache[key] = (reader._get_sutta_from_raw(sid, lang, author), "lang_text")
    chunks, text_key = cache[key]
    if not chunks:
        return
    refset = set(refs)
    idx = next((i for i, c in enumerate(chunks) if refset & set(c.get("chunk_ids", []))), None)
    if idx is None:
        return
    if idx > 0:
        frag.setdefault("context_before", {})[lang] = (chunks[idx - 1].get(text_key) or "").strip()
        frag.setdefault("context_before_refs", {})[lang] = chunks[idx - 1].get("chunk_ids") or []
    if idx < len(chunks) - 1:
        frag.setdefault("context_after", {})[lang] = (chunks[idx + 1].get(text_key) or "").strip()
        frag.setdefault("context_after_refs", {})[lang] = chunks[idx + 1].get("chunk_ids") or []


def _populate_fragment_parts(page_suttas):
    cache = {}
    for s in page_suttas:
        sutta_id = s.get("sutta_id")
        if not sutta_id:
            continue
        for fr in s.get("fragments", []):
            if fr.get("author") == "blurb":
                continue
            refs = fr.get("ref") or []
            if not refs:
                continue
            lang = fr.get("db_source")
            author = fr.get("author")
            source = fr.get("source")
            sid = reader.resolve_sutta_id(fr.get("file_base_name") or refs[0].split(":")[0])
            refset = set(refs)

            if source == "html":
                # html_text (mis. id DhammaCitta): SELALU repopulate parts dari _get_sutta_from_html
                # supaya bawa link "§N" LIVE (index lama plain) -> kartu hasil pencarian ikut nampilin
                # §N, paritas dgn viewer & catatan. Match ref->chunk_ids (sama spt _fill_frag_context);
                # parts chunk dipakai apa adanya (shape id/num/text sudah cocok renderPartsHtml, key="id"
                # baca p.text). mainText kosong utk part html = no-op (fragment id: langs cuma ["id"]).
                key = (sid, lang, author, "html")
                if key not in cache:
                    cache[key] = reader._get_sutta_from_html(sid, lang, author)
                chunks = cache[key]
                if not chunks:
                    continue
                fr["parts"] = [dict(p) for c in chunks if refset & set(c.get("chunk_ids", []))
                               for p in c.get("parts", [])]
                continue

            if fr.get("parts") and len(fr["parts"]) > 0:
                continue
            if source != "bilara":
                continue
            key = (sid, lang, author, source)
            if key not in cache:
                cache[key] = reader._get_sutta_from_raw(sid, lang, author)
            chunks = cache[key]
            if not chunks:
                continue
            formatted_parts = []
            for c in chunks:
                for p in c.get("parts", []):
                    if p.get("id") in refset:
                        p_copy = dict(p)
                        p_copy["text"] = p.get("lang", "")
                        p_copy["num"] = p.get("id", "").split(":")[-1] if ":" in p.get("id", "") else ""
                        p_copy["bilara"] = True
                        formatted_parts.append(p_copy)
            fr["parts"] = formatted_parts



# ============================================================
# Context processor + error handlers
# ============================================================
@app.context_processor
def _ctx():
    def versioned_static(filename):
        try:
            mtime = int(os.path.getmtime(STATIC_DIR / filename))
        except OSError:
            mtime = 0
        return f"/static/{filename}?v={mtime}"
    sid = request.view_args.get("sutta_id") if request.view_args else None
    return {"versioned_static": versioned_static,
            "browse_href": f"/browse/{sid}" if sid else "/browse",
            "bilara_author_names": reader._BILARA_AUTHOR_LONG_NAMES,
            "edition_author_names": reader._EDITION_AUTHOR_LONG_NAMES,
            "lang_names": reader._LANG_NAME_MAP,
            # Chat kini panel di semua halaman (bukan dedicated page) -> TERM_MAP
            # (window.DK_TERM_MAP, satu sumber FE/BE) di-inject dari base.html.
            "term_map": [[p, r] for p, r in TERM_MAP]}


@app.errorhandler(404)
def _404(e):
    if request.path.startswith("/api/"):
        return {"error": "Not found"}, 404
    try:
        return render_template("404.html"), 404
    except Exception:
        return "Not found", 404


# ============================================================
# Routes — search / config
# ============================================================
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/browse")
@app.route("/browse/<path:highlight_id>")
def browse(highlight_id=None):
    return redirect(f"/?browse={highlight_id}" if highlight_id else "/")


@app.route("/api/models")
def api_models():
    base = [_model_entry(str(m["name"])) for m in config.REGISTRY]
    gpl = [_model_entry(m) for m in _gpl_models()]
    exp = [_model_entry(m) for m in _retrain_models()]
    cats = [{"key": "base", "label": "Base", "models": base}]
    if gpl:
        cats.append({"key": "gpl", "label": "GPL (exp0)", "models": gpl})
    if exp:
        exp_groups = {}
        for m in exp:
            # Misal 'gpl-exp1-e5' -> ambil 'exp1'
            import re
            match = re.search(r'(exp\d+)', m["value"])
            key = match.group(1) if match else "exp"
            if key not in exp_groups:
                exp_groups[key] = []
            exp_groups[key].append(m)
        
        for key in sorted(exp_groups.keys()):
            num = key.replace("exp", "")
            cats.append({"key": key, "label": f"Refinement {num} ({key})", "models": exp_groups[key]})
    # NB: BM25 (leksikal) sengaja TIDAK dimasukkan ke kategori ensemble. Kaki keyword
    # diatur penuh oleh tombol metode (Hybrid/Kata Kunci) lewat search.py RRF, bukan
    # oleh checkbox model semantik. Konfig Mesin = pilih model semantik saja.
    return jsonify({"categories": cats, "all": _all_models()})


@app.route("/api/model-langs")
def api_model_langs():
    """lang_mode per model utk dialog Konfig Mesin: 'multi' = 3 korpus tersedia,
    'indo' = cuma id (frontend LANG_COVERAGE menandai/dim di tab lain). Dasar =
    ketersediaan embedding web nyata, bukan asumsi."""
    out = {}
    for m in _all_models():
        if m == "BM25":
            out[m] = "multi"
            continue
        langs = _model_web_langs(m)
        out[m] = "multi" if set(langs) >= set(VALID_DB) else ("indo" if not langs or langs == ["id"] else "multi")
    return jsonify(out)


@app.route("/api/config", methods=["GET"])
def api_get_config():
    return jsonify(_load_engine_config())


@app.route("/api/config", methods=["POST"])
def api_set_config():
    try:
        data = request.get_json(force=True) or {}
        _config_path().write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/search", methods=["POST"])
def api_search():
    body = request.get_json(force=True) or {}
    query = (body.get("query") or "").strip()
    if not query:
        return jsonify({"error": "Query kosong"}), 400

    model_name = body.get("model", "BM25")
    db_choice = body.get("db", "id")
    method = body.get("method", "keyword")
    inc_titles = bool(body.get("include_titles", True))
    inc_blurb = bool(body.get("include_blurbs", True))
    show_preview = bool(body.get("show_preview", True))
    page = int(body.get("page", 1))
    page_size = int(body.get("page_size", 20))
    pitaka_f = body.get("pitaka", list(PITAKAS))
    if isinstance(pitaka_f, str):
        pitaka_f = [p.strip() for p in pitaka_f.split(",") if p.strip()]
    ens_cfg = body.get("ensemble_config") if isinstance(body.get("ensemble_config"), dict) else None
    use_rerank = body.get("use_reranker", SEARCH_RERANK)

    methods = method if isinstance(method, list) else [method]
    has_sem, has_kw = "semantic" in methods, "keyword" in methods
    eng_method = "hybrid" if (has_sem and has_kw) else ("keyword" if has_kw else "semantic")

    try:
        dbs = _parse_db(db_choice)
        pool = max(page * page_size * 6, 60)
        result_lists = []
        for db in dbs:
            if eng_method == "keyword":
                result_lists.append(_run_one(query, "keyword", None, db, pool, inc_titles, inc_blurb))
            else:
                models = _ensemble_models(db, ens_cfg) if model_name == "ensemble" else [model_name]
                for mdl in models:
                    result_lists.append(_run_one(query, eng_method, mdl, db, pool, inc_titles, inc_blurb))

        nonempty = [l for l in result_lists if l]
        if len(nonempty) == 1:
            fused = nonempty[0]
        elif len(nonempty) > 1:
            fused = engine.rrf_fuse(nonempty, top_k=pool)
        else:
            fused = []

        # Stage-2 rerank (exp5) HANYA utk pencarian default (ensemble, non-keyword) ->
        # default home = konfigurasi terbaik 8-reeval (base + rerank). Mode model
        # eksplisit (banding per-model/per-eksperimen) & Kata-Kunci murni sengaja
        # TIDAK di-rerank: tujuannya melihat perilaku asli tiap model/leksikal.
        # keep_tail: sisa kandidat tetap dibawa (urutan stage-1) demi paginasi dalam.
        if fused and use_rerank and model_name == "ensemble" and eng_method != "keyword":
            fused = _rerank_fragments(query, fused, keep_tail=True)

        suttas = _group_suttas(fused)
        _normalize_rrf_scores(suttas)
        if set(pitaka_f) != set(PITAKAS):
            suttas = [s for s in suttas if s["pitaka"] in pitaka_f]

        total_sutta = len(suttas)
        total_hits = sum(len(s["fragments"]) for s in suttas)
        start = (page - 1) * page_size
        page_suttas = suttas[start:start + page_size]
        for i, s in enumerate(page_suttas):
            s["rank"] = start + i + 1

        _populate_fragment_parts(page_suttas)

        # Konteks (n-1/n+1) hanya utk halaman yang tampil & hanya bila diminta.
        if show_preview:
            ctx_cache = {}
            for s in page_suttas:
                for fr in s["fragments"]:
                    _fill_frag_context(fr, ctx_cache)

        return jsonify({
            "results": page_suttas, "query": query, "model": model_name,
            "total_sutta": total_sutta, "total_hits": total_hits,
            "page": page, "page_size": page_size,
            "query_lang": detect_query_lang(query, default_lang=dbs[0] if dbs else "id")
        })
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ============================================================
# Routes — reader (sutta viewer / browse / breadcrumb / nav)
# ============================================================
@app.route("/api/sutta/<sutta_id>/<lang>")
@app.route("/api/sutta/<sutta_id>/<lang>/<author>")
def api_sutta(sutta_id, lang, author=None):
    sutta_id = reader.resolve_sutta_id(sutta_id)
    if lang not in VALID_DB:
        return jsonify({"error": "Invalid language"}), 400

    paths = reader._RAW_FILE_MAP.get(sutta_id, {})
    html_la = reader._HTML_FILE_MAP.get(sutta_id, {})
    if not author:
        bil = [k.split("_", 1)[1] for k in paths if k.startswith(f"{lang}_")]
        if bil:
            author = bil[0]
        else:
            ha = [a for (l, a) in html_la if l == lang]
            author = ha[0] if ha else None

    bilara_key = f"{lang}_{author}" if author else None
    is_bilara = bool(bilara_key and bilara_key in paths)
    is_html = (not is_bilara) and ((lang, author) in html_la)

    # Fallback jika kombinasi lang dan author tidak ada di korpus
    if author and not (is_bilara or is_html):
        bil = [k.split("_", 1)[1] for k in paths if k.startswith(f"{lang}_")]
        if bil:
            author = bil[0]
        else:
            ha = [a for (l, a) in html_la if l == lang]
            author = ha[0] if ha else None
        
        bilara_key = f"{lang}_{author}" if author else None
        is_bilara = bool(bilara_key and bilara_key in paths)
        is_html = (not is_bilara) and ((lang, author) in html_la)

    source = "bilara" if is_bilara else ("html" if is_html else "bilara")

    if is_html:
        chunks = reader._get_sutta_from_html(sutta_id, lang, author)
        if chunks is None:
            return jsonify({"error": f"Sutta '{sutta_id}' not found"}), 404
        # Coba ambil pali dari raw (jika tersedia)
        pli_chunks = reader._get_sutta_from_raw(sutta_id, "pli") or []
        
        segments = []
        if not chunks:
            pass
        elif not pli_chunks:
            for c in chunks:
                seg = {"ids": c.get("chunk_ids", []), "pli_ids": [],
                       "heading": c.get("heading", 0), "pli_heading": 0,
                       "text": c.get(f"{lang}_text", ""), "pli": ""}
                if c.get("parts"):
                    seg["parts"] = [{"id": pt["id"], "num": pt["num"], "text": pt["text"],
                                     **({"heading": pt["heading"]} if pt.get("heading") else {})}
                                    for pt in c["parts"]]
                segments.append(seg)
        else:
            ratio = len(pli_chunks) / len(chunks)
            for i in range(len(chunks)):
                c = chunks[i]
                start_idx = int(i * ratio)
                end_idx = int((i + 1) * ratio)
                if i == len(chunks) - 1:
                    end_idx = len(pli_chunks)
                
                p_group = pli_chunks[start_idx:end_idx]
                
                merged_pli_text = " ".join(p.get("pli_text", "") for p in p_group if p.get("pli_text")).strip()
                merged_pli_parts = []
                merged_pli_ids = []
                for p in p_group:
                    merged_pli_ids.extend(p.get("chunk_ids", []))
                    if p.get("parts"):
                        merged_pli_parts.extend(p["parts"])
                
                seg = {"ids": c.get("chunk_ids", []),
                       "pli_ids": merged_pli_ids,
                       "heading": c.get("heading", 0),
                       "pli_heading": p_group[0].get("heading", 0) if p_group else 0,
                       "text": c.get(f"{lang}_text", ""),
                       "pli": merged_pli_text}
                
                if c.get("parts"):
                    seg["parts"] = [{"id": pt["id"], "num": pt["num"], "text": pt["text"],
                                     **({"heading": pt["heading"]} if pt.get("heading") else {})}
                                    for pt in c["parts"]]
                if merged_pli_parts:
                    seg["pli_parts"] = [{"id": pt["id"], "num": pt.get("num", ""), "pli": pt.get("pli", ""),
                                         **({"heading": pt["heading"]} if pt.get("heading") else {})}
                                        for pt in merged_pli_parts]
                segments.append(seg)
    else:
        chunks = reader._get_sutta_from_raw(sutta_id, lang, author)
        if chunks is None:
            return jsonify({"error": f"Sutta '{sutta_id}' not found"}), 404
        segments = []
        for c in chunks:
            seg = {"ids": c.get("chunk_ids", []), "heading": c.get("heading", 0)}
            parts = c.get("parts", [])
            if lang == "pli":
                seg["text"] = c.get("pli_text", "")
                seg["en"] = c.get("en_text", "")
                seg["parts"] = [{"id": p["id"], "num": p["id"].split(":")[-1], "text": p["pli"],
                                 "en": p["en"], "bilara": True,
                                 **({"heading": p["heading"]} if p.get("heading") else {})} for p in parts]
            else:
                seg["text"] = c.get("lang_text", "")
                seg["pli"] = c.get("pli_text", "")
                seg["parts"] = [{"id": p["id"], "num": p["id"].split(":")[-1], "text": p["lang"],
                                 "pli": p["pli"], "bilara": True,
                                 **({"heading": p["heading"]} if p.get("heading") else {})} for p in parts]
            segments.append(seg)

    short_id = reader.shorten_sutta_id(sutta_id)
    avail_paths = {}

    def _append(l_, uid_, src_):
        b = avail_paths.setdefault(l_, [])
        if not any(e["uid"] == uid_ and e["source"] == src_ for e in b):
            b.append({"uid": uid_, "source": src_})

    for k in paths:
        if "_" not in k or k == "sec":
            continue
        l, a = k.split("_", 1)
        if a == "blurb":
            continue
        _append(l, a, "bilara")
    for (l, a) in html_la:
        _append(l, a, "html")

    available_links = {}
    for l, entries in avail_paths.items():
        uid_ = author if (l == lang and author) else (entries[0]["uid"] if entries else None)
        if uid_:
            available_links[l] = f"/{short_id}/{l}/{uid_}"

    # Navigasi sutta sebelum/sesudah utk dialog viewer (paritas dgn halaman reader).
    # Pertahankan author saat ini bila tersedia di sutta tetangga; kalau tidak, author=""
    # supaya dialog membiarkan API memilih author yg ada utk bahasa itu.
    prev_id, next_id = reader._get_prev_next(sutta_id)

    def _nav_dlg(sid):
        if not sid:
            return None
        s = reader.shorten_sutta_id(sid)
        fid = reader.resolve_sutta_id(s)
        nav_author = author
        if lang == "pli":
            pli_a = [k.split("_", 1)[1] for k in reader._RAW_FILE_MAP.get(fid, {}) if k.startswith("pli_")]
            for l, a in reader._HTML_FILE_MAP.get(fid, {}):
                if l == "pli" and a not in pli_a:
                    pli_a.append(a)
            nav_author = pli_a[0] if pli_a else None
        else:
            direct = (f"{lang}_{author}" in reader._RAW_FILE_MAP.get(fid, {}) or
                      any(l == lang and a == author for l, a in reader._HTML_FILE_MAP.get(fid, {})))
            if not direct:
                nav_author = None
        return {"id": s, "label": reader.format_sutta_id(fid),
                "name": reader._sutta_names.get(fid, ""),
                "lang": lang, "author": nav_author or ""}

    # Peyyāla-total: sutta html body kosong (cuma judul) -> pointer ke sutta LENGKAP terdekat
    # sebelumnya (viewer render notice + link). Cek murah: tak ada segmen non-heading berisi.
    elision_ref = None
    if is_html and not any(s.get("heading", 0) == 0 and (s.get("text") or "").strip() for s in segments):
        ex = reader._elision_exemplar(sutta_id, lang, author)
        if ex:
            elision_ref = {"id": reader.shorten_sutta_id(ex),
                           "label": reader.format_sutta_id(ex),
                           "name": reader._sutta_names.get(ex, "")}

    return jsonify({
        "sutta_id": short_id, "formatted_id": reader.format_sutta_id(sutta_id),
        "sutta_name": reader._sutta_names.get(sutta_id, ""),
        "lang": lang, "author": author or "ms", "source": source,
        "segments": segments, "segmented": not is_html,
        "available_links": available_links, "available_paths": avail_paths,
        "prev_sutta": _nav_dlg(prev_id), "next_sutta": _nav_dlg(next_id),
        "elision_ref": elision_ref,
    })


@app.route("/api/breadcrumbs/<sutta_id>")
def api_breadcrumbs(sutta_id):
    return jsonify(reader._get_breadcrumbs(reader.resolve_sutta_id(sutta_id)))


@app.route("/api/browse")
def api_browse():
    return jsonify(reader.build_tree())


@app.route("/api/browse-unavailable")
def api_browse_unavailable():
    # Leaf yg rute /<id>-nya 404 (tak ada teks) -> UI browse nge-disable link-nya.
    return jsonify({"unavailable": reader.unavailable_leaves()})


@app.route("/api/sutta-names")
def api_sutta_names():
    return jsonify(reader._sutta_names)


@app.route("/api/sutta-names/<pitaka>")
def api_sutta_names_pitaka(pitaka):
    return jsonify(reader.sutta_names_for_pitaka(pitaka))


@app.route("/api/collections")
def api_collections():
    return jsonify(reader.collections_list())


# Pola teks Pali kanonik yg layak di-@mention: nikaya (butuh angka) + vinaya bu/bi
# (pli-tv-b[iu]-...) + abhidhamma. Terjemahan non-Pali (lzh-*/san-*/xct-*) sengaja dibuang.
_MENTIONABLE_RE = re.compile(r'^((dn|mn|sn|an|kn|kp|khp|dhp|ud|iti|snp|vv|pv|thag|thig|tha-ap|thi-ap|bv|cp|ja|mnd|cnd|ps|pe|nett|mil)\d|pli-tv-b[iu]-|ds|vb|dt|pp|kv|ya|patthana)', re.IGNORECASE)


@app.route("/api/mentionable")
def api_mentionable():
    """Daftar LENGKAP teks (Pali kanonik) yg punya file & bisa di-@mention di chat:
    {collections:[{abbr,name}], suttas:[{abbr,name,id}]}. Sumber = peta file reader."""
    avail = set(reader._RAW_FILE_MAP) | set(reader._HTML_FILE_MAP)
    suttas, cols = [], {}
    for sid in avail:
        if not _MENTIONABLE_RE.match(sid):
            continue
        suttas.append({"abbr": reader.format_sutta_id(sid),
                       "name": reader._sutta_names.get(sid, ""),
                       "id": reader.shorten_sutta_id(sid)})
        book = reader._SUTTA_BOOK.get(sid)
        if book:
            cols.setdefault(book, reader._sutta_names.get(book, ""))
    suttas.sort(key=lambda s: s["abbr"])
    collections = [{"abbr": reader.format_sutta_id(b), "name": n or reader.format_sutta_id(b)}
                   for b, n in sorted(cols.items())]
    return jsonify({"collections": collections, "suttas": suttas})


@app.route("/api/sutta-translations/<sutta_id>")
def api_sutta_translations(sutta_id):
    """Terjemahan yg tersedia utk satu sutta (buat picker @mention di chat). Terima id
    ternormalisasi (mis. 'mn10') ataupun berspasi ('MN 10')."""
    sid = reader.resolve_sutta_id(sutta_id.replace(" ", "").lower())
    include_pli = request.args.get("pli", "0") == "1"
    
    if sid in reader.collection_codes():
        return jsonify({
            "formatted_id": reader.format_sutta_id(sid),
            "sutta_name": reader._sutta_names.get(sid, ""),
            "translations": [{"lang": "id", "author": "koleksi", "author_name": "Tim Koleksi myDhamma", "source": "sistem"}],
            "is_collection": True
        })

    return jsonify({
        "formatted_id": reader.format_sutta_id(sid),
        "sutta_name": reader._sutta_names.get(sid, ""),
        "pitaka": reader._SUTTA_PITAKA.get(sid, "sutta"),
        "collection_name": reader._sutta_names.get(reader._SUTTA_BOOK.get(sid, ""), ""),
        "blurbs": {l: text for (s, l), text in reader._blurbs.items() if s == sid},
        "translations": _sutta_translations(sid, include_pli=include_pli),
    })


@app.route("/api/availability")
def api_availability():
    avail = {}
    for sid, paths in reader._RAW_FILE_MAP.items():
        avail[sid] = {}
        for k in paths:
            if "_" in k:
                l, a = k.split("_", 1)
                avail[sid].setdefault(l, []).append(a)
    for sid, la_map in reader._HTML_FILE_MAP.items():
        avail.setdefault(sid, {})
        for (l, a) in la_map:
            avail[sid].setdefault(l, [])
            if a not in avail[sid][l]:
                avail[sid][l].append(a)
    return jsonify(avail)


@app.route("/bu/")
@app.route("/bu")
@app.route("/bi/")
@app.route("/bi")
def redirect_vinaya():
    return redirect("/browse/vinaya")


def _nav_entry_plex(sid):
    if not sid:
        return None
    return {"id": reader.shorten_sutta_id(sid), "label": reader.format_sutta_id(sid),
            "name": reader._sutta_names.get(sid, "")}


@app.route("/<sutta_id>")
def suttaplex(sutta_id):
    full_id = reader.resolve_sutta_id(sutta_id)
    short_id = reader.shorten_sutta_id(full_id)
    if not re.match(r"^[a-z]", full_id):
        abort(404)
    if full_id not in reader._RAW_FILE_MAP and full_id not in reader._HTML_FILE_MAP:
        abort(404)

    avail_paths = {}

    def _ap(l, uid, src):
        b = avail_paths.setdefault(l, [])
        if not any(e["uid"] == uid and e["source"] == src for e in b):
            b.append({"uid": uid, "source": src})

    for k in reader._RAW_FILE_MAP.get(full_id, {}):
        if "_" in k and k != "sec":
            l, a = k.split("_", 1)
            _ap(l, a, "bilara")
    for (l, a) in reader._HTML_FILE_MAP.get(full_id, {}):
        _ap(l, a, "html")

    prev_id, next_id = reader._get_prev_next(full_id)
    return render_template("suttaplex.html",
        sutta_id=short_id, full_id=full_id, formatted_id=reader.format_sutta_id(full_id),
        sutta_name=reader._sutta_names.get(full_id, ""), paths=avail_paths,
        breadcrumbs=reader._get_breadcrumbs(full_id),
        blurb_id=reader._blurbs.get((full_id, "id"), ""),
        blurb_en=reader._blurbs.get((full_id, "en"), ""),
        prev_sutta=_nav_entry_plex(prev_id), next_sutta=_nav_entry_plex(next_id))


@app.route("/<sutta_id>/<lang>")
@app.route("/<sutta_id>/<lang>/<author>")
def sutta_reader(sutta_id, lang, author=None):
    if lang not in VALID_DB:
        abort(404)
    if not re.match(r"^[a-z]", sutta_id):
        abort(404)
    if not author:
        return redirect(f"/{sutta_id}")

    full_id = reader.resolve_sutta_id(sutta_id)
    key = f"{lang}_{author}"
    has_bilara = key in reader._RAW_FILE_MAP.get(full_id, {})
    has_html = any(l == lang and a == author for l, a in reader._HTML_FILE_MAP.get(full_id, {}))
    if not has_bilara and not has_html:
        return redirect(f"/{reader.shorten_sutta_id(full_id)}")

    prev_id, next_id = reader._get_prev_next(full_id)

    def _nav(sid):
        if not sid:
            return None
        s = reader.shorten_sutta_id(sid)
        fid = reader.resolve_sutta_id(s)
        if lang == "pli":
            pli_a = [k.split("_", 1)[1] for k in reader._RAW_FILE_MAP.get(fid, {}) if k.startswith("pli_")]
            for l, a in reader._HTML_FILE_MAP.get(fid, {}):
                if l == "pli" and a not in pli_a:
                    pli_a.append(a)
            href = f"/{s}/pli/{pli_a[0]}" if pli_a else f"/{s}"
        else:
            k2 = f"{lang}_{author}"
            direct = (k2 in reader._RAW_FILE_MAP.get(fid, {}) or
                      any(l == lang and a == author for l, a in reader._HTML_FILE_MAP.get(fid, {})))
            # Edisi (lang,author) tak ada di tetangga (mis. MN 3 tanpa Bodhi) -> suttaplex
            # + sinyal ?na= supaya halaman tujuan nampilin TOAST "terjemahan X tak tersedia"
            # (tanpa ini user bingung kok nyasar ke halaman pilih terjemahan).
            href = f"/{s}/{lang}/{author}" if direct else f"/{s}?na={lang}_{author}"
        return {"href": href, "label": reader.format_sutta_id(fid), "name": reader._sutta_names.get(fid, "")}

    return render_template("sutta.html",
        sutta_id=reader.shorten_sutta_id(full_id), lang=lang, author=author or "",
        prev_sutta=_nav(prev_id), next_sutta=_nav(next_id))


@app.route("/<sutta_id>/<lang>/<author>/<path:extra>")
def sutta_reader_extra(sutta_id, lang, author, extra):
    if lang not in VALID_DB:
        abort(404)
    return redirect(f"/{sutta_id}/{lang}/{author}", code=302)


@app.route("/<lang>/<sutta_id>/<segment>")
def sutta_reader_redirect(lang, sutta_id, segment):
    if lang not in VALID_DB:
        abort(404)
    return redirect(f"/{sutta_id}/{lang}#{segment}", code=302)


@app.route("/res/<path:filename>")
def serve_res(filename):
    resp = send_from_directory(STATIC_DIR / "res", filename)
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in ("mp4", "webm", "ogg", "mp3", "wav"):
        resp.headers["Cache-Control"] = "public, max-age=604800, immutable"
    elif ext in ("png", "jpg", "jpeg", "gif", "svg", "webp", "ico"):
        resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


# ============================================================
# Routes — Tentang (about) + README
# ============================================================
@app.route("/tentang")
def tentang():
    return render_template("tentang.html")


@app.route("/api/readme")
def api_readme():
    """Serve README mentah (markdown) -> di-render client-side (marked.js) di tentang.html.
    Dual-README (rencana): README.md (ID) + README_EN.md (EN), 1:1 mirror."""
    repo_root = _SRC.parent                                  # mydhamma/
    fname = "README_EN.md" if request.args.get("lang") == "en" else "README.md"
    p = repo_root / fname
    if p.exists():
        return p.read_text(encoding="utf-8"), 200, {"Content-Type": "text/markdown; charset=utf-8"}
    return ("# myDhamma\n\nREADME belum tersedia.", 200,
            {"Content-Type": "text/markdown; charset=utf-8"})


# ============================================================
# Chat (Agentic RAG) — helper: LLM (Ollama) + retrieval + post-proses
# ============================================================
# Model & endpoint Ollama. Ganti model = ubah env, tak perlu sentuh kode.

def _get_chat_config():
    """Load config.json on-the-fly to allow switching backends without restarting."""
    _cfg = {}
    try:
        with open(BASE_DIR / "config.json", "r") as f:
            _cfg = json.load(f)
    except Exception:
        pass

    api_key = os.environ.get("LLM_API_KEY", _cfg.get("LLM_API_KEY", ""))
    backend = os.environ.get("CHAT_BACKEND", _cfg.get("CHAT_BACKEND", "ollama")).lower()
    
    # Default model dipilih dari INTENT backend (bukan ada/tidaknya key) biar salah-konfig
    # kelihatan. Prod: SELALU set MYDHAMMA_CHAT_MODEL eksplisit (ID persis dari provider, mis. openrouter.ai/models).
    if backend == "api":
        _dm = "google/gemma-3-27b-it"   # fallback aman; ganti ke pilihanmu via env/config.json
    else:
        _dm = "gemma4:12b"
    model = os.environ.get("MYDHAMMA_CHAT_MODEL", _cfg.get("MYDHAMMA_CHAT_MODEL", _dm))
        
    url = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
    return {"api_key": api_key, "backend": backend, "model": model, "url": url}

# Variabel ini tetap disediakan untuk fallback jika ada kode lama yang memanggilnya, tapi disarankan pakai _get_chat_config()
_initial_cfg = _get_chat_config()
LLM_API_KEY = _initial_cfg["api_key"]
CHAT_BACKEND = _initial_cfg["backend"]
CHAT_MODEL = _initial_cfg["model"]
OLLAMA_URL = _initial_cfg["url"]

# Header atribusi (dikirim ala OpenRouter: HTTP-Referer + X-Title; provider lain mengabaikan).
# 1 sumber, override lewat env LLM_APP_URL / LLM_APP_NAME.
LLM_APP_URL = os.environ.get("LLM_APP_URL", "https://mydhamma.app")
LLM_APP_NAME   = os.environ.get("LLM_APP_NAME", "myDhamma")
# Base URL endpoint OpenAI-compatible. Default OpenRouter, tapi bisa diarahin ke provider lain
# yg OpenAI-compatible (DeepInfra/Together/Fireworks/Novita/Gemini-openai) -> cukup ganti env, no code.
LLM_API_URL     = os.environ.get("LLM_API_BASE", "https://openrouter.ai/api/v1").rstrip("/") + "/chat/completions"
def _api_headers(api_key: str) -> dict:
    return {"Authorization": f"Bearer {api_key}",
            "HTTP-Referer": LLM_APP_URL, "X-Title": LLM_APP_NAME}

# Guard migrasi: kalau backend=api tapi key kosong, DULU diam-diam jatuh ke Ollama
# (127.0.0.1:11434) yg tak ada di VPS -> error "LLM lokal" menyesatkan. Sekarang gagal jelas.
if CHAT_BACKEND == "api" and not LLM_API_KEY:
    print("=" * 72)
    print("[!] PERINGATAN: CHAT_BACKEND=api TAPI LLM_API_KEY KOSONG.")
    print("    Chat akan gagal (HTTP 401). Set LLM_API_KEY di environment/.env.")
    print("    (Search & fitur non-chat tetap jalan.)")
    print("=" * 72)
# Thinking mode default MATI: qwen3 dgn thinking 3-6x lebih lambat (sapaan bisa 30s) tanpa
# manfaat nyata utk RAG ini. Set MYDHAMMA_CHAT_THINK=1 utk menyalakan. think:false aman utk
# model non-thinking (qwen2.5 balas 200, param diabaikan).
_CHAT_THINK = os.environ.get("MYDHAMMA_CHAT_THINK", "").lower() in ("1", "true", "yes")
# num_ctx: Ollama default cuma 2048 -> prompt RAG (system + answer-guide + 9+ passage + reminder)
# tembus jauh, dan Ollama MEMOTONG DIAM-DIAM DARI DEPAN. Akibatnya passage terbaik (mis. AN 9.64
# yg ngelist lengkap) kebuang, model cuma liat ekor prompt -> under-answer/ngawur. Set cukup besar
# agar seluruh prompt muat. WAJIB sama di semua call ke model yg sama, beda num_ctx = Ollama reload
# model tiap request (lambat). 8192 ~+1.5GB KV cache utk 14b, aman di 12GB.
# CHAT_NUM_CTX = int(os.environ.get("MYDHAMMA_CHAT_NUM_CTX", "8192"))
CHAT_NUM_CTX = int(os.environ.get("MYDHAMMA_CHAT_NUM_CTX", "12288"))
# Budget karakter untuk teks-tool (passage hasil retrieval) per panggilan tool. Mencegah
# total prompt (system + answer-guide + passage + history + reminder) menembus CHAT_NUM_CTX,
# yg bikin Ollama memotong DARI DEPAN (system prompt hilang). ~11000 char ≈ 3.3k token
# (@~3.3 char/token utk teks id+diakritik). Sutta yg di-@mention (⭐/expand) & glosari
# dikecualikan dari budget. Naikkan kalau num_ctx dinaikkan.
TOOL_TEXT_BUDGET = int(os.environ.get("MYDHAMMA_TOOL_TEXT_BUDGET", "11000"))


def _sse(obj: dict) -> str:
    """Bungkus dict jadi satu event Server-Sent Events (dipakai gen() streaming)."""
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"


# Tool yang ditawarkan ke LLM. Agen memutuskan sendiri kapan & dgn argumen apa
# memanggil search_sutta (query wajib; pitaka/language opsional).
_CHAT_TOOLS = [{
    "type": "function",
    "function": {
        "name": "search_sutta",
        "description": ("Cari teks di korpus Tipiṭaka (Sutta/Vinaya/Abhidhamma) berdasarkan kata "
                        "kunci atau topik. WAJIB dipanggil sebelum menjelaskan Dhamma agar jawaban "
                        "bersumber pada teks, bukan ingatan model."),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string",
                          "description": "Kata kunci / topik yg dicari, mis. 'empat kebenaran mulia' atau 'sigalovada'."},
                "pitaka": {"type": "string", "enum": ["sutta", "vinaya", "abhidhamma"],
                           "description": "Opsional: batasi pencarian ke satu kitab."},
                "language": {"type": "string", "enum": ["id", "en"],
                             "description": ("Bahasa korpus yg dicari. Default: IKUTI bahasa "
                                             "antarmuka/pertanyaan pengguna (jangan asal 'id'). "
                                             "Pilih 'id' bila pengguna jelas ingin teks/terjemahan "
                                             "Indonesia (mis. memilih versi terjemahan Indo).")},
            },
            "required": ["query"],
        },
    },
}, {
    "type": "function",
    "function": {
        "name": "ask_clarification",
        "description": ("Gunakan SANGAT JARANG: HANYA bila pesan user benar-benar ambigu antara MELANJUTKAN "
                        "sutta dari turn sebelumnya vs GANTI topik, dan keduanya sama-sama mungkin. "
                        "DILARANG memakai tool ini untuk menanyakan 'dari perspektif/sudut pandang apa' atau "
                        "menawarkan pilihan ilmiah/umum/agama lain — pertanyaan topik Dhamma APA PUN "
                        "(mis. 'penyebab gempa bumi') LANGSUNG dijawab via search_sutta dari sudut pandang "
                        "Theravāda, JANGAN diklarifikasi."),
        "parameters": {
            "type": "object",
            "properties": {
                "question": {"type": "string", "description": "Pertanyaan klarifikasi yang ramah untuk ditanyakan ke pengguna."}
            },
            "required": ["question"]
        }
    }
}]

# System prompt RINGKAS & tool-forward. Model 7b (qwen2.5) jauh lebih patuh memanggil
# tool kalau mandat tool ada di depan & prompt tidak bertele-tele (prompt 8-aturan lama
# bikin tool_calls tak pernah terpicu — model malah menjawab dari ingatan).



import json
import os

_PROMPTS_CACHE = None
_PROMPTS_MTIME = 0


def _join_prompt_lines(obj):
    """Nilai prompt boleh ditulis di prompts.json sbg ARRAY baris (1 elemen = 1 baris) supaya
    file kebaca & tetap JSON valid (JSON tak izinkan newline mentah dalam string). Saat load,
    array digabung jadi string ber-newline. String biasa dibiarkan apa adanya (backward-compat),
    jadi kedua format boleh dicampur."""
    if isinstance(obj, list):
        return "\n".join(str(x) for x in obj)
    if isinstance(obj, dict):
        return {k: _join_prompt_lines(v) for k, v in obj.items()}
    return obj


def get_prompts():
    global _PROMPTS_CACHE, _PROMPTS_MTIME
    prompts_file = os.path.join(os.path.dirname(__file__), "prompts.json")
    try:
        mtime = os.path.getmtime(prompts_file)
        if _PROMPTS_CACHE is None or mtime > _PROMPTS_MTIME:
            with open(prompts_file, "r", encoding="utf-8") as f:
                _PROMPTS_CACHE = _join_prompt_lines(json.load(f))
            _PROMPTS_MTIME = mtime
    except Exception as e:
        print(f"Error loading prompts: {e}")
        if _PROMPTS_CACHE is None:
            # Fallback
            _PROMPTS_CACHE = {"_CHAT_SYSTEM": {"id": "", "en": ""}, "_CHAT_ANSWER_GUIDE": {"id": "", "en": ""}}
    return _PROMPTS_CACHE

# Panduan GAYA jawaban final (fase 2, call tanpa tools). Dipisah dari get_prompts()["_CHAT_SYSTEM"]
# supaya fase keputusan tetap ringkas (tool-forward), tapi jawaban akhir kaya & terstruktur.


# Kamus Sanskerta/nama -> Pali (deterministik; ditegakkan pada jawaban akhir LLM).
# SATU SUMBER utk backend & frontend: gabungan TERM_MAP (di bawah) di-inject ke base.html
# (window.DK_TERM_MAP) dan dipakai enforceTheravadaTerms chat.js SAAT STREAMING — dulu dua
# salinan tangan FE/BE drift, koreksi BE-only baru muncul pas final = teks "berubah" abis stream.
_THERAVADA_MAP = [
    # Kombinasi nama DULUAN — kalau kata-tunggal duluan, "Gautama Siddhartha" keburu jadi
    # "Gotama Siddhattha" & pola kombinasi tak pernah match.
    (r"(?:gautama|gotama)[\s,]+(?:siddhartha|siddhattha|siddharta)", "Siddhattha Gotama"),
    (r"(?:siddhartha|siddhattha|siddharta)[\s,]+(?:gautama|gotama)", "Siddhattha Gotama"),
    (r"gautama", "Gotama"), (r"siddhartha|siddharta", "Siddhattha"),
    (r"nirv[aā]na", "Nibbāna"), (r"karma", "Kamma"), (r"dharma", "Dhamma"),
    (r"skandhas?", "khandha"), (r"dhyanas?", "jhāna"), (r"praj(?:n|ñ)a", "paññā"),
    (r"vij(?:n|ñ)ana", "viññāṇa"), (r"samskaras?", "saṅkhāra"), (r"trishna", "taṇhā"),
    (r"anatman", "anattā"), (r"avidya", "avijjā"), (r"sh?unyata", "suññatā"),
    (r"bhikshus?", "bhikkhu"), (r"bhikshun[iī]s?", "bhikkhunī"),
    # "bikun[iī]" DIHAPUS (2026-07-09): "bikuni" = bentuk KBBI yg justru DITUJU _KBBI_MAP
    # (biksuni->bikuni, sengaja; "beda kata" dgn bhikkhunī). Entry lama bikin model yg meniru
    # "bikuni" dari history ke-flip jadi "bhikkhunī" di final (stream != final) & non-idempoten.
    (r"bhiksun[iī]s?", "bhikkhunī"),
    (r"sutras?", "sutta"), (r"sutera", "sutta"),
    (r"shraddha", "saddhā"), (r"maitri", "mettā"), (r"duhkha", "dukkha"),
    (r"kleshas?", "kilesa"), (r"pratityasamutpada", "paṭiccasamuppāda"),
    (r"satya", "sacca"), (r"arya", "ariya"),
    (r"bodhisattva", "bodhisatta"), (r"arhat", "arahant"),
]

# Normalisasi DIAKRITIK istilah Pali "telanjang" -> ejaan korpus yg benar. Model kecil sering
# menulis tanpa diakritik (satipatthana, nibbana) walau sumber pakai diakritik. Ini BUKAN mengarang
# (kata sama, ejaan benar). Kurasi: hanya istilah frekuensi tinggi & rendah-tabrakan dgn kata Indonesia
# (sengaja TIDAK memasukkan "sila"/"mara"/"nana" yg ambigu). Pola panjang ditaruh dulu (parinibbana
# sebelum nibbana) — aman krn \b\b, tapi urutan dijaga utk jelas.
_PALI_DIACRITIC_MAP = [
    (r"satipatthana", "satipaṭṭhāna"), (r"parinibbana", "parinibbāna"), (r"nibbana", "nibbāna"),
    (r"paticcasamuppada", "paṭiccasamuppāda"), (r"brahmavihara", "brahmavihāra"),
    (r"vipassana", "vipassanā"), (r"samadhi", "samādhi"), (r"jhana", "jhāna"),
    (r"panna", "paññā"), (r"metta", "mettā"), (r"karuna", "karuṇā"), (r"mudita", "muditā"),
    (r"upekkha", "upekkhā"), (r"tanha", "taṇhā"), (r"anatta", "anattā"), (r"sankhara", "saṅkhāra"),
    (r"nikaya", "nikāya"), (r"tipitaka", "tipiṭaka"), (r"patimokkha", "pātimokkha"),
    (r"tipiṭika", "tipiṭaka"), (r"piṭika", "piṭaka"), (r"piṭṭaka","piṭaka"),   # typo model: -ṭika -> -ṭaka (Piṭaka/Tipiṭaka)
    # Potongan model: "Vinaya Piṭa" (kena live 2026-07-09). Aman: "piṭa"/"tipiṭa" TIDAK ada
    # sbg kata utuh di korpus pli/id/en (diverifikasi); "pita" polos (Indonesia) tak tersentuh
    # krn pola wajib ber-ṭ. CATATAN: "Tripitaka" SENGAJA tidak di-map — korpus ID sendiri
    # pakai "Tripitaka Pali" (blurbs, 5x; "tipiṭaka" 0x) = nama Indonesia yg sah.
    (r"piṭa", "piṭaka"), (r"tipiṭa", "tipiṭaka"),
    (r"sotapanna", "sotāpanna"), (r"sakadagami", "sakadāgāmī"), (r"anagami", "anāgāmī"),
    (r"kasina", "kasiṇa"), (r"sangha", "saṅgha"),
    (r"budha", "Buddha"),        # typo umum
    (r"upasatha", "uposatha"),   # model sering salah eja (prefix "upa-" jauh lebih umum di Pali)
]

# Ejaan KBBI: bentuk Indonesia "biksu"/"biksuni" -> "biku"/"bikuni" (deterministik;
# istilah Pāḷi "bhikkhu"/"bhikkhunī" sengaja TIDAK disentuh — beda kata). "biksuni"
# didahulukan biar tak keduluan oleh pola "biksu".
_KBBI_MAP = [
    (r"biksuni", "bikuni"), (r"biksu", "biku"),
    (r"buku", "kitab"),   # konteks keagamaan: SELALU 'kitab', bukan 'buku' (kapitalisasi dijaga make_repl)
]

# SATU SUMBER peta istilah utk BE (final.answer) & FE (streaming, via window.DK_TERM_MAP di
# base.html). Urutan dijaga (kombinasi-nama dulu, biksuni sebelum biksu). Pola harus valid
# di regex Python DAN JS (char-class/alternation sederhana; TANPA \b — boundary ditambah
# masing-masing sisi: \b unicode di Python, lookaround sadar-diakritik di chat.js).
TERM_MAP = _THERAVADA_MAP + _PALI_DIACRITIC_MAP + _KBBI_MAP
_TERM_RES = [(re.compile(rf"\b(?:{p})\b", re.IGNORECASE), rep) for p, rep in TERM_MAP]

# Gloss stutter "X (X)" -> "X". Peta istilah bisa MENCIPTAKAN redundansi dari gloss yg tadinya
# sah: model nulis "Nibbāna (Nirvana)" (informatif) -> map ubah isi kurung -> "Nibbāna (Nibbāna)".
# Backref \1 case-insensitive (re.I) tapi DIAKRITIK-sensitif: gloss ejaan beda huruf
# ("paṭicca (paticca)") bukan stutter -> dibiarkan. Emphasis * di kedua sisi ditoleransi.
# Mirror di chat.js (enforceTheravadaTerms) — dijaga sync-test node di tests/test_postprocess.py.
_SELF_GLOSS_RE = re.compile(
    r"(?<![\w\-])([^\W\d_][\w\-]*)(\*{0,2})[ \t]*\(\s*\*{0,2}\1\*{0,2}\s*\)", re.IGNORECASE)

# Kata umum yg TIDAK boleh memicu pencocokan nama-sutta (anti false-positive).
_NAME_MATCH_STOPWORDS = {
    "tentang", "kepada", "dengan", "untuk", "yaitu", "adalah", "bagaimana", "mengapa",
    "mengenai", "dalam", "sebuah", "seorang", "tersebut", "menurut", "sutta", "nikaya",
    "tipitaka", "dhamma", "buddha", "about", "which", "there", "their", "these", "those",
    "could", "would", "should", "theravada", "explain", "meaning",
}


def _enforce_theravada_terms(text: str) -> str:
    """Ganti istilah Sanskerta -> Pali, pertahankan kapitalisasi token aslinya.
    Semantik casing HARUS identik dgn loop replacements enforceTheravadaTerms chat.js
    (ALL-CAPS -> rep upper; Kapital-awal -> rep kapital-awal; lowercase -> rep lower) —
    dulu match lowercase BE balikin rep apa adanya ("nirvana" -> "Nibbāna") sementara FE
    nge-lower ("nibbāna") -> teks flip pas final."""
    if not text:
        return text
    def make_repl(rep):
        def f(m):
            s = m.group(0)
            if s.isupper() and len(s) > 1:
                return rep.upper()
            if s[:1].isupper():
                return rep[:1].upper() + rep[1:]
            return rep.lower()
        return f
    for cre, rep in _TERM_RES:
        text = cre.sub(make_repl(rep), text)
    # Bersihkan gloss stutter "X (X)" yg tercipta dari penggantian peta di atas (lihat
    # komentar _SELF_GLOSS_RE). Aman lolos uji transform: salah-tembak terburuknya cuma
    # membuang kurung duplikat-persis (kosmetik), tak pernah mengubah kata/struktur.
    text = _SELF_GLOSS_RE.sub(r"\1\2", text)
    # Pemecah calque ", di mana <klausa>" DIHAPUS (2026-07-09): regex tak bisa bedakan calque
    # dari konstruksi SAH — ", di mana pun ia berada" -> ". Pun ia berada." dan pertanyaan
    # tak-langsung "bertanya, di mana X" -> dua kalimat ngaco (dibuktikan). Kelas kegagalan
    # sama dgn sanitizer Pali: transform yg bisa MERUSAK kalimat > gaya yg diperbaikinya.
    # Calque kini murni urusan soft-rule prompt (batas model, jangan ditegakkan regex).
    text = _fix_collection_names(text)
    return text


# 'namun' sah HANYA sbg konjungsi ANTARKALIMAT (awal kalimat); intrakalimat ("kaya,
# namun kikir") baku-nya 'tetapi'. Aturan sudah ada di prompt (rule 3 _CHAT_SYSTEM)
# tapi model tetap sering melanggar -> tegakkan deterministik. Beda dgn calque "di mana"
# yg dihapus (transform bisa merusak kalimat): swap namun->tetapi mempertahankan struktur
# kalimat apa adanya, salah-tembak terburuknya cuma pilihan kata sinonim.
# Baris blockquote ('> ') = kutipan langsung sutta, JANGAN disentuh (fidelitas kutipan).
# Semantik HARUS identik dgn fixIntraNamun di chat.js (kalau beda, teks 'flip' pas final).
_NAMUN_RE = re.compile(r'(\S)([ \t]+)(namun)\b', re.IGNORECASE)
_NAMUN_KEEP_PREV = set('.!?…:>*-|"\'“”‘’')


def _fix_intra_namun(text: str) -> str:
    if not text or "namun" not in text.lower():
        return text

    def _repl(m):
        prev, sp, w = m.group(1), m.group(2), m.group(3)
        if prev in _NAMUN_KEEP_PREV:
            return m.group(0)   # awal kalimat/bullet/kutipan -> antarkalimat, biarkan
        rep = "TETAPI" if w.isupper() else ("Tetapi" if w[:1].isupper() else "tetapi")
        return prev + sp + rep

    return "\n".join(ln if ln.lstrip().startswith(">") else _NAMUN_RE.sub(_repl, ln)
                     for ln in text.split("\n"))


# Validator nama koleksi: nama nikāya/koleksi ditulis GABUNG (Saṁyuttanikāya, Suttanipāta),
# bukan ber-spasi, & harus COCOK dgn kode dalam kurung. Sumber nama = reader (grounded korpus),
# bukan hard-code. Model kecil sering (a) memberi spasi ('Saṁyutta Nikāya') atau (b) mengonflasi
# ('Saṁyutta Nipāta' utk Snp). KODE dipercaya > nama (kode pendek jarang salah).
_COLL_NAMES_MAP = None
_COLL_NAME_RE = None


def _collection_names_map() -> dict:
    """{kode_lower: nama kanonik gabung}, mis. {'sn':'Saṁyuttanikāya','snp':'Suttanipāta'}."""
    global _COLL_NAMES_MAP
    if _COLL_NAMES_MAP is None:
        m = {}
        for c in reader.collection_codes():
            nm = reader._sutta_names.get(str(c).lower())
            if nm:
                m[str(c).lower()] = nm
        _COLL_NAMES_MAP = m
    return _COLL_NAMES_MAP


def _collection_name_re():
    global _COLL_NAME_RE
    if _COLL_NAME_RE is None:
        codes = sorted(_collection_names_map().keys(), key=len, reverse=True)
        alt = "|".join(re.escape(str(c)) for c in codes)
        # Nama = 1-2 kata berhuruf-awal kapital TEPAT sebelum '(KODE)'. Kode case-insensitive &
        # tanpa angka di dalam kurung (cegah match rujukan sutta spt '(MN 10)'). Kata pemandu
        # kapital di depan (mis. 'Berisi') otomatis tak ikut krn pola butuh '(' tepat sesudahnya.
        _COLL_NAME_RE = re.compile(
            r'((?:[A-Z][^\W\d_]*\s+)?[A-Z][^\W\d_]*)\s*\(\s*((?i:' + alt + r'))\s*\)')
    return _COLL_NAME_RE


def _norm_coll(s: str) -> str:
    return unicodedata.normalize("NFD", (s or "").lower()).encode("ascii", "ignore").decode().replace(" ", "")


def _shared_suffix_len(a: str, b: str) -> int:
    n = 0
    for x, y in zip(reversed(a), reversed(b)):
        if x != y:
            break
        n += 1
    return n


def _fix_collection_names(text: str) -> str:
    """Tegakkan nama koleksi kanonik-gabung sesuai kode dalam kurung:
      (1) benar tapi ber-spasi: 'Saṁyutta Nikāya (SN)' -> 'Saṁyuttanikāya (SN)'
      (2) salah utk kodenya   : 'Saṁyutta Nipāta (Snp)' -> 'Suttanipāta (Snp)'
    Aman: frasa non-nama ('Bagian Penting (SN)') TAK disentuh — hanya bila ternormalisasi sama
    ATAU se-tipe (berbagi akhiran >=5 huruf, mis. '…nipata'). Kata terakhir yg SUDAH kanonik
    dibiarkan (mis. 'Berisi Saṁyuttanikāya (SN)')."""
    if not text:
        return text
    names = _collection_names_map()

    def repl(m):
        name, code = m.group(1), m.group(2)
        canon = names.get(code.lower())
        if not canon:
            return m.group(0)
        nN, nC = _norm_coll(name), _norm_coll(canon)
        if _norm_coll(name.split()[-1]) == nC:        # kata terakhir sudah kanonik-gabung -> biarkan
            return m.group(0)
        if nN == nC or _shared_suffix_len(nN, nC) >= 5:
            return canon + " (" + code + ")"
        return m.group(0)

    return _collection_name_re().sub(repl, text)


def _strip_invented_pali_glosses(text: str, source: str) -> str:
    """Buang gloss Pali 'ngarang' dalam kurung, termasuk yang tanpa diakritik,
    selama kata tersebut TIDAK muncul di sumber dan bukan rujukan sutta.
    """
    if not text or not source:
        return text
    src = unicodedata.normalize("NFD", source.lower()).encode("ascii", "ignore").decode()

    def repl(m):
        inner = m.group(1)
        # Abaikan jika kosong
        if not inner.strip():
            return m.group(0)

        # Jika mengandung diakritik Pali -> pasti Pali
        if any(c in _PALI_DIACRITICS for c in inner):
            norm = unicodedata.normalize("NFD", inner.lower()).encode("ascii", "ignore").decode()
            return m.group(0) if (norm and norm in src) else ""
        
        # Jika TIDAK mengandung diakritik:
        # Hanya curigai sebagai Pali jika:
        # - hanya terdiri dari huruf kecil (a-z) tanpa spasi/angka/tanda baca
        # - bukan singkatan sutta (tidak ada pola "XX 12.3")
        if re.fullmatch(r"[a-z]+", inner):
            # Cek apakah kata ini ada di sumber
            norm = inner.lower()
            if norm not in src:
                return ""   # hapus karena tidak ada di sumber -> mungkin ngawur
        return m.group(0)   # selain itu biarkan

    # Tangkap isi kurung (tanpa kurung di dalamnya)
    text = re.sub(r"\s*\(([^()]+)\)", repl, text)
    return re.sub(r"[ \t]{2,}", " ", text)

_PALI_DIACRITICS = set("āīūṁṃṅñṭḍṇḷ")
_LINGUA_DETECTOR = None


def _get_pali_vocabulary(unique_suttas):
    """
    Ekstrak daftar kosakata Pali unik dari teks Pāli asli milik sutta yang di-retrieve.
    Mengembalikan dict {sutta_id: [pali_words_with_diacritics]}
    """
    vocab: dict[str, list[str]] = {}
    for s in unique_suttas:
        sid = s.get("sutta_id")
        if not sid:
            continue
        pali_words: set[str] = set()
        chunks = reader._get_sutta_from_raw(sid, "pli")
        if not chunks:
            chunks = reader._get_sutta_from_html(sid, "pli", "ms")
        if chunks:
            for c in chunks:
                text = c.get("pli_text") or c.get("pli") or ""
                if not text and "parts" in c:
                    text = " ".join(p.get("pli", "") for p in c["parts"])
                if text:
                    for w in re.findall(r"[a-zA-Zāīūṁṃṅñṭḍṇḷāīūṁṃṅñṭḍṇḷ\-]+", text):
                        w_clean = w.lower().strip("-.,;!?()\"'")
                        if len(w_clean) >= 6 and (any(char in _PALI_DIACRITICS for char in w_clean) or "bojjha" in w_clean):
                            pali_words.add(w.strip("-.,;!?()\"'"))
        if pali_words:
            # Ambil maks 40 kata terpanjang/terpenting agar hemat token
            vocab[sid] = sorted(list(pali_words), key=len, reverse=True)[:40]
    return vocab


_EN_HINT = set(
    "the of and to is what how why who which are can does in on for about a an it with as by at from "
    "this that these those not but or if then than out up down over under again once twice here there "
    "when where all any both each few more most other some such no nor only own same so very s t "
    "can will just should now d ll m o re ve y ain aren couldn didn doesn hadn hasn haven isn ma "
    "mightn mustn needn shan shouldn wasn weren won wouldn "
    "noble truths moral shame mindfulness suffering wisdom concentration view effort livelihood action "
    "speech thought resolve path factor factors monk monks nuns nun layperson rebirth heaven hell "
    "karma deed greed hatred delusion ethics precepts virtue meditation release liberation awakening "
    "enlightenment deathless peace calm tranquility".split()
)
_ID_HINT = set(
    "apa bagaimana mengapa siapa yang adalah bisa apakah kenapa gimana dan ke dari tentang itu ini "
    "untuk dengan pada oleh dalam bagi serta tetapi namun melainkan hanya jika kalau bila agar "
    "supaya karena sebab hingga sehingga ketika sambil sebelum setelah sejak selama semenjak "
    "sementara seraya tatkala bagai seperti laksana daripada kepada ialah merupakan yaitu yakni "
    "ada tidak bukan belum jangan bahwa saya kami kita kamu dia mereka ia nya "
    "mulia kebenaran penderitaan konsentrasi perhatian kebijaksanaan ketidakkekalan tanpa diri "
    "jiwa agregat faktor jalan biksu bikkhu bhikkhu bhikkhuni umat kelahiran kembali surga neraka "
    "perbuatan keserakahan kebencian ilusi kebodohan sila kemoralan meditasi pembebasan pencerahan "
    "perdamaian ketenangan".split()
)


def detect_query_lang(query: str, default_lang: str = "id") -> str:
    """Deteksi bahasa kueri utk korpus & bahasa jawaban. Token Pali (istilah yg diselipkan) TIDAK
    menentukan bahasa kalimat: codeswitch 'what is viññāṇa' TETAP EN, 'apa itu viññāṇa' TETAP ID.
    'pli' HANYA bila kueri MURNI Pali (tak ada satu pun kata non-Pali).

    Prinsip: kalau RAGU, JANGAN nebak -> kembalikan default_lang. Bar saran bahasa di FE cuma
    nongol saat deteksi != db aktif, jadi 'ragu = diam' langsung mengurangi tebakan salah yg
    ganggu. Urutan: sisihkan token Pali (diakritik + bentuk ASCII istilah Pali dari korpus pli)
    -> lingua atas SISA dgn AMBANG keyakinan (lebih ketat utk sisa 1-kata) -> kata-petunjuk
    -> default."""
    q = (query or "").strip()
    if not q:
        return default_lang
    words = re.findall(r"[^\W\d_]+", q.lower(), re.UNICODE)
    if not words:
        return default_lang
    # Token Pali BUKAN penentu bahasa kalimat -> disingkirkan dulu: (a) berdiakritik, (b) bentuk
    # ASCII istilah Pali yg ada di korpus pli (mis. 'dukkha','nibbana','anatta'). Tanpa (b),
    # istilah Pali telanjang bikin lingua ngasal (sering satu bahasa dgn PD tinggi tapi SALAH).
    try:
        pali_stripped = _pali_vocab()[0]
    except Exception:
        pali_stripped = set()

    def _is_pali_tok(w: str) -> bool:
        return any(c in _PALI_DIACRITICS for c in w) or (_ascii_lower(w) in pali_stripped)

    plain = [w for w in words if not _is_pali_tok(w)]
    if not plain:
        return "pli"          # tak ada kata non-Pali sama sekali -> kueri murni Pali
    rest = " ".join(plain)

    # Lingua (EN/ID) atas SISA — TAPI cuma dipercaya bila cukup yakin. Sisa 1-kata gampang
    # meleset: istilah teknis/Pali-pendek ('citta','kamma','jhana') skor ~0.6-0.89 (ambigu) ->
    # ambang dinaikin ke 0.90 shg jatuh ke default; kata EN/ID asli 1-kata ('meditation'~0.91,
    # 'meditasi'~0.95) tetap lolos. Sisa >=2 kata sudah stabil -> 0.70 cukup.
    try:
        from lingua import Language, LanguageDetectorBuilder
        global _LINGUA_DETECTOR
        if _LINGUA_DETECTOR is None:
            _LINGUA_DETECTOR = LanguageDetectorBuilder.from_languages(Language.ENGLISH, Language.INDONESIAN).build()
        vals = _LINGUA_DETECTOR.compute_language_confidence_values(rest)
        if vals:
            top = vals[0]
            min_conf = 0.90 if len(plain) <= 1 else 0.70
            if top.value >= min_conf:
                return top.language.iso_code_639_1.name.lower()
    except Exception:
        pass

    # Lingua ragu/gagal -> kata-petunjuk (function words) sbg jaring pengaman (nangkep juga
    # content-word EN/ID yg lingua underscore). Kalau ini pun seri/kosong -> JANGAN nebak.
    plain_set = set(plain)
    en_count = len(plain_set & _EN_HINT)
    id_count = len(plain_set & _ID_HINT)
    if en_count > id_count:
        return "en"
    elif id_count > en_count:
        return "id"
    else:
        return default_lang


# Sapaan/basa-basi: dideteksi DETERMINISTIK (bukan LLM — qwen sering salah menandai
# pertanyaan Dhamma sbg basa-basi). Bias ke "cari": hanya pesan PENDEK yg jelas diawali
# sapaan yg dilewati retrieval; sisanya selalu di-retrieve agar jawaban grounded.
_SMALLTALK_RE = re.compile(
    r"^\s*(hai|halo+|hallo|h[ae]llo|hi+|hey+|selamat\s+(pagi|siang|sore|malam)|pagi|siang|sore|malam|"
    r"terima\s*kasih|makasih\w*|thank(s| you)?|thx|namo\s+buddhaya|assalam\w*|"
    r"(kamu|anda)\s+siapa|siapa\s+(kamu|anda|kau)|who\s+are\s+you|apa\s+kabar|how\s+are\s+you|"
    r"ok(e|ay)?|sip\w*|mantap|baik|bagus|test+|tes+)\b", re.IGNORECASE)


def _is_smalltalk(query: str) -> bool:
    """True hanya utk pesan pendek (≤5 kata) yg diawali pola sapaan/basa-basi."""
    q = (query or "").strip()
    if not q:
        return True
    if len(q.split()) > 5:
        return False
    return bool(_SMALLTALK_RE.match(q))


# Rujukan KOLEKSI sbg KESELURUHAN (mis. "@Dhp", "apa itu Itivuttaka") — beda dari sutta+nomor.
# Tanpa ini, "@Dhp itu apa" jatuh ke semantic acak & model ngarang (Dhp dikira ada di AN).
# Jawaban di-ground dari reader.glossary_entry (nama+blurb otoritatif+hierarki+jumlah teks).
_COLLECTION_CODES = None
_DEFN_CUE_RE = re.compile(
    r"\b(apa(\s*(itu|sih|kah|maksud\w*))?|itu\s+apa|jelas\w*|maksud\w*|arti\w*|tentang|"
    r"what\s+(is|are)|explain|tell\s+me\s+about|meaning\s+of)\b", re.IGNORECASE)


def _collection_codes() -> set:
    global _COLLECTION_CODES
    if _COLLECTION_CODES is None:
        _COLLECTION_CODES = reader.collection_codes()
    return _COLLECTION_CODES


def _detect_collection_refs(query: str) -> list:
    """Kode koleksi yg dirujuk sbg KESELURUHAN (bukan sutta+nomor). Dua pemicu:
    (1) @kode telanjang tanpa angka (mis. '@Dhp', '@iti'); (2) pertanyaan definitif
    ('apa itu X', 'what is X') yg menyebut kode ATAU nama kanonik koleksi. '@AN 3.65'
    & 'an 3.65' SENGAJA tak terpicu (ada angka -> sutta spesifik, ditangani jalur mention).
    Seragam utk semua koleksi — tak ada penanganan per-kitab."""
    if not query:
        return []
    codes = _collection_codes()
    refs = []
    # (1) @kode telanjang, tak diikuti angka (mis. '@Dhp 1' / '@dhp1-20' = mention, dilewati)
    for m in re.finditer(r"@\s*([a-zA-Z][a-zA-Z\-]*)\b(?!\s*\d)", query):
        c = reader.shorten_sutta_id(m.group(1).lower())
        if c in codes:
            refs.append(c)
    # (2) pertanyaan definitif yg menyebut koleksi via kode atau nama kanonik
    if _DEFN_CUE_RE.search(query):
        ql = " " + re.sub(r"\s+", " ", query.lower()) + " "
        ql_clean = unicodedata.normalize("NFD", ql).encode("ascii", "ignore").decode()
        for c in codes:
            # kode sbg token utuh, BUKAN diikuti angka (itu sutta spesifik, mis. 'an 3.65')
            if re.search(r"(?<![a-z])" + re.escape(c) + r"(?![a-z\-])(?!\s*\d)", ql_clean):
                refs.append(c)
                continue
            name = reader._sutta_names.get(c)
            if name and len(name) >= 5:
                nm = unicodedata.normalize("NFD", name.lower()).encode("ascii", "ignore").decode()
                if re.search(r"(?<![a-z])" + re.escape(nm) + r"(?![a-z])", ql_clean):
                    refs.append(c)
    return list(dict.fromkeys(refs))


def _glossary_blocks(coll_refs: list, prompt_db: str):
    """Bangun blok teks GLOSARI grounded utk daftar kode koleksi. Balas (blocks, abbrs)."""
    blocks, abbrs = [], []
    for c in coll_refs:
        g = reader.glossary_entry(c, prompt_db)
        if not g:
            continue
        abbrs.append(g["abbr"])
        head = g["abbr"] + (f" — {g['name']}" if g.get("name") else "")
        parts = [f"{head} adalah sebuah koleksi dalam Tipiṭaka, bukan satu sutta tunggal."]
        if g.get("hierarchy"):
            parts.append("Letak: " + " › ".join(g["hierarchy"]) + f" › {g['abbr']}")
        if g.get("count"):
            parts.append(f"Berisi {g['count']} teks.")
        if g.get("blurb"):
            parts.append(g["blurb"])
        # Peringatan INLINE supaya model tak mengarang istilah Pali di luar blurb.
        # Ditaruh dekat teks (bukan di system prompt yg jauh) — lebih efektif utk model kecil.
        parts.append("⚠ Sampaikan isi blurb di atas APA ADANYA. JANGAN menambahkan istilah "
                     "Pali dalam kurung yang TIDAK tertulis di teks ini.")
        blocks.append("\n".join(parts))
    return blocks, abbrs


def _llm_json(messages: list, fmt: str = "json", temperature: float = 0.2) -> str:
    """Panggilan Ollama non-stream (utk query-rewrite). Balas string content; '' bila gagal."""
    c = _get_chat_config()
    if c["backend"] == "api":
        payload: dict = {
            "model": c["model"], 
            "messages": messages, 
            "max_tokens": 400,
            "temperature": temperature,
        }
        if fmt == "json":
            payload["response_format"] = {"type": "json_object"}
            
        try:
            headers = _api_headers(c["api_key"])
            r = requests.post(LLM_API_URL, json=payload, headers=headers, timeout=120)
            if r.status_code == 200:
                return (r.json().get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
            return ""
        except Exception:
            return ""

    try:
        r = requests.post(f"{c['url']}/api/chat", timeout=120, json={
            "model": c["model"], "messages": messages, "stream": False, "think": _CHAT_THINK,
            "keep_alive": "30m",
            "format": fmt, "options": {"temperature": temperature, "num_ctx": CHAT_NUM_CTX,
                                       "num_predict": 400},  # query rewrite cukup pendek
        })
        return ((r.json().get("message") or {}).get("content") or "").strip()
    except Exception:
        return ""



def _llm_chat(messages: list, tools: list | None = None) -> dict:
    """Panggilan Ollama non-stream / API OpenAI-compatible. Balas message dict {content, tool_calls?}; {} bila gagal.
    Non-stream sengaja: qwen sering emit konten basa-basi BARENG tool_calls — dgn non-stream
    keputusan (panggil tool atau jawab) terbaca utuh, tak perlu menebak urutan token."""

    c = _get_chat_config()
    if c["backend"] == "api":
        payload = {
            "model": c["model"], 
            "messages": messages, 
            "max_tokens": 512,
            "temperature": 0.1
        }
        if tools:
            # OpenRouter / OpenAI tools format is identical to Ollama tools format
            payload["tools"] = tools

        try:
            headers = _api_headers(c["api_key"])
            r = requests.post(LLM_API_URL, json=payload, headers=headers, timeout=60)
            if r.status_code != 200:
                print("LLM API error:", r.text)
                return {"content": f"[LLM API HTTP {r.status_code}]"}
            return (r.json().get("choices", [{}])[0].get("message") or {})
        except Exception as e:
            return {"content": f"[Tidak bisa menghubungi API LLM: {e}]"}

    payload = {"model": c["model"], "messages": messages, "stream": False,
               "think": _CHAT_THINK, "keep_alive": "30m",
               "options": {"temperature": 0.1, "num_ctx": CHAT_NUM_CTX,
                           "num_predict": 512}}  # fase 1: cuma tool call / sapaan, tak perlu panjang
    if tools:
        payload["tools"] = tools

    try:
        r = requests.post(f"{c['url']}/api/chat", json=payload, timeout=60)
        return r.json().get("message") or {}
    except Exception as e:
        return {"content": f"[Tidak bisa menghubungi LLM lokal: {e}]"}


# ── SSE heartbeat ─────────────────────────────────────────────────────────────
# Cloudflare memutus stream yg diam ~100 dtk (tanpa satu byte pun). Fase diam panjang
# di chat: keputusan fase-1 (non-stream), retrieval+rerank, dan prompt-eval sebelum
# token pertama — semuanya bisa >100 dtk → jawaban "kestop tiba-tiba" (bukti: cloudflared
# ERR "stream canceled by remote" di /api/chat). Solusi: selipkan event ping kecil tiap
# _SSE_PING_SECS supaya byte terus mengalir. Frontend mengabaikan {"type":"ping"}.
_SSE_PING_SECS = int(os.environ.get("MYDHAMMA_SSE_PING_SECS", "15"))
_PING = object()   # sentinel heartbeat (bukan teks jawaban)

import concurrent.futures as _cf
# Executor bersama utk panggilan blocking panjang (fase-1 LLM, retrieval) supaya gen()
# bisa memancarkan ping sambil menunggu. -w1 --threads 4 → max 4 request paralel; 8 aman.
_CHAT_BG = _cf.ThreadPoolExecutor(max_workers=8, thread_name_prefix="chat-bg")


def _stream_pump(resp, extract):
    """Baca resp.iter_lines() di thread terpisah; yield potongan teks, selipkan _PING tiap
    _SSE_PING_SECS tanpa data (prompt-eval bisa diam lama sebelum token pertama).
    extract(line) -> (piece|None, stop). try/finally: resp.close() tetap deterministik saat
    client putus (GeneratorExit dari Werkzeug) -> koneksi Ollama drop -> inferensi batal &
    thread pembaca ikut mati. Perilaku pembatalan lama dipertahankan persis."""
    import queue as _queue
    q: "_queue.Queue" = _queue.Queue()
    _DONE = object()

    def _read():
        try:
            for line in resp.iter_lines():
                if not line:
                    continue
                try:
                    piece, stop = extract(line)
                except Exception:
                    continue
                if piece:
                    q.put(piece)
                if stop:
                    break
        except Exception:
            pass
        finally:
            q.put(_DONE)

    threading.Thread(target=_read, daemon=True).start()
    aborted = False
    try:
        while True:
            try:
                item = q.get(timeout=_SSE_PING_SECS)
            except _queue.Empty:
                yield _PING
                continue
            if item is _DONE:
                return
            yield item
    except GeneratorExit:
        # Client putus (tombol Stop / tutup tab / pindah halaman). Tandai supaya finally
        # mencatatnya — resp.close() di bawah menutup koneksi UPSTREAM (OpenRouter/Ollama),
        # provider berhenti generate = billing token BERHENTI, bukan sekadar stop di UI.
        aborted = True
        raise
    finally:
        resp.close()
        if aborted:
            print("[chat] client disconnect → upstream LLM stream closed, token generation aborted", flush=True)


def _llm_stream(messages: list):
    """Stream jawaban FINAL token-demi-token (TANPA tools -> tak ada preamble/tool_call
    menyelip, streaming bersih). Yield potongan teks; konten kosong diabaikan.
    Juga meng-yield sentinel _PING saat lama tak ada data (lihat _stream_pump)."""
    c = _get_chat_config()
    if c["backend"] == "api":
        payload = {
            "model": c["model"], 
            "messages": messages, 
            "stream": True,
            "max_tokens": 4000,
            "temperature": 0.1,
            "repetition_penalty": 1.15 # Equivalent to repeat_penalty slightly
        }
        try:
            headers = _api_headers(c["api_key"])
            resp = requests.post(LLM_API_URL, json=payload, headers=headers, stream=True, timeout=300)
        except Exception as e:
            yield f"[Tidak bisa menghubungi API LLM: {e}]"
            return
        # HTTP non-200 (429 rate-limit, 5xx transient, 401 key, 400 model invalid, content-filter):
        # body-nya JSON error, BUKAN SSE 'data:' — kalau diteruskan ke _stream_pump, _extract_or
        # skip semua baris -> 0 token -> answer kosong -> FE nampilin fallback "chat_no_answer".
        # Mirror _llm_chat (cek status): surface error biar KELIHATAN, jangan nyamar jadi kosong.
        if resp.status_code != 200:
            body = ""
            try:
                body = resp.text[:500]
            except Exception:
                pass
            resp.close()
            print(f"[chat] LLM API stream error HTTP {resp.status_code}: {body}", flush=True)
            yield f"[Server model membalas error (HTTP {resp.status_code}). Coba lagi sebentar lagi.]"
            return

        def _extract_or(line):
            line = line.decode('utf-8', errors='ignore')
            if not line.startswith("data: "):
                return None, False
            data_str = line[6:]
            if data_str == "[DONE]":
                return None, True
            data = json.loads(data_str)
            return data.get("choices", [{}])[0].get("delta", {}).get("content"), False

        yield from _stream_pump(resp, _extract_or)
        return

    payload = {"model": c["model"], "messages": messages, "stream": True,
               "think": _CHAT_THINK, "keep_alive": "30m",
               "options": {"temperature": 0.1, "num_ctx": CHAT_NUM_CTX,
                           "num_predict": 4000,    # cukup untuk jawaban terstruktur panjang
                           "repeat_penalty": 1.15}} # kurangi repetisi kalimat/frasa
    try:
        resp = requests.post(f"{c['url']}/api/chat", json=payload, stream=True, timeout=300)
    except Exception as e:
        yield f"[Tidak bisa menghubungi LLM lokal: {e}]"
        return
    # Saat client putus, Werkzeug menutup generator ini (GeneratorExit di yield) ->
    # _stream_pump.finally memutus koneksi Ollama deterministik -> inferensi batal.
    def _extract(line):
        data = json.loads(line)
        return (data.get("message") or {}).get("content"), bool(data.get("done"))

    yield from _stream_pump(resp, _extract)


def _rewrite_query(query: str, lang: str, failed: list | None = None, history: list | None = None, mentions: list | None = None):
    """Ekspansi kueri user -> 3-5 variasi kueri (sinonim/parafrase) + saran pitaka. SKIP_SEARCH HANYA utk
    sapaan (deteksi deterministik). LLM cuma mengekspansi, TIDAK berwenang memutus skip —
    mencegah pertanyaan Dhamma salah dilewati. Error/timeout -> fallback ([query], None)."""
    if _is_smalltalk(query):
        return ["SKIP_SEARCH"], None
    # Bahasa kueri ditentukan oleh `lang` = bahasa KORPUS target (mengikuti pilihan agen
    # / mode UI), BUKAN bahasa input. Korpus EN harus dikueri dgn frasa Inggris (kalau kueri
    # ikut bahasa input yg Indo, recall di korpus EN jeblok + jejak "Hybrid search" tampil Indo).
    is_en = (lang == "en")
    tgt_name = "BAHASA INGGRIS (English)" if is_en else "BAHASA INDONESIA"
    def_fmt = ("'[concept] meaning' atau '[concept] is' (contoh: 'kamma meaning', 'nibbana definition')"
               if is_en else "'[konsep] adalah' (contoh: 'kamma adalah', 'pengertian nibbana')")
    extra_forbidden = (" Untuk kueri Inggris juga hindari kata sambung/meta: 'in', 'according to', 'about', "
                       "'religion', 'buddhism', 'buddhist', 'scripture'.") if is_en else ""
    example = (("Contoh 1 (definisi) input: 'apa arti kamma?'\n"
                "Output: {\"context\":\"the meaning of kamma\",\"queries\":[\"kamma meaning\",\"results of action\",\"deeds ripening\"],\"pitaka\":null}\n"
                "Contoh 2 (situasional) input: 'Saya sedang sedih karena putus cinta'\n"
                "Output: {\"context\":\"coping with heartbreak sadness\",\"queries\":[\"overcoming sorrow\",\"attachment to love\",\"grief from separation\"],\"pitaka\":null}")
               if is_en else
               ("Contoh 1 (definisi) input: 'apa arti kamma?'\n"
                "Output: {\"context\":\"makna kamma perbuatan\",\"queries\":[\"kamma adalah\",\"akibat perbuatan\",\"buah perbuatan\"],\"pitaka\":null}\n"
                "Contoh 2 (situasional) input: 'Saya sedang sedih karena putus cinta'\n"
                "Output: {\"context\":\"mengatasi sedih karena putus cinta\",\"queries\":[\"mengatasi kesedihan\",\"kemelekatan cinta\",\"kesedihan perpisahan\"],\"pitaka\":null}"))
    sys_p = (
        "Anda adalah mesin reformulasi kueri untuk pencarian di korpus Tipiṭaka.\n"
        "ATURAN BESI:\n"
        "1. Setiap kueri HARUS berupa frasa pendek 1-5 kata yang HANYA berisi kata kunci murni.\n"
        "2. Hindari kata sambung/meta tanpa sinyal: 'dalam', 'menurut', 'di', 'tentang', 'berdasarkan', 'agama', 'buddha', 'buddhisme', 'theravada', 'tipitaka', 'kitab', 'suci', dsb." + extra_forbidden + " Kata topik spt 'dhamma', 'ajaran', 'mengajar', 'membabar', 'sutta' BOLEH dipakai bila memang bagian dari konsep PEMBEDA (mis. 'mengajar dhamma demi materi'); TAPI jangan jadikan 'dhamma'/'sutta' sebagai SATU-SATUNYA kata kunci karena cocok ke hampir semua teks.\n"
        f"3. HANYA bila pengguna menanyakan makna/pengertian sebuah konsep, kueri pertama berupa definisi dengan format {def_fmt}. Untuk pertanyaan situasional/naratif, JANGAN memaksakan kueri definisi — langsung kata kunci topiknya.\n"
        "4. Kueri lain mengeksplorasi aspek berbeda (contoh: 'cara mengatasi marah', 'penyebab dukkha').\n"
        "5. JANGAN membuat kalimat tanya, jangan pakai tanda tanya, jangan pakai kata 'apa', 'bagaimana', dll.\n"
        "6. Jika pengguna bercerita panjang, ekstrak SEMUA aspek emosi/masalah dan buat kueri untuk masing-masing.\n"
        f"7. WAJIB tulis SEMUA kueri dalam {tgt_name} — itu bahasa KORPUS yang dicari, BUKAN sekadar bahasa input. "
        "Bila pertanyaan pengguna berbahasa lain, TERJEMAHKAN konsepnya ke bahasa target itu (mis. mode Inggris: 'mengatasi marah' -> 'overcoming anger'). "
        "TETAP jangan menerjemahkan kata biasa menjadi istilah Pāḷi (mis. 'keyakinan'/'faith' -> 'saddha') kecuali kueri asli pengguna sendiri sudah memakai istilah Pāḷi itu.\n"
        f"KUERI KONTEKS (WAJIB): selain 'queries', tulis SATU 'context' = frasa NATURAL 3-8 kata dalam {tgt_name} yang menangkap NIAT UTUH pengguna (warisi subjek dari riwayat bila kalimatnya elipsis/lanjutan spt 'ada lagi'/'selain itu'). BEDA dari aturan di atas: 'context' BOLEH memuat kata inti topik — TERMASUK 'dhamma'/'mengajar'/'membabar'/'ajaran' bila itu subjeknya — dan TIDAK perlu format '[konsep] adalah'. Ini jangkar makna biar sutta paling tepat tak tenggelam oleh parafrase yang melebar.\n"
        "Balas HANYA JSON: {\"context\":\"...\",\"queries\":[\"...\",\"...\"],\"pitaka\":null|\"sutta\"|\"vinaya\"|\"abhidhamma\"}.\n"
        + example
    )
    
    if mentions:
        mentions_str = ", ".join(mentions)
        sys_p += f"\n8. PENTING: Pengguna merujuk teks spesifik ({mentions_str}). Analisis niat pengguna! Jika pengguna HANYA ingin membahas/merangkum teks tersebut, KEMBALIKAN HANYA: {{\"queries\":[\"SKIP_SEARCH\"],\"pitaka\":null}}. TETAPI jika pengguna mencari teks LAIN yang sejalan/berkaitan/mirip, buatkan kueri seperti biasa."

    user_p = f"Pertanyaan ({lang}): {query}"
    if history:
        hist_str = "\n".join(f"{h['role']}: {h['content'][:200]}" for h in history[-4:])
        user_p = f"Konteks obrolan sebelumnya:\n{hist_str}\n\nPertanyaan baru ({lang}): {query}\n\nJadikan pertanyaan baru ini sebagai kueri yang UTUH. WAJIB: jika pertanyaan baru memakai kata ganti, ATAU elipsis/lanjutan (mis. 'ada lagi', 'yang lain', 'selain itu', 'lainnya', 'apa lagi') yang TIDAK menyebut subjeknya sendiri, kamu HARUS mewarisi kata-benda topik (subjek) dari pertanyaan user TERAKHIR yang punya subjek jelas (mis. sebelumnya 'penyebab gempa bumi' lalu user bilang 'ada lagi dari AN' -> kueri tetap soal 'penyebab gempa bumi', BUKAN 'penyebab' umum)."
    if failed:
        user_p += f"\nKueri yg sudah dicoba & gagal: {failed}. Cari sudut kata kunci yg BERBEDA."
    raw = _llm_json([{"role": "system", "content": sys_p}, {"role": "user", "content": user_p}])
    try:
        d = json.loads(raw)
        qs = [q.strip() for q in (d.get("queries") or []) if isinstance(q, str) and q.strip()]
        # Kueri KONTEKS (natural, nyimpen kata inti spt 'dhamma'/'mengajar') = jangkar makna biar
        # sutta paling tepat tak tenggelam oleh parafrase yg melebar. Taruh PALING DEPAN (ikut
        # dijalanin bareng yg lain di retrieval); jangan pernah gusur sinyal SKIP_SEARCH.
        ctx = d.get("context")
        if (isinstance(ctx, str) and ctx.strip() and "SKIP_SEARCH" not in qs
                and ctx.strip().lower() not in {q.lower() for q in qs}):
            qs = [ctx.strip()] + qs
        hint = d.get("pitaka") if d.get("pitaka") in ("sutta", "vinaya", "abhidhamma") else None
        return (qs[:5] or [query]), hint
    except Exception:
        return [query], None


# --- Scope NIKAYA (mis. "ada lagi dari AN") -----------------------------------
# Beda dari @mention (yg punya angka -> 1 sutta spesifik): ini menyebut KOLEKSI tanpa
# angka -> filter KERAS ke nikaya itu + token nikaya DIBUANG dari kueri semantik supaya
# subjek asli ("gempa bumi") tak terkontaminasi. Kode 2-huruf hanya dideteksi bila HURUF
# BESAR (hindari false-positive kata "an"/"sn" biasa); nama lengkap case-insensitive.
_NIKAYA_CODE_RE = re.compile(r'\b(DN|MN|SN|AN|KN)\b(?!\s*\d)')
_NIKAYA_NAME_MAP = {"digha": "DN", "majjhima": "MN", "samyutta": "SN",
                    "anguttara": "AN", "khuddaka": "KN"}
# Prefix formatted_id yang dianggap milik tiap nikaya (KN = banyak sub-koleksi).
_NIKAYA_PREFIXES = {
    "DN": {"DN"}, "MN": {"MN"}, "SN": {"SN"}, "AN": {"AN"},
    "KN": {"DHP", "UD", "ITI", "SNP", "THAG", "THIG", "VV", "PV", "KP",
           "CP", "BV", "NIDD", "NETT", "MIL", "PS", "PE"},
}


def _ascii_lower(s: str) -> str:
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()


# Kata generik penanda niat "bahas/rangkum SELURUH sutta" (overview), bukan subjek spesifik.
# REQUEST = kata-minta substantif (bahas/poin/ringkas/intinya) -> sinyal kuat overview & cukup
# kuat utk MEMICU carry kueri tanpa-subjek. FILLER = generik/sapaan (dong/tentang/yang) -> ikut
# di-strip tapi TAK memicu carry sendirian. Union dipakai utk cek "ada subjek tersisa?".
_OVERVIEW_REQUEST_WORDS = {
    "bahas", "membahas", "dibahas", "bahasan", "jelaskan", "jelasin", "menjelaskan",
    "penjelasan", "ceritakan", "ringkas", "ringkasan", "rangkum", "rangkuman", "merangkum",
    "isinya", "isi", "intinya", "inti", "poin", "poinnya", "pointer", "highlight", "penting",
    "pentingnya", "ikhtisar", "gambaran", "uraian", "uraikan", "maksud", "maksudnya",
    "overview", "summary", "summarize", "summarise", "discuss", "explain", "gist",
}
_OVERVIEW_FILLER_WORDS = {
    "cerita", "tentang", "mengenai", "soal", "perihal", "tolong", "coba", "kasih", "garis",
    "besar", "umum", "about", "content", "contents", "sutta", "teks", "khotbah", "kotbah",
    "dong", "yang", "biar", "gimana", "seperti", "kalau", "kira", "deh", "nih", "saja", "sih",
}
_OVERVIEW_VERB_STOPWORDS = _OVERVIEW_REQUEST_WORDS | _OVERVIEW_FILLER_WORDS

# Klitik Indonesia (akhiran melekat): di-strip sebelum cek kosakata supaya bentuk ber-imbuhan
# ('poinnya'->'poin', 'ringkasnya'->'ringkas') dikenali sama dgn akarnya. Dipakai bersama oleh
# deteksi overview & filter istilah Pali (cegah Indo ber-klitik nyangkut sbg "istilah hilang").
_ID_CLITIC_RE = re.compile(r'(nya|kah|lah|pun|mu|ku|kan)$')


def _strip_clitic(w: str) -> str:
    return _ID_CLITIC_RE.sub('', w)


def _overview_subject_tokens(query: str, mentions: list | None = None) -> list:
    """Token 'subjek' yg tersisa setelah buang mention + kode koleksi + kata overview/nama
    (akar pasca-klitik ikut dicek). Kosong = kueri tak punya subjek sendiri (minta gambaran)."""
    q = _ascii_lower(query)
    for m in (mentions or []):               # buang token mention itu sendiri (kode + angka)
        q = q.replace(_ascii_lower(m), " ")
    codes = {_ascii_lower(str(c)) for c in _collection_codes() if c}
    out = []
    for w in re.findall(r'[^\W\d_]+', q):
        if len(w) < 4:
            continue
        wr = _strip_clitic(w)
        if w in _OVERVIEW_VERB_STOPWORDS or wr in _OVERVIEW_VERB_STOPWORDS:
            continue
        if w in _NAME_MATCH_STOPWORDS or wr in _NAME_MATCH_STOPWORDS or w in codes:
            continue
        out.append(w)
    return out


def _mention_is_overview(query: str, mentions: list) -> bool:
    """True kalau user cuma minta gambaran umum sutta yg di-@mention ('bahas apa', 'isinya
    apa') tanpa subjek spesifik. False kalau ada subjek (mis. 'vedananupassana di @MN10').
    Sengaja konservatif: ragu -> False (perilaku lama), karena false-positive (narik kerangka
    saat user mau section spesifik) lebih buruk daripada false-negative."""
    if not mentions:
        return False
    return not _overview_subject_tokens(query, mentions)


def _is_contentless_followup(query: str) -> bool:
    """True kalau kueri tak punya subjek sendiri TAPI ada kata-minta substantif ('poin-poinnya
    apa', 'ringkasnya dong', 'intinya apa') -> hanya bermakna sbg lanjutan topik sebelumnya,
    jadi layak meng-carry mention terakhir. Butuh REQUEST word biar sapaan kosong ('ok deh')
    tak ikut memicu."""
    if _overview_subject_tokens(query):
        return False
    return any(w in _OVERVIEW_REQUEST_WORDS or _strip_clitic(w) in _OVERVIEW_REQUEST_WORDS
               for w in re.findall(r'[^\W\d_]+', _ascii_lower(query)))


def _detect_nikaya_scope(text: str) -> set:
    """Set kode nikaya ({'AN'}, ...) yg disebut tanpa angka. Kosong bila tak ada."""
    scope = set(_NIKAYA_CODE_RE.findall(text))
    for w in re.findall(r'[^\W\d_]+', text, re.UNICODE):
        code = _NIKAYA_NAME_MAP.get(_ascii_lower(w))
        if code:
            scope.add(code)
    return scope


def _strip_nikaya_tokens(text: str) -> str:
    """Buang token nikaya (kode + nama) dari kueri agar tinggal subjek murni."""
    out = _NIKAYA_CODE_RE.sub(" ", text)
    out = " ".join(w for w in out.split() if _ascii_lower(w) not in _NIKAYA_NAME_MAP)
    return re.sub(r'\s+', ' ', out).strip()


def _sutta_nikaya_prefix(s: dict) -> str:
    m = re.match(r'([A-Za-z-]+)', s.get("formatted_id", ""))
    return m.group(1).upper().rstrip("-") if m else ""


# ── Stage-2 rerank utk retrieval CHAT (resep exp5: retriever base -> CE) ────
# Bukti 8-reeval-llm: base+rerank satu-satunya konfigurasi di atas base murni
# (nDCG@5 konsensus e5 .752/gte .736 vs base .729/.691) — rangkuman_bab4_hasil.txt [6].
# CE ikut EMBED_DEVICE (default cpu; GPU utuh utk LLM chat): ~4.5s per 48 kandidat.
# HANYA jalur chat (_retrieve_suttas); /api/search (home) tak disentuh.
CHAT_RERANK       = os.environ.get("MYDHAMMA_CHAT_RERANK", "1").lower() not in ("0", "false", "no")
SEARCH_RERANK     = os.environ.get("MYDHAMMA_SEARCH_RERANK", "1").lower() not in ("0", "false", "no")
CHAT_RERANK_MODEL = os.environ.get("MYDHAMMA_CHAT_RERANK_MODEL", "BAAI/bge-reranker-v2-m3")
CHAT_RERANK_TOP   = int(os.environ.get("MYDHAMMA_CHAT_RERANK_TOP", "48"))
CHAT_RERANK_BATCH = int(os.environ.get("MYDHAMMA_CHAT_RERANK_BATCH", "16"))

_ce_lock = threading.Lock()
_ce_holder: dict = {}


def _load_reranker():
    if "ce" not in _ce_holder:
        import torch
        from sentence_transformers import CrossEncoder                 # import lambat -> lazy
        
        device = os.environ.get("EMBED_DEVICE", "").strip().lower()
        if not device:
            device = "cuda" if torch.cuda.is_available() else "cpu"
        elif device == "cuda" and not torch.cuda.is_available():
            device = "cpu"
            
        model_kwargs = {}
        if device == "cuda":
            model_kwargs["torch_dtype"] = torch.float16
            
        _ce_holder["ce"] = CrossEncoder(CHAT_RERANK_MODEL, max_length=config.GPL_MAX_SEQ,
                                        trust_remote_code=True,
                                        device=device,
                                        model_kwargs=model_kwargs if model_kwargs else None)
    return _ce_holder["ce"]


def _rerank_fragments(query: str, fused: list, keep_tail: bool = False) -> list:
    """CE menyusun ulang CHAT_RERANK_TOP kandidat teratas stage-1. Skor fragmen jadi
    sigmoid CE (0..1, score_type 'rerank'). Kandidat di luar TOP (terlemah menurut
    stage-1): dibuang (chat, keep_tail=False) atau ditaruh setelah hasil rerank
    (home, keep_tail=True — demi paginasi dalam). Gagal load/predict -> fallback
    senyap ke urutan stage-1."""
    head = fused[:CHAT_RERANK_TOP]
    pairs = [(query, f.get("text") or "") for f in head]
    try:
        with _ce_lock:  # _retrieve_suttas bisa paralel (multi-subquery) -> predict diserialisasi
            scores = _load_reranker().predict(pairs, batch_size=CHAT_RERANK_BATCH,
                                              show_progress_bar=False)
    except Exception as e:
        app.logger.warning(f"[chat-rerank] gagal ({e}); pakai urutan stage-1")
        return fused
    for f, s in zip(head, scores):
        f["score"] = float(s)
        f["score_type"] = "rerank"
    head.sort(key=lambda f: -f["score"])
    return head + fused[CHAT_RERANK_TOP:] if keep_tail else head


def _retrieve_suttas(query: str, db: str, max_suttas: int = 6, pitaka=None, nikaya=None, use_rerank=None) -> list:
    """Hybrid (semantic ensemble + BM25) -> RRF -> rerank CE (exp5) -> grouping per-sutta.
    Bentuk keluaran SAMA dgn _group_suttas (punya formatted_id/sutta_name/pitaka/max_score/
    fragments). `nikaya` = set kode nikaya ('AN', ...) -> filter keras ke koleksi tsb."""
    dbs = _parse_db(db)
    pool = max(max_suttas * 6, 60)
    lists = []
    for d in dbs:
        models = _ensemble_models(d) or [config.REGISTRY[0]["name"]]
        for mdl in models:
            lists.append(_run_one(query, "hybrid", mdl, d, pool, True, True))
    nonempty = [l for l in lists if l]
    if len(nonempty) == 1:
        fused = nonempty[0]
    elif len(nonempty) > 1:
        fused = engine.rrf_fuse(nonempty, top_k=pool)
    else:
        fused = []
    if fused and (use_rerank if use_rerank is not None else CHAT_RERANK):
        fused = _rerank_fragments(query, fused)
    suttas = _group_suttas(fused)
    _normalize_rrf_scores(suttas)
    if pitaka:
        pits = pitaka if isinstance(pitaka, list) else [pitaka]
        suttas = [s for s in suttas if s["pitaka"] in pits]
    if nikaya:
        allowed = set()
        for code in nikaya:
            allowed |= _NIKAYA_PREFIXES.get(code, {code})
        suttas = [s for s in suttas if _sutta_nikaya_prefix(s) in allowed]
    return suttas[:max_suttas]


def _inject_missing_blurbs(suttas: list):
    """Sisipkan fragmen blurb (sinopsis) utk sutta yg belum punya — biar LLM dpt konteks ringkas."""
    for s in suttas:
        if any(f.get("author") == "blurb" for f in s.get("fragments", [])):
            continue
        sid = reader.resolve_sutta_id(s.get("sutta_id", ""))
        blurbs = {l: text for (s, l), text in reader._blurbs.items() if s == sid}
        if not blurbs:
            continue
        s.setdefault("fragments", []).insert(0, {
            "score": s.get("max_score", 0), "ref": [f"{sid}:sinopsis"], "ref_display": s.get("formatted_id", sid),
            "texts": blurbs,
            "author": "blurb", "db_source": list(blurbs.keys())[0], "models": ["blurb"], "score_type": "blurb",
        })


# ── Elipsis rujukan-silang (teks sutta disingkat -> teks lengkap di sutta lain) ──
# Banyak sutta menyingkat isinya dgn penanda:
#   • "…seperti sebelumnya"      -> teks lengkap = sutta SEBELUMNYA (urutan baca)
#   • "§N" pada ID BER-TITIK (SN/AN, mis. sn55.45 "§44") -> sutta ke-N di koleksi
#     yg sama = sn55.44 (terverifikasi 110/111 nyambung ke {koleksi}.{N} yg ada)
#   • "§N" pada ID tanpa titik (MN/DN) -> paragraf INTERNAL sutta itu sendiri, BUKAN
#     rujukan sutta lain -> diabaikan (teksnya toh sudah ada di konteks).
# Dipakai chat: kalau sutta FOKUS (di-mention/lagi dibuka) teksnya disingkat, tarik
# JUGA teks lengkap sutta rujukannya sbg konteks pendukung, ikut rantai (cap 3) karena
# SN sering menyingkat berlapis (sn55.45->44->…->1 template asli).
# Penanda elipsis (peyyāla) dibaca dari NOTE id saja (span pe/add + parenthetical), BUKAN
# seluruh body -> "sebelumnya" naratif tak salah picu. Ragam notasi (data-driven, korpus id):
#   • "sutta sebelumnya" / "sebelum ini" / "(hal/yang) sama diulangi" -> sutta SEBELUM (via rantai)
#   • "§N" / "§§N-M"  -> sutta se-saṁyutta ({saṁyutta_ini}.{N})
#   • "NN:MM(-KK)"    -> lintas-saṁyutta, nikaya sama ({nikaya}{NN}.{MM})
# Ujung range boleh disingkat ala PTS ("140-42"=140–142, "106-12"=106–112) -> dipadankan dari awal.
_ELISION_PREV_RE  = re.compile(r'sebelum(?:nya|\s+ini)|sama\s+diulang', re.IGNORECASE)
_ELISION_PARA_RE  = re.compile(r'§\s*§?\s*(\d+)\s*(?:[-–]\s*(\d+))?')
_ELISION_COLON_RE = re.compile(r'\b(\d+):(\d+)\s*(?:[-–]\s*(\d+))?')
_ELISION_RANGE_CAP = 15   # abaikan range absurd (ambil awalnya saja)
_elision_text_cache: dict = {}


def _elision_id_text(full_id):
    """Gabungan teks html Indonesia sutta (SEMUA author id) utk deteksi marker elipsis."""
    if full_id in _elision_text_cache:
        return _elision_text_cache[full_id]
    parts = []
    for (lang, author), path in reader._HTML_FILE_MAP.get(full_id, {}).items():
        if lang == "id" and path and path.exists():
            try:
                parts.append(path.read_text(encoding="utf-8"))
            except OSError:
                pass
    txt = "\n".join(parts)
    _elision_text_cache[full_id] = txt
    return txt


def _elision_note_text(full_id):
    """Teks NOTE peyyāla saja (isi <span class='pe'|'add'> + paragraf ber-kurung "(...)"),
    tag dibuang. Notasi elipsis dicari di sini, BUKAN di seluruh body — cegah "sebelumnya"
    naratif atau angka lain (ref PTS "3.243") ikut ke-parse."""
    html_txt = _elision_id_text(full_id)
    notes = []
    for m in re.finditer(r"<span class='(?:pe|add)'>(.*?)</span>", html_txt, re.S):
        notes.append(re.sub(r'<[^>]+>', ' ', m.group(1)))
    for m in re.finditer(r"<p>\s*\((.*?)\)\s*</p>", html_txt, re.S):
        notes.append(re.sub(r'<[^>]+>', ' ', m.group(1)))
    return ' '.join(notes)


def _expand_pe_range(coll, s_start, s_end):
    """('sn35','140','42') -> ['sn35.140','sn35.141','sn35.142']. SADAR file-range: ('sn45','91',
    '96') -> ['sn45.91','sn45.92-95','sn45.96'] (92-95 satu file, tak diskip). Ujung disingkat
    dipadankan (140-42 -> 142). Delegasi ke reader.range_member_stems (sumber tunggal dgn viewer)."""
    return reader.range_member_stems(coll, s_start, s_end, cap=_ELISION_RANGE_CAP)


_cr_refs_cache: dict = {}


def _cr_ref_ids(full_id):
    """Target rujukan silang <a class='cr'> (bawaan SC; Abhidhamma vb/pp/kv + Vinaya kd/pvr)
    di SEMUA edisi html sutta ini. Sumber elipsis yg sama dgn yg dirender reader jadi
    sutta-ref — mis. kv10.5 "argument verbatim similar ... in Kv 10.2"."""
    if full_id in _cr_refs_cache:
        return _cr_refs_cache[full_id]
    refs = []
    for (_l, _a), path in reader._HTML_FILE_MAP.get(full_id, {}).items():
        try:
            txt = path.read_text(encoding="utf-8")
        except OSError:
            continue
        for href, _lbl in reader._CR_RE.findall(txt):
            m = re.match(r'/([^/#]+)', href or "")
            if not m:
                continue
            tgt = reader.resolve_sutta_id(m.group(1).lower())
            if tgt and tgt != full_id and (tgt in reader._HTML_FILE_MAP or tgt in reader._RAW_FILE_MAP):
                refs.append(tgt)
    refs = list(dict.fromkeys(refs))
    _cr_refs_cache[full_id] = refs
    return refs


def _elision_refs(full_id):
    """ID full sutta yg dirujuk oleh elipsis di `full_id` (cross-sutta saja)."""
    note = _elision_note_text(full_id)
    refs = []
    if note:
        if _ELISION_PREV_RE.search(note):               # "sutta sebelumnya"/"sama diulangi" -> prev
            prev, _nx = reader._get_prev_next(full_id)
            if prev:
                refs.append(prev)
        short = reader.shorten_sutta_id(full_id)
        m_nik = re.match(r'^([a-z]+)', short)
        nik = m_nik.group(1) if m_nik else ''
        # Basis saṁyutta 'sn45' dari 'sn45.103' MAUPUN stem range 'sn45.98-102' (dulu `\.\d+$`
        # gagal di range -> §§ di dalam exemplar range tak ke-chain).
        m_coll = re.match(r'^([a-z]+\d+)\.', short)
        if m_coll:                                      # ID ber-titik (SN/AN) -> §N = se-saṁyutta
            coll = m_coll.group(1)
            for m in _ELISION_PARA_RE.finditer(note):
                refs.extend(_expand_pe_range(coll, m.group(1), m.group(2)))
        if nik:                                         # "NN:MM(-KK)" -> lintas-saṁyutta, nikaya sama
            for m in _ELISION_COLON_RE.finditer(note):
                refs.extend(_expand_pe_range(f"{nik}{m.group(1)}", m.group(2), m.group(3)))
    # Rujukan silang cr (semua edisi/bahasa, bukan cuma id): perlakuannya SAMA dgn elipsis —
    # mention sutta yg isinya nunjuk "lanjutan di teks lain" ikut narik teks rujukannya.
    refs.extend(_cr_ref_ids(full_id))
    # Peyyāla-total tanpa note (body id kosong, cuma judul: SN 12.5-9, SN 33.x, SN 45.x): tarik
    # sutta LENGKAP terdekat sebelumnya sbg sumber teks (walk mundur di reader).
    ex = reader._elision_exemplar(full_id, "id")
    if ex:
        refs.append(ex)
    return [r for r in dict.fromkeys(refs) if r != full_id]


def _expand_elision_chain(seed_ids, cap=3, max_refs=6):
    """Ikuti rantai elipsis sampai sutta lengkap (tanpa elipsis), maks `cap` hop dan
    `max_refs` sutta tambahan. `seen` mencegah siklus & dobel dgn seed."""
    seen = set(seed_ids)
    out = []
    frontier = list(seed_ids)
    depth = 0
    while frontier and depth < cap and len(out) < max_refs:
        nxt = []
        for sid in frontier:
            for ref in _elision_refs(sid):
                if ref not in seen:
                    seen.add(ref)
                    out.append(ref)
                    nxt.append(ref)
                    if len(out) >= max_refs:
                        break
            if len(out) >= max_refs:
                break
        frontier = nxt
        depth += 1
    return out


# ── Rujukan §N LINTAS-sutta (MN/DN "MN 51, §24") -> SEGMEN md target (bukan full sutta) ──
# Reader SUDAH meresolusi §N -> chunk_id md saat render (<a class="sutta-ref" href=".../#mn51:md34">
# via reader.resolve_para_chunk). Chat REUSE hasil itu (TANPA parsing §N ganda): pungut chunk_id
# target dari href berhash di sutta fokus, lalu tarik SEGMEN itu + tetangga n±1 saja — koheren
# tanpa ngeborong sutta panjang. SN/AN sibling (sutta-ref TANPA hash) & para-ref intra sengaja
# dilewati: yg pertama peyyāla pendek (via _expand_elision_chain), yg kedua teksnya sudah di konteks.
_XREF_HASH_RE = re.compile(r'<a href="(/[^"#]+#[^"]+)" class="sutta-ref"')


def _elision_para_targets(focus_ids, langs):
    """(t_sid, t_lang, t_auth, chunk_id) tiap rujukan §N lintas-sutta yg SUDAH diresolusi reader
    di sutta fokus. chunk_id = "mn51:md34" (edisi-spesifik). Intra (t_sid==fokus) dilewati."""
    out, seen = [], set()
    for fid in focus_ids:
        for L in langs:
            for a in [au for (l, au) in reader._HTML_FILE_MAP.get(fid, {}) if l == L]:
                chunks = reader._get_sutta_from_html(fid, L, a)
                if not chunks:
                    continue
                for c in chunks:
                    for p in c.get("parts", []):
                        for href in _XREF_HASH_RE.findall(p.get("text", "")):
                            path, _, cid = href.partition("#")
                            pp = [x for x in path.split("/") if x]
                            if len(pp) < 2 or not cid or pp[0] == fid:
                                continue
                            key = (pp[0], pp[1], pp[2] if len(pp) > 2 else a, cid)
                            if key not in seen:
                                seen.add(key)
                                out.append(key)
    return out


def _pull_chunk_frags(t_sid, t_lang, t_auth, chunk_id, window=1, short_cap=6):
    """Fragmen (shape exact_sutta_match) utk chunk_id + tetangga n±window di edisi target.
    Sutta ≤ short_cap chunk -> ambil SEMUA (murah, nutup 'kecuali yg pendek'). Author diutamakan
    t_auth; kalau chunk_id-nya ada di edisi lain, pakai edisi itu (jaga penomoran md cocok)."""
    corpus, _bm, _st = engine._load_bm25(t_lang)
    if not corpus:
        return []
    sut = [(i, e) for i, e in enumerate(corpus)
           if e.get("file_base_name") == t_sid and e.get("author") != "blurb"]
    auth = t_auth if any(e.get("author") == t_auth and chunk_id in (e.get("ref") or []) for _i, e in sut) \
        else next((e.get("author") for _i, e in sut if chunk_id in (e.get("ref") or [])), None)
    if auth is None:
        return []
    ents = [(i, e) for i, e in sut if e.get("author") == auth]
    if len(ents) <= short_cap:
        picked = ents
    else:
        tidx = next((k for k, (i, e) in enumerate(ents) if chunk_id in (e.get("ref") or [])), None)
        if tidx is None:
            return []
        lo, hi = max(0, tidx - window), min(len(ents), tidx + window + 1)
        picked = ents[lo:hi]
    return [{**e, "score": 1.0 - (n * 0.001), "score_type": "exact", "corpus_idx": i}
            for n, (i, e) in enumerate(picked)]


# ── Istilah Pali tak-terterjemah (POV awam ngetik istilah Pali) ────────────────
# Masalah: user awam sering ngetik istilah Pali (mis. "cittanupassana") yg TIDAK
# muncul sbg kata di korpus TERJEMAHAN (Indo nulisnya "perenungan pikiran"). Akibatnya
# BM25 Indo nol, semantik ngeloyor ke tetangga-vektor yg salah (mis. SN 41.6/AN 10.115),
# lalu LLM ngarang. Solusi: deteksi token "ada di korpus PALI tapi TAK ada di korpus
# terjemahan" -> betulkan ejaan (fuzzy ke vocab Pali) -> cari sutta-nya via korpus Pali
# (string deterministik, bukan tebakan LLM) -> tarik terjemahan sutta yg SAMA. Aturannya
# SERAGAM (ada-di-pali & tak-ada-di-target), BUKAN daftar suffix/istilah hardcoded.
_PALI_VOCAB = None          # (set_stripped, canon_map, by_len)
_PALI_FREQ: dict = {}       # token stripped -> total kemunculan di korpus pli (utk bobot frekuensi)
_PALI_FORMS_BY_KEY: dict = {}  # token stripped -> [bentuk-permukaan diakritik, urut frekuensi]
_CORPUS_VOCAB: dict = {}    # lang -> set token stripped (>=4 huruf)
_PALI_TERM_MINLEN = 6       # istilah teknis Pali umumnya panjang; cegah kata pendek nyangkut

# Disambiguasi istilah Pali "telanjang": skor gabungan = rasio-ejaan × bobot-frekuensi.
# Awam hampir selalu menanyakan istilah UMUM, jadi frekuensi memecah kemiripan ejaan yang
# setara (mis. 'pancakanda': pañcakaṅga [nama tokoh, langka] vs pañcakkhandha [lima kelompok,
# sangat sering]). Bila kandidat #2 masih >= DOMINANCE×#1 -> ambigu, TANYA user (jangan tebak).
_PALI_AMBIG_FREQ_ALPHA = 0.15   # bobot log-frekuensi pd skor gabungan (utk URUTAN chip & auto-pick)
_PALI_AMBIG_CAND_FLOOR = 0.72   # rasio difflib minimum sebuah kandidat boleh ikut dipertimbangkan
_PALI_AMBIG_RATIO_FLOOR = 0.80  # rasio kandidat-TERBAIK minimum agar dialog layak dipicu (anti kata non-Pali)
_PALI_AMBIG_RATIO_GAP = 0.06    # bila dua KATA berbeda selisih rasio ejaan <= ini -> ambigu (tanya)
# Rujukan sutta di kueri MENTAH (id/@mention) -> jangkar eksplisit, lewati disambiguasi.
_QUERY_SUTTA_REF_RE = re.compile(
    r'(?:^|[\s@])(?:dn|mn|sn|an|kn|kp|khp|dhp|ud|iti|snp|vv|pv|thag|thig|bu-[a-z]+|bi-[a-z]+|pli-tv-[a-z-]+)\s*\d',
    re.IGNORECASE)


def _pali_vocab():
    """Vocab korpus PALI: (set token stripped-diakritik, map stripped->ejaan-diakritik
    paling sering, by_len: panjang->list token stripped, all_original_set: set token asli).
    by_len dipakai utk kandidat fuzzy berbasis-panjang (BUKAN prefix) supaya typo di huruf awal
    — mis. 'accinteyya' (dobel c) — tetap kebetulin. Dibangun sekali dari korpus pli."""
    global _PALI_VOCAB, _PALI_FREQ, _PALI_FORMS_BY_KEY
    if _PALI_VOCAB is None:
        from collections import Counter, defaultdict
        corpus, _bm, _st = engine._load_bm25("pli")
        forms: dict = {}
        all_original_set = set()
        for e in (corpus or []):
            for w in re.findall(r"[^\W\d_]+", e.get("text", ""), re.UNICODE):
                wl = w.lower()
                key = _ascii_lower(wl)
                if len(key) < _PALI_TERM_MINLEN:
                    continue
                forms.setdefault(key, Counter())[wl] += 1
                all_original_set.add(wl)
        canon = {k: c.most_common(1)[0][0] for k, c in forms.items()}
        by_len: dict = defaultdict(list)
        for k in forms:
            by_len[len(k)].append(k)
        _PALI_FREQ = {k: sum(c.values()) for k, c in forms.items()}
        _PALI_FORMS_BY_KEY = {k: [w for w, _n in c.most_common()] for k, c in forms.items()}
        _PALI_VOCAB = (set(forms.keys()), canon, by_len, all_original_set)
    return _PALI_VOCAB


def _pali_freq() -> dict:
    """token stripped -> total kemunculan di korpus pli. Dipakai utk membobot kandidat
    fuzzy: istilah yang lebih sering muncul = lebih mungkin yang dimaksud awam."""
    _pali_vocab()                       # pastikan _PALI_FREQ terisi (dibangun sekali)
    return _PALI_FREQ


def _pali_ranked(key: str, cutoff: float = _PALI_AMBIG_CAND_FLOOR,
                 window: int = 4, n: int = 6):
    """Kandidat token Pali kanonik (stripped) terdekat ke `key`, diurut skor GABUNGAN
    = rasio-difflib × bobot-log-frekuensi-korpus. Awam hampir selalu menanyakan istilah
    UMUM, jadi frekuensi memecah kemiripan ejaan yang setara (mis. 'pancakanda' lebih dekat
    secara ejaan ke 'pancakanga' tetapi 'pancakkhandha' jauh lebih sering -> skornya menyusul).
    window LEBIH LEBAR dari _pali_fuzzy lama supaya istilah panjang yang terpangkas typo
    (mis. 'pancakkhandha' 13 vs 'pancakanda' 10) tetap masuk kandidat.
    Balas list (stripped, canon, ratio, score) urut skor menurun (maks `n`)."""
    import difflib, math
    pali_set, canon, by_len, _orig = _pali_vocab()
    freq = _pali_freq()
    def _score(c: str, ratio: float) -> float:
        return ratio * (1 + _PALI_AMBIG_FREQ_ALPHA * math.log10(freq.get(c, 1) + 1))
    if key in pali_set:
        return [(key, canon.get(key, key), 1.0, _score(key, 1.0))]
    cand = []
    for L in range(len(key) - window, len(key) + window + 1):
        cand += by_len.get(L, [])
    raw = difflib.get_close_matches(key, cand, n=n * 5, cutoff=cutoff)
    sm = difflib.SequenceMatcher()
    sm.set_seq2(key)
    out = []
    for c in raw:
        sm.set_seq1(c)
        ratio = sm.ratio()
        out.append((c, canon.get(c, c), ratio, _score(c, ratio)))
    out.sort(key=lambda x: x[3], reverse=True)
    return out[:n]


def _pali_fuzzy(key: str, cutoff: float, window: int = 2):
    """Token Pali kanonik (stripped) terdekat ke `key`, atau None. Sekarang mengembalikan
    kandidat dengan skor GABUNGAN tertinggi (rasio ejaan × frekuensi) lewat _pali_ranked,
    bukan sekadar rasio difflib tertinggi -> istilah umum menang saat ejaan setara dekat."""
    r = _pali_ranked(key, cutoff=cutoff, window=max(window, 4), n=4)
    return r[0][0] if r else None


def _corpus_token_set(lang: str) -> set:
    """Set token (stripped, >=4 huruf) korpus satu bahasa — utk cek 'kata ini ada di terjemahan'."""
    if lang not in _CORPUS_VOCAB:
        corpus, _bm, _st = engine._load_bm25(lang)
        s = set()
        for e in (corpus or []):
            for w in re.findall(r"[^\W\d_]+", e.get("text", "").lower(), re.UNICODE):
                w2 = _ascii_lower(w)
                if len(w2) >= 4:
                    s.add(w2)
        _CORPUS_VOCAB[lang] = s
    return _CORPUS_VOCAB[lang]


def _pali_suggest(typed: str):
    """'Did you mean' utk gerbang 'ga nemu'. Tiga lapis cutoff: >=0.84 auto-resolve (jawab),
    0.72-0.84 di sini -> cuma usul (jangan jawab pakai tebakan), <0.72 bukan istilah Pali
    (jangan ganggu, biar alur normal). 0.72 cukup ketat supaya kata Inggris ('mindfulness')
    tak salah-usul ke kata Pali acak."""
    key = _ascii_lower(typed)
    if len(key) < 5:
        return None
    _set, canon, _bl, _orig = _pali_vocab()
    m = _pali_fuzzy(key, 0.72)
    # Guard 2-huruf-depan: di gerbang (token tak-ter-resolve) kita lebih ketat — cegah
    # kata Indo langka yg lolos vocab (mis. 'kemarahan' -> 'karomahan') salah-usul Pali.
    # (Detection 0.84 TIDAK pakai guard ini -> typo huruf depan spt 'accinteyya' tetap kena.)
    if not m or m[:2] != key[:2]:
        return None
    return canon.get(m, m)


def _is_diacritically_compatible(typed: str, canon_form: str) -> bool:
    """True jika term yang diketik user sudah memiliki diakritik yang kompatibel/benar
    dibandingkan dengan versi kanon (hanya berbeda case ending / infleksi akhir)."""
    if typed.lower() == canon_form.lower():
        return True
    t_stem = re.sub(r'[aāiīuūeomṁṃṅñṭḍṇḷ]+$', '', typed.lower(), flags=re.UNICODE)
    c_stem = re.sub(r'[aāiīuūeomṁṃṅñṭḍṇḷ]+$', '', canon_form.lower(), flags=re.UNICODE)
    return t_stem == c_stem


def _detect_pali_terms(query: str, target_lang: str):
    """Token kueri = istilah Pali yg TAK tersedia di terjemahan target.
    Balas (resolved, unresolved):
      resolved   = [(diketik, ejaan_kanonik)]  -> ketemu eksak/fuzzy-ketat di vocab Pali
      unresolved = [diketik]                    -> tak ada di target & bukan Pali yg dikenal
    Hanya token yg TAK ADA di vocab korpus target yg diperiksa (kata Indo biasa dilewati),
    jadi pertanyaan Indo normal tak terpengaruh."""
    _set, canon, _bl, all_original_set = _pali_vocab()
    target_set = _corpus_token_set(target_lang)
    resolved, unresolved, seen = [], [], set()
    
    tokens_raw = re.findall(r"[^\W\d_]+", query, re.UNICODE)
    skip_next = False
    
    for i in range(len(tokens_raw)):
        if skip_next:
            skip_next = False
            continue
            
        # Coba gabungkan dengan token berikutnya (compound / 2-gram)
        if i + 1 < len(tokens_raw):
            w1 = _ascii_lower(tokens_raw[i])
            w2 = _ascii_lower(tokens_raw[i+1])
            # JANGAN fusi bila KEDUA token sudah valid sendiri-sendiri (eksak di vocab Pali ATAU
            # kata korpus target): itu DUA kata terpisah yg nyata, bukan satu istilah yg kepecah
            # spasi. Tanpa ini 'samadhi'(eksak)+'labhati'(eksak) malah difusi jadi 'samādhimhāti'
            # (istilah ngaco) -> retrieval meleset. Fusi 2-gram cuma utk istilah yg memang terpecah
            # (mis. 'panca'+'kanda', dua-duanya BUKAN kata valid sendiri).
            _w1_known = (w1 in _set) or (w1 in target_set)
            _w2_known = (w2 in _set) or (w2 in target_set)
            # Jangan gabungkan jika salah satu token adalah stopword atau kata hubung/hints umum bahasa target
            if (not (_w1_known and _w2_known) and
                # Potongan istilah Pali yg kepecah spasi ('panca'+'khanda') tak pernah cuma 2 huruf.
                # Tanpa floor ini, kata-fungsi Indo super-umum ('di','ke') yg TAK ada di _NAME_MATCH_
                # STOPWORDS ikut difusi: 'di'+'ayat' -> 'diayat' -> fuzzy 'dīpayati' (~0.86 > 0.84),
                # menghancurkan kueri locator ("ada DI AYAT mana") jadi istilah Pali palsu. Uniform.
                len(w1) >= 3 and len(w2) >= 3 and
                w1 not in _NAME_MATCH_STOPWORDS and w2 not in _NAME_MATCH_STOPWORDS and
                w1 not in _EN_HINT and w2 not in _EN_HINT and
                w1 not in _ID_HINT and w2 not in _ID_HINT and
                w1 not in ("dan", "atau", "dengan", "and", "or", "with", "but", "tetapi") and
                w2 not in ("dan", "atau", "dengan", "and", "or", "with", "but", "tetapi")):
                
                raw_2gram = tokens_raw[i] + tokens_raw[i+1]
                key_2gram = _ascii_lower(raw_2gram)
                if len(key_2gram) >= _PALI_TERM_MINLEN and key_2gram not in seen and key_2gram not in _NAME_MATCH_STOPWORDS and key_2gram not in target_set:
                    _root_2gram = _strip_clitic(key_2gram)
                    if not (_root_2gram != key_2gram and _root_2gram in target_set):
                        if key_2gram not in _OVERVIEW_VERB_STOPWORDS and _root_2gram not in _OVERVIEW_VERB_STOPWORDS:
                            m = _pali_fuzzy(key_2gram, 0.84)
                            if m:
                                seen.add(key_2gram)
                                resolved.append((tokens_raw[i] + " " + tokens_raw[i+1], canon.get(m, m)))
                                skip_next = True
                                continue
                                
        # Fallback ke 1-gram
        raw = tokens_raw[i]
        key = _ascii_lower(raw)
        if len(key) < _PALI_TERM_MINLEN or key in seen or key in _NAME_MATCH_STOPWORDS:
            continue
        if key in target_set:           # kata ini ADA di terjemahan -> bukan istilah hilang
            continue
        # Klitik Indonesia (-nya/-kah/-lah/-pun/-mu/-ku/-kan): kalau AKAR-nya ada di korpus
        # target, ini kata Indo ber-imbuhan ('poinnya'->'poin') yg cuma luput krn klitik,
        # BUKAN istilah Pali hilang -> jangan picu fuzzy/gerbang botched-Pali. Uniform morfologi.
        _root = _strip_clitic(key)
        if _root != key and _root in target_set:
            continue
        if key in _OVERVIEW_VERB_STOPWORDS or _root in _OVERVIEW_VERB_STOPWORDS:
            continue                          # kata-minta overview ('isinya','poinnya') bukan Pali
        seen.add(key)
        m = _pali_fuzzy(key, 0.84)
        if not m:
            # Pass TENTATIF: typo yg mangkas/ubah huruf KEDUA (mis. 'darmanupasan'->'dhammanupassana',
            # ratio 0.81) luput di window±2/cutoff0.84. Window lebih lebar + cutoff 0.80 + huruf
            # PERTAMA sama -> resolve, biar leg `pli` (_pali_term_suttas) yg nyari LANGSUNG ke korpus
            # Pali ikut nyala & nge-ground jawabannya. Tetap tolak kata Indo/Eng non-Pali (mis.
            # 'kemarahan' ratio 0.78 < 0.80). Huruf-pertama sama = penjaga utama anti-drift.
            m2 = _pali_fuzzy(key, 0.80, window=4)
            if m2 and m2[0] == key[0]:
                m = m2
        if m:
            raw_lower = raw.lower()
            canon_val = canon.get(m, m)
            if raw_lower in all_original_set or _is_diacritically_compatible(raw, canon_val):
                resolved.append((raw, raw_lower))
            else:
                resolved.append((raw, canon_val))
        else:
            unresolved.append(raw)
            
    return resolved, unresolved


def _pali_stem(stripped_key: str) -> str:
    """Akar pencarian utk menjaring INFLEKSI Pali (acinteyyo/acinteyyāni/acinteyyā ...).
    Pali sangat berinfleksi -> match satu bentuk eksak sering luput sutta intinya. Buang
    ~3 huruf akhiran, tahan minimal 7 huruf (di bawah itu pakai utuh) supaya spesifik."""
    return stripped_key[:max(7, len(stripped_key) - 3)]


def _pali_term_context_suttas(canon_forms: list, limit: int = 4) -> dict:
    """Untuk tiap istilah kanonik, balas daftar formatted-id sutta tempat istilah itu paling
    sering muncul (konteks chip disambiguasi — mis. 'pañcakaṅga → MN 59, MN 78'). Satu lintasan
    korpus pli (stem tahan infleksi), DETERMINISTIK & ringan (tanpa indeks bilara)."""
    corpus, _bm, stripped = engine._load_bm25("pli")
    if not corpus:
        return {c: [] for c in canon_forms}
    pats = {}
    for c in canon_forms:
        s = _pali_stem(_ascii_lower(c))
        if len(s) >= 5:
            pats[c] = re.compile(r'\b' + re.escape(s))
    counts = {c: {} for c in canon_forms}          # canon -> {file_base_name: hit}
    for i, txt in enumerate(stripped):
        base = corpus[i].get("file_base_name")
        if not base:
            continue
        for c, pat in pats.items():
            if pat.search(txt):
                counts[c][base] = counts[c].get(base, 0) + 1
    # Konteks bertujuan membantu user MENGENALI istilah, jadi utamakan sutta KANONIK yang
    # familiar (DN/MN/SN/AN + teks KN populer) di atas teks Abhidhamma/komentar yang cuma
    # mengulang-ulang istilah (mis. Vb/Pe/Ps) -> urut (kanonik dulu, lalu frekuensi).
    _CORE = ("DN ", "MN ", "SN ", "AN ", "Dhp", "Ud ", "Iti", "Snp", "Thag", "Thig")
    out = {}
    for c in canon_forms:
        scored = []
        for base, n in counts.get(c, {}).items():
            fid = reader.format_sutta_id(reader.resolve_sutta_id(base))
            if fid:
                scored.append((0 if fid.startswith(_CORE) else 1, -n, fid))
        scored.sort()
        ids, seen = [], set()
        for _core, _negn, fid in scored:
            if fid not in seen:
                seen.add(fid)
                ids.append(fid)
            if len(ids) >= limit:
                break
        out[c] = ids
    return out


def _detect_pali_ambiguity(query: str, target_lang: str) -> dict | None:
    """Deteksi SATU istilah Pali 'telanjang' di kueri yang AMBIGU: punya >=2 tafsir kanonik
    (stem berbeda) dengan skor gabungan (kemiripan ejaan × frekuensi korpus) berdekatan.
    Balas {'typed': <kata user>, 'candidates': [(canon, ratio, score), ...]} atau None.
    Hanya untuk token yang BELUM eksak/diakritik-benar (yang sudah benar tak perlu ditanya).
    Tujuannya: bertanya 'maksud Anda?' SEBELUM menebak & menjawab salah."""
    _set, canon, _bl, all_original_set = _pali_vocab()
    target_set = _corpus_token_set(target_lang)
    for raw in re.findall(r"[^\W\d_]+", query, re.UNICODE):
        key = _ascii_lower(raw)
        if len(key) < _PALI_TERM_MINLEN or key in _NAME_MATCH_STOPWORDS:
            continue
        if key in target_set:                       # kata ini ADA di terjemahan -> bukan Pali hilang
            continue
        root = _strip_clitic(key)
        if root != key and root in target_set:      # kata target ber-imbuhan (mis. 'poinnya')
            continue
        if key in _OVERVIEW_VERB_STOPWORDS or root in _OVERVIEW_VERB_STOPWORDS:
            continue
        # User sudah mengetik ejaan yang BENAR/eksak (atau diakritik-kompatibel) -> tak ambigu.
        if key in _set or raw.lower() in all_original_set:
            continue
        ranked = _pali_ranked(key, cutoff=_PALI_AMBIG_CAND_FLOOR, window=4, n=8)
        # Jangkar AWALAN: disambiguasi hanya menawarkan kata yang KIRA-KIRA dieja user. Buang
        # kandidat yang 4-huruf awalnya beda (mis. 'panānanda' utk 'pancakanda' — kebetulan
        # sering muncul & ejaan lumayan dekat, tapi jelas bukan yang dimaksud). Awalan = jangkar
        # anti-noise yang jauh lebih kuat dari rasio difflib semata.
        pref = key[:4]
        ranked = [r for r in ranked if r[0][:4] == pref]
        if not ranked:
            continue
        # Kolaps INFLEKSI: kelompokkan semua bentuk satu KATA jadi SATU pilihan/chip (mis.
        # pañcakkhandha / pañcakkhandhā / pañcakkhandhaṁ -> satu chip yang mendaftar bentuk2nya).
        # _pali_stem memotong per-panjang sehingga infleksi beda-panjang bisa beda stem ->
        # gabungkan bila satu stem berawalan stem lainnya (prefix-merge). rasio/skor kata =
        # yang TERBAIK di antara infleksinya; daftar 'forms' = bentuk-permukaan urut frekuensi.
        groups = []                                 # {"stem", "members": [(stripped, canon, ratio, score)]}
        for stripped_c, canon_c, ratio, score in ranked:
            st = _pali_stem(stripped_c)
            g = next((g for g in groups
                      if st.startswith(g["stem"]) or g["stem"].startswith(st)), None)
            if g is None:
                groups.append({"stem": st, "members": [(stripped_c, canon_c, ratio, score)]})
            else:
                g["members"].append((stripped_c, canon_c, ratio, score))
                if len(st) < len(g["stem"]):
                    g["stem"] = st                  # simpan stem terpendek sbg kunci grup
        distinct: list[dict[str, typing.Any]] = []
        for g in groups:
            forms, seen = [], set()                 # bentuk-permukaan tiap infleksi, urut frekuensi
            for stripped_c, canon_c, _r, _s in sorted(g["members"], key=lambda m: -m[3]):
                for sf in (_PALI_FORMS_BY_KEY.get(stripped_c) or [canon_c]):
                    if sf not in seen:
                        seen.add(sf); forms.append(sf)
            distinct.append({
                "term": forms[0] if forms else g["members"][0][1],   # bentuk tersering -> utk resubmit
                "forms": forms[:5],                                   # ditampilkan di satu chip
                "ratio": max(m[2] for m in g["members"]),
                "score": max(m[3] for m in g["members"]),
            })
        distinct.sort(key=lambda x: -x["score"])
        if len(distinct) < 2:
            continue                                # cuma satu KATA (atau infleksinya) -> tak ambigu
        # Putuskan TANYA berdasarkan EJAAN saja: ambil dua KATA berbeda paling mirip ejaan.
        # Bila keduanya sama-sama mirip (selisih rasio <= GAP) -> ejaan tak bisa memutus, jadi
        # tanyakan. Bila satu jelas lebih mirip -> auto-resolve. Frekuensi TIDAK ikut keputusan
        # ini (hanya utk URUTAN chip), supaya pencari istilah langka tak diam-diam dibelokkan.
        by_ratio = sorted(distinct, key=lambda x: -x["ratio"])
        if by_ratio[0]["ratio"] < _PALI_AMBIG_RATIO_FLOOR or by_ratio[1]["ratio"] < _PALI_AMBIG_CAND_FLOOR:
            continue
        if by_ratio[0]["ratio"] - by_ratio[1]["ratio"] > _PALI_AMBIG_RATIO_GAP:
            continue
        # Hanya tampilkan kandidat yang EJAANNYA benar2 sedekat yang terbaik (buang noise spt
        # 'panānanda' yang cuma kebetulan sering tapi ejaannya jauh): rasio >= terbaik - GAP.
        best_ratio = by_ratio[0]["ratio"]
        shown = [d for d in distinct if best_ratio - d["ratio"] <= _PALI_AMBIG_RATIO_GAP][:3]
        if len(shown) < 2:
            continue
        return {"typed": raw, "candidates": shown}
    return None


_BILARA_IDX = None


def _bilara_index():
    """Index korpus BILARA (yg segmen-nya SELARAS Pali↔EN): (pli_by_base, en_by_ref).
    Dipakai utk presisi-segmen: istilah Pali ditemukan di teks pli pada segmen X -> ambil
    terjemahan EN pada segmen X yg SAMA (deterministik). Korpus html (id) TIDAK selaras-segmen
    -> tak bisa di-pinpoint begini (itu sebabnya jalur Indo mengandalkan grounding EN ini)."""
    global _BILARA_IDX
    if _BILARA_IDX is None:
        from collections import defaultdict
        pli_by_base = defaultdict(list)
        for e in engine.load_corpus("pli"):
            if e.get("source") == "bilara":
                pli_by_base[e.get("file_base_name")].append(e)
        en_by_ref = {}
        for e in engine.load_corpus("en"):
            if e.get("source") == "bilara":
                for r in (e.get("ref") or []):
                    en_by_ref.setdefault(r, e)
        _BILARA_IDX = (pli_by_base, en_by_ref)
    return _BILARA_IDX


def _pali_term_suttas(canon_terms: list, target_lang: str, max_suttas: int) -> list:
    """Tarik grounding utk istilah Pali. Tiga lapis, semua DETERMINISTIK:
    1. Sutta kandidat: AKAR/stem istilah di teks pli ternormalisasi (tahan infleksi), diurut
       kepadatan -> sutta yg memang membahas istilah naik ke atas.
    2. Section PRESISI: segmen pli yg memuat istilah -> ambil terjemahan EN pada segmen SELARAS
       (bilara). Inilah definisi istilah yg tepat (mis. dn22 'observing an aspect of the mind').
    3. Konteks bahasa-target (id): blurb sinopsis + bbrp chunk html (utk istilah/kartu) — html
       TAK selaras-segmen jadi tak bisa pinpoint; grounding presisi tetap dari segmen EN di atas.
    Hasil: bentuk ala _group_suttas (satu sutta bisa punya fragmen en+pli+id)."""
    corpus, _bm, stripped = engine._load_bm25("pli")
    if not corpus:
        return []
    stems = list(dict.fromkeys(_pali_stem(_ascii_lower(t)) for t in canon_terms if t))
    patterns = [re.compile(r'\b' + re.escape(s)) for s in stems if len(s) >= 5]
    if not patterns:
        return []
    np = len(patterns)
    base_pat: dict = {}                              # base -> [hitungan per-stem]
    dfs = [0] * np                                   # df per stem (jumlah segmen memuat stem)
    for i, txt in enumerate(stripped):
        hit = [pi for pi in range(np) if patterns[pi].search(txt)]
        if not hit:
            continue
        for pi in hit:
            dfs[pi] += 1
        base = corpus[i].get("file_base_name")
        if base:
            row = base_pat.get(base)
            if row is None:
                row = base_pat[base] = [0] * np
            for pi in hit:
                row[pi] += 1
    # Stem KUANTIFIER/partikel super-umum (mis. 'cattari'=empat) meracuni ranking OR: ngeflood
    # sutta enumerasi & nenggelamin stem KONTEN (mis. 'ariyasacc'). Buang stem yg df-nya outlier
    # tinggi (>4x stem terjarang DAN >400) ASAL masih ada stem tersisa — stem tunggal tak pernah
    # dibuang. Data-driven, jadi tak perlu daftar-kata kuantifier manual.
    mn = min((d for d in dfs if d > 0), default=1)
    keep = [pi for pi in range(np) if dfs[pi] <= max(mn * 4, 400)] or [min(range(np), key=lambda pi: dfs[pi])]
    base_counts = {b: s for b, row in base_pat.items() if (s := sum(row[pi] for pi in keep)) > 0}
    # PRIORITAS SUTTA-PITAKA (DN/MN/SN/AN + KN populer), baru densitas. Istilah spt 'pañcakkhandhā'
    # diborong teks ABHIDHAMMA/komentar (Vibhaṅga/Paṭisambhidā/Kathāvatthu/Peṭakopadesa) yg
    # ngenumerasi terus -> densitas tertinggi TAPI tak punya terjemahan EN selaras/blurb -> entri
    # grounding NOL -> "tidak menemukan teks" walau istilahnya valid. Sutta-pitaka (yg PUNYA
    # terjemahan) didahulukan. Selaras dgn _pali_ranked (disambiguasi).
    _CORE = ("DN ", "MN ", "SN ", "AN ", "Dhp", "Ud ", "Iti", "Snp", "Thag", "Thig")
    def _rank_key(item):
        b, n = item
        fid = reader.format_sutta_id(reader.resolve_sutta_id(b)) or ""
        return (0 if fid.startswith(_CORE) else 1, -n)
    ranked = [b for b, _ in sorted(base_counts.items(), key=_rank_key)][:max(max_suttas, 4)]
    patterns = [patterns[pi] for pi in keep]         # segmen di bawah dipilih pakai stem konten saja

    pli_by_base, en_by_ref = _bilara_index()
    qseed = " ".join(canon_terms)
    entries = []
    for base in ranked:
        segs = [pe for pe in pli_by_base.get(base, [])
                if any(p.search(_ascii_lower(pe.get("text", ""))) for p in patterns)]
        # PRIORITAS JUDUL: segmen heading (head>0) = judul section/sub-section -> menyampaikan
        # STRUKTUR LENGKAP istilah (mis. dhammānupassanā: rintangan/agregat/landasan/bojjhanga/
        # kebenaran). Tanpa ini jawaban timpang (cuma sub-section pertama) & kartu dibanjiri segmen
        # detail. Lalu OVERVIEW (segmen non-judul yg memuat PALING BANYAK istilah berbeda -> kalimat
        # ikhtisar 4-fondasi), lalu sedikit isi. Total dibatasi -> kartu rapi.
        def _stem_hits(pe):
            t = _ascii_lower(pe.get("text", ""))
            return sum(1 for p in patterns if p.search(t))
        headers = [s for s in segs if s.get("heading", 0) > 0]
        nonh = sorted((s for s in segs if s.get("heading", 0) == 0), key=_stem_hits, reverse=True)
        selected = headers[:8] + nonh[:3]
        seen_en = set()
        _n_before = len(entries)
        for pe in selected:
            for r in (pe.get("ref") or []):
                ee = en_by_ref.get(r)
                if ee and id(ee) not in seen_en:
                    seen_en.add(id(ee))
                    entries.append({**ee, "score": 1.0, "score_type": "exact"})
        # FALLBACK terjemahan HTML: istilah yg hidupnya di teks ber-terjemahan NON-bilara
        # (Abhidhamma kv/vb/patthana, Vinaya html) tak punya segmen EN selaras -> tanpa ini
        # entri NOL -> "tidak menemukan teks" padahal istilahnya valid (kasus pañcaviññāṇā).
        # Tarik chunk terjemahan sutta-nya (urut relevansi BM25 thd istilah), bahasa target
        # dulu lalu bahasa lain — pola fallback bahasa yg sama dgn jalur mention.
        if len(entries) == _n_before:
            for _L in [target_lang] + [x for x in ("id", "en") if x != target_lang]:
                _th = [h for h in engine.exact_sutta_match(base, _L, max_chunks=6, query=qseed)
                       if h.get("author") != "blurb"]
                if _th:
                    entries.extend(_th)
                    break
        # Konteks bahasa-target: HANYA blurb sinopsis (benar & ringkas). Sengaja TIDAK menarik
        # isi html bahasa-target — html tak selaras-segmen jadi sort-panjang menarik section SALAH
        # (mis. 'merenungkan jasmani' utk kueri dhamma) yg menyesatkan di kartu & prompt.
        tgt_blurb = [h for h in engine.exact_sutta_match(base, target_lang, max_chunks=1, query=qseed)
                     if h.get("author") == "blurb"]
        entries.extend(tgt_blurb)
    return _group_suttas(entries)


def _pali_phrase_suttas(query: str, target_lang: str, max_suttas: int):
    """User nge-PASTE petikan Pāḷi KONTIGU (>=3 kata) yg ADA persis di korpus pli -> tarik
    SEGMEN EKSAK yg memuatnya + terjemahan EN selaras-segmen (bilara) + blurb target. Jauh lebih
    presisi dari _pali_term_suttas yg bag-of-words: kata super-umum ('labhati','cittassa') nge-flood
    ranking densitas & nenggelamin passage yg dimaksud (mis. 'karitva labhati samadhi' SEHARUSNYA
    SN 48.9/10/11, bukan DN 30/AN 10.75). Self-gating: cuma nyala kalau frasa LITERAL ada di teks
    Pāḷi (substring), jadi kueri Indo/Eng biasa tak akan memicu. Balas (entries, frasa) / ([], None)."""
    corpus, _bm, stripped = engine._load_bm25("pli")
    if not corpus:
        return [], None
    qtoks = re.findall(r"[^\W\d_]+", _ascii_lower(query))
    if len(qtoks) < 3:
        return [], None
    # n-gram KONTIGU TERPANJANG (n: min(len,10) -> 3) yg jadi substring >=1 segmen pli. Ambil yg
    # paling panjang = paling spesifik. Min 12 huruf (tanpa spasi) supaya bukan kebetulan kata pendek.
    phrase, hit_idx = None, []
    for n in range(min(len(qtoks), 10), 2, -1):
        for i in range(len(qtoks) - n + 1):
            cand = " ".join(qtoks[i:i + n])
            if len(cand.replace(" ", "")) < 12:
                continue
            idxs = [j for j, t in enumerate(stripped) if cand in t]
            if idxs:
                phrase, hit_idx = cand, idxs
                break
        if phrase:
            break
    if not phrase:
        return [], None
    # Base sutta yg memuat frasa, ranking: core-pitaka dulu (punya terjemahan), lalu densitas hit.
    base_counts: dict = {}
    for j in hit_idx:
        b = corpus[j].get("file_base_name")
        if b:
            base_counts[b] = base_counts.get(b, 0) + 1
    _CORE = ("DN ", "MN ", "SN ", "AN ", "Dhp", "Ud ", "Iti", "Snp", "Thag", "Thig")
    def _rank_key(item):
        b, n = item
        fid = reader.format_sutta_id(reader.resolve_sutta_id(b)) or ""
        return (0 if fid.startswith(_CORE) else 1, -n)
    ranked = [b for b, _ in sorted(base_counts.items(), key=_rank_key)][:max(max_suttas, 4)]
    pli_by_base, en_by_ref = _bilara_index()
    entries = []
    for base in ranked:
        segs = [pe for pe in pli_by_base.get(base, []) if phrase in _ascii_lower(pe.get("text", ""))]
        seen_en = set()
        for pe in segs[:6]:
            for r in (pe.get("ref") or []):
                ee = en_by_ref.get(r)
                if ee and id(ee) not in seen_en:
                    seen_en.add(id(ee))
                    entries.append({**ee, "score": 1.0, "score_type": "exact"})
        tgt_blurb = [h for h in engine.exact_sutta_match(base, target_lang, max_chunks=1, query=phrase)
                     if h.get("author") == "blurb"]
        entries.extend(tgt_blurb)
    return _group_suttas(entries), phrase


def _translation_phrase_suttas(query: str, lang: str, max_suttas: int):
    """User nge-PASTE petikan TERJEMAHAN (id/en) KONTIGU yg ADA persis di korpus bahasa itu ->
    tarik sutta pemuatnya sbg hit EKSAK. Analog _pali_phrase_suttas tapi utk korpus terjemahan
    (entri korpus SUDAH bahasa target -> tak perlu bilara-align). Threshold lebih tinggi (>=6 token,
    >=28 char, query >=8 token) krn kata terjemahan overlap tinggi -> cegah pertanyaan natural pendek
    ikut memicu. Substring dicek pada teks korpus ter-normalisasi (`stripped`: NFD-strip-diakritik +
    lower, TANPA buang tanda baca) -> hanya span kontigu TANPA tanda baca yg match (paritas jalur Pāḷi).
    Balas (entries, frasa) / ([], None)."""
    corpus, _bm, stripped = engine._load_bm25(lang)
    if not corpus:
        return [], None
    qtoks = re.findall(r"[^\W\d_]+", _ascii_lower(query))
    if len(qtoks) < 8:            # paste panjang, bukan pertanyaan pendek
        return [], None
    phrase, hit_idx = None, []
    for n in range(min(len(qtoks), 16), 5, -1):    # n turun sampai 6
        for i in range(len(qtoks) - n + 1):
            cand = " ".join(qtoks[i:i + n])
            if len(cand.replace(" ", "")) < 28:
                continue
            idxs = [j for j, t in enumerate(stripped) if cand in t]
            if idxs:
                phrase, hit_idx = cand, idxs
                break
        if phrase:
            break
    if not phrase:
        return [], None
    base_counts: dict = {}
    entries_by_base: dict = {}
    for j in hit_idx:
        e = corpus[j]
        b = e.get("file_base_name") or ((e.get("ref") or ["?"])[0].split(":")[0])
        base_counts[b] = base_counts.get(b, 0) + 1
        entries_by_base.setdefault(b, []).append(e)
    _CORE = ("DN ", "MN ", "SN ", "AN ", "Dhp", "Ud ", "Iti", "Snp", "Thag", "Thig")
    def _rank_key(item):
        b, n = item
        fid = reader.format_sutta_id(reader.resolve_sutta_id(b)) or ""
        return (0 if fid.startswith(_CORE) else 1, -n)
    ranked = [b for b, _ in sorted(base_counts.items(), key=_rank_key)][:max(max_suttas, 4)]
    entries = []
    for base in ranked:
        for e in entries_by_base[base][:6]:
            entries.append({**e, "score": 1.0, "score_type": "exact", "db_source": lang})
    return _group_suttas(entries), phrase


# Intent enumeratif: user minta DAFTAR (mis. "sebutkan empat jenis manusia", "apa saja faktor ..."). Dipakai
# utk (a) narik chunk lebih banyak per sutta (list utuh, bukan 1 aspek), (b) memicu panduan framing
# di answer-guide (sajikan tiap kategorisasi terpisah). Sinyal kuat: angka/kata-bilangan + kata-kategori.
_ENUM_INTENT_RE = re.compile(
    r'\b(?:satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|berapa|\d+|'
    r'two|three|four|five|six|seven|eight|nine|ten|how\s+many)\s+'
    r'(?:jenis|macam|tipe|golongan|kelompok|kategori|kelas|jalan|landasan|faktor|unsur|cara|tingkat|sifat|'
    r'kualitas|aspek|types?|kinds?|factors?|grounds?|ways?|categories|categorie)\b'
    r'|\b(?:sebutkan|rincikan|daftar(?:kan)?|uraikan\s+semua|jelaskan\s+semua|apa\s+saja(?:kah)?|'
    r'list\s+(?:the|all)|what\s+are\s+the)\b',
    re.IGNORECASE)

# Niat "buatkan tabel" (sering muncul sbg follow-up reformat: "oke bikinin tabelnya").
# Dipakai utk inject pengingat KERAS di akhir pesan tool (atensi tertinggi): rujukan WAJIB
# menyatu di dalam sel, DILARANG bikin kolom 'Rujukan' tersendiri — klausa di answer-guide
# sering diabaikan model.
_TABLE_INTENT_RE = re.compile(
    r'\b(?:tabel|table|tabelkan|tabulasi|tabular|kolom|column)\b',
    re.IGNORECASE)

# Niat KONFIRMASI PREMIS ("jadi X itu sama dengan Y?", "berarti ...?", "bukankah ...").
# Model kecil cenderung sycophancy: asal mengiyakan ("Benar, ...") padahal premisnya keliru
# — kasus nyata: user menyamakan 'kesadaran' (sati) dgn viññāṇa, model jawab "Benar" (bahaya
# doktrin). Dipakai utk inject pengingat periksa-premis di akhir pesan tool (atensi
# tertinggi). Umum utk premis APA PUN, bukan special-case pasangan istilah tertentu.
_CONFIRM_INTENT_RE = re.compile(
    r'\b(?:apakah\s+(?:benar|betul|sama)|benarkah|betulkah|bukankah|berarti|artinya|maksudnya|'
    r'sama\s+(?:dengan|dgn|seperti|spt|saja|aja|kah)|itu\s+sama|sama\s*,?\s*(?:kan|ya|bukan)\b|'
    r'is\s+it\s+true|isn\'?t\s+it|(?:the\s+)?same\s+(?:as|thing)|equivalent\s+to|'
    r'does\s+(?:that|this|it)\s+mean|so\s+(?:that|this)\s+means)\b',
    re.IGNORECASE)

# Niat LOCATOR: user nanya DI MANA sebuah kutipan/teks berada ("ini ada di ayat mana",
# "dari sutta apa", "which sutta is this from"). Dipakai utk (a) ketika frasa Pāḷi yg
# di-paste ketemu PERSIS di korpus -> redam kaki hybrid topikal yg cuma berkaitan tema
# (biar lokasi eksak tak ketimbun), (b) memicu pengingat agar jawaban MIMPIN dgn rujukan.
_LOCATOR_INTENT_RE = re.compile(
    r'\b(?:di|dari|pada)\s+(?:ayat|sutta|teks|bagian|kitab|nikaya|mana)\b'
    r'|\b(?:ayat|sutta|teks|bagian|kutipan|baris)\s+(?:mana|apa|berapa|keberapa)\b'
    r'|\b(?:dari|di)\s+mana\b'
    r'|\b(?:sumber\w*|asal(?:nya|\s*usul)?)\b'
    r'|\bwhich\s+(?:sutta|text|verse|passage|discourse|nikaya|line)\b'
    r'|\bwhere\b.{0,30}\b(?:from|find|appears?|come|comes|located)\b'
    r'|\bwhat\s+(?:sutta|verse|text|passage)\b',
    re.IGNORECASE)

def _get_overlap_length(s1: str, s2: str) -> int:
    """Helper buat nyari panjang karakter yang tumpang tindih di ujung s1 dan awal s2"""
    max_overlap = min(len(s1), len(s2))
    # batasi cek overlap maksimal misal 200 karakter terakhir aja biar enteng
    max_overlap = min(max_overlap, 200) 
    for i in range(max_overlap, 10, -1): # minimal 10 char biar ga salah potong kata pendek
        if s1.endswith(s2[:i]):
            return i
    return 0


def _truncate_sentence(t: str, n: int) -> str:
    """Potong t ke <= ~n char, sebisanya di batas kalimat (.!?) supaya kutipan wakil section
    tak putus di tengah. Fallback: potong di spasi terakhir + elipsis."""
    t = (t or "").strip()
    if len(t) <= n:
        return t
    cut = t[:n]
    ends = list(re.finditer(r'[.!?]["\'”’]?(?:\s|$)', cut))
    if ends and ends[-1].end() > n * 0.5:
        return cut[:ends[-1].end()].strip()
    sp = cut.rfind(" ")
    return (cut[:sp].strip() if sp > n * 0.5 else cut.strip()) + " …"


def _passages_for_prompt(suttas: list, prompt_db: str, expand: set | None = None, enum: bool = False) -> list:
    """Ratakan suttas -> daftar passage utk teks-tool LLM. Tiap passage: formatted_id (dgn segmen),
    sutta_name, pitaka, synopsis (blurb), text (fragmen terbaik pd bahasa prompt_db).
    `expand` = set formatted-id sutta yg di-mention eksplisit -> gabung BANYAK fragmen (baca
    lebih penuh, dipotong ~4000 char) alih-alih 1 fragmen, agar LLM bisa fokus mendalam."""
    expand = expand or set()
    def _ftext(f):
        """Teks fragmen + bahasa yg dipakai. Fallback berurutan: prompt_db -> id -> en -> pli
        (mis. sutta yg di-mention tanpa terjemahan Indo ambil Inggris, lalu Pāli sbg upaya terakhir)."""
        tx = f.get("texts", {})
        for L in (prompt_db, "id", "en", "pli"):
            t = (tx.get(L) or "").strip()
            if t:
                return t, L
        return "", None

    def _seg_sort_key(f):
        refs = f.get("ref") or []
        if not refs: return ()
        return tuple((-(len(x) - len(x.lstrip('0'))), int(x)) if x.isdigit() else x for x in re.split(r'(\d+)', refs[0]))

    out = []
    for s in suttas:
        frags = s.get("fragments", [])
        blurb = next((f for f in frags if f.get("author") == "blurb"), None)
        bodies = [f for f in frags if f.get("author") != "blurb"]
        synopsis = ""
        if blurb:
            synopsis, _ = _ftext(blurb)
        fid = s.get("formatted_id", "")
        text, text_lang = "", None
        
        if bodies:
            # Jika eksplisit (expand), ambil semua. Kueri enumeratif ('sebutkan empat jenis ...') butuh
            # daftar UTUH -> ambil lebih banyak chunk (8) biar list lengkap kebawa, bukan 1 aspek doang.
            # Selain itu 5 chunk terbaik.
            limit = None if fid in expand else (8 if enum else 5)
            bodies_subset = bodies if limit is None else bodies[:limit]
            # Urutan dokumen (natural sort by segmen) = dasar perakitan.
            bodies_sorted = sorted(bodies_subset, key=_seg_sort_key)
            max_len = 4000 if fid in expand else (3200 if enum else 2000)

            parts, part_langs = [], []
            core_texts = set()
            for f in bodies_sorted:
                t, _ = _ftext(f)
                if t: core_texts.add(t)

            seen_refs = set()
            for f in bodies_sorted:
                for r in f.get("ref") or []:
                    seen_refs.add(r)
            seen_texts = set()
            last_raw_text = ""

            def add_part(tag, text, refs=None, is_core=False):
                nonlocal last_raw_text
                if not text:
                    return
                if refs:
                    if not is_core and all(r in seen_refs for r in refs):
                        return
                else:
                    if text in seen_texts:
                        return
                    if not is_core and text in core_texts:
                        return

                overlap = _get_overlap_length(last_raw_text, text)
                if overlap > 0:
                    clean_text = text[overlap:].strip()
                else:
                    clean_text = text.strip()

                if clean_text:
                    # Ganti titik jadi garis miring tunggal ( / ) sebagai penanda pindah baris (line break) bait puisi.
                    # Ini ngasih tahu LLM bahwa ada jeda struktural (beda baris) tanpa harus memutus tata bahasa
                    # kalimat kalau aslinya emang nyambung ke baris bawahnya.
                    if not re.search(r'[.!?]["\']?$', clean_text):
                        clean_text += " /"
                    parts.append(f"{tag} {clean_text}")
                    last_raw_text = text

                seen_texts.add(text)
                if refs:
                    for r in refs:
                        seen_refs.add(r)

            def _seg_tag(f):
                refs = f.get("ref") or []
                return (":" + refs[0].split(":", 1)[1]) if (refs and ":" in refs[0]) else ""

            heading_frags = [f for f in bodies_sorted if f.get("heading", 0) > 0]
            # Skeleton overview = KOMPRESI utk sutta yg badannya MELEBIHI budget (max_len): ambil
            # 1 wakil isi (terpanjang) per section. Kalau seluruh badan sutta MUAT di budget, gak
            # ada alasan dikompres -> rakit penuh biar LLM lihat semua poin. Tanpa gate ukuran ini,
            # sutta pendek ber-heading hierarki-judul (mis. AN 4.91: 3 judul Nikāya/Buku/Sutta + 6
            # isi 'asura/deva' numpuk di SATU section, ~1.3k char) ke-collapse jadi 1 paragraf ->
            # jawaban cuma bahas 1 dari 4 poin (sisi 'deva' ilang).
            full_body_len = sum(len(_ftext(f)[0]) for f in bodies_sorted)
            if fid in expand and heading_frags and full_body_len > max_len:
                # OVERVIEW (@mention 'bahas apa', skeleton hanya saat badan > budget): KERANGKA judul
                # + 1 kutipan isi representatif
                # PER SECTION, tersebar merata se-sutta (bukan front-load). Section = judul + isi
                # di bawahnya s/d judul berikut; wakil = isi TERPANJANG (paling informatif),
                # dipotong ke jatah merata. Judul identik berulang (refrain mis. 'Pandangan
                # Terang') di-collapse ke kemunculan pertama -> hemat budget utk struktur EKOR.
                sections, cur_h, cur_c = [], None, []
                for f in bodies_sorted:
                    if f.get("heading", 0) > 0:
                        sections.append((cur_h, cur_c)); cur_h, cur_c = f, []
                    else:
                        cur_c.append(f)
                sections.append((cur_h, cur_c))
                uniq, seen_h = [], set()
                for h, c in sections:
                    if h is None and not c:
                        continue
                    ht = _ftext(h)[0] if h is not None else ""
                    if ht and ht in seen_h:        # judul identik = refrain/boilerplate -> lewati
                        continue
                    if ht: seen_h.add(ht)
                    uniq.append((h, c))
                skel_len = sum(len(_ftext(h)[0]) + 12 for h, _ in uniq if h is not None)
                n_c = sum(1 for _, c in uniq if c) or 1
                share = max(220, (max_len - skel_len) // n_c)
                for h, c in uniq:
                    if h is not None:
                        ht, hl = _ftext(h)
                        if ht:
                            part_langs.append(hl)
                            add_part(f"[{fid}{_seg_tag(h)}]", ht, refs=h.get("ref"), is_core=True)
                    if not c:
                        continue
                    rep = max(c, key=lambda x: len(_ftext(x)[0]))   # isi terpanjang = paling informatif
                    rt, rl = _ftext(rep)
                    if not rt:
                        continue
                    part_langs.append(rl)
                    add_part(f"[{fid}{_seg_tag(rep)}]", _truncate_sentence(rt, share), refs=rep.get("ref"), is_core=True)
            else:
                # Non-overview (search biasa / mention spesifik): rakit fragmen + konteks urut segmen.
                for f in bodies_sorted:
                    t, L = _ftext(f)
                    if not t: continue
                    part_langs.append(L)
                    ctx_b = f.get("context_before", {}).get(L)
                    if ctx_b:
                        refs_b = f.get("context_before_refs", {}).get(L) or []
                        tag_b = (":" + refs_b[0].split(":", 1)[1]) if (refs_b and ":" in refs_b[0]) else ""
                        add_part(f"[{fid}{tag_b}]", ctx_b, refs=refs_b, is_core=False)
                    
                    add_part(f"[{fid}{_seg_tag(f)}]", t, refs=f.get("ref"), is_core=True)
                    
                    ctx_a = f.get("context_after", {}).get(L)
                    if ctx_a:
                        refs_a = f.get("context_after_refs", {}).get(L) or []
                        tag_a = (":" + refs_a[0].split(":", 1)[1]) if (refs_a and ":" in refs_a[0]) else ""
                        add_part(f"[{fid}{tag_a}]", ctx_a, refs=refs_a, is_core=False)

            text = "\n".join(parts)[:max_len]
            text_lang = next((L for L in part_langs if L != "pli"), "pli" if part_langs else None)
        else:
            text = synopsis
            synopsis = ""
            
        if not text and not synopsis:
            continue
            
        out.append({
            "formatted_id": fid,
            "sutta_name": s.get("sutta_name", ""),
            "pitaka": s.get("pitaka", "sutta"),
            "synopsis": synopsis,
            "text": text,
            "lang": text_lang,
            "is_expand": fid in expand
        })
    return out


def _cited_only(answer: str, suttas: list) -> list:
    """Hanya sutta yg base-id-nya (mis. 'MN 4') benar-benar muncul di jawaban LLM."""
    if not answer:
        return []
    seen, out = set(), []
    for s in suttas:
        base = (s.get("formatted_id") or "").split(":")[0]
        # Word-boundary + lookahead (?!\d): cegah "DN 2" cocok di dalam "DN 22",
        # "MN 1" di "MN 10", dst. Substring naif (base in answer) bikin kartu salah lolos.
        if base and base not in seen and re.search(r'\b' + re.escape(base) + r'(?!\d)', answer):
            seen.add(base)
            out.append(s)
    return out


# "Sitasi hantu": LLM kerap menyebut rujukan (mis. 'SN 12.48:md9') yg sebenarnya berasal dari
# giliran SEBELUMNYA (ada di history) atau dari ingatan model — TAK di-retrieve giliran ini, jadi
# tak ada kartunya. linkifyCitations frontend sudah menolak mengubahnya jadi link, tapi TEKS-nya
# masih menggantung. Di sini kita BUANG ref-nya dari jawaban final supaya tak ada klaim sumber
# tanpa kartu. Hanya ref ber-nomor (sutta+angka) yg disasar; nama koleksi telanjang ('Dhp') aman.
_GHOST_REF_RE = None


def _ghost_ref_re():
    global _GHOST_REF_RE
    if _GHOST_REF_RE is None:
        codes = sorted((str(c) for c in _collection_codes() if c), key=len, reverse=True)
        alt = "|".join(re.escape(c) for c in codes)
        _GHOST_REF_RE = re.compile(
            r'\(?\b(' + alt + r')\s*(\d+(?:\.\d+)*(?:-\d+)?)(:[\w.\-]+)?\)?',
            re.IGNORECASE)
    return _GHOST_REF_RE


def _seg_ord(seg: str):
    """('md', 13.0) dari 'md13'; ('', 4.2) dari '4.2'. None kalau tak terurai."""
    m = re.match(r'^([a-z]*)(\d+(?:\.\d+)?)$', seg, re.I)
    return (m.group(1).lower(), float(m.group(2))) if m else None


def _seg_covers(a_seg: str, b_seg: str) -> bool:
    """a_seg (bisa range 'x-y' / hierarki titik) mencakup b_seg? Mirror segInTarget di chat.js."""
    if a_seg == b_seg:
        return True
    if "-" in a_seg:
        lo, hi = (a_seg.split("-", 1) + [""])[:2]
        ob, olo, ohi = _seg_ord(b_seg), _seg_ord(lo), _seg_ord(hi)
        if ob and olo and ohi and ob[0] == olo[0] == ohi[0]:
            return min(olo[1], ohi[1]) <= ob[1] <= max(olo[1], ohi[1])
        return b_seg in (lo, hi)
    return b_seg.startswith(a_seg + ".") or a_seg.startswith(b_seg + ".")


def _seg_grounded(base_norm: str, seg: str, grounded_segs: set) -> bool:
    """True kalau `seg` (mis. 'md13') memang ada di segmen retrieval base ini, ATAU formatnya beda
    (mis. sitasi '1.3' tapi fragment ':md' -> jangan dihakimi ngarang). False HANYA kalau ada
    segmen valid se-base & se-prefix tapi nomor ini di luarnya (= halusinasi melebihi segmentasi)."""
    if not seg:
        return True
    t_ord = _seg_ord(seg)
    same_prefix = False
    for v in grounded_segs:
        if ":" not in v:
            continue
        vb, vseg = v.split(":", 1)
        if vb != base_norm:
            continue
        if _seg_covers(vseg, seg) or _seg_covers(seg, vseg):
            return True
        v_ord = _seg_ord(vseg)
        if t_ord and v_ord and t_ord[0] == v_ord[0]:
            same_prefix = True
    return not same_prefix


def _strip_ghost_refs(answer: str, grounded_bases: set, grounded_segs=None) -> str:
    """Buang rujukan sutta yg base-id-nya TIDAK ada di retrieval giliran ini (grounded_bases =
    {'sn12.48', ...} sudah ternormalisasi lower & tanpa spasi). Yg grounded dibiarkan utuh.
    Bila grounded_segs diberi (final), SEGMEN ngarang yg melebihi segmentasi nyata (mis. ':md13'
    padahal cuma s/d ':md5') -> suffix segmennya DIBUANG, sisakan ref base. Deterministik (bukan
    ngandelin disiplin sitasi model). grounded_segs = {'sn48.68:md1', ...} ternormalisasi."""
    if not answer:
        return answer

    def repl(m):
        base = (m.group(1) + m.group(2)).replace(" ", "").lower()
        if base not in grounded_bases:
            # '\(?…\)?' di regex ditujukan utk ref FULL berkurung '(MN 10)' -> buang beserta
            # kurungnya. Utk prosa campuran '(… dalam MN 10)' match cuma nyaplok SATU sisi
            # kurung -> kembalikan sisi itu, jangan ikut dibuang (dulu bikin kurung gantung
            # '(seperti yang dijelaskan dalam .' krn kurung-tutup raib bareng ref).
            tok = m.group(0)
            has_open, has_close = tok.startswith("("), tok.endswith(")")
            if has_open != has_close:
                return "(" if has_open else ")"
            return ""
        seg_raw = m.group(3)
        if grounded_segs and seg_raw:
            seg = seg_raw[1:].strip().rstrip(".,;").lower()      # buang ':' depan + tanda baca akhir
            if seg and not _seg_grounded(base, seg, grounded_segs):
                return m.group(0).replace(seg_raw, "", 1)        # base valid, segmen ngarang -> drop segmen
        return m.group(0)

    out = _ghost_ref_re().sub(repl, answer)
    # Rapikan sisa pembuangan + TANDA BACA YATIM. Separator (;/,) bisa menggantung karena (a) ref
    # di antaranya kebuang, ATAU (b) model emang nulis "…terang ; ." (kutipan kepotong). Aturan
    # hanya menyasar separator yg bersebelahan dgn tanda-baca-kalimat / batas teks / kurung —
    # titik-koma & koma SAH di tengah prosa ("A; B", "A, B") tak tersentuh.
    out = re.sub(r'\(\s*[,;.\s]*\)', '', out)          # kurung kosong / cuma tanda baca
    out = re.sub(r'\(\s*[,;]\s*', '(', out)            # separator nyantol di awal kurung
    out = re.sub(r'[;,]\s*(?=[;,])', '', out)          # separator beruntun ('; ;' / ';,') -> satu
    out = re.sub(r'\s*[;,](?=\s*[.!?)])', '', out)     # ';'/',' tepat sebelum . ! ? ) -> buang
    out = re.sub(r'(^|[(\n])\s*[;,]\s*', r'\1', out)   # separator yatim di awal baris/kalimat/kurung
    out = re.sub(r'\s*[;,]\s*$', '', out)              # separator yatim di ujung teks
    out = re.sub(r'\s+([;,.)!?])', r'\1', out)         # spasi sebelum tanda baca
    out = re.sub(r'(?<=\S)[ \t]{2,}', ' ', out)        # spasi dobel sisa
    return out


# ============================================================
# Routes — Chat (Agentic RAG)
# ============================================================
@app.route("/chat")
def chat_ui():
    """Chat bukan lagi dedicated page — jadi panel kanan di semua halaman.
    Link lama (/chat, /chat?q=..., /chat?tag=...) di-redirect ke home dengan
    ?chat=1; common.js membuka panel + prefill dari param tsb."""
    args = {"chat": "1"}
    for k in ("q", "tag", "id"):
        v = request.args.get(k)
        if v:
            args[k] = v
    return redirect("/?" + urlencode(args))

@app.route("/api/chat", methods=["POST"])
def api_chat():
    from flask import Response, stream_with_context
    import json
    import re
    import unicodedata
    import concurrent.futures

    body = request.get_json(force=True) or {}
    query = (body.get("message") or body.get("query") or "").strip()
    if not query:
        return jsonify({"error": "Pertanyaan kosong"}), 400
    # Guard panjang query: maks 2000 karakter (proteksi context flooding)
    query = query[:2000]

    lang = body.get("lang") or detect_query_lang(query, default_lang=body.get("db", "id"))
    if lang == "pli":
        lang = "id"
    # Scope (bahasa korpus & pitaka) ditentukan agen sendiri via argumen tool, bukan filter UI.
    # db_pref hanya menentukan bahasa jawaban/pasase (prompt_db); default ikut bahasa terdeteksi.
    db_pref = body.get("db") or ("en" if lang == "en" else "id")
    # Guard top_k: clamp ke 1–12. Default 6. Tanpa batas, user bisa kirim top_k=9999 → beban retrieval masif.
    max_suttas = max(1, min(int(body.get("top_k") or 8), 12))
    history = body.get("history") or []
    # Poin 4: pilihan terjemahan per-mention dari user (picker frontend). Keyed formatted_id
    # ("MN 10"); dinormalisasi ke "mn10" utk dicocokkan dgn mention loop. Kosong = auto fallback.
    mention_prefs = body.get("mention_prefs") or {}
    _prefs_norm = {k.replace(" ", "").lower(): v for k, v in mention_prefs.items() if v}
    page_context = body.get("page_context") if isinstance(body.get("page_context"), dict) else None
    # broad_search = body.get("broad_search", False)
    use_rerank = body.get("use_reranker")
    sel_dbs = _parse_db(db_pref)
    prompt_db = lang if lang in sel_dbs else sel_dbs[0]

    def _strip_diacritics(s):
        return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode()

    # Fungsi Wrapper Tool
    def execute_search_tool(t_query, t_pitaka, t_lang):
        eff_db = "en" if t_lang == "en" else "id"
        eff_dbs = _parse_db(eff_db)
        eff_db_str = ",".join(eff_dbs)
        
        # Ekstraksi mentions (rujukan eksplisit) dari kueri agen DAN kueri asli user —
        # supaya "@MN10" selalu dihormati walau agen menulis ulang kuerinya.
        # \d+(?:\.\d+)*(?:-\d+)? -> dukung RANGE (mis. Dhp 1-20, Thag 1.1-10) karena banyak
        # teks dikelompokkan per-vagga dgn id ber-range (dhp1-20). Tanpa ini "@Dhp 1-20"
        # ke-truncate jadi "dhp1" yg tak resolve -> hasil kosong.
        _MENTION_RE = r'@?\b((?:dn|mn|sn|an|kn|kp|khp|dhp|ud|iti|snp|vv|pv|thag|thig|tha-ap|thi-ap|bv|cp|ja|mnd|cnd|ps|pe|nett|mil|bu-[a-z]+|bi-[a-z]+|pli-tv-[a-z\-]+|ds|vb|dt|pp|kv|ya|patthana)\s*\d+(?:\.\d+)*(?:-\d+)?)\b'
        mentions = re.findall(_MENTION_RE, t_query + " " + query, re.IGNORECASE)
        # Dedup CASE-INSENSITIF (cegah "MN 10" & "mn 10" dianggap dua mention berbeda ->
        # dobel di trace/penarikan). Simpan bentuk pertama yg terlihat.
        _seen_m, _dd = set(), []
        for _m in (m.strip() for m in mentions):
            _k = _m.lower().replace(" ", "")
            if _k in _seen_m:
                continue
            _seen_m.add(_k)
            _dd.append(_m)
        mentions = _dd
        # Anti-MANGLING rewrite: t_query (tulisan-ulang LLM) kadang menyalin-rusak kode kitab
        # ("@Mnd 6" -> nulis "MN 6") -> kebaca sbg mention kedua & sutta salah ikut ketarik.
        # Buang mention yg (a) TAK ada di kueri user asli, dan (b) nabrak mention-asli dgn
        # NOMOR sama + kode kitab yg satu prefix dari yg lain (mn ⊂ mnd). Carry lintas-turn
        # sah (nomor beda / kode beda total) tetap lolos.
        _raw_keys = {m.lower().replace(" ", "") for m in re.findall(_MENTION_RE, query, re.IGNORECASE)}
        def _split_code(k):
            _mm = re.match(r'([a-z\-]+)(\d.*)$', k)
            return (_mm.group(1), _mm.group(2)) if _mm else (k, "")
        def _mangled(m):
            k = m.lower().replace(" ", "")
            if not _raw_keys or k in _raw_keys:
                return False
            bk, num = _split_code(k)
            for r in _raw_keys:
                rb, rn = _split_code(r)
                if num and rn == num and bk != rb and (rb.startswith(bk) or bk.startswith(rb)):
                    return True
            return False
        mentions = [m for m in mentions if not _mangled(m)]
        carried_ctx = False
        # Auto-carry LAMA (selalu carry) dihapus krn lock-in permanen. Andalan utama: LLM menyisipkan
        # kode sutta di t_query saat follow-up. JARING PENGAMAN deiktik di bawah: kalau LLM lupa & user
        # JELAS merujuk balik ("sutta itu", "teks tersebut", "di situ"), tarik kode sutta dari giliran
        # asisten terakhir. Sengaja pakai pola referent-noun + kata tunjuk, BUKAN "itu" telanjang —
        # supaya idiom "apa itu X" (pertanyaan baru) tidak salah memicu carry (anti lock-in).
        # Page-context: user lagi baca sutta X di viewer -> panel chat kirim page_context.
        # Kalau query deiktik ("sutta ini", "di sini", "this passage") & belum ada mention eksplisit,
        # jangkar ke sutta yg LAGI DIBUKA. Prioritas di atas carry-history (user literally lihat teksnya).
        # HANYA saat deiktik (bukan always-carry) -> hindari lock-in ke sutta yg dibuka utk pertanyaan lepas.
        if not mentions and page_context and page_context.get("formatted_id"):
            _PGCTX_DEICTIC = re.compile(
                r'\b(?:sutta|teks|ayat|bagian|kisah|cerita|perumpamaan|khotbah|kotbah|wejangan|uraian|bab|paragraf|kalimat|potongan|isi(?:nya)?)\s+(?:ini|itu|tersebut|di\s*atas|berikut)\b'
                r'|\bdi\s*(?:sini|situ|atas|bawah)\b'
                r'|\b(?:ini|tersebut)\s+(?:sutta|teks|maksud\w*|arti\w*)\b'
                r'|\bthis\s+(?:sutta|text|passage|verse|line|paragraph|word|term|section|discourse|part)\b'
                r'|\b(?:here|above)\b', re.IGNORECASE)
            if _PGCTX_DEICTIC.search(query):
                mentions = [page_context["formatted_id"]]
                carried_ctx = True
        if not mentions and history:
            _DEICTIC_RE = re.compile(
                r'\b(?:sutta|teks|ayat|bagian|kisah|cerita|perumpamaan|khotbah|kotbah|wejangan|uraian|bab|isi(?:nya)?)\s+(?:itu|ini|tersebut|tadi)\b'
                r'|\bdi\s+(?:situ|sana)\b'
                r'|\b(?:itu|tersebut)\s+(?:sutta|teks)\b', re.IGNORECASE)
            if _DEICTIC_RE.search(query):
                for h in reversed(history):
                    if h.get("role") != "assistant":
                        continue
                    prev = re.findall(_MENTION_RE, h.get("content") or "", re.IGNORECASE)
                    if prev:
                        mentions = list(dict.fromkeys(m.strip() for m in prev))[:2]
                        carried_ctx = True
                        break
            # Lanjutan TANPA subjek sendiri ('poin-poinnya apa', 'ringkasnya dong', 'intinya
            # apa') -> hanya bermakna sbg kelanjutan; carry mention TERAKHIR (user/asisten, mana
            # pun yg terdekat). Aman dari lock-in: 'apa itu X' punya subjek -> _is_contentless
            # False -> tak ke-carry. Memberi jangkar (anti gerbang 'ga nemu') + niat overview.
            if not mentions and _is_contentless_followup(query):
                for h in reversed(history):
                    prev = re.findall(_MENTION_RE, h.get("content") or "", re.IGNORECASE)
                    if prev:
                        mentions = list(dict.fromkeys(m.strip() for m in prev))[:2]
                        carried_ctx = True
                        break
        q_norm = _strip_diacritics(t_query.lower())
        q_words = [w for w in dict.fromkeys(re.split(r'\W+', q_norm)) if len(w) >= 5 and w not in _NAME_MATCH_STOPWORDS]
        
        _PALI_ID_RE = re.compile(r'^(dn|mn|sn|an|kn|kp|khp|dhp|ud|iti|snp|vv|pv|thag|thig|tha-ap|thi-ap|bv|cp|ja|mnd|cnd|ps|pe|nett|mil|bu-|bi-|pli-tv-)', re.IGNORECASE)
        name_hits = []
        for sid, sname in reader._sutta_names.items():
            if not sname: continue
            if not _PALI_ID_RE.match(sid): continue
            sname_norm = _strip_diacritics(sname.lower())
            core = re.sub(r'(sutta|nikaya|nikaya|samyutta|vagga|pannasaka)$', '', sname_norm).strip()
            if len(core) < 4: continue
            
            match_found = False
            if re.search(r'\b' + re.escape(core) + r'\b', q_norm):
                match_found = True
            else:
                for w in q_words:
                    if len(w) >= 4 and w in core:
                        match_found = True
                        break
            
            if match_found:
                name_hits.append(sid)

        # JANGAN cari nama kalau sudah ada mention eksplisit — name_hunt cuma bikin
        # noise (DN 22, MN 10, dll.) untuk Abhidhamma/Vinaya yang tak ada namanya.
        if name_hits and not mentions:
            name_hits = sorted(name_hits, key=len)[:5]
        elif name_hits and mentions:
            name_hits = []

        # if name_hits:
        #     name_hits = sorted(name_hits, key=len)[:5]
        #     existing_norms = {m.lower().replace(" ","") for m in mentions}
        #     name_hits = [sid for sid in name_hits if sid not in existing_norms]

        # Rujukan KOLEKSI keseluruhan (mis. "@Dhp", "apa itu Itivuttaka") -> blok glosari
        # grounded; dideteksi dari kueri agen + kueri asli user (hormati @mention apa adanya).
        coll_refs = _detect_collection_refs(t_query + " " + query)
        gloss_blocks, gloss_abbrs = _glossary_blocks(coll_refs, prompt_db)

        # Jejak transparansi: apa yg sebetulnya dilakukan tool (dipancarkan sbg step).
        trace: list[typing.Any] = []
        if gloss_abbrs:
            trace.append({"kind": "glossary", "collections": gloss_abbrs})
        if mentions:
            # Poin 7: sertakan terjemahan yg dipilih (author+lang) per mention, biar step
            # "Rujukan eksplisit terdeteksi" menampilkan teks mana yg sebenarnya ditelusuri.
            picks = []
            for m in mentions:
                for p in (_prefs_norm.get(m.lower().replace(" ", "")) or []):
                    picks.append({"mention": m.strip(), "lang": p.get("lang"),
                                  "author": p.get("author"), "source": p.get("source")})
            trace.append({
                "kind": "mention",
                "carried": carried_ctx,
                "mentions": list(dict.fromkeys(m.strip() for m in mentions)),
                "picks": picks,
                "overview": _mention_is_overview(query, mentions),
            })
        if name_hits:
            trace.append({
                "kind": "name_match",
                "names": [reader.format_sutta_id(str(s)) for s in name_hits]
            })

        # Sutta yg di-mention eksplisit: tarik JAUH lebih banyak chunk (baca hampir penuh utk
        # mayoritas sutta) & tandai sbg fokus utama. mention_cites = formatted-id utk tanda ⭐.
        exact_suttas = []
        mention_cites = set()
        # Fallback bahasa utk mention: korpus pilihan -> id -> en -> pli, supaya sutta yg
        # di-mention tetap kebawa walau tak ada terjemahan Indo (ambil Inggris, lalu Pāli).
        _mention_langs = [eff_dbs[0]] + [L for L in ("id", "en", "pli") if L != eff_dbs[0]]
        # Niat "bahas apa" (overview, tanpa subjek spesifik) -> tarik KERANGKA judul dulu biar
        # struktur sutta panjang tak hilang ke-potong. "vedananupassana di @MN10" -> spesifik,
        # biarkan relevance biasa. Dihitung sekali (sama utk semua mention di giliran ini).
        _overview = _mention_is_overview(query, mentions)
        for m in mentions:
            mclean = m.lower().replace(" ", "")
            # Resolve short-id ke full-id (mis. "bi-pc9" → "pli-tv-bi-vb-pc9")
            mfull = reader.resolve_sutta_id(mclean)
            # Coba prefs dengan full-id dulu, fallback ke short-id
            prefs = _prefs_norm.get(mfull) or _prefs_norm.get(mclean)
            if prefs:
                # Poin 4: user sudah pilih terjemahan spesifik -> tarik HANYA (lang, author) itu
                # (+ blurb sinopsis), abaikan fallback bahasa. pli tak akan ada di prefs (frontend
                # menyaring). Korpus RAG memang memuat banyak author per (sutta,lang).
                want = {(p.get("lang"), p.get("author")) for p in prefs}
                want_langs = list(dict.fromkeys(p.get("lang") for p in prefs))
                m_hits = []
                for _L in want_langs:
                    # max_chunks besar: terjemahan SEGMENTED (bilara, mis. sujato) berbentuk
                    # banyak chunk pendek per-segmen. Kalau dipotong 24-terpanjang dulu lalu
                    # difilter author, segmen author terpilih bisa habis tergusur html yg lebih
                    # panjang (bug rujukan tak lengkap). Tarik luas dulu, baru filter author.
                    # hits = engine.exact_sutta_match(mclean, _L, max_chunks=400, query=t_query)
                    hits = engine.exact_sutta_match(mfull, _L, max_chunks=400, query=t_query,
                                                    headings_first=_overview)
                    m_hits += [h for h in hits
                               if h.get("author") == "blurb" or (_L, h.get("author")) in want]
                exact_suttas.extend(m_hits)
            else:
                m_hits = []
                for _L in _mention_langs:
                    # m_hits = engine.exact_sutta_match(mclean, _L, max_chunks=24, query=t_query)
                    m_hits = engine.exact_sutta_match(mfull, _L, max_chunks=24, query=t_query,
                                                      headings_first=_overview)
                    if any(h.get("author") != "blurb" for h in m_hits):
                        break   # dapat teks isi (bukan cuma blurb) -> berhenti di bahasa ini
                exact_suttas.extend(m_hits)
            mention_cites.add(reader.format_sutta_id(reader.resolve_sutta_id(mclean)))
        for sid in name_hits:
            exact_suttas.extend(engine.exact_sutta_match(sid, eff_db_str, max_chunks=3, query=t_query))

        # Ekspansi elipsis: kalau sutta FOKUS (mention/page-context) teksnya disingkat
        # ("§44" cross-sutta / "…sebelumnya"), tarik JUGA teks lengkap sutta rujukannya
        # (rantai cap 3) sbg konteks pendukung — BUKAN sitasi paksa (tak masuk mention_cites).
        if mentions:
            _focus_ids = [reader.resolve_sutta_id(m.lower().replace(" ", "")) for m in mentions]
            _elision_added = []
            for _ref_full in _expand_elision_chain(_focus_ids, cap=3):
                _r_hits = []
                for _L in _mention_langs:
                    _r_hits = engine.exact_sutta_match(_ref_full, _L, max_chunks=24, query=t_query,
                                                       headings_first=_overview)
                    if any(h.get("author") != "blurb" for h in _r_hits):
                        break
                if _r_hits:
                    exact_suttas.extend(_r_hits)
                    _elision_added.append(reader.format_sutta_id(_ref_full))
            if _elision_added:
                trace.append({"kind": "elision_expand", "refs": _elision_added})

            # §N lintas-sutta (MN/DN "MN 51, §24") -> tarik SEGMEN md target + tetangga saja
            # (bukan full sutta), reuse resolusi reader. Sutta pendek ke-full via short_cap.
            _para_added = []
            for _t_sid, _t_lang, _t_auth, _cid in _elision_para_targets(_focus_ids, _mention_langs):
                _seg_hits = _pull_chunk_frags(_t_sid, _t_lang, _t_auth, _cid)
                if _seg_hits:
                    exact_suttas.extend(_seg_hits)
                    _para_added.append(f"{reader.format_sutta_id(_t_sid)} §{_cid.split(':')[-1]}")
            if _para_added:
                trace.append({"kind": "elision_para", "refs": _para_added})

        suttas = _group_suttas(exact_suttas)
        _inject_missing_blurbs(suttas)

        # Istilah Pali tak-terterjemah (POV awam): deteksi dari kueri user ASLI (bukan kueri
        # tulisan-ulang LLM yg bisa membuang istilahnya), betulkan ejaan, lalu tarik sutta-nya
        # dari korpus PALI -> ambil terjemahan sutta yg SAMA. canon_terms juga jadi seed semantik
        # ekstra (model multilingual bisa menyambung ejaan kanonik ke padanan Indo).
        # JALUR FRASA PĀḶI (presisi tertinggi): user nge-paste petikan Pāḷi kontigu yg ADA persis
        # di korpus -> tarik segmen eksaknya. Didahulukan & MENGGANTIKAN density term-search (yg
        # gampang meleset utk frasa krn kata umum nge-flood). Dipakai kueri ASLI user (bukan tulisan
        # ulang LLM yg bisa mecah frasanya).
        phrase_suttas, _matched_phrase = _pali_phrase_suttas(query, eff_dbs[0], max_suttas)
        if not phrase_suttas:
            phrase_suttas, _matched_phrase = _translation_phrase_suttas(query, eff_dbs[0], max_suttas)
            if phrase_suttas:
                _phrase_trace_kind = "phrase"   # frasa terjemahan (bukan Pāḷi)
            else:
                _phrase_trace_kind = "pali_phrase"
        else:
            _phrase_trace_kind = "pali_phrase"
        locator_intent = bool(_LOCATOR_INTENT_RE.search(query))
        phrase_locs = []   # rujukan SEGMEN eksak tempat frasa muncul, mis. ["SN 48.9:4.2", ...]
        if phrase_suttas:
            trace.append({"kind": _phrase_trace_kind, "phrase": _matched_phrase})
            suttas.extend(phrase_suttas)
            for s in phrase_suttas:
                fid = s.get("formatted_id", "")
                for fr in s.get("fragments", []):
                    if fr.get("author") == "blurb":
                        continue
                    for r in (fr.get("ref") or []):
                        seg = r.split(":", 1)[1] if ":" in r else ""
                        phrase_locs.append(f"{fid}:{seg}" if seg else fid)
            phrase_locs = list(dict.fromkeys(phrase_locs)) or [s.get("formatted_id", "") for s in phrase_suttas]

        pali_resolved, pali_unresolved = _detect_pali_terms(query, eff_dbs[0])
        canon_terms = [c for _t, c in pali_resolved]
        if pali_resolved:
            actual_corrs = [{"typed": t, "as": c} for t, c in pali_resolved if t.lower() != c.lower()]
            if actual_corrs:
                trace.append({"kind": "pali_term",
                              "corrected": actual_corrs})
            # Density term-search HANYA bila frasa-eksak tak ketemu — kalau ketemu, segmen eksak
            # sudah jauh lebih tepat, jangan dikotori sutta high-freq dari bag-of-words.
            if not phrase_suttas:
                suttas.extend(_pali_term_suttas(canon_terms, eff_dbs[0], max_suttas))

        # Semantic: default jalan (mis. "sutta mirip @MN 1" tetap nyari ke DB).
        # Scope nikaya ("dari AN") -> filter keras + token nikaya dibuang dari kueri
        # semantik supaya subjek asli tak terkontaminasi (lihat _detect_nikaya_scope).
        nikaya_scope = _detect_nikaya_scope(t_query + " " + query)
        rewrite_seed = _strip_nikaya_tokens(t_query) if nikaya_scope else t_query

        # Istilah Pali yg sudah di-resolve: kaki semantik = SUMBER RACUN. (a) kueri tulisan-ulang
        # LLM membawa TYPO mentah ('citanupasana adalah') & kadang Sanskrit ('dharma...'); (b) bahkan
        # ejaan Pali kanonik pun MELENCENG di embedding (cittānupassanā -> Thig 2.5, bukan DN 22).
        # Jadi BUANG token istilah dari seed (versi user DAN versi LLM), biar semantik cuma
        # mengeksplor SISA niat kueri. Kalau sisa tak bermakna -> SKIP semantik total & andalkan
        # grounding presisi (segmen bilara) dari _pali_term_suttas.
        if pali_resolved:
            _seed_pali, _ = _detect_pali_terms(rewrite_seed, eff_dbs[0])
            for _raw, _c in list(_seed_pali) + pali_resolved:
                rewrite_seed = re.sub(r'\b' + re.escape(_raw) + r'\b', ' ', rewrite_seed, flags=re.IGNORECASE)
            rewrite_seed = re.sub(r'\s+', ' ', rewrite_seed).strip()
        _seed_content = [w for w in re.findall(r'[^\W\d_]+', _ascii_lower(rewrite_seed))
                         if len(w) >= 4 and w not in _NAME_MATCH_STOPWORDS]

        if (pali_resolved and not _seed_content) or (phrase_suttas and locator_intent):
            # kueri murni istilah Pali -> grounding presisi cukup; ATAU user paste frasa Pāḷi + nanya
            # LOKASI ("ada di ayat mana") -> segmen eksak (phrase_suttas) SUDAH jawabannya, jgn ditimbun
            # ekspansi hybrid topikal (rewrite LLM yg cuma berkaitan tema, mis. AN 4.41 'samadhi').
            sq_list = []
        else:
            # Delegasikan penentuan "Fokus vs Luas" sepenuhnya ke LLM lewat _rewrite_query
            sq_list, _hint = _rewrite_query(rewrite_seed, t_lang, [], history, mentions=mentions)

        if sq_list and "SKIP_SEARCH" not in sq_list:
            if nikaya_scope:
                trace.append({
                    "kind": "nikaya_scope",
                    "scopes": sorted(list(nikaya_scope))
                })
            if name_hits or mentions:
                trace.append({
                    "kind": "hybrid_search_extra",
                    "queries": sq_list
                })
            else:
                trace.append({
                    "kind": "hybrid_search",
                    "queries": sq_list
                })
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                futures = [executor.submit(_retrieve_suttas, sq, eff_db_str, max_suttas, t_pitaka, nikaya_scope, use_rerank) for sq in sq_list]
                for future in concurrent.futures.as_completed(futures):
                    suttas.extend(future.result())

        seen = {}; unique_suttas = []
        for s in sorted(suttas, key=lambda x: x.get("score", 0) if isinstance(x.get("score"), (int, float)) else x.get("max_score", 0), reverse=True):
            fid = s["formatted_id"]
            if fid not in seen:
                seen[fid] = len(unique_suttas)
                unique_suttas.append(s)
            else:
                existing = unique_suttas[seen[fid]]
                if not any(f.get("author") == "blurb" for f in existing.get("fragments", [])):
                    nb = [f for f in s.get("fragments", []) if f.get("author") == "blurb"]
                    if nb: existing["fragments"] = nb + existing["fragments"]
        
        unique_suttas = unique_suttas[:max_suttas]
        # Tandai sutta yg di-mention eksplisit -> kartunya WAJIB tampil walau model lupa/salah mengutip.
        ctx_cache = {}
        for s in unique_suttas:
            if s.get("formatted_id", "").split(":")[0] in mention_cites:
                s["mentioned"] = True
            for fr in s.get("fragments", []):
                if "context_before" not in fr: fr["context_before"] = {}
                if "context_after" not in fr: fr["context_after"] = {}
                _fill_frag_context(fr, ctx_cache)
                
        # canon_terms -> mode 'enum' (tarik lbh banyak fragmen/sutta) supaya SEMUA segmen-judul
        # sub-section istilah kebawa (mis. 5 kategori dhammānupassanā), bukan kepotong limit-5.
        passages = _passages_for_prompt(unique_suttas, prompt_db, expand=mention_cites,
                                        enum=bool(_ENUM_INTENT_RE.search(query) or canon_terms))
        
        # Format Passages to Tool Text. Kategori dari pitaka (andal utk Bu- DAN Bi-);
        # token rujukan eksplisit supaya model menyalin PERSIS (cegah ref ngarang/ga nge-link).
        blocks = []
        for i, p in enumerate(passages, 1):
            cite = p["formatted_id"].split(":")[0]
            if "/" in cite:
                cite = cite.split("/")[-1].split(".")[0].upper()
            # Label kategori per-pitaka (3 keranjang Tipiṭaka), BUKAN cuma special-case vinaya:
            # kalau abhidhamma (mis. Vb=Vibhaṅga, Ds, Kv) dicap "SUTTA", model nurut label terstruktur
            # ini & nulis "Sutta Vibhaṅga" — padahal itu kitab Abhidhamma, bukan sutta. Selaras
            # aturan prompts.json (HANYA Suttapiṭaka yg boleh disebut 'sutta').
            _pit = p.get("pitaka")
            if _pit == "vinaya" or cite[:3] in ("Bu-", "Bi-"):
                kind = "VINAYA (aturan monastik, BUKAN sutta)"
            elif _pit == "abhidhamma":
                # "teks dalam kitab" (bukan "kitab"): item ber-id ini = SATU bagian/teks di dalam
                # kitab Abhidhamma (mis. Bojjhaṅgavibhaṅga = bagian di kitab Vibhaṅga), bukan kitabnya
                # sendiri. "kitab analisis" lama bikin model nyebut bagiannya sbg kitab + cuma tepat
                # utk Vibhaṅga, salah utk Ds/Kv/dst.
                kind = "ABHIDHAMMA (teks/bagian dalam kitab Abhidhamma, BUKAN sutta)"
            else:
                kind = "SUTTA"
            star = "⭐ DIMINTA USER — " if p.get("is_expand") else ""
            name = cite + (f" — {p['sutta_name']}" if p.get("sutta_name") else "")
            pli_note = " | ⚠️ HANYA tersedia teks PĀLI (belum ada terjemahan id/en)" if p.get("lang") == "pli" else ""

            lines = [f"[{i}] {star}{kind} | {name} | rujuk segmen spesifik per klaim sesuai tag dalam teks (mis. {cite}:1.2 atau {cite}:md1){pli_note}"]
            if p.get("synopsis"): lines.append(f"[{cite}:sinopsis] Sinopsis: {p['synopsis']}")
            lines.append(f">> {p.get('text', '')}")
            blocks.append(("\n".join(lines), bool(p.get("is_expand"))))

        # Budget tool-text: cegah prompt tembus num_ctx — kalau lewat, Ollama memotong DARI DEPAN
        # (system prompt + answer-guide ikut kepotong, aturan hilang). Blok ⭐/expand (sutta yg
        # di-@mention) & glosari SELALU dipertahankan (sedikit & paling penting); sisanya (sudah
        # urut skor) ditambah sampai mendekati budget, blok skor terendah di-drop bila perlu.
        kept, used = [], sum(len(b) for b in gloss_blocks)
        for text, is_exp in blocks:
            if is_exp or used + len(text) <= TOOL_TEXT_BUDGET:
                kept.append(text)
                used += len(text)

        # Glosari koleksi (grounded) di DEPAN supaya jadi sumber utama definisi.
        all_blocks = gloss_blocks + kept
        
        # Ambil kosakata Pali unik dari sutta yang di-retrieve untuk dijadikan petunjuk bagi model
        pali_vocab_dict = _get_pali_vocabulary(unique_suttas)
        pali_vocab_hints = []
        for sid, words in pali_vocab_dict.items():
            fmt_id = reader.format_sutta_id(sid)
            pali_vocab_hints.append(f"Istilah Pāli asli dalam {fmt_id}: {', '.join(sorted(words))}")
            
        tool_result_text = "\n\n".join(all_blocks) if all_blocks else "Tidak ada teks Tipiṭaka yang ditemukan."
        if pali_vocab_hints:
            tool_result_text += "\n\n--- PETUNJUK ISTILAH PĀLI ASLI (Gunakan ini jika ingin menuliskan istilah Pāli) ---\n" + "\n".join(pali_vocab_hints)
            
        meta = {
            "pali_resolved": pali_resolved,
            "pali_unresolved": pali_unresolved,
            # 'anchored' = ada jangkar eksplisit (mention/nama/glosari) -> jgn pernah pasang gerbang "ga nemu".
            "anchored": bool(mentions or name_hits or gloss_abbrs),
            # Frasa Pāḷi yg di-paste user & ketemu PERSIS + segmen eksaknya -> jawaban WAJIB mimpin
            # dgn lokasi ini (lihat pengingat [LOKASI] di gen()).
            "phrase": _matched_phrase if phrase_suttas else None,
            "phrase_locations": phrase_locs,
        }
        return (tool_result_text, unique_suttas, trace, meta)

    def gen():
        def _run_with_pings(fn, *a, **kw):
            """Jalankan panggilan blocking panjang (LLM fase-1 / retrieval) di thread,
            sambil memancarkan ping SSE tiap _SSE_PING_SECS — tanpa byte mengalir,
            proxy Cloudflare memutus stream idle ~100 dtk. Pakai: x = yield from _run_with_pings(...)."""
            fut = _CHAT_BG.submit(fn, *a, **kw)
            while True:
                try:
                    return fut.result(timeout=_SSE_PING_SECS)
                except concurrent.futures.TimeoutError:
                    yield _sse({"type": "ping"})

        yield _sse({"stage": "homage"})
        # Build initial messages
        sys_content = get_prompts()["_CHAT_SYSTEM"].get(lang, get_prompts()["_CHAT_SYSTEM"]["id"])
        messages = [{"role": "system", "content": sys_content}]
        for h in (history or [])[-6:]:
            role = h.get("role")
            # Guard panjang content history: maks 4000 karakter per item
            content = (h.get("content") or "").strip()[:4000]
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
        
        # di gen(), sebelum messages.append({"role":"user","content":query})
        recent_summary = ""
        if history:
            recent = [f"{'User' if h['role']=='user' else 'Asisten'}: {h['content'][:200]}" for h in history[-6:]]
            recent_summary = "Ringkasan obrolan terakhir:\n" + "\n".join(recent) + "\n\n"
        query_with_context = recent_summary + query
        messages.append({"role": "user", "content": query_with_context})

        all_unique_suttas = []
        all_source_text = ""        # gabungan teks-tool retrieval -> dipakai filter gloss Pali ngarang
        search_q_str = ""
        pali_only_present = False   # item 9/10: ada blok yg HANYA punya teks Pāli?
        gate_unresolved = []        # istilah 'asing' yg tak teridentifikasi (utk gerbang "ga nemu")
        gate_resolved = False       # ada istilah Pali yg BERHASIL dipetakan -> jangan pasang gerbang
        gate_anchored = False       # ada jangkar eksplisit (mention/nama/glosari) -> jangan pasang gerbang
        pali_corrected = []         # ejaan Pali kanonik (utk pengingat: jawaban WAJIB pakai ejaan ini)
        matched_phrase = ""         # frasa Pāḷi di-paste user yg ketemu PERSIS di korpus
        phrase_locations = []       # segmen eksak tempat frasa itu berada (utk pengingat [LOKASI])
        yield _sse({"stage": "understand"})

        # GERBANG DISAMBIGUASI ISTILAH PĀḶI: bila kueri memuat satu istilah Pali 'telanjang'
        # yang AMBIGU (>=2 tafsir kanonik dengan skor ejaan×frekuensi berdekatan — mis.
        # 'pancakanda' bisa pañcakkhandha [lima kelompok] ATAU pañcakaṅga [nama tokoh]),
        # JANGAN menebak lalu menjawab salah. Tanya user dulu via chip (deskripsi = sutta
        # tempat tiap istilah muncul). Lebih RINGAN: berhenti sebelum retrieval & generate.
        # Hanya untuk kueri TANPA jangkar eksplisit (@mention / id sutta) & bukan sapaan.
        # skip_disambig = user sudah klik chip "bukan ini semua" -> jangan tanya lagi, proses apa adanya.
        if (not history and not body.get("skip_disambig") and not _is_smalltalk(query)
                and "@" not in query and not _QUERY_SUTTA_REF_RE.search(query)):
            ambig = _detect_pali_ambiguity(query, lang)
            if ambig:
                ctx = _pali_term_context_suttas([c["term"] for c in ambig["candidates"]])
                cands_out = []
                for c in ambig["candidates"]:
                    resubmit = re.sub(re.escape(ambig["typed"]), lambda _m, _c=c["term"]: _c,
                                      query, count=1, flags=re.IGNORECASE)
                    cands_out.append({"term": c["term"], "forms": c["forms"],
                                      "suttas": ctx.get(c["term"], []), "resubmit": resubmit})
                yield _sse({"stage": "generate"})
                if lang == "en":
                    head = (f"The term «{ambig['typed']}» could mean more than one Pāḷi term. "
                            "Which did you mean?")
                else:
                    head = (f"Istilah «{ambig['typed']}» bisa merujuk ke beberapa istilah Pāḷi. "
                            "Mana yang Anda maksud?")
                yield _sse({"type": "chunk", "text": head})
                yield _sse({"type": "final", "answer": head, "results": [],
                            "query": query, "search_query": "", "model": CHAT_MODEL,
                            "lang": lang, "has_mention": False, "total_results": 0,
                            "disambiguate": {"typed": ambig["typed"], "candidates": cands_out}})
                return

        # FASE 1 — keputusan tool (non-stream + tools). Satu putaran; model boleh
        # mengeluarkan >1 tool_call. Jaring pengaman: bila tak memanggil tool padahal
        # bukan sapaan, paksa satu retrieval agar jawaban tetap grounded.
        msg = yield from _run_with_pings(_llm_chat, messages, tools=_CHAT_TOOLS)
        tcs = msg.get("tool_calls")
        if not tcs and not _is_smalltalk(query):
            tcs = [{"function": {"name": "search_sutta", "arguments": {"query": query}}}]

        if tcs:
            clarify = next((tc for tc in tcs if tc.get("function", {}).get("name") == "ask_clarification"), None)
            if clarify:
                args = clarify.get("function", {}).get("arguments", {})
                if isinstance(args, str):
                    try: args = json.loads(args)
                    except Exception: args = {}
                q = args.get("question", "Maaf, bisa diperjelas maksud pertanyaannya?")
                yield _sse({"stage": "generate"})
                yield _sse({"type": "chunk", "text": q})
                # yield _sse({"type": "final", "answer": q, "results": [], "query": query, "search_query": "", "model": CHAT_MODEL, "lang": lang})
                yield _sse({"type": "final", "answer": q, "results": [], "query": query, "search_query": "", "model": CHAT_MODEL, "lang": lang, "has_mention": False, "total_results": 0})
                return

            # Konten preamble pd giliran-tool dibuang (tak relevan & bisa bias konteks).
            messages.append({"role": "assistant", "content": "", "tool_calls": tcs})  # type: ignore
            for tc in tcs:
                func = tc.get("function", {})
                if func.get("name") != "search_sutta":
                    continue
                args = func.get("arguments", {})
                if isinstance(args, str):
                    try: args = json.loads(args)
                    except Exception: args = {}
                t_query = args.get("query", query)
                t_pitaka = args.get("pitaka")
                t_lang = args.get("language", lang)
                # Step transparan: tampilkan kueri + scope (pitaka/bahasa) yg dipakai agen.
                scope = [s for s in (t_pitaka if isinstance(t_pitaka, list) else [t_pitaka]) if s]
                if t_lang and t_lang != lang:
                    scope.append(f"korpus {t_lang}")
                scope_s = f"  ·  [{', '.join(scope)}]" if scope else ""
                # Frontend sudah membungkus dgn "Memproses: …" — JANGAN prefix "Mencari:"
                # di sini, kalau tidak labelnya jadi dobel ("Memproses: Mencari: …").
                yield _sse({"stage": "retrieve", "query": f"{t_query}{scope_s}"})
                search_q_str += (t_query + " | ")
                tool_result_text, usuttas, trace, meta = yield from _run_with_pings(
                    execute_search_tool, t_query, t_pitaka, t_lang)
                all_source_text += "\n" + tool_result_text
                if "HANYA tersedia teks PĀLI" in tool_result_text:
                    pali_only_present = True
                # Akumulasi sinyal gerbang "ga nemu" lintas tool-call.
                gate_unresolved.extend(meta.get("pali_unresolved", []))
                gate_resolved = gate_resolved or bool(meta.get("pali_resolved"))
                gate_anchored = gate_anchored or meta.get("anchored", False)
                pali_corrected.extend(c for _t, c in meta.get("pali_resolved", []))
                if meta.get("phrase"):
                    matched_phrase = meta["phrase"]
                    phrase_locations.extend(meta.get("phrase_locations", []))
                # Step transparan: jejak apa yg tool kerjakan (mention/nama/kueri ekspansi).
                for tdata in trace:
                    yield _sse({"stage": "tool", "data": tdata})
                all_unique_suttas.extend(usuttas)
                # Step transparan: berapa SUTTA kandidat ketemu + daftarnya (jumlah cocok dgn list).
                ids = [s.get("formatted_id", "") for s in usuttas if s.get("formatted_id")]
                if ids:
                    shown = ids[:8]
                    more = len(ids) - len(shown)
                    yield _sse({"stage": "found", "count": len(ids), "ids": shown, "more": more})
                elif not any(t.get("kind") == "glossary" for t in trace):
                    # glosari koleksi tak menghasilkan kartu sutta -> jangan klaim "tak ada teks"
                    yield _sse({"stage": "found", "count": 0})
                t_msg = {"role": "tool", "name": "search_sutta", "content": tool_result_text}
                if tc.get("id"):
                    t_msg["tool_call_id"] = tc["id"]
                messages.append(t_msg)
        else:
            # Sapaan/basa-basi: konten keputusan = jawaban final, kirim langsung (pendek).
            yield _sse({"stage": "generate"})
            # answer = _fix_intra_namun(_enforce_theravada_terms(msg.get("content") or ""))
            answer = msg.get("content") or ""
            yield _sse({"type": "chunk", "text": answer})
            yield _sse({"type": "final", "answer": answer, "results": [],
            "query": query, "search_query": "",
            "model": CHAT_MODEL, "lang": lang,
            "has_mention": False, "total_results": 0})
            return

        # GERBANG "ga nemu" (Sol 3): user nanya istilah yg TAK teridentifikasi (berbau Pali
        # salah eja) DAN retrieval cuma drift -> jujur bilang tak ketemu + 'mungkin maksud Anda',
        # JANGAN ngarang. Menyala HANYA bila SEMUA: (a) tak ada istilah Pali yg berhasil dipetakan,
        # (b) tak ada jangkar eksplisit (mention/nama/glosari), (c) token tak-dikenal punya tetangga
        # Pali (botched-Pali, bukan kata Inggris biasa spt 'mindfulness'), (d) overlap leksikal
        # kueri-vs-hasil = 0. Pertanyaan Indo normal & istilah yg ke-resolve TIDAK terpengaruh.
        if not gate_resolved and not gate_anchored and gate_unresolved:
            gate_terms, gate_sugg = [], []
            for t in dict.fromkeys(gate_unresolved):
                s = _pali_suggest(t)
                if s:
                    gate_terms.append(t)
                    gate_sugg.append(s)
            _nsrc = unicodedata.normalize("NFD", all_source_text.lower()).encode("ascii", "ignore").decode()
            _qc = [w for w in re.findall(r"[^\W\d_]+", _ascii_lower(query))
                   if len(w) >= 4 and w not in _NAME_MATCH_STOPWORDS]
            overlap = any(w in _nsrc for w in _qc)
            if gate_terms and not overlap:
                yield _sse({"stage": "generate"})
                terms_s = ", ".join(f"«{t}»" for t in gate_terms)
                sugg_s = ", ".join(dict.fromkeys(gate_sugg))
                if lang == "en":
                    ans = (f"Sorry, I couldn't find {terms_s} in the available translated corpus — "
                           f"the spelling may differ, or no translation exists yet.")
                    if sugg_s:
                        ans += f" Did you mean: {sugg_s}?"
                    ans += " Please check the spelling or try another term/concept. 🙏"
                else:
                    ans = (f"Maaf, istilah {terms_s} tidak ditemukan di korpus terjemahan yang tersedia — "
                           f"kemungkinan ejaannya berbeda atau memang belum ada teks terjemahannya.")
                    if sugg_s:
                        ans += f" Mungkin maksud Anda: {sugg_s}?"
                    ans += " Silakan periksa ejaan atau gunakan istilah/konsep lain. 🙏"
                yield _sse({"type": "chunk", "text": ans})
                yield _sse({"type": "final", "answer": ans, "results": [], "query": query,
                            "search_query": search_q_str, "model": CHAT_MODEL, "lang": lang,
                            "has_mention": False, "total_results": 0})
                return

        # SAFETY NET "jangan dipaksa": retrieval grounded NOL sutta utk kueri substantif (sapaan
        # sudah ditangani lebih awal; jangkar eksplisit @mention/nama dikecualikan). Tanpa konteks
        # model PASTI ngarang (mis. 'pañcakkhandhā' jawab 'Citta' bukan 'Viññāṇa') walau istilahnya
        # ke-resolve. Lebih baik jujur belum nemu drpd dipaksa jawab dari ingatan.
        if not all_unique_suttas and not gate_anchored:
            yield _sse({"stage": "generate"})
            _term = ", ".join(f"«{c}»" for c in dict.fromkeys(pali_corrected))
            if lang == "en":
                ans = ("Sorry, I couldn't find matching text in the available translated corpus"
                       + (f" for {_term}" if _term else "")
                       + " — there may be no segment-aligned translation yet, or the term/spelling "
                       "differs. Please try rephrasing or another term/concept. 🙏")
            else:
                ans = ("Maaf, saya belum menemukan teks yang cocok di korpus terjemahan yang tersedia"
                       + (f" untuk {_term}" if _term else "")
                       + " — kemungkinan belum ada terjemahan selaras-segmennya, atau istilah/ejaannya "
                       "berbeda. Coba ungkapkan ulang atau pakai istilah/konsep lain. 🙏")
            yield _sse({"type": "chunk", "text": ans})
            yield _sse({"type": "final", "answer": ans, "results": [], "query": query,
                        "search_query": search_q_str, "model": CHAT_MODEL, "lang": lang,
                        "has_mention": False, "total_results": 0})
            return

        # FASE 2 — jawaban final di-STREAM token-demi-token (tools dimatikan -> streaming
        # bersih tanpa preamble/tool_call menyelip). Panduan gaya disuntik di sini supaya
        # jawaban lengkap & terstruktur, tanpa membebani fase keputusan. Frontend meng-enforce
        # istilah Pali per-chunk; final.answer dipakai utk filter kartu rujukan & history.
        yield _sse({"stage": "generate"})
        gen_messages = list(messages)
        if gen_messages and gen_messages[0].get("role") == "system":
            gen_messages[0] = {
                "role": "system",
                "content": gen_messages[0]["content"] + "\n\n" + get_prompts()["_CHAT_ANSWER_GUIDE"].get(lang, get_prompts()["_CHAT_ANSWER_GUIDE"]["id"])
            }
        else:
            gen_messages.insert(0, {"role": "system", "content": get_prompts()["_CHAT_ANSWER_GUIDE"].get(lang, get_prompts()["_CHAT_ANSWER_GUIDE"]["id"])})
        # Trik "System Prompt Reinforcement": Kita taruh panduan utama di atas agar alurnya logis.
        # PENTING: Jangan membuat pesan 'system' baru di akhir karena bisa memutus rantai attention model
        # terhadap pesan 'tool'. Sebaliknya, kita APPEND pengingat kritis ke pesan terakhir (pesan 'tool').
        reminder_template = get_prompts().get("_CHAT_REMINDER", {}).get(lang, get_prompts().get("_CHAT_REMINDER", {}).get("id", ""))
        reminder = reminder_template.replace("{query}", repr(query))
        
        # Pertanyaan enumeratif: dorong SURVEI multi-skema di posisi atensi tertinggi (akhir pesan tool).
        # Klausa di answer-guide sering diabaikan model; pengingat di sini lebih dipatuhi.
        # Guard anti-ngarang: kalau hasil cuma punya SATU skema, bahas satu saja (jangan paksakan skema palsu).
        if _ENUM_INTENT_RE.search(query):
            enum_reminder = get_prompts().get("_CHAT_ENUM_REMINDER", {}).get(lang, get_prompts().get("_CHAT_ENUM_REMINDER", {}).get("id", ""))
            reminder += enum_reminder

        # Niat "buatkan tabel": pengingat KERAS di akhir (atensi tertinggi) bahwa rujukan
        # menyatu di sel, BUKAN kolom 'Rujukan' tersendiri — aturan di answer-guide diabaikan.
        if _TABLE_INTENT_RE.search(query):
            table_reminder = get_prompts().get("_CHAT_TABLE_REMINDER", {}).get(lang, get_prompts().get("_CHAT_TABLE_REMINDER", {}).get("id", ""))
            reminder += table_reminder

        # Kueri konfirmasi-premis: pengingat KERAS periksa premis dulu (anti-sycophancy).
        # Klausa serupa di answer-guide sering diabaikan model; posisi akhir = atensi tertinggi.
        if _CONFIRM_INTENT_RE.search(query):
            premise_reminder = get_prompts().get("_CHAT_PREMISE_REMINDER", {}).get(lang, get_prompts().get("_CHAT_PREMISE_REMINDER", {}).get("id", ""))
            reminder += premise_reminder

        # Frasa Pāḷi yg di-paste user ketemu PERSIS di korpus -> jawaban WAJIB mimpin dgn lokasi
        # eksaknya (rujukan segmen), bukan menyurvei sutta lain yg cuma berkaitan tema. Pengingat di
        # akhir pesan-tool (atensi tertinggi) krn klausa serupa di answer-guide sering diabaikan model.
        if phrase_locations:
            _locs = ", ".join(phrase_locations[:8])
            if lang == "en":
                reminder += (f"\n\n[LOCATION] The user pasted a quotation («{matched_phrase}») that "
                             f"appears VERBATIM in: {_locs}. Your FIRST sentence MUST state where the "
                             "quotation occurs, citing these exact references. Do NOT survey other "
                             "merely topic-related suttas before answering the location.")
            else:
                reminder += (f"\n\n[LOKASI] Pengguna mem-paste kutipan («{matched_phrase}») yang muncul "
                             f"PERSIS di: {_locs}. KALIMAT PERTAMA jawabanmu WAJIB menyebut di mana kutipan "
                             "itu berada dengan rujukan persis ini. JANGAN menyurvei sutta lain yang sekadar "
                             "berkaitan tema sebelum menjawab lokasinya.")


            
        # Item 9/10: kalau sumber yg ada untuk sutta yg diminta HANYA teks Pāli, model kecil
        # tak bisa menerjemahkannya dengan benar -> larang keras menebak. Taruh di akhir pesan
        # tool (atensi tertinggi) krn klausa serupa di answer-guide sering diabaikan.
        if pali_only_present:
            if lang == "en":
                reminder += (
                    f"\n\nCRITICAL — PĀLI-ONLY TEXT: Some blocks are tagged '⚠️ HANYA tersedia teks PĀLI' "
                    f"(only raw Pāli is available, no id/en translation). You CANNOT reliably translate Pāli. "
                    f"STRICTLY FORBIDDEN to guess, paraphrase, or invent the meaning of any Pāli-only block. "
                    f"If the requested sutta has ONLY Pāli text, do NOT translate it — say honestly and politely "
                    f"that no understandable translation is available yet and suggest another sutta."
                )
            else:
                reminder += (
                    f"\n\nKRITIS — TEKS HANYA PĀLI: Sebagian blok bertanda '⚠️ HANYA tersedia teks PĀLI' "
                    f"(hanya ada teks Pāli mentah, belum ada terjemahan id/en). Kamu TIDAK bisa menerjemahkan "
                    f"Pāli dengan benar. DILARANG KERAS menebak, memparafrase, atau mengarang arti blok Pāli mana pun. "
                    f"Jika sutta yang diminta HANYA punya teks Pāli, JANGAN diterjemahkan — katakan dengan jujur & sopan "
                    f"bahwa belum ada terjemahan yang bisa kamu pahami, dan sarankan mencoba sutta lain."
                )

        # Istilah Pali terkoreksi: (a) jawaban WAJIB pakai ejaan baku (bukan typo user), (b) makna
        # presisi ada di kutipan EN/Pāli selaras-segmen (korpus terjemahan Indo TAK selaras jadi tak
        # bisa di-pinpoint) -> pahami dari situ, lalu jawab dalam bahasa user. Posisi akhir = atensi tertinggi.
        _pc = list(dict.fromkeys(pali_corrected))
        if _pc:
            terms_s = ", ".join(_pc)
            if lang == "en":
                reminder += (
                    f"\n\nPĀLI TERM(S): the user asked about {terms_s}. Use this exact canonical spelling "
                    f"(NOT the user's typo) in your answer. The precise meaning of each term is in the segment-"
                    f"aligned English/Pāli quotes above (Indonesian translations are not segment-aligned, so they "
                    f"can't be pinpointed) — understand it from there and answer in English. Do NOT invent meaning "
                    f"beyond the quotes."
                )
            else:
                reminder += (
                    f"\n\nISTILAH PĀLI: pertanyaan memuat {terms_s}. Pakai ejaan baku ini PERSIS (bukan typo user) "
                    f"di jawaban. Makna tepat tiap istilah ada pada kutipan berbahasa Inggris/Pāli yang selaras-segmen "
                    f"di atas (terjemahan Indonesia tidak selaras-segmen sehingga tak bisa ditunjuk persis) — pahami "
                    f"dari situ, lalu JAWAB DALAM BAHASA INDONESIA. JANGAN mengarang makna di luar kutipan."
                )

        gen_messages[-1]["content"] += reminder

        norm_src = unicodedata.normalize("NFD", all_source_text.lower()).encode("ascii", "ignore").decode() if all_source_text else ""
        parts = []

        # Base-id sutta yg grounded giliran ini -> dipakai utk buang "sitasi hantu" LANGSUNG
        # saat streaming (di filter kurung di bawah), bukan cuma di akhir. Tanpa ini ref hantu
        # dalam kurung (mis. '(SN 12.48:md9)') sempat nongol lalu hilang di final = kedip aneh.
        _grounded_bases = {(s.get("formatted_id") or "").split(":")[0].replace(" ", "").lower()
                           for s in all_unique_suttas}
        # Segmen yg BENAR-BENAR ada di fragment retrieval (yg model dikasih lihat). Dipakai di
        # _strip_ghost_refs final utk buang segmen ngarang yg melebihi segmentasi nyata.
        _grounded_segs = {str(rf).replace(" ", "").lower()
                          for s in all_unique_suttas
                          for fr in (s.get("fragments") or [])
                          for rf in (fr.get("ref") or []) if rf}
        # Registry grounded SE-SESI dari frontend: base-id + segmen sutta yg pernah jadi KARTU
        # nyata di room ini (giliran SEBELUMNYA — kartunya masih kepampang di atas). Union supaya
        # sitasi lintas-giliran yg valid tak dihakimi "hantu" lalu dibuang. Sumbernya kartu nyata
        # frontend (bukan teks model) -> aman. Normalisasi sama: lower + tanpa spasi. Di-cap biar
        # payload nakal tak membengkakkan set.
        _sess_refs = body.get("grounded_refs") or {}
        if isinstance(_sess_refs, dict):
            for _b in (_sess_refs.get("bases") or [])[:2000]:
                if isinstance(_b, str) and _b.strip():
                    _grounded_bases.add(_b.replace(" ", "").lower())
            for _g in (_sess_refs.get("segs") or [])[:2000]:
                if isinstance(_g, str) and _g.strip():
                    _grounded_segs.add(_g.replace(" ", "").lower())

        paren_buf = ""
        in_paren = False

        for piece in _llm_stream(gen_messages):
            if piece is _PING:
                # Heartbeat: prompt-eval bisa diam >100 dtk sebelum token pertama.
                yield _sse({"type": "ping"})
                continue
            # Samakan bentuk Unicode diakritik ke NFC. Model kadang keluarin diakritik
            # DECOMPOSED (mis. ī = "i" + combining macron) yg BEDA codepoint dari kelas
            # precomposed [āīūṁṃṅñṭḍṇḷ] di normalizer Pali/gloss/ghost-ref -> istilah tak
            # terdeteksi -> **bold** lolos jadi <strong> (campur sama <em> yg single-star).
            piece = unicodedata.normalize("NFC", piece)
            out_buf = ""
            for char in piece:
                if in_paren:
                    paren_buf += char
                    if char == ")":
                        in_paren = False
                        inner = paren_buf[1:-1]
                        
                        keep = True
                        if not inner.strip():
                            pass
                        elif any(c in _PALI_DIACRITICS for c in inner):
                            norm = unicodedata.normalize("NFD", inner.lower()).encode("ascii", "ignore").decode()
                            if not (norm and norm in norm_src):
                                keep = False
                        elif re.fullmatch(r"[a-z]+", inner):
                            norm = inner.lower()
                            if norm not in norm_src:
                                keep = False
                        
                        if keep:
                            # Lolos cek-gloss, tapi masih bisa berisi RUJUKAN hantu (base sutta
                            # tak grounded) -> bersihkan di sini juga supaya stream = final (tak kedip).
                            out_buf += _strip_ghost_refs(paren_buf, _grounded_bases)

                        paren_buf = ""
                    elif len(paren_buf) > 100:
                        in_paren = False
                        out_buf += paren_buf
                        paren_buf = ""
                else:
                    if char == "(":
                        in_paren = True
                        paren_buf = "("
                    else:
                        out_buf += char
                        
            if out_buf:
                parts.append(out_buf)
                yield _sse({"type": "chunk", "text": out_buf})

        if paren_buf:
            parts.append(paren_buf)
            yield _sse({"type": "chunk", "text": paren_buf})

        # NFC lagi di level final: jaga2 kalau combining-mark kepotong antar-chunk stream.
        # answer = _fix_intra_namun(_enforce_theravada_terms(unicodedata.normalize("NFC", "".join(parts))))
        answer = unicodedata.normalize("NFC", "".join(parts))
        # Fuzzy-rewrite istilah Pali pasca-stream SENGAJA DIHAPUS (2026-07-09). Dulu tiap kata
        # ber-diakritik yg tak ada di body sutta di-swap ke kata "terdekat" (cutoff 0.4) -> kata
        # meta yg SAH tapi jarang di body sutta ikut ke-swap ngawur (Tipiṭaka -> appakā/pītakaṁ,
        # Sutta Piṭaka -> upaṭṭhapetha), dan karena cuma jalan di final, teks "berubah" setelah
        # streaming selesai (stream != final). Fuzzy tak bisa bedakan typo vs kata langka yg benar.
        # Ejaan Pali kini diarahkan di HULU saja: blok "PETUNJUK ISTILAH PĀLI ASLI" dalam prompt
        # (pali_vocab_hints) — konsisten sejak token pertama. Sisa garble = batas model (kebijakan:
        # jangan tambah/strip istilah Pali di prosa).

        # Normalisasi pemformatan istilah Pāḷi (bold/plain -> italic) SENGAJA TAK di sini lagi.
        # Dulu pakai regex per-kata yg menempel-ulang bintang ke kata Pali; tapi utk emphasis
        # MULTI-KATA (mis. "**jhāna pertama**") cuma kata ber-diakritik yg ketangkap -> bintang
        # penutup nyangkut jadi mentah ("*jhāna* pertama**"). Emphasis kini dinormalisasi SATU
        # tempat di frontend (enforceTheravadaTerms+mdLite di chat.js) yg pakai proteksi span
        # balanced + boundary sadar-diakritik -> tak ada bintang nyasar. answer tetap NFC.

        # Rapihkan double-space sisa hapus kurung/gloss, TAPI hanya di tengah baris.
        # Lookbehind (?<=\S) menjaga indentasi awal-baris tetap utuh -> sub-bullet markdown
        # (butuh >=2 spasi indent di frontend isSub) tak ikut ke-flatten jadi 1 level.
        answer = re.sub(r"(?<=\S)[ \t]{2,}", " ", answer)

        # Buang "sitasi hantu" sisa: ref ber-nomor TELANJANG (tanpa kurung) yg TAK di-retrieve
        # giliran ini lolos filter-kurung streaming -> bersihkan di final. Yg dalam kurung sudah
        # dibuang live di atas (idempoten -> aman dijalankan ulang). _grounded_bases dihitung di atas.
        answer = _strip_ghost_refs(answer, _grounded_bases, _grounded_segs)

        cited = _cited_only(answer, all_unique_suttas)
        # Kartu rujukan = HANYA sutta yg base-id-nya BENAR-BENAR dikutip model di jawaban. Sutta
        # yg di-@mention TAPI tak dikutip TIDAK lagi dipaksa tampil: force lama bikin kartu
        # "rujukan" yg sebenarnya tak dirujuk jawaban, dan karena all_unique_suttas diakumulasi
        # lintas tool-call (varian base/segmen bisa kembar) force itu memunculkan kartu DUPLIKAT.
        # Kalau model lupa mengutip yg di-mention -> biar saja tak tampil (sesuai keputusan).
        _cited_bases = {(s.get("formatted_id") or "").split(":")[0] for s in cited}
        # Jangan percaya 100% kutipan model: qwen sering nempel rujukan ke sutta yg salah
        # (mis. ngutip frasa verbatim dari Snp 1.3 padahal isi list datang dari AN 9.64).
        # Pad kartu dgn kandidat retrieval skor tertinggi yg belum masuk, sampai max_suttas,
        # supaya sumber real tetap tampil walau model lupa/salah mengutipnya.
        for s in sorted(all_unique_suttas, key=lambda x: x.get("max_score", 0) or 0, reverse=True):
            if len(cited) >= max_suttas:
                break
            base = (s.get("formatted_id") or "").split(":")[0]
            if base and base not in _cited_bases:
                _cited_bases.add(base)
                cited.append(s)
        _populate_fragment_parts(cited)

        # Konteks n-1/n+1 utk kartu chat (sama spt hasil pencarian home; dedup tetangga yg
        # redundan ditangani frontend renderSuttaCardsTo). Hanya utk kartu yg dikutip -> ringan.
        ctx_cache = {}
        for s in cited:
            if s.get("fragments"):
                s["fragments"] = sorted(
                    s["fragments"],
                    key=lambda f: (0 if f.get("author") == "blurb" else 1,
                                   tuple((-(len(x) - len(x.lstrip('0'))), int(x)) if x.isdigit() else x for x in re.split(r'(\d+)', (f.get("ref") or [""])[0])))
                )
            
            for fr in s.get("fragments", []):
                _fill_frag_context(fr, ctx_cache)

        has_mention = any(s.get("mentioned") for s in all_unique_suttas)
        # Jejak answer-kosong: FE nampilin fallback "chat_no_answer" -> tanpa log ini akar
        # (API error 4xx/5xx, model degenerate, atau semua teks kestrip filter kurung/ghost-ref)
        # tak ketrace. 1 baris di journal cukup utk bedain penyebabnya saat kejadian.
        if not answer.strip():
            print(f"[chat] EMPTY final answer — query={query!r} suttas={len(all_unique_suttas)} model={CHAT_MODEL}", flush=True)
        yield _sse({"type": "final", "answer": answer,
                    "results": cited,
                    "query": query, "search_query": search_q_str.strip(" | "),
                    "model": CHAT_MODEL, "lang": lang,
                    "has_mention": has_mention,
                    "total_results": len(cited)})
        return
                
    if body.get("stream"):
        return Response(stream_with_context(gen()), mimetype="text/event-stream",  # type: ignore
                        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
    
    # Non-stream fallback
    gen_iter = gen()
    final_res = {}
    for ev in gen_iter:
        if ev.startswith("data: "):
            try:
                data = json.loads(ev[6:])
                if data.get("type") == "final":
                    final_res = data
            except: pass
    if not final_res:
        return jsonify({"error": "No final response"}), 500
    return jsonify(final_res)

import threading
import time

def _warmup_via_http():
    """Tunggu server ready, lalu panggil search endpoint kayak user beneran."""
    _base = f"http://127.0.0.1:{os.environ.get('PORT', 5002)}"   # ikut PORT env (dulu hardcode 5002)
    # Tunggu server bener-bener siap (polling sampai 200 OK)
    print("[-] Warmup: waiting for server to be ready...")
    for _ in range(30):  # max 30 detik
        try:
            r = requests.get(f"{_base}/", timeout=2)
            if r.status_code == 200:
                print("[+] Server is ready!")
                break
        except Exception:
            pass
        time.sleep(1)
    else:
        print("[!] Warmup: server didn't respond, skipping")
        return

    # Gate akses (gate.py) juga menolak call warmup ini (401: /api tanpa session).
    # Login dulu pakai kode dari gate_config.json — session cookie dibawa requests.Session.
    # SENGAJA bukan pengecualian localhost di gate: cloudflared mem-proxy SEMUA traffic
    # eksternal via 127.0.0.1, jadi pengecualian localhost = gate bolong total.
    sess = requests.Session()
    _gcfg = gate.get_gate_config()
    if _gcfg.get("enabled"):
        try:
            sess.post(f"{_base}/gate/login",
                      data={"code": _gcfg.get("code", "")}, timeout=5)
        except Exception as e:
            print(f"[!] Warmup: gate login gagal ({e}), lanjut tanpa session")

    # Simulasi search home: Hybrid + semua korpus
    cfgs = [
        {"db": "id", "desc": "ID"},
        {"db": "en", "desc": "EN"},
        {"db": "pli", "desc": "PLI"},
    ]

    total = len(cfgs)
    print(f"[-] Warming up {total} corpora via HTTP (Hybrid search)...")

    for i, cfg in enumerate(cfgs, 1):
        try:
            print(f"  [{i}/{total}] {cfg['desc']}...", end=" ", flush=True)
            r = sess.post(
                f"{_base}/api/search",
                json={
                    "query": "dhamma",
                    "db": cfg["db"],
                    "method": ["semantic", "keyword"],  # Hybrid
                    "include_titles": True,
                    "include_blurbs": True,
                    "page_size": 5,
                },
                timeout=60,
            )
            # flush=True WAJIB: di bawah gunicorn stdout block-buffered — tanpa flush, baris
            # hasil & "done" ngendon di buffer sampai proses exit -> journal seolah warmup hang.
            if r.status_code == 200:
                data = r.json()
                n = data.get("total_sutta", 0)
                print(f"OK ({n} results)", flush=True)
            else:
                print(f"FAILED (HTTP {r.status_code})", flush=True)
        except Exception as e:
            print(f"FAILED: {e}", flush=True)

    print("[+] Warmup done!", flush=True)


# Jalanin di background thread (daemon, aman). MYDHAMMA_SKIP_WARMUP=1 utk skip saat
# app.py di-import tooling/test (tanpa ini tiap import nembak login+3 search ke server live).
if not os.environ.get("MYDHAMMA_SKIP_WARMUP"):
    threading.Thread(target=_warmup_via_http, daemon=True).start()

if __name__ == "__main__":
    # Sengaja cuma jalan buat testing lokal.
    # Di server production, JANGAN jalanin file ini langsung pakai 'python app.py',
    # tapi gunakan Gunicorn!
    port = int(os.environ.get("PORT", 5002))
    app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False)