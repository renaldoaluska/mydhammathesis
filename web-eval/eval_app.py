"""
eval_app.py — Web EVAL (Asesmen Pakar) myDhamma — APP STANDALONE & TERSEGEL.

Melayani UI penilaian pakar (GRA): serve kandidat top-5 dari `search_cache.pkl`
(beku) + kumpulkan grade -> CSV (kontrak src/code/5-eval/common.py) + progress.

NOL engine: tidak meng-import sentence-transformers / web/search. Cache dibangun
offline oleh `src/code/5-eval/1-build-cache.py`. App ini cuma BACA cache + tulis CSV.

Standalone: folder/templates/static sendiri, daftar model di eval_config.json, PATH
data dari src/config.py. Tersegel -> ngoprek engine myDhamma tidak mengubah grade.

Jalankan:  python web-eval/eval_app.py   (port 5001)
"""
import csv as _csv
import json
import pickle
import re
import threading
import time
from pathlib import Path

from flask import Flask, jsonify, request, redirect, render_template

# STANDALONE / SEALED: eval app TIDAK import dari src/ atau web/ myDhamma (nol engine).
APP_DIR = Path(__file__).resolve().parent

# Registry model eval = LOKAL & BEKU (eval_config.json) — pengganti import engine.
with open(APP_DIR / "eval_config.json", encoding="utf-8") as _f:
    _CFG = json.load(_f)
MODEL_VERSI_MAP = dict(_CFG["model_versi"])      # model -> versi (kolom CSV)
MODEL_LANGS     = dict(_CFG["model_langs"])      # model -> cakupan korpus (multi/en/indo)
ALL_MODELS      = list(MODEL_VERSI_MAP.keys())

# ── Flask (template & static di-share dengan myDhamma) ──────────────────────
app = Flask(
    __name__,
    static_folder=str(APP_DIR / "eval_static"),
    static_url_path="/eval_static",
    template_folder=str(APP_DIR / "eval_templates"),
)
STATIC_DIR = APP_DIR / "eval_static"
app.config["TEMPLATES_AUTO_RELOAD"] = True


@app.context_processor
def _template_globals():
    """Helper Jinja yang dipakai template (cache-buster + fallback aman)."""
    import os
    def versioned_static(filename):
        try:
            mtime = int(os.path.getmtime(STATIC_DIR / filename))
        except OSError:
            mtime = 0
        return f"/eval_static/{filename}?v={mtime}"
    return {
        "versioned_static": versioned_static,
        "browse_href": "/browse",
        "bilara_author_names": {},
        "edition_author_names": {},
        "lang_names": {},
    }


# ── Data eval: PATH dari config.py myDhamma (single source of truth). Import RINGAN
#    (cuma path + REGISTRY, NOL torch/engine) -> sealing tetap (app tak jalankan search). ──
import sys as _sys
_SRC = next((p / "src") for p in APP_DIR.parents if (p / "src" / "config.py").exists())
_sys.path.insert(0, str(_SRC))
import config as _mdc                            # noqa: E402  (path + REGISTRY, tanpa engine)
EVAL_DIR = _mdc.EVAL_DIR                         # = src/output/5-eval (hub bareng code/5-eval)
EVAL_DIR.mkdir(parents=True, exist_ok=True)

ALL_CORPORA = ["id", "en"]
EVAL_TOP_K = 10              # KEY cache (HARUS = TOP_K precompute=10 sutta). Jangan diubah.
EVAL_PASSAGE_K = 5           # UNIT EVAL = PASASE: top-5 fragmen by score per (query,model),
                            # bukan top-5 sutta. nDCG@5 = @5 pasase. Filter serve-time dari
                            # cache (subset, non-destruktif) — ubah angka ini = ganti kedalaman pool.
EVAL_INCLUDE_TITLES = False  # heading dibuang dari hasil eval (seragam dgn 5-eval/1-precompute)

def _norm_experts(raw):
    """Normalisasi daftar pakar -> [{"name", "corpora"}].
    Toleran entri lama berupa string (otomatis dapat semua korpus). Korpus
    selalu diurutkan & divalidasi ke ALL_CORPORA; kosong -> semua korpus."""
    out = []
    for e in raw or []:
        if isinstance(e, str):
            out.append({"name": e, "corpora": list(ALL_CORPORA)})
        elif isinstance(e, dict) and e.get("name"):
            corpora = [c for c in ALL_CORPORA if c in (e.get("corpora") or [])]
            out.append({"name": e["name"], "corpora": corpora or list(ALL_CORPORA)})
    return out


def get_eval_paths(eval_type=1):
    # SATU ALUR (sealed): OUTPUT eval (cache/anotasi) di EVAL_DIR; INPUT hand-made
    # (queries_pakar/nama_pakar) di EVAL_INPUT_DIR (= src/code/5-eval). eval_type diabaikan.
    res_dir = EVAL_DIR / "anotasi"      # anotasi_*.csv + completed_*.json -> dibaca code/5-eval
    res_dir.mkdir(parents=True, exist_ok=True)
    return {
        "queries":  _mdc.EVAL_INPUT_DIR / "queries_pakar.json",
        "cache":    EVAL_DIR / "search_cache.pkl",
        "experts":  _mdc.EVAL_INPUT_DIR / "nama_pakar.json",
        "results_dir": res_dir,
    }

_eval_search_caches = {1: {}}   # SATU eval saja (mydhamma; data unified di EVAL_DIR)
_eval_cache_lock = threading.Lock()
_eval_heartbeats = {}   # expert -> {"ts", "step"}

def _get_cache(eval_type):
    return _eval_search_caches.get(eval_type, {})

def _limit_passages(suttas, k=EVAL_PASSAGE_K):
    """Batasi hasil ke top-k PASASE (fragmen by score) lintas sutta, lalu kelompokin
    ulang per sutta utk jaga struktur yg ditelan frontend. Unit eval = pasase, bukan
    sutta: cache nyimpen top-10 SUTTA (superset); ini motong ke top-k FRAGMEN saat
    serve/hitung (subset, non-destruktif — grade lama tetap valid)."""
    flat = [(s, fr) for s in (suttas or []) for fr in s.get("fragments", [])]
    # tiebreak (ref, author) deterministik — seragam dgn 1-build-cache.py: skor tersimpan
    # sudah 4dp, jadi pasase yg skornya seri TAK BOLEH diurut by urutan list (non-determ);
    # kalau seri, ref lalu author yg mutusin -> pool top-k stabil & reproducible.
    flat.sort(key=lambda sf: (-float(sf[1].get("score", 0)),
                              sf[1].get("ref_display") or ",".join(sf[1].get("ref", [])),
                              sf[1].get("author", "")))
    out, idx = [], {}
    for s, fr in flat[:k]:
        sid = s.get("sutta_id")
        if sid not in idx:
            idx[sid] = {kk: vv for kk, vv in s.items() if kk != "fragments"}
            idx[sid]["fragments"] = []
            out.append(idx[sid])
        idx[sid]["fragments"].append(fr)
    return out

def _load_eval_cache(eval_type):
    paths = get_eval_paths(eval_type)
    cache_file = paths["cache"]
    if cache_file.exists():
        try:
            with open(cache_file, "rb") as f:
                _eval_search_caches[eval_type] = pickle.load(f)
            print(f"[EVAL CACHE {eval_type}] Loaded {len(_eval_search_caches[eval_type])} entries from disk")
        except Exception as e:
            print(f"[EVAL CACHE {eval_type}] Failed to load cache: {e}")
            _eval_search_caches[eval_type] = {}

def _save_eval_cache(eval_type):
    paths = get_eval_paths(eval_type)
    cache_file = paths["cache"]
    try:
        with _eval_cache_lock:
            with open(cache_file, "wb") as f:
                pickle.dump(_eval_search_caches.get(eval_type, {}), f)
    except Exception as e:
        print(f"[EVAL CACHE {eval_type}] Failed to save cache: {e}")

_load_eval_cache(1)


# ── Halaman ──────────────────────────────────────────────────────────────────
@app.route("/")
def root():
    return render_template("eval_gra.html", eval_type=1)

@app.route("/output")
def eval_output_root():
    return render_template("eval_output.html", eval_type=1)

# Alias path /eval/* (legacy / URL yang diketik manual) -> route flat.
@app.route("/eval")
def eval_alias_home():
    return redirect("/")

@app.route("/eval/gra")
def eval_alias_gra():
    return redirect("/")

@app.route("/eval/<int:eval_type>")
def eval_alias_type(eval_type):
    return redirect("/")

@app.route("/<int:eval_type>")
def eval_gra(eval_type):
    return redirect("/")

@app.route("/<int:eval_type>/output")
def eval_output(eval_type):
    return redirect("/output")

# legacy redirects
@app.route("/output/<int:eval_type>")
def eval_output_legacy(eval_type):
    return redirect("/output")


@app.route("/api/eval/<int:eval_type>/output")
def api_eval_output(eval_type):
    paths = get_eval_paths(eval_type)
    queries_path = paths["queries"]
    queries_total = 0
    if queries_path.exists():
        with open(queries_path, "r", encoding="utf-8") as f:
            qs = json.load(f)
        queries_total = len([q for q in qs if q.get("query", "").strip()])

    CORPUS_MAP = {"multi": ["id", "en"], "en": ["en"], "indo": ["id"]}
    corpora_union = set()
    for m in MODEL_VERSI_MAP:
        lm = MODEL_LANGS.get(m, "multi")
        corpora_union.update(CORPUS_MAP.get(lm, ["id"]))
    corpora_union.discard("pli")

    passages_total_by_corpus: dict = {}
    if queries_path.exists():
        with open(queries_path, "r", encoding="utf-8") as qf:
            all_queries = [q for q in json.load(qf) if q.get("query", "").strip()]
        eval_models = list(MODEL_VERSI_MAP.keys())
        _cache = _get_cache(eval_type)
        for q in all_queries:
            for db in sorted(corpora_union):
                models_for_db = [m for m in eval_models if db in CORPUS_MAP.get(MODEL_LANGS.get(m, "multi"), ["id"])]
                refs = set()
                for model in models_for_db:
                    cache_key = (q["query"], model, db, EVAL_TOP_K, EVAL_INCLUDE_TITLES)
                    for sutta in _limit_passages(_cache.get(cache_key), EVAL_PASSAGE_K):
                        for frag in sutta.get("fragments", []):
                            ref = frag.get("ref_display") or ",".join(frag.get("ref", []))
                            if ref:
                                refs.add((ref, frag.get("author", "")))
                passages_total_by_corpus[db] = passages_total_by_corpus.get(db, 0) + len(refs)

    files = sorted(paths["results_dir"].glob("anotasi_*.csv"))
    results = []
    for f in files:
        with open(f, newline="", encoding="utf-8") as fh:
            rows = list(_csv.DictReader(fh))
        if not rows:
            continue
        expert_name = f.stem[len("anotasi_"):].replace("_", " ")

        grade_counts = {"0": 0, "1": 0, "2": 0, "3": 0}
        grade_counts_by_corpus: dict = {}
        for r in rows:
            g = str(r.get("grade", ""))
            db = r.get("db", "")
            if g in grade_counts:
                grade_counts[g] += 1
            if db:
                if db not in grade_counts_by_corpus:
                    grade_counts_by_corpus[db] = {"0": 0, "1": 0, "2": 0, "3": 0}
                if g in grade_counts_by_corpus[db]:
                    grade_counts_by_corpus[db][g] += 1

        versies = sorted({r.get("versi", "") for r in rows if r.get("versi")})
        expert_corpora = [c for c in sorted({r.get("db", "") for r in rows if r.get("db")}) if c in corpora_union]

        progress_by_corpus = {}
        for db in expert_corpora:
            db_rows = [r for r in rows if r.get("db") == db]
            q_done = len({r["query_id"] for r in db_rows})
            graded = len({(r.get("query_id", ""), r.get("ref", ""), r.get("author", "")) for r in db_rows if r.get("ref", "").strip()})
            progress_by_corpus[db] = {
                "queries_done": q_done,
                "queries_total": queries_total,
                "passages_graded": graded,
                "passages_total": passages_total_by_corpus.get(db, 0),
            }

        # Unique passages (dedup by query_id, db, ref, author) — unit eval = pasase.
        all_passages = {(r.get("query_id",""), r.get("db",""), r.get("ref",""), r.get("author",""))
                        for r in rows if r.get("ref","").strip()}
        # In-pool: rank <= EVAL_PASSAGE_K
        passage_min_rank = {}   # passage -> min rank across models
        for r in rows:
            ref = r.get("ref","").strip()
            if not ref:
                continue
            pk = (r.get("query_id",""), r.get("db",""), ref, r.get("author",""))
            try:
                rk = int(r.get("rank") or 9999)
            except (ValueError, TypeError):
                rk = 9999
            passage_min_rank[pk] = min(passage_min_rank.get(pk, 9999), rk)
        in_pool = {pk for pk, rk in passage_min_rank.items() if rk <= EVAL_PASSAGE_K}

        results.append({
            "filename": f.name,
            "expert": expert_name,
            "versi": ", ".join(versies) if versies else "all",
            "total": len(rows),
            "unique_passages": len(all_passages),
            "in_pool_passages": len(in_pool),
            "models": len({r["model"] for r in rows}),
            "corpora": expert_corpora,
            "grade_counts": grade_counts,
            "grade_counts_by_corpus": grade_counts_by_corpus,
            "progress_by_corpus": progress_by_corpus,
        })
    return jsonify(results)


@app.route("/api/eval/<int:eval_type>/output/rows/<filename>")
def api_eval_output_rows(eval_type, filename):
    paths = get_eval_paths(eval_type)
    if not filename.startswith("anotasi_") or not filename.endswith(".csv"):
        return jsonify({"error": "Invalid filename"}), 400
    path = paths["results_dir"] / filename
    if not path.exists():
        return jsonify({"error": "Not found"}), 404
    with open(path, newline="", encoding="utf-8") as fh:
        rows = list(_csv.DictReader(fh))
    return jsonify(rows)


@app.route("/api/eval/<int:eval_type>/experts")
def api_eval_experts(eval_type):
    path = get_eval_paths(eval_type)["experts"]
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return jsonify(_norm_experts(json.load(f)))
    return jsonify([])


@app.route("/api/eval/<int:eval_type>/experts/add", methods=["POST"])
def api_eval_experts_add(eval_type):
    body = request.get_json(force=True)
    name = (body.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Nama kosong"}), 400
    corpora = [c for c in ALL_CORPORA if c in (body.get("corpora") or [])] or list(ALL_CORPORA)
    path = get_eval_paths(eval_type)["experts"]
    experts = []
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            experts = _norm_experts(json.load(f))
    if not any(e["name"] == name for e in experts):
        experts.append({"name": name, "corpora": corpora})
        with open(path, "w", encoding="utf-8") as f:
            json.dump(experts, f, ensure_ascii=False, indent=2)
    return jsonify({"ok": True, "name": name})


@app.route("/api/eval/<int:eval_type>/queries")
def api_eval_queries(eval_type):
    path = get_eval_paths(eval_type)["queries"]
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return jsonify(json.load(f))
    return jsonify([])


@app.route("/api/eval/<int:eval_type>/models")
def api_eval_models(eval_type):
    return jsonify({"models": list(MODEL_VERSI_MAP.keys())})

@app.route("/api/model-langs")
def api_model_langs():
    return jsonify(MODEL_LANGS)


@app.route("/api/eval/<int:eval_type>/run", methods=["POST"])
def api_eval_run(eval_type):
    """Serve hasil top-5 dari cache. CACHE-ONLY: tidak menjalankan search live —
    cache dibangun offline oleh 1-precompute-eval.py."""
    body = request.get_json(force=True)
    query = body.get("query", "").strip()
    model_name = body.get("model", ALL_MODELS[0])
    db_choice = body.get("db", "id")
    top_k = body.get("top_k", EVAL_TOP_K)
    include_titles = body.get("include_titles", EVAL_INCLUDE_TITLES)

    if not query:
        return jsonify({"error": "Query kosong"}), 400

    cache_key = (query, model_name, db_choice, top_k, include_titles)
    _cache = _get_cache(eval_type)
    if cache_key in _cache:
        results = _limit_passages(_cache[cache_key], EVAL_PASSAGE_K)   # unit = top-k pasase
        return jsonify({"results": results, "query": query, "model": model_name, "cached": True})

    return jsonify({
        "error": "Kombinasi belum ada di cache. Jalankan precompute dulu: "
                 "python src/code/5-eval/1-build-cache.py",
        "query": query, "model": model_name, "cached": False,
    }), 404


@app.route("/api/eval/<int:eval_type>/submit", methods=["POST"])
def api_eval_submit(eval_type):
    """Save a batch of expert grades to CSV (dedup per kandidat, grade terbaru menang)."""
    paths = get_eval_paths(eval_type)
    body = request.get_json(force=True)
    expert = body.get("expert", "unknown")
    entries = body.get("entries", [])
    if not entries:
        return jsonify({"error": "No entries"}), 400

    safe_expert = re.sub(r'[^\w\-]', '_', expert)
    filename = paths["results_dir"] / f"anotasi_{safe_expert}.csv"

    COLS = ["query_id", "query", "model", "versi", "db", "rank",
            "sutta_id", "ref", "author", "retrieved_text", "cosine_sim", "grade"]
    # KEY = identitas pasase per-model, BUKAN posisinya. author masuk krn ref tak unik
    # lintas penerjemah ((ref,author) yg bedain pasase). rank & versi SENGAJA di luar KEY:
    # rank = atribut volatil dari cache (rebuild bisa geser rank) dan versi cuma turunan
    # model. Kalau rank ikut KEY, rebuild cache -> rank beda -> baris lama jadi "ghost"
    # duplikat alih2 ke-update di tempat. Di luar KEY -> re-grade meng-update baris yg sama.
    KEY = ("query_id", "model", "db", "ref", "author")

    rows = {}
    if filename.exists():
        with open(filename, newline="", encoding="utf-8") as f:
            for r in _csv.DictReader(f):
                rows[tuple(str(r.get(k, "")) for k in KEY)] = {c: r.get(c, "") for c in COLS}

    for e in entries:
        model = e.get("model", "")
        model_display = Path(model).name if "\\" in model else model
        row = {
            "query_id": e.get("query_id", ""), "query": e.get("query", ""),
            "model": model_display, "versi": MODEL_VERSI_MAP.get(model, "unknown"),
            "db": e.get("db", ""), "rank": e.get("rank", ""),
            "sutta_id": e.get("sutta_id", ""), "ref": e.get("ref", ""),
            "author": e.get("author", ""),
            "retrieved_text": e.get("retrieved_text", ""),
            "cosine_sim": e.get("cosine_sim", ""), "grade": e.get("grade", ""),
        }
        rows[tuple(str(row[k]) for k in KEY)] = row

    # tulis ATOMIK: temp file -> rename. Autosave nulis ulang seluruh CSV; tanpa ini
    # pembaca (hlm output) bisa nangkep file ter-truncate sesaat -> pakar "hilang".
    tmp = filename.with_name(filename.name + ".tmp")
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        writer = _csv.DictWriter(f, fieldnames=COLS)
        writer.writeheader()
        for r in rows.values():
            writer.writerow({c: r.get(c, "") for c in COLS})
    tmp.replace(filename)   # atomic rename (same dir) — pembaca lihat file lama/baru utuh

    return jsonify({"ok": True, "file": filename.name, "rows": len(rows)})


@app.route("/api/eval/<int:eval_type>/summary")
def api_eval_summary(eval_type):
    """Matrix pakar × kueri — centang per kueri selesai + progress parsial."""
    paths = get_eval_paths(eval_type)
    experts_path = paths["experts"]
    queries_path = paths["queries"]

    experts = []
    if experts_path.exists():
        with open(experts_path, "r", encoding="utf-8") as f:
            experts = _norm_experts(json.load(f))
    expert_names = [e["name"] for e in experts]

    queries = []
    if queries_path.exists():
        with open(queries_path, "r", encoding="utf-8") as f:
            queries = [q for q in json.load(f) if q.get("query", "").strip()]

    matrix = {}
    partial = {}        # graded IN-POOL (pasase dgn rank<=EVAL_PASSAGE_K) per step
    partial_excl = {}   # graded DI LUAR pool (semua rank-nya >EVAL_PASSAGE_K) per step
    for name in expert_names:
        safe_expert = re.sub(r'[^\w\-]', '_', name)
        completion_file = paths["results_dir"] / f"completed_{safe_expert}.json"
        completed = []
        if completion_file.exists():
            with open(completion_file, "r", encoding="utf-8") as f:
                completed = json.load(f)
        matrix[name] = completed

        filename = paths["results_dir"] / f"anotasi_{safe_expert}.csv"
        # min-rank per pasase (ref,author) -> in-pool kalau rank terbaiknya <=K.
        step_minrank = {}   # key -> {(ref,author): min_rank}
        if filename.exists():
            with open(filename, "r", encoding="utf-8") as f:
                for row in _csv.DictReader(f):
                    qid = row.get("query_id", "").strip()
                    db = row.get("db", "").strip()
                    ref = row.get("ref", "").strip()
                    if not (qid and db and ref):
                        continue
                    try:
                        rk = int(row.get("rank") or 9999)
                    except (ValueError, TypeError):
                        rk = 9999
                    key = f"{qid}_{db}"
                    pa = (ref, row.get("author", "").strip())
                    d = step_minrank.setdefault(key, {})
                    d[pa] = min(d.get(pa, 9999), rk)
        partial[name]      = {k: sum(1 for r in d.values() if r <= EVAL_PASSAGE_K) for k, d in step_minrank.items()}
        partial_excl[name] = {k: sum(1 for r in d.values() if r >  EVAL_PASSAGE_K) for k, d in step_minrank.items()}

    CORPUS_MAP_EVAL = {"multi": ["id", "en"], "en": ["en"], "indo": ["id"]}
    eval_models = list(MODEL_VERSI_MAP.keys())
    _cache = _get_cache(eval_type)
    step_totals = {}
    for q in queries:
        for db in ["id", "en"]:
            models_for_db = [m for m in eval_models if db in CORPUS_MAP_EVAL.get(MODEL_LANGS.get(m, "multi"), ["id"])]
            refs = set()
            for model in models_for_db:
                cache_key = (q["query"], model, db, EVAL_TOP_K, EVAL_INCLUDE_TITLES)
                for sutta in _limit_passages(_cache.get(cache_key), EVAL_PASSAGE_K):
                    for frag in sutta.get("fragments", []):
                        ref = frag.get("ref_display") or ",".join(frag.get("ref", []))
                        if ref:
                            refs.add((ref, frag.get("author", "")))
            if refs:
                step_totals[f"{q['id']}_{db}"] = len(refs)

    return jsonify({"experts": expert_names, "queries": queries, "matrix": matrix,
                    "partial": partial, "partial_excl": partial_excl, "step_totals": step_totals})


@app.route("/api/eval/<int:eval_type>/config/<string:kind>", methods=["GET", "POST"])
def api_eval_config(eval_type, kind):
    paths = get_eval_paths(eval_type)
    file_map = {
        "queries": paths["queries"],
        "experts": paths["experts"],
    }
    if kind not in file_map:
        return jsonify({"error": "Unknown config"}), 404
    path = file_map[kind]
    if request.method == "GET":
        if not path.exists():
            return jsonify([])
        with open(path, "r", encoding="utf-8") as f:
            return jsonify(json.load(f))
    body = request.get_json(force=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(body, f, ensure_ascii=False, indent=2)
    return jsonify({"ok": True})


@app.route("/api/eval/<int:eval_type>/expert_status")
def api_eval_expert_status(eval_type):
    paths = get_eval_paths(eval_type)
    path = paths["experts"]
    if not path.exists():
        return jsonify({})
    with open(path, "r", encoding="utf-8") as f:
        experts = _norm_experts(json.load(f))
    result = {}
    for name in (e["name"] for e in experts):
        safe_expert = re.sub(r'[^\w\-]', '_', name)
        filename = paths["results_dir"] / f"anotasi_{safe_expert}.csv"
        per_corpus = {"id": set(), "en": set()}
        if filename.exists():
            with open(filename, "r", encoding="utf-8") as f:
                for row in _csv.DictReader(f):
                    db = row.get("db", "")
                    qid = row.get("query_id", "")
                    if db in per_corpus:
                        per_corpus[db].add(qid)
        result[name] = {db: len(s) for db, s in per_corpus.items()}
    return jsonify(result)


@app.route("/api/eval/<int:eval_type>/grades/<path:expert_name>")
def api_eval_grades(eval_type, expert_name):
    paths = get_eval_paths(eval_type)
    safe_expert = re.sub(r'[^\w\-]', '_', expert_name)
    filename = paths["results_dir"] / f"anotasi_{safe_expert}.csv"
    grades = {}
    if filename.exists():
        with open(filename, "r", encoding="utf-8") as f:
            for row in _csv.DictReader(f):
                key = f"{row.get('query_id', '')}_{row.get('db', '')}"
                ref = row.get("ref", "").strip()
                author = row.get("author", "").strip()
                grade = row.get("grade", "")
                if ref and grade != "":
                    try:
                        # kunci = ref␟author (samakan dgn passageKey di eval_gra.js)
                        grades.setdefault(key, {})[f"{ref}␟{author}"] = int(grade)
                    except ValueError:
                        pass
    return jsonify({"grades": grades})


@app.route("/api/eval/<int:eval_type>/progress/<path:expert_name>")
def api_eval_progress(eval_type, expert_name):
    paths = get_eval_paths(eval_type)
    safe_expert = re.sub(r'[^\w\-]', '_', expert_name)
    completion_file = paths["results_dir"] / f"completed_{safe_expert}.json"
    completed = []
    if completion_file.exists():
        with open(completion_file, "r", encoding="utf-8") as f:
            completed = json.load(f)
    return jsonify({"completed": completed})


@app.route("/api/eval/<int:eval_type>/mark_complete", methods=["POST"])
def api_eval_mark_complete(eval_type):
    paths = get_eval_paths(eval_type)
    body = request.get_json(force=True)
    expert = body.get("expert", "")
    step_key = body.get("step_key", "")
    if not expert or not step_key:
        return jsonify({"error": "Missing expert or step_key"}), 400
    safe_expert = re.sub(r'[^\w\-]', '_', expert)
    completion_file = paths["results_dir"] / f"completed_{safe_expert}.json"
    completed = []
    if completion_file.exists():
        with open(completion_file, "r", encoding="utf-8") as f:
            completed = json.load(f)
    if step_key not in completed:
        completed.append(step_key)
        tmp = completion_file.with_name(completion_file.name + ".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(completed, f, ensure_ascii=False)
        tmp.replace(completion_file)   # atomic
    return jsonify({"ok": True})


@app.route("/api/eval/<int:eval_type>/heartbeat", methods=["POST"])
def api_eval_heartbeat(eval_type):
    body = request.get_json(force=True)
    expert = body.get("expert", "")
    if not expert:
        return jsonify({"error": "Missing expert"}), 400
    _eval_heartbeats[expert] = {"ts": time.time(), "step": body.get("step", "")}
    return jsonify({"ok": True})


@app.route("/api/eval/<int:eval_type>/online")
def api_eval_online(eval_type):
    now = time.time()
    online = {}
    for expert, info in list(_eval_heartbeats.items()):
        if now - info["ts"] < 60:
            online[expert] = {"step": info.get("step", "")}
    return jsonify(online)


if __name__ == "__main__":
    print("[Web EVAL] Server starting (cache-only, no engine)...")
    print(f"  EVAL_DIR  : {EVAL_DIR}")
    print(f"  Cache     : {sum(len(c) for c in _eval_search_caches.values())} entries across all evals")
    print(f"  Web (own) : {APP_DIR}/(templates,static)")
    # bind localhost: diakses via Cloudflare Tunnel (service: localhost:5001) saja.
    # 127.0.0.1 nutup akses LAN langsung — lindungi data grade pakar dari sabotase.
    app.run(host="0.0.0.0", port=5001, debug=False)
