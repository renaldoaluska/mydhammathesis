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
import uuid
import unicodedata
from datetime import datetime
from pathlib import Path

import requests

from flask import (Flask, jsonify, request, redirect, render_template,
                   send_from_directory, abort)

# ── bootstrap: src/config.py (anchor) + web/ (engine) + reader.py (sedir) ─────
BASE_DIR = Path(__file__).resolve().parent                 # mydhamma/web-md
_SRC = next(p / "src" for p in BASE_DIR.parents if (p / "src" / "config.py").exists())
sys.path.insert(0, str(_SRC))
import config                                               # type: ignore # noqa: E402
sys.path.insert(0, str(_SRC.parent / "web"))               # engine bersama
# GPU 12GB dipakai penuh chat LLM (qwen2.5:14b) -> embedding model ke CPU biar tak rebutan VRAM.
# Query encoding ringan & vektor korpus sudah precomputed (cache CPU), jadi CPU aman/cepat.
# Override eksplisit lewat env EMBED_DEVICE bila perlu (mis. EMBED_DEVICE=cuda).
os.environ.setdefault("EMBED_DEVICE", "cpu")
import search as engine                                    # type: ignore # noqa: E402  (web/search.py)
sys.path.insert(0, str(BASE_DIR))
import reader                                               # noqa: E402

STATIC_DIR = BASE_DIR / "static"
NOTES_DIR  = BASE_DIR / "notes"
NOTES_DIR.mkdir(parents=True, exist_ok=True)
VALID_DB = ("id", "en", "pli")
PITAKAS  = reader.PITAKAS

app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static",
            template_folder=str(BASE_DIR / "templates"))
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.json.sort_keys = False

reader.init()


# ============================================================
# Registry model untuk dropdown + resolusi nama -> engine
# ============================================================
def _gpl_models():
    out = []
    if config.MODELS_DIR.exists():
        for d in sorted(config.MODELS_DIR.iterdir()):
            if d.is_dir() and (d / "config.json").exists() and d.name.startswith("gpl-"):
                out.append(d.name)
    return out


def _all_models():
    return [m["name"] for m in config.REGISTRY] + _gpl_models() + ["BM25"]


def _engine_model(value: str) -> str:
    """gpl-* -> path folder 4-training/models; lainnya apa adanya (resolve_model handle snapshot)."""
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
        return json.loads(_config_path().read_text(encoding="utf-8"))
    except Exception:
        return {}


def _ensemble_models(db: str, cfg: dict = None) -> list:
    """Model semantik utk korpus `db` dari konfig FLAT {target:[models]}.
    `cfg` = override per-request (ensemble_config dari browser); None -> config.json server."""
    cfg = cfg if isinstance(cfg, dict) else _load_engine_config()
    return [m for m in (cfg.get(db) or []) if m]


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
        frag["context_before"][lang] = (chunks[idx - 1].get(text_key) or "").strip()
    if idx < len(chunks) - 1:
        frag["context_after"][lang] = (chunks[idx + 1].get(text_key) or "").strip()


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
            "lang_names": reader._LANG_NAME_MAP}


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
    base = [_model_entry(m["name"]) for m in config.REGISTRY]
    gpl = [_model_entry(m) for m in _gpl_models()]
    cats = [{"key": "base", "label": "Base", "models": base}]
    if gpl:
        cats.append({"key": "gpl", "label": "GPL", "models": gpl})
    # NB: BM25 (leksikal) sengaja TIDAK dimasukkan ke kategori ensemble. Kaki keyword
    # diatur penuh oleh tombol metode (Hybrid/Kata Kunci) lewat search.py RRF, bukan
    # oleh checkbox model semantik. Konfig Mesin = pilih model semantik (Base/GPL) saja.
    return jsonify({"categories": cats, "all": _all_models()})


@app.route("/api/model-langs")
def api_model_langs():
    return jsonify({m: "multi" for m in _all_models()})


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
    source = "bilara" if is_bilara else ("html" if is_html else "bilara")

    if is_html:
        chunks = reader._get_sutta_from_html(sutta_id, lang, author)
        if chunks is None:
            return jsonify({"error": f"Sutta '{sutta_id}' not found"}), 404
        segments = []
        for c in chunks:
            seg = {"ids": c.get("chunk_ids", []), "heading": c.get("heading", 0),
                   "text": c.get(f"{lang}_text", "")}
            if c.get("parts"):
                seg["parts"] = [{"id": p["id"], "num": p["num"], "text": p["text"],
                                 **({"heading": p["heading"]} if p.get("heading") else {})}
                                for p in c["parts"]]
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

    return jsonify({
        "sutta_id": short_id, "formatted_id": reader.format_sutta_id(sutta_id),
        "sutta_name": reader._sutta_names.get(sutta_id, ""),
        "lang": lang, "author": author or "ms", "source": source,
        "segments": segments, "segmented": not is_html,
        "available_links": available_links, "available_paths": avail_paths,
    })


@app.route("/api/breadcrumbs/<sutta_id>")
def api_breadcrumbs(sutta_id):
    return jsonify(reader._get_breadcrumbs(reader.resolve_sutta_id(sutta_id)))


@app.route("/api/browse")
def api_browse():
    return jsonify(reader.build_tree())


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
# (pli-tv-b[iu]-...). Terjemahan non-Pali (lzh-*/san-*/xct-*) sengaja dibuang.
_MENTIONABLE_RE = re.compile(r'^((dn|mn|sn|an|kn|dhp|ud|iti|snp|vv|pv|thag|thig)\d|pli-tv-b[iu]-)', re.IGNORECASE)


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
            href = f"/{s}/{lang}/{author}" if direct else f"/{s}"
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
# Routes — Notes (CRUD; file JSON di web-md/notes/)
# ============================================================
def _notes_path(note_id: str) -> Path:
    return NOTES_DIR / f"{note_id}.json"


def _list_notes() -> list:
    notes = []
    for f in sorted(NOTES_DIR.glob("*.json"), key=os.path.getmtime, reverse=True):
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
            notes.append({"id": d["id"], "title": d.get("title", "Untitled"),
                          "created_at": d.get("created_at", ""), "updated_at": d.get("updated_at", ""),
                          "block_count": len(d.get("blocks", []))})
        except Exception:
            pass
    return notes


def _load_note(note_id: str):
    p = _notes_path(note_id)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def _save_note(note: dict):
    note["updated_at"] = datetime.now().isoformat()
    _notes_path(note["id"]).write_text(json.dumps(note, ensure_ascii=False, indent=2), encoding="utf-8")


@app.route("/api/notes", methods=["GET"])
def api_list_notes():
    return jsonify({"notes": _list_notes()})


@app.route("/api/notes/<note_id>", methods=["GET"])
def api_get_note(note_id):
    note = _load_note(note_id)
    return (jsonify(note) if note else (jsonify({"error": "Note not found"}), 404))


@app.route("/api/notes", methods=["POST"])
def api_create_note():
    body = request.get_json(force=True) or {}
    note = {"id": str(uuid.uuid4())[:8], "title": body.get("title", "Catatan Baru"),
            "created_at": datetime.now().isoformat(), "updated_at": datetime.now().isoformat(),
            "blocks": body.get("blocks", [])}
    _save_note(note)
    return jsonify(note), 201


@app.route("/api/notes/<note_id>", methods=["PUT"])
def api_update_note(note_id):
    existing = _load_note(note_id)
    if not existing:
        return jsonify({"error": "Note not found"}), 404
    body = request.get_json(force=True) or {}
    existing["title"] = body.get("title", existing["title"])
    existing["blocks"] = body.get("blocks", existing["blocks"])
    _save_note(existing)
    return jsonify(existing)


@app.route("/api/notes/<note_id>", methods=["DELETE"])
def api_delete_note(note_id):
    p = _notes_path(note_id)
    if p.exists():
        p.unlink()
        return jsonify({"ok": True})
    return jsonify({"error": "Note not found"}), 404


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
CHAT_MODEL = os.environ.get("MYDHAMMA_CHAT_MODEL", "qwen3:14b")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
# Thinking mode default MATI: qwen3 dgn thinking 3-6x lebih lambat (sapaan bisa 30s) tanpa
# manfaat nyata utk RAG ini. Set MYDHAMMA_CHAT_THINK=1 utk menyalakan. think:false aman utk
# model non-thinking (qwen2.5 balas 200, param diabaikan).
_CHAT_THINK = os.environ.get("MYDHAMMA_CHAT_THINK", "").lower() in ("1", "true", "yes")
# num_ctx: Ollama default cuma 2048 -> prompt RAG (system + answer-guide + 9+ passage + reminder)
# tembus jauh, dan Ollama MEMOTONG DIAM-DIAM DARI DEPAN. Akibatnya passage terbaik (mis. AN 9.64
# yg ngelist lengkap) kebuang, model cuma liat ekor prompt -> under-answer/ngawur. Set cukup besar
# agar seluruh prompt muat. WAJIB sama di semua call ke model yg sama, beda num_ctx = Ollama reload
# model tiap request (lambat). 8192 ~+1.5GB KV cache utk 14b, aman di 12GB.
CHAT_NUM_CTX = int(os.environ.get("MYDHAMMA_CHAT_NUM_CTX", "8192"))


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
                             "description": "Bahasa korpus yg dicari (default id)."},
            },
            "required": ["query"],
        },
    },
}, {
    "type": "function",
    "function": {
        "name": "ask_clarification",
        "description": "Gunakan HANYA jika pertanyaan pengguna terlalu ambigu dan Anda tidak yakin apakah mereka masih membahas sutta dari turn sebelumnya atau berganti topik.",
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
_CHAT_SYSTEM = {
    "id": (
        "Nama Anda 'myDhamma AI', asisten Dhamma buatan tim myDhamma (jangan pernah menyebut Qwen, "
        "Google, atau OpenAI).\n"
        "Anda AGEN yang menjawab pertanyaan Dhamma tradisi Theravada dan punya tool `search_sutta`.\n\n"
        "ATURAN:\n"
        "1. Untuk pertanyaan APA PUN soal Dhamma/Buddhisme/sutta/Tipiṭaka, Anda WAJIB memanggil tool "
        "`search_sutta` LEBIH DULU. DILARANG menjawab dari ingatan. Jika pertanyaan user adalah pertanyaan lanjutan (follow-up) mengenai sutta dari obrolan sebelumnya, Anda WAJIB menyisipkan kode/nama sutta tersebut ke dalam argumen query tool (misal: 'MN 21 perumpamaan gergaji'). Jika user berganti topik, jangan sertakan kode suttanya. Jika niat user sangat ambigu (Anda ragu apakah ia lanjut atau ganti topik), panggil tool `ask_clarification`.\n"
        "2. HANYA jika user sekadar menyapa, berterima kasih, atau basa-basi, jawab langsung TANPA tool.\n"
        "3. Setelah hasil tool ada, jawab dalam Bahasa Indonesia natural dan WAJIB merujuk sutta yg "
        "Anda pakai secara eksplisit. Sebutkan secara natural (misal 'Dalam SN 56.11...' atau dengan namanya 'Dalam Dhammacakkappavattana Sutta (SN 56.11)...'). "
        "Jangan mengaku memakai 'tool' atau 'pencarian'.\n"
        "4. Gunakan istilah Pali (Nibbāna, Kamma, Dhamma), bukan Sanskerta (Nirvana, Karma, Dharma). "
        "Kapitalkan kata ganti Sang Buddha.\n"
        "5. SALAM: JIKA memberi salam, gunakan HANYA salam Buddhis Pali — 'Sotthi hotu' atau 'Sukhī hotu'. DILARANG KERAS "
        "memakai salam tradisi agama lain (mis. Assalamualaikum, Shalom, Om Swastiastu, Salam sejahtera). JIKA pengguna "
        "sekadar bertanya kabar ('apa kabar?'), jawablah dengan natural, santai, dan ramah tanpa kaku mengulang salam.\n"
        "6. KERANGKA THERAVĀDA: Jawab SELALU dari sudut pandang Tipiṭaka Theravāda. DILARANG KERAS melabeli atau "
        "mengaitkan konsep dengan agama lain secara eksplisit (mis. JANGAN menulis 'ini ajaran Hindu', 'menurut Islam', "
        "'dalam agama X') — termasuk saat membahas kasta/varna, brahmana, petapa, atau dewa: itu adalah konteks "
        "India kuno di dalam Tipiṭaka, BUKAN milik 'agama Hindu' atau agama lain mana pun. Jangan membandingkan dengan, "
        "menilai, atau membahas ajaran agama lain; jika pengguna memintanya, tolak dengan sopan dan arahkan kembali ke "
        "Dhamma Theravāda. Bila ada perbedaan tafsir, selalu berpihak pada tradisi Theravāda."
    ),
    "en": (
        "Your name is 'myDhamma AI', a Dhamma assistant by the myDhamma team (never mention Qwen, "
        "Google, or OpenAI).\n"
        "You are an AGENT answering Theravada Dhamma questions and you have the `search_sutta` tool.\n\n"
        "RULES:\n"
        "1. For ANY question about Dhamma/Buddhism/suttas/Tipiṭaka you MUST call `search_sutta` FIRST. "
        "Never answer from memory. If the user's question is a follow-up about a sutta from the previous turn, you MUST include the sutta code/name in the tool query argument (e.g. 'MN 21 simile of the saw'). If the user changes the topic, do not include the sutta code. If the user's intent is highly ambiguous (you're unsure if they are continuing or changing the topic), call the `ask_clarification` tool.\n"
        "2. ONLY if the user merely greets, thanks, or makes small talk, answer directly WITHOUT the tool.\n"
        "3. Once tool results arrive, answer in natural English and you MUST cite the suttas you use "
        "explicitly. Mention it naturally (e.g. 'In SN 56.11...' or by name 'In the Dhammacakkappavattana Sutta (SN 56.11)...'). "
        "Don't admit using a 'tool' or 'search'.\n"
        "4. Use Pali terms (Nibbāna, Kamma, Dhamma), not Sanskrit (Nirvana, Karma, Dharma).\n"
        "5. GREETINGS: IF greeting, use ONLY the Buddhist Pali salutation — 'Sotthi hotu' or 'Sukhī hotu'. NEVER "
        "use another religion's greeting (e.g. Assalamualaikum, Shalom). IF the user just asks 'how are you?', "
        "answer naturally, warmly, and casually without rigidly forcing a Pali greeting.\n"
        "6. THERAVĀDA FRAME: ALWAYS answer from the Theravāda Tipiṭaka standpoint. STRICTLY DO NOT explicitly "
        "label or attribute concepts to other religions (e.g. NEVER write 'this is Hindu teaching', 'according to "
        "Islam', 'in religion X') — including when discussing caste/varna, brahmins, ascetics, or devas: these are "
        "ancient Indian context WITHIN the Tipiṭaka, NOT 'Hinduism' or any other religion. Do not compare to, judge, "
        "or discuss other religions' teachings; if asked, politely decline and steer back to the Theravāda Dhamma. "
        "When interpretations differ, always side with the Theravāda tradition."
    ),
}

# Panduan GAYA jawaban final (fase 2, call tanpa tools). Dipisah dari _CHAT_SYSTEM
# supaya fase keputusan tetap ringkas (tool-forward), tapi jawaban akhir kaya & terstruktur.
_CHAT_ANSWER_GUIDE = {
    "id": (
        "Sekarang TULIS JAWABAN FINAL untuk pengguna. Anda adalah asisten Dhamma yang piawai. PENTING: JANGAN PERNAH mengatakan 'Berdasarkan kutipan yang Anda berikan' karena ANDA sendirilah yang mencari sutta tersebut, bukan pengguna! Jika Anda ingin merujuk pada hasil pencarian, gunakan frasa 'Berdasarkan sutta yang saya temukan...' atau langsung ke inti materi. Buat "
        "LENGKAP, jelas, dan terstruktur:\n"
        "- Buka dgn inti jawaban/definisi konsepnya secara langsung.\n"
        "- PRIORITASKAN penggunaan poin-poin (bullet points) untuk menguraikan isi teks. Jangan gunakan paragraf panjang yang sulit dibaca.\n"
        "- Tutup dgn ringkasan/intisari praktis 1-2 kalimat bila relevan. LANGSUNG tulis intisarinya TANPA kalimat pengantar/bridging kaku seperti 'Sebagai ringkasan praktis...', 'Berikut adalah intisarinya...', atau semacamnya.\n"
        "- Setelah penutup, WAJIB buat daftar 3 Rekomendasi Pertanyaan Lanjutan (format bullet) yang relevan untuk eksplorasi lebih dalam. Setidaknya satu rekomendasi WAJIB men-tag sutta yang terkait, misal: 'Jelasin isi @MN10' atau 'Apa kata @SN56.11 tentang ini'. Gunakan heading '**Rekomendasi Pertanyaan Lanjutan:**'. DILARANG menggunakan tanda titik (.) di akhir kalimat rekomendasi pertanyaan. PENTING: Jangan menyertakan nomor segmen (seperti :md3 atau :1.2) saat men-tag sutta di pertanyaan lanjutan; cukup tag nama suttanya utuh tanpa segmen. ATURAN REKOMENDASI: Jika pengguna SECARA EKSPLISIT bertanya tentang sutta tertentu (misal '@SN 12.60'), JANGAN rekomendasikan sutta itu lagi. Namun, jika kamu merujuk suatu sutta untuk menjawab pertanyaan konseptual, kamu SANGAT DIANJURKAN membuat rekomendasi agar pengguna menggali isi sutta tersebut (misal 'Jelaskan isi @SuttaTsb secara detail').\n"
        "ATURAN RUJUKAN (WAJIB):\n"
        "- DILARANG KERAS menggunakan frasa seperti 'Berdasarkan teks yang Anda berikan', 'Berdasarkan kutipan di atas', atau 'Menurut dokumen ini'. Ingat: Pengguna mengira ANDALAH yang mencari sutta-sutta tersebut, bukan menerima contekan dari sistem/tools lain. Jawablah dengan natural seolah Anda mengetahuinya dari hasil pencarian Anda sendiri dan langsung sebut nama suttanya (misal: 'Dalam MN 10 dijelaskan...').\n"
        "- DILARANG KERAS membuat bagian/daftar 'Referensi:', 'Daftar Rujukan:', atau semacamnya di akhir jawaban. Semua rujukan HARUS diselipkan langsung di dalam kalimat (inline). SETIAP kali kamu membahas suatu poin/segmen, kamu WAJIB menyebutkan Sutta/Segmen asalnya di teks tersebut!\n"
        "- Rujuk HANYA dgn token rujukan PERSIS yg diberikan tiap blok (SALIN apa adanya, mis. 'MN 10:1.5' atau 'Bu-Pj 1'). DILARANG KERAS menambahkan spasi di sekitar tanda titik dua (contoh BENAR: 'MN 10:1.5', contoh SALAH: 'MN 10 : 1.5'). Jika ada spasi, link rujukan akan rusak!\n"
        "- UTAMAKAN rujukan tingkat SEGMEN: jika token rujukan blok menyertakan nomor segmen (mis. 'MN 10:1.5'), kamu WAJIB merujuk dengan segmen itu, JANGAN cuma nama sutta utuh ('MN 10'). Tag segmen yang spesifik untuk SETIAP klaim/poin agar pembaca bisa langsung ke kalimat sumbernya.\n"
        "- Jika menyebut rentang atau beberapa segmen berurutan, WAJIB mengulang nama sutta-nya secara utuh (contoh BENAR: 'SN 54.10:md6 sampai SN 54.10:md8'. Contoh SALAH: 'SN 54.10:md6 sampai md8'). Hal ini sangat penting agar link rujukan bisa di-klik.\n"
        "- JIKA satu-satunya teks yg tersedia untuk sutta yg diminta hanya berbahasa Pāli (blok bertanda '⚠️ HANYA tersedia teks PĀLI') DAN kamu tidak benar-benar memahami isinya, DILARANG KERAS menebak/mengarang artinya. Katakan jujur & sopan: 'Mohon maaf, untuk [nama/ID sutta] belum ada terjemahan yang bisa saya pahami. Silakan coba sutta lain.'\n"
        "DILARANG KERAS mengarang, menambah, atau mengubah nomor rujukan.\n"
        "- Bedakan jenis teks: blok bertanda VINAYA adalah ATURAN MONASTIK — sebut 'aturan Vinaya', "
        "JANGAN sebut 'sutta'. Blok bertanda SUTTA baru boleh disebut sutta.\n"
        "- Awalan rujukan: 'Bu-' = bhikkhu (biksu PRIA), 'Bi-' = bhikkhunī (biksu WANITA). Jangan "
        "tertukar — aturan untuk bhikkhu tidak otomatis berlaku untuk bhikkhunī dan sebaliknya.\n"
        "- STRUKTUR JAWABAN: Jika ada teks yang bertanda '⭐ DIMINTA USER' (artinya pengguna menyebut teks ini secara spesifik), FOKUSKAN seluruh jawabanmu secara utama pada teks tersebut! Jelaskan isinya secara detail dan urut. Namun, kamu SANGAT DIIZINKAN untuk menggunakan teks rujukan lain tanpa bintang sebagai pelengkap (supplement) untuk memperluas atau mengklarifikasi jawaban jika penjelasan di teks utama kurang lengkap.\n"
        "- KELOMPOKKAN & SURVEI (PENTING): JIKA TIDAK ADA teks bertanda '⭐ DIMINTA USER', bahas SEMUA blok yang relevan — JANGAN cuma ambil 1 sutta lalu mengabaikan sisanya yang juga relevan. KHUSUS pertanyaan enumeratif (mis. 'empat jenis manusia', 'lima rintangan'): SADARI sering ADA BEBERAPA KATEGORISASI BERBEDA dengan jumlah sama tetapi ISI BERBEDA (mis. 'empat jenis manusia' versi gelap/terang di satu sutta, versi arus/melawan-arus di sutta lain). JANGAN menggabung atau memaksakannya jadi satu daftar tunggal! Sajikan sebagai SURVEI di JAWABAN UTAMA: SATU poin (bullet) per skema/sutta, masing-masing DENGAN rujukannya dan ringkasan isi skema itu (mis. 'Versi gelap/terang (SN 3.21): ...', 'Versi menyiksa diri/orang lain (MN 51): ...'), agar pengguna melihat ragam kategorisasinya. DILARANG cuma membahas SATU skema lalu menyembunyikan skema lain di bagian rekomendasi/pertanyaan lanjutan — semua skema berbeda yang relevan WAJIB jadi poin terpisah di jawaban utama. Hanya buang blok yang benar-benar tidak relevan.\n"
        "- BATASAN ELABORASI & KEJUJURAN (SUPER KRITIS!): Jika Anda memberikan penjelasan tambahan, definisi rincian, perumpamaan, atau penjabaran makna yang TIDAK TERTULIS SECARA EKSPLISIT di teks rujukan yang disediakan, ANDA WAJIB MEMBERI TANDA bahwa itu adalah tambahan/elaborasi Anda sendiri (misal: '*Sebagai tambahan penjelasan...*', '*Meski tidak disebutkan secara eksplisit di sutta ini...*', atau '*Catatan tambahan dari AI...*'). JANGAN PERNAH menyajikan penjelasan atau ingatan eksternal Anda seolah-olah itu adalah isi asli dari sutta yang sedang dikutip!\n"
        "- Bila teks rujukan utama tampak hanya SEBAGIAN (tidak lengkap), katakan jujur bahwa kamu tidak "
        "membaca seluruh isinya, lalu beri gambaran umum dari bagian yg tersedia.\n"
        "Bahasa Indonesia natural, hangat, informatif. DILARANG KERAS MENGARANG ATAU MENEBAK ISTILAH PALI! Jangan pernah menyisipkan istilah Pali (misalnya dengan embel-embel 'atau [Pali] dalam bahasa Pali') KECUALI teks sumber secara harfiah dan eksplisit menyebutkan pasangan kata tersebut. Jika teks aslinya HANYA menulis terjemahan Indonesianya saja, MAKA KAMU HARUS MENULIS INDONESIANYA SAJA TANPA SOK TAHU MENAMBAHKAN BAHASA PALI. Ini adalah kitab suci yang wajib dijaga keakuratannya, menebak istilah adalah kesalahan fatal. DILARANG memakai kata 'di mana' sebagai kata hubung intrakalimat. Jangan menyebut 'tool' "
        "atau 'hasil pencarian'. ATURAN PENGGUNAAN TEKS: Jika teks rujukan membahas topik yang relevan secara konsep tetapi TIDAK menggunakan kata persis yang dicari pengguna (misal: teks membahas 'semangat' saat pengguna mencari 'kemalasan'), KAMU WAJIB MENJELASKAN HUBUNGAN LOGISNYA SECARA EKSPLISIT (contoh: 'Meskipun sutta ini tidak menyebut kemalasan secara langsung, sutta ini menjelaskan cara memunculkan semangat, yang merupakan kunci mengatasi kemalasan...'). Jangan asal melompat menyimpulkan seolah-olah teks itu menyebut kata pengguna secara harfiah! DILARANG KERAS halusinasi. Jangan pernah mengarang isi."
    ),
    "en": (
        "Now WRITE THE FINAL ANSWER for the user. You are an expert Dhamma assistant. IMPORTANT: NEVER say 'Based on the quotes you provided' because YOU searched for the suttas yourself! If you want to refer to the source, use phrases like 'Based on the suttas I found...' or jump straight to the core matter. Make it COMPLETE, "
        "clear, and structured:\n"
        "- Open with the core answer/definition directly.\n"
        "- PRIORITIZE using bullet points to explain the text. Avoid long, dense paragraphs.\n"
        "- Close with a short practical takeaway (1-2 sentences) when relevant.\n"
        "- After the closing, you MUST generate a list of 3 Follow-up Questions (bulleted) for deeper exploration. At least one question MUST tag a relevant sutta, e.g., 'Explain the contents of @MN10' or 'What does @SN56.11 say about this?'. Use the heading '**Recommended Follow-up Questions:**'. IMPORTANT: Do not include segment IDs (like :md3 or :1.2) when tagging suttas in the follow-up questions; just tag the base sutta name. RECOMMENDATION RULE: If the user EXPLICITLY asked about a specific sutta (e.g. '@SN 12.60'), DO NOT recommend asking about that sutta again. However, if you cited a sutta to answer a general conceptual question, you are HIGHLY ENCOURAGED to recommend a follow-up question for the user to dive deeper into that cited sutta (e.g. 'Explain the contents of @ThatSutta in detail').\n"
        "CITATION RULES (MANDATORY):\n"
        "- STRICTLY FORBIDDEN to use phrases like 'Based on the text you provided', 'According to the provided document', or 'Based on the quotes'. Remember: The user thinks YOU searched for these suttas yourself, not that you received them from another tool/system. Answer naturally as if you found them yourself, and directly cite the sutta name (e.g., 'In MN 10, it is explained...').\n"
        "- Cite ONLY with the EXACT reference token given in each block (copy it verbatim, e.g. 'MN 10:1.5' or 'Bu-Pj 1'). STRICTLY NO spaces around the colon (CORRECT: 'MN 10:1.5', WRONG: 'MN 10 : 1.5'). Adding spaces breaks the citation links!\n"
        "- PREFER SEGMENT-LEVEL citations: if a block's reference token includes a segment number (e.g. 'MN 10:1.5'), you MUST cite with that segment, NOT just the bare sutta name ('MN 10'). Tag the specific segment for EACH claim/point so the reader can jump straight to the source line.\n"
        "- When citing a range or multiple consecutive segments, you MUST repeat the full sutta name for each segment (CORRECT: 'SN 54.10:md6 to SN 54.10:md8'. WRONG: 'SN 54.10:md6 to md8'). This is critical so the citation links work properly.\n"
        "- IF the only available text for a requested sutta is in Pāli (a block tagged '⚠️ HANYA tersedia teks PĀLI') AND you do not genuinely understand it, you are STRICTLY FORBIDDEN from guessing/inventing its meaning. Say honestly and politely: 'I'm sorry, there is no translation of [sutta name/ID] available that I can understand yet. Please try another sutta.'\n"
        "NEVER invent, add, or alter a reference number.\n"
        "- Distinguish text types: a block tagged VINAYA is a MONASTIC RULE — call it a 'Vinaya rule', "
        "do NOT call it a 'sutta'. Only blocks tagged SUTTA may be called suttas.\n"
        "- Reference prefixes: 'Bu-' = bhikkhu (MONK), 'Bi-' = bhikkhunī (NUN). Don't confuse them — a "
        "rule for bhikkhus does not automatically apply to bhikkhunīs and vice versa.\n"
        "- FOCUS: if a block is tagged ⭐ DIMINTA USER, that is what the user directly asked for — focus your main answer on it. However, you are HIGHLY ENCOURAGED to use other provided blocks as supplementary context to expand or clarify your answer if the main text is insufficient.\n"
        "- GROUPING & SURVEY (IMPORTANT): if there's NO ⭐ DIMINTA USER tag, discuss ALL relevant blocks — do NOT just pick 1 sutta and ignore the rest that are also relevant. If several blocks cover the same topic/category (e.g. a question about 'the four kinds of people' with MANY relevant suttas), present a SURVEY: ONE bullet per sutta, each WITH its citation, so the user sees the range of sources. Only drop blocks that are truly irrelevant.\n"
        "- ELABORATION & HONESTY BOUNDARIES (SUPER CRITICAL!): If you provide any additional explanations, detailed definitions, analogies, or elaborations that are NOT EXPLICITLY WRITTEN in the provided reference texts, YOU MUST DECLARE that it is your own addition (e.g., '*As an additional explanation...*', '*Although not explicitly mentioned in this sutta...*', or '*Additional note from AI...*'). NEVER present your external knowledge or elaborations as if they were the original contents of the cited sutta!\n"
        "- If the main referenced text appears only PARTIAL, honestly say you couldn't read the whole "
        "thing, then give a general picture from what's available.\n"
        "Natural, warm, informative English. Use Pali terms (Nibbāna, Kamma), but NEVER invent Pali terms yourself. Don't mention a 'tool' or "
        "'search results'. STRICTLY NO hallucinations or forced connections: if the passages aren't truly "
        "relevant, don't force a connection; just use them as supplementary facts or say so honestly — never fabricate content."
    ),
}

# Kamus Sanskerta -> Pali (deterministik; ditegakkan pada jawaban akhir LLM).
_THERAVADA_MAP = [
    (r"nirvana", "Nibbāna"), (r"karma", "Kamma"), (r"dharma", "Dhamma"),
    (r"skandhas?", "khandha"), (r"dhyana", "jhāna"), (r"prajna", "paññā"),
    (r"vijnana", "viññāṇa"), (r"samskara", "saṅkhāra"), (r"trishna", "taṇhā"),
    (r"anatman", "anattā"), (r"bhikshus?", "bhikkhu"), (r"sutras?", "sutta"),
    (r"bodhisattva", "bodhisatta"), (r"arhat", "arahant"), (r"nirv[aā]na", "Nibbāna"),
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
    (r"sotapanna", "sotāpanna"), (r"sakadagami", "sakadāgāmī"), (r"anagami", "anāgāmī"),
    (r"kasina", "kasiṇa"),
]

# Kata umum yg TIDAK boleh memicu pencocokan nama-sutta (anti false-positive).
_NAME_MATCH_STOPWORDS = {
    "tentang", "kepada", "dengan", "untuk", "yaitu", "adalah", "bagaimana", "mengapa",
    "mengenai", "dalam", "sebuah", "seorang", "tersebut", "menurut", "sutta", "nikaya",
    "tipitaka", "dhamma", "buddha", "about", "which", "there", "their", "these", "those",
    "could", "would", "should", "theravada", "explain", "meaning",
}


def _enforce_theravada_terms(text: str) -> str:
    """Ganti istilah Sanskerta -> Pali, pertahankan kapitalisasi token aslinya."""
    if not text:
        return text
    def make_repl(rep):
        def f(m):
            s = m.group(0)
            if s.isupper():
                return rep.upper()
            if s[:1].isupper():
                return rep[:1].upper() + rep[1:]
            return rep
        return f
    for pat, rep in _THERAVADA_MAP:
        text = re.sub(rf"\b{pat}\b", make_repl(rep), text, flags=re.IGNORECASE)
    for pat, rep in _PALI_DIACRITIC_MAP:
        text = re.sub(rf"\b{pat}\b", make_repl(rep), text, flags=re.IGNORECASE)
    # Calque "di mana" sbg konjungsi intrakalimat (pola ", di mana <klausa>") -> pecah jadi kalimat
    # baru. Soft-rule di prompt sering dilanggar model kecil; ini penegakan deterministik.
    # Hanya pola berkoma (hampir pasti calque); "tahu di mana"/"di mana-mana" yg sah tak tersentuh.
    text = re.sub(r",\s*di\s+mana\s+(\S)", lambda m: ". " + m.group(1).upper(), text, flags=re.IGNORECASE)
    return text


_PALI_DIACRITICS = set("āīūṁṃṅñṭḍṇḷ")
_EN_HINT = set("the of and to is what how why who which are can does in on for about".split())
_ID_HINT = set("apa bagaimana mengapa siapa yang adalah bisa apakah kenapa gimana dan ke dari tentang".split())


def detect_query_lang(query: str) -> str:
    """Heuristik bahasa kueri: diakritik Pali -> 'pli'; selisih kata-petunjuk -> 'en'/'id'."""
    q = (query or "").lower()
    if any(c in _PALI_DIACRITICS for c in q):
        return "pli"
    words = set(re.findall(r"[a-z]+", q))
    return "en" if len(words & _EN_HINT) > len(words & _ID_HINT) else "id"


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


def _ollama_json(messages: list, fmt: str = "json", temperature: float = 0.2) -> str:
    """Panggilan Ollama non-stream (utk query-rewrite). Balas string content; '' bila gagal."""
    try:
        r = requests.post(f"{OLLAMA_URL}/api/chat", timeout=120, json={
            "model": CHAT_MODEL, "messages": messages, "stream": False, "think": _CHAT_THINK,
            "format": fmt, "options": {"temperature": temperature, "num_ctx": CHAT_NUM_CTX},
        })
        return ((r.json().get("message") or {}).get("content") or "").strip()
    except Exception:
        return ""


def _ollama_chat(messages: list, tools: list = None) -> dict:
    """Panggilan Ollama non-stream. Balas message dict {content, tool_calls?}; {} bila gagal.
    Non-stream sengaja: qwen sering emit konten basa-basi BARENG tool_calls — dgn non-stream
    keputusan (panggil tool atau jawab) terbaca utuh, tak perlu menebak urutan token."""
    payload = {"model": CHAT_MODEL, "messages": messages, "stream": False,
               "think": _CHAT_THINK, "options": {"temperature": 0.3, "num_ctx": CHAT_NUM_CTX}}
    if tools:
        payload["tools"] = tools

    try:
        r = requests.post(f"{OLLAMA_URL}/api/chat", json=payload, timeout=60)
        return r.json().get("message") or {}
    except Exception as e:
        return {"content": f"[Tidak bisa menghubungi LLM lokal: {e}]"}


def _ollama_stream(messages: list):
    """Stream jawaban FINAL token-demi-token (TANPA tools -> tak ada preamble/tool_call
    menyelip, streaming bersih). Yield potongan teks; konten kosong diabaikan."""
    payload = {"model": CHAT_MODEL, "messages": messages, "stream": True,
               "think": _CHAT_THINK,
               "options": {"temperature": 0.35, "num_ctx": CHAT_NUM_CTX}}  # turun dari 0.45: kurangi wandering/halusinasi
    try:
        resp = requests.post(f"{OLLAMA_URL}/api/chat", json=payload, stream=True, timeout=300)
    except Exception as e:
        yield f"[Tidak bisa menghubungi LLM lokal: {e}]"
        return
    for line in resp.iter_lines():
        if not line:
            continue
        try:
            data = json.loads(line)
        except Exception:
            continue
        piece = (data.get("message") or {}).get("content")
        if piece:
            yield piece
        if data.get("done"):
            break


def _rewrite_query(query: str, lang: str, failed: list = None, history: list = None):
    """Ekspansi kueri user -> 3-5 variasi kueri (sinonim/parafrase) + saran pitaka. SKIP_SEARCH HANYA utk
    sapaan (deteksi deterministik). LLM cuma mengekspansi, TIDAK berwenang memutus skip —
    mencegah pertanyaan Dhamma salah dilewati. Error/timeout -> fallback ([query], None)."""
    if _is_smalltalk(query):
        return ["SKIP_SEARCH"], None
    sys_p = (
        "Anda mesin reformulasi kueri pencarian korpus Tipiṭaka. Jika user bercerita/bertanya panjang, ekstrak SEMUA aspek/emosi/masalah utama dari cerita tersebut dan "
        "hasilkan 3-5 variasi kueri pencarian ATOMIK (pecah menjadi kueri-kueri sangat singkat yang masing-masing HANYA fokus pada satu aspek spesifik secara terpisah). "
        "Kueri PERTAMA WAJIB berupa definisi konsep utama menggunakan kata 'adalah' atau 'pengertian' (misal: 'sedih adalah', 'pengertian kamma'). "
        "Kueri selanjutnya mengeksplorasi aspek-aspek lain dari cerita user secara ringkas (misal: 'cara mengatasi sedih', 'penyebab penderitaan'). JANGAN membuat kalimat panjang. "
        "DILARANG memasukkan kata-kata redundan seperti 'dalam agama Buddha', 'menurut Buddha', 'Buddhisme', atau 'Theravada' karena korpus ini sudah spesifik Tipiṭaka.\n"
        'Balas HANYA JSON: {"queries":["...","..."],"pitaka":null|"sutta"|"vinaya"|"abhidhamma"}.'
    )
    user_p = f"Pertanyaan ({lang}): {query}"
    if history:
        hist_str = "\n".join(f"{h['role']}: {h['content'][:200]}" for h in history[-4:])
        user_p = f"Konteks obrolan sebelumnya:\n{hist_str}\n\nPertanyaan baru ({lang}): {query}\n\nJadikan pertanyaan baru ini sebagai kueri yang utuh (gabungkan konteks jika pertanyaan baru menggunakan kata ganti atau merupakan pertanyaan lanjutan)."
    if failed:
        user_p += f"\nKueri yg sudah dicoba & gagal: {failed}. Cari sudut kata kunci yg BERBEDA."
    raw = _ollama_json([{"role": "system", "content": sys_p}, {"role": "user", "content": user_p}])
    try:
        d = json.loads(raw)
        qs = [q.strip() for q in (d.get("queries") or []) if isinstance(q, str) and q.strip()]
        hint = d.get("pitaka") if d.get("pitaka") in ("sutta", "vinaya", "abhidhamma") else None
        return (qs[:5] or [query]), hint
    except Exception:
        return [query], None


def _retrieve_suttas(query: str, db: str, max_suttas: int = 6, pitaka=None) -> list:
    """Hybrid (semantic ensemble + BM25) -> RRF -> grouping per-sutta. Bentuk keluaran
    SAMA dgn _group_suttas (punya formatted_id/sutta_name/pitaka/max_score/fragments)."""
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
    suttas = _group_suttas(fused)
    _normalize_rrf_scores(suttas)
    if pitaka:
        pits = pitaka if isinstance(pitaka, list) else [pitaka]
        suttas = [s for s in suttas if s["pitaka"] in pits]
    return suttas[:max_suttas]


def _inject_missing_blurbs(suttas: list):
    """Sisipkan fragmen blurb (sinopsis) utk sutta yg belum punya — biar LLM dpt konteks ringkas."""
    for s in suttas:
        if any(f.get("author") == "blurb" for f in s.get("fragments", [])):
            continue
        sid = reader.resolve_sutta_id(s.get("sutta_id", ""))
        blurb = reader._blurbs.get((sid, "id")) or reader._blurbs.get((sid, "en"))
        if not blurb:
            continue
        s.setdefault("fragments", []).insert(0, {
            "score": s.get("max_score", 0), "ref": [sid], "ref_display": s.get("formatted_id", sid),
            "texts": {"id": blurb if reader._blurbs.get((sid, "id")) else "",
                      "en": blurb if not reader._blurbs.get((sid, "id")) else "", "pli": ""},
            "author": "blurb", "db_source": "id", "models": ["blurb"], "score_type": "blurb",
        })


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


def _passages_for_prompt(suttas: list, prompt_db: str, expand: set = None, enum: bool = False) -> list:
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
            # Urutkan berdasarkan segmen dari kecil ke besar secara logis (natural sort)
            bodies_sorted = sorted(bodies_subset, key=_seg_sort_key)
            
            parts, part_langs = [], []
            core_texts = set()
            for f in bodies_sorted:
                t, _ = _ftext(f)
                if t: core_texts.add(t)
                
            seen_texts = set()
            for f in bodies_sorted:
                t, L = _ftext(f)
                if not t: continue
                part_langs.append(L)
                refs = f.get("ref") or []
                f_seg = ""
                if refs and ":" in refs[0]:
                    f_seg = ":" + refs[0].split(":", 1)[1]
                    
                ctx_b = f.get("context_before", {}).get(L)
                if ctx_b and ctx_b not in seen_texts and ctx_b not in core_texts:
                    parts.append(ctx_b)
                    seen_texts.add(ctx_b)
                
                if t not in seen_texts:
                    parts.append(f"[{fid}{f_seg}] {t}")
                    seen_texts.add(t)
                
                ctx_a = f.get("context_after", {}).get(L)
                if ctx_a and ctx_a not in seen_texts and ctx_a not in core_texts:
                    parts.append(ctx_a)
                    seen_texts.add(ctx_a)
                
            max_len = 4000 if fid in expand else (3200 if enum else 2000)
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


# ============================================================
# Routes — Chat (Agentic RAG)
# ============================================================
@app.route("/chat")
def chat_ui():
    """Halaman Utama Chat (Frontend)."""
    return render_template("chat.html")

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

    lang = body.get("lang") or detect_query_lang(query)
    if lang == "pli":
        lang = "id"
    # Scope (bahasa korpus & pitaka) ditentukan agen sendiri via argumen tool, bukan filter UI.
    # db_pref hanya menentukan bahasa jawaban/pasase (prompt_db); default ikut bahasa terdeteksi.
    db_pref = body.get("db") or ("en" if lang == "en" else "id")
    max_suttas = int(body.get("top_k", 6))
    history = body.get("history") or []
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
        _MENTION_RE = r'@?\b((?:dn|mn|sn|an|kn|dhp|ud|iti|snp|vv|pv|thag|thig|bu-[a-z]+)\s*\d+(?:\.\d+)?)\b'
        mentions = re.findall(_MENTION_RE, t_query + " " + query, re.IGNORECASE)
        mentions = list(dict.fromkeys(m.strip() for m in mentions))
        carried_ctx = False
        # Auto-carry LAMA (selalu carry) dihapus krn lock-in permanen. Andalan utama: LLM menyisipkan
        # kode sutta di t_query saat follow-up. JARING PENGAMAN deiktik di bawah: kalau LLM lupa & user
        # JELAS merujuk balik ("sutta itu", "teks tersebut", "di situ"), tarik kode sutta dari giliran
        # asisten terakhir. Sengaja pakai pola referent-noun + kata tunjuk, BUKAN "itu" telanjang —
        # supaya idiom "apa itu X" (pertanyaan baru) tidak salah memicu carry (anti lock-in).
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
        q_norm = _strip_diacritics(t_query.lower())
        q_words = [w for w in dict.fromkeys(re.split(r'\W+', q_norm)) if len(w) >= 5 and w not in _NAME_MATCH_STOPWORDS]
        
        _PALI_ID_RE = re.compile(r'^(dn|mn|sn|an|kn|dhp|ud|iti|snp|vv|pv|thag|thig|bu-|bi-|pli-tv-)', re.IGNORECASE)
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
                
        if name_hits:
            name_hits = sorted(name_hits, key=len)[:5]
            existing_norms = {m.lower().replace(" ","") for m in mentions}
            name_hits = [sid for sid in name_hits if sid not in existing_norms]

        # Jejak transparansi: apa yg sebetulnya dilakukan tool (dipancarkan sbg step).
        trace = []
        if mentions:
            _mlabel = "Melanjutkan konteks sutta: " if carried_ctx else "Rujukan eksplisit terdeteksi: "
            trace.append(_mlabel + ", ".join(dict.fromkeys(m.strip() for m in mentions)))
        if name_hits:
            trace.append("Kecocokan nama sutta: " + ", ".join(reader.format_sutta_id(s) for s in name_hits))

        # Sutta yg di-mention eksplisit: tarik JAUH lebih banyak chunk (baca hampir penuh utk
        # mayoritas sutta) & tandai sbg fokus utama. mention_cites = formatted-id utk tanda ⭐.
        exact_suttas = []
        mention_cites = set()
        # Fallback bahasa utk mention: korpus pilihan -> id -> en -> pli, supaya sutta yg
        # di-mention tetap kebawa walau tak ada terjemahan Indo (ambil Inggris, lalu Pāli).
        _mention_langs = [eff_dbs[0]] + [L for L in ("id", "en", "pli") if L != eff_dbs[0]]
        for m in mentions:
            mclean = m.lower().replace(" ", "")
            m_hits = []
            for _L in _mention_langs:
                m_hits = engine.exact_sutta_match(mclean, _L, max_chunks=24, query=t_query)
                if any(h.get("author") != "blurb" for h in m_hits):
                    break   # dapat teks isi (bukan cuma blurb) -> berhenti di bahasa ini
            exact_suttas.extend(m_hits)
            mention_cites.add(reader.format_sutta_id(reader.resolve_sutta_id(mclean)))
        for sid in name_hits:
            exact_suttas.extend(engine.exact_sutta_match(sid, eff_db_str, max_chunks=3, query=t_query))

        suttas = _group_suttas(exact_suttas)
        _inject_missing_blurbs(suttas)
        
        # Semantic
        if mentions:
            pass # "Pencarian hybrid untuk konteks tambahan" dilewati sesuai permintaan jika ada rujukan eksplisit
        else:
            sq_list, _ = _rewrite_query(t_query, t_lang, [], history)
            if "SKIP_SEARCH" not in sq_list:
                if name_hits:
                    trace.append("Pencarian hybrid untuk konteks tambahan: " + "  ·  ".join(f"“{q}”" for q in sq_list))
                else:
                    trace.append("Pencarian hybrid: " + "  ·  ".join(f"“{q}”" for q in sq_list))
                with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                    futures = [executor.submit(_retrieve_suttas, sq, eff_db_str, max_suttas, t_pitaka) for sq in sq_list]
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
        
        unique_suttas = unique_suttas[:max_suttas * 2]
        # Tandai sutta yg di-mention eksplisit -> kartunya WAJIB tampil walau model lupa/salah mengutip.
        ctx_cache = {}
        for s in unique_suttas:
            if s.get("formatted_id", "").split(":")[0] in mention_cites:
                s["mentioned"] = True
            for fr in s.get("fragments", []):
                if "context_before" not in fr: fr["context_before"] = {}
                if "context_after" not in fr: fr["context_after"] = {}
                _fill_frag_context(fr, ctx_cache)
                
        passages = _passages_for_prompt(unique_suttas, prompt_db, expand=mention_cites,
                                        enum=bool(_ENUM_INTENT_RE.search(query)))
        
        # Format Passages to Tool Text. Kategori dari pitaka (andal utk Bu- DAN Bi-);
        # token rujukan eksplisit supaya model menyalin PERSIS (cegah ref ngarang/ga nge-link).
        blocks = []
        for i, p in enumerate(passages, 1):
            cite = p["formatted_id"].split(":")[0]
            if "/" in cite:
                cite = cite.split("/")[-1].split(".")[0].upper()
            is_vinaya = p.get("pitaka") == "vinaya" or cite[:3] in ("Bu-", "Bi-")
            kind = "VINAYA (aturan monastik, BUKAN sutta)" if is_vinaya else "SUTTA"
            star = "⭐ DIMINTA USER — " if p.get("is_expand") else ""
            name = cite + (f" — {p['sutta_name']}" if p.get("sutta_name") else "")
            pli_note = " | ⚠️ HANYA tersedia teks PĀLI (belum ada terjemahan id/en)" if p.get("lang") == "pli" else ""

            lines = [f"[{i}] {star}{kind} | {name} | rujuk segmen spesifik per klaim sesuai tag dalam teks (mis. {cite}:1.2){pli_note}"]
            if p.get("synopsis"): lines.append(f"Sinopsis: {p['synopsis']}")
            lines.append(f">> {p.get('text', '')}")
            blocks.append("\n".join(lines))
        
        return (("\n\n".join(blocks) if blocks else "Tidak ada teks Tipiṭaka yang ditemukan."),
                unique_suttas, trace)

    def gen():
        # Build initial messages
        sys_content = _CHAT_SYSTEM.get(lang, _CHAT_SYSTEM["id"])
        messages = [{"role": "system", "content": sys_content}]
        for h in (history or [])[-6:]:
            role = h.get("role")
            content = (h.get("content") or "").strip()
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": query})

        all_unique_suttas = []
        search_q_str = ""
        yield _sse({"stage": "understand"})

        # FASE 1 — keputusan tool (non-stream + tools). Satu putaran; model boleh
        # mengeluarkan >1 tool_call. Jaring pengaman: bila tak memanggil tool padahal
        # bukan sapaan, paksa satu retrieval agar jawaban tetap grounded.
        msg = _ollama_chat(messages, tools=_CHAT_TOOLS)
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
                yield _sse({"type": "final", "answer": q, "results": [], "query": query, "search_query": "", "model": CHAT_MODEL, "lang": lang})
                return

            # Konten preamble pd giliran-tool dibuang (tak relevan & bisa bias konteks).
            messages.append({"role": "assistant", "content": "", "tool_calls": tcs})
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
                yield _sse({"stage": "retrieve", "query": f"Mencari: {t_query}{scope_s}"})
                search_q_str += (t_query + " | ")
                tool_result_text, usuttas, trace = execute_search_tool(t_query, t_pitaka, t_lang)
                # Step transparan: jejak apa yg tool kerjakan (mention/nama/kueri ekspansi).
                for tlabel in trace:
                    yield _sse({"stage": "tool", "label": tlabel})
                all_unique_suttas.extend(usuttas)
                # Step transparan: berapa SUTTA kandidat ketemu + daftarnya (jumlah cocok dgn list).
                ids = [s.get("formatted_id", "") for s in usuttas if s.get("formatted_id")]
                if ids:
                    shown = ids[:8]
                    more = f"  (+{len(ids) - len(shown)} lagi)" if len(ids) > len(shown) else ""
                    yield _sse({"stage": "found", "label": f"Menemukan {len(ids)} teks kandidat: {', '.join(shown)}{more}"})
                else:
                    yield _sse({"stage": "found", "label": "Tidak menemukan teks yang cocok"})
                messages.append({"role": "tool", "name": "search_sutta",
                                 "content": tool_result_text})
        else:
            # Sapaan/basa-basi: konten keputusan = jawaban final, kirim langsung (pendek).
            yield _sse({"stage": "generate"})
            answer = _enforce_theravada_terms(msg.get("content") or "")
            yield _sse({"type": "chunk", "text": answer})
            yield _sse({"type": "final", "answer": answer, "results": [],
                        "query": query, "search_query": "",
                        "model": CHAT_MODEL, "lang": lang})
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
                "content": gen_messages[0]["content"] + "\n\n" + _CHAT_ANSWER_GUIDE.get(lang, _CHAT_ANSWER_GUIDE["id"])
            }
        else:
            gen_messages.insert(0, {"role": "system", "content": _CHAT_ANSWER_GUIDE.get(lang, _CHAT_ANSWER_GUIDE["id"])})
            
        # Trik "System Prompt Reinforcement": Kita taruh panduan utama di atas agar alurnya logis.
        # PENTING: Jangan membuat pesan 'system' baru di akhir karena bisa memutus rantai attention model
        # terhadap pesan 'tool'. Sebaliknya, kita APPEND pengingat kritis ke pesan terakhir (pesan 'tool').
        reminder = (
            f"\n\n--- PENGINGAT KRITIS DARI SISTEM ---\n"
            f"Jawablah pertanyaan pengguna berikut: '{query}'.\n"
            f"1) Jawab HANYA menggunakan informasi yang EKSPLISIT TERTULIS di teks hasil pencarian. Jika teks pencarian TIDAK merinci suatu hal, DILARANG KERAS melengkapinya dari ingatan Anda! Cukup sampaikan sebatas info yang ada.\n"
            f"2) LANGSUNG masuk ke inti materi tanpa kalimat pengantar apa pun (basa-basi dilarang keras).\n"
            f"3) Anda WAJIB menyertakan token rujukan sutta (yang BENAR-BENAR ADA di teks hasil pencarian) DI DALAM SETIAP kalimat/poin klaim yang Anda buat!\n"
            f"4) Rujuk teks yang benar-benar MENJELASKAN/merinci klaim Anda, BUKAN teks yang hanya menyebut istilahnya sambil lalu (mis. dalam syair). Jika sebuah daftar/penjelasan datang dari teks A, kutiplah teks A — jangan tempelkan ke teks lain yang kebetulan memuat frasa serupa."
        )
        # Pertanyaan enumeratif: dorong SURVEI multi-skema di posisi atensi tertinggi (akhir pesan tool).
        # Klausa di answer-guide sering diabaikan model; pengingat di sini lebih dipatuhi.
        # Guard anti-ngarang: kalau hasil cuma punya SATU skema, bahas satu saja (jangan paksakan skema palsu).
        if _ENUM_INTENT_RE.search(query):
            reminder += (
                f"\n5) PERTANYAAN INI ENUMERATIF. Hasil pencarian sering memuat BEBERAPA KATEGORISASI "
                f"BERBEDA dengan jumlah sama tetapi ISI BERBEDA (mis. beberapa versi 'empat jenis manusia' "
                f"dari sutta berlainan). JAWABAN UTAMA-mu WAJIB membahas SETIAP kategorisasi berbeda yang "
                f"relevan sebagai bagian/poin TERPISAH, masing-masing dengan suttanya. DILARANG membahas "
                f"hanya satu skema lalu menyembunyikan skema lain di bagian rekomendasi. TETAPI jangan "
                f"mengarang: kalau di hasil pencarian memang hanya ada SATU skema, bahas satu saja dengan jujur."
            )
        gen_messages[-1]["content"] += reminder
        parts = []
        for piece in _ollama_stream(gen_messages):
            parts.append(piece)
            yield _sse({"type": "chunk", "text": piece})
        answer = _enforce_theravada_terms("".join(parts))
        cited = _cited_only(answer, all_unique_suttas)
        # Sutta yg di-mention eksplisit user SELALU ditampilkan kartunya (di atas), walau model
        # lupa mengutipnya atau malah halusinasi ref lain. Dedup terhadap yg sudah dikutip.
        _cited_bases = {(s.get("formatted_id") or "").split(":")[0] for s in cited}
        _forced = []
        for s in all_unique_suttas:
            base = (s.get("formatted_id") or "").split(":")[0]
            if s.get("mentioned") and base and base not in _cited_bases:
                _cited_bases.add(base)
                _forced.append(s)
        cited = _forced + cited
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
        yield _sse({"type": "final", "answer": answer,
                    "results": cited,
                    "query": query, "search_query": search_q_str.strip(" | "),
                    "model": CHAT_MODEL, "lang": lang})
        return
                
    if body.get("stream"):
        return Response(stream_with_context(gen()), mimetype="text/event-stream",
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


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5002))
    app.run(host="0.0.0.0", port=port, debug=True, use_reloader=False)
