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
from datetime import datetime
from pathlib import Path

from flask import (Flask, jsonify, request, redirect, render_template,
                   send_from_directory, abort)

# ── bootstrap: src/config.py (anchor) + web/ (engine) + reader.py (sedir) ─────
BASE_DIR = Path(__file__).resolve().parent                 # mydhamma/web-md
_SRC = next(p / "src" for p in BASE_DIR.parents if (p / "src" / "config.py").exists())
sys.path.insert(0, str(_SRC))
import config                                               # noqa: E402
sys.path.insert(0, str(_SRC.parent / "web"))               # engine bersama
import search as engine                                    # noqa: E402  (web/search.py)
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


def _ensemble_models(db: str, query_lang: str) -> list:
    cfg = _load_engine_config()
    row = cfg.get(query_lang) if isinstance(cfg.get(query_lang), dict) else {}
    return [m for m in (row.get(db) or []) if m]


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
    query_lang = body.get("query_lang") if body.get("query_lang") in ("id", "en") else "id"

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
                models = _ensemble_models(db, query_lang) if model_name == "ensemble" else [model_name]
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


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5002))
    app.run(host="0.0.0.0", port=port, debug=True, use_reloader=False)
