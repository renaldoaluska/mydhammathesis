"""
build_pool.py — JEMBATAN retrieval -> pool anotasi (standalone, TAHAP 7).

Menjalankan retrieval satu model (lama/baru) atas 30 kueri pakar, lalu mengekspor
pool dalam format 12-kolom IDENTIK anotasi pakar (query_id,query,model,versi,db,rank,
sutta_id,ref,author,retrieved_text,cosine_sim,grade) — siap dinilai LLM-judge
(8-reeval-llm) untuk reeval. grade dikosongkan (diisi judge).

Aturan pool = top-5 PASSAGE (fragmen by score) per (kueri,model) — unit = (ref,author),
satu sutta boleh nyumbang >1 fragmen. Mirror eval_app._limit_passages (EVAL_PASSAGE_K=5);
rank = rank sutta asal. Retrieval & _build_results di-reuse dari 5-eval/1-build-cache.py
(DRY -> identik dgn pool 6 model lama).

PENTING (anti-sirkular): pool ini cuma WADAH pasase; relevansi diisi judge yang
INDEPENDEN dari sinyal latih eksperimen (lihat 7-retraining/flow_old.txt).

Usage:
  python build_pool.py --model intfloat/multilingual-e5-base --validate   # uji faithful
  python build_pool.py --model gpl-multilingual-e5-base --validate
  python build_pool.py --model gpl-exp1-e5 --label gpl-multilingual-e5-base --versi exp1   # model baru
  # --model = artifact (checkpoint+embed); --label = IDENTITAS base-model di eval (biar
  #   base/gpl/exp1 sefamili & ke-pair di signifikansi); --versi = generasi.
Output: 7-retraining/pool/pool_<versi>_<label>.csv
"""
import argparse
import importlib.util
import json
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
_BASE = next(p for p in HERE.parents if (p / "config.py").exists())   # mydhamma/src
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402
# OVERRIDE CONFIG agar baca dari 7-retraining (Arsitektur Standalone)
config.MODELS_DIR = config.OUTPUT_DIR / "7-retraining" / "models"
config.VECTOR_DIR = config.OUTPUT_DIR / "7-retraining" / "vectors"

BUILD_CACHE = _BASE / "code" / "5-eval" / "1-build-cache.py"
POOL_K  = 5                                                    # = EVAL_PASSAGE_K: top-5 passage/kueri
OUT_DIR = config.OUTPUT_DIR / "7-retraining" / "pool"


def _load_buildcache():
    """Muat 1-build-cache.py sbg modul (nama berawalan digit -> importlib)."""
    spec = importlib.util.spec_from_file_location("buildcache", BUILD_CACHE)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def build(name, label=None, versi=None):
    bc = _load_buildcache()
    bc.reader.init()
    bc._build_index()
    label = label or name
    versi = versi or bc.MODEL_VERSI.get(name, "gpl" if name.startswith("gpl") else "base")
    search_id = bc._search_model(name)
    queries = json.loads((config.EVAL_INPUT_DIR / "queries_pakar.json").read_text(encoding="utf-8"))

    rows = []
    for q in queries:
        qt = q["query"].strip()
        if name == "BM25":
            flat = bc.websearch.keyword_search(qt, "id", top_k=bc.FETCH_CHUNK, include_titles=bc.INCLUDE_TITLES)
        else:
            flat = bc.websearch.semantic_search(qt, search_id, "id",
                                                top_k=bc.FETCH_CHUNK, include_titles=bc.INCLUDE_TITLES)
        suttas = bc._build_results(flat)
        pairs = [(s, fr) for s in suttas for fr in s.get("fragments", [])]   # = eval_app._limit_passages
        pairs.sort(key=lambda sf: -float(sf[1].get("score", 0)))
        for s, fr in pairs[:POOL_K]:
            txt = (fr.get("texts") or {}).get("id", "") or fr.get("texts", {}).get(fr.get("db_source", ""), "")
            rows.append({"query_id": q["id"], "query": qt, "model": label, "versi": versi, "db": "id",
                         "rank": s["rank"], "sutta_id": s["sutta_id"], "ref": fr.get("ref_display", ""),
                         "author": fr.get("author", ""), "retrieved_text": txt,
                         "cosine_sim": fr.get("score", ""), "grade": ""})

    df = pd.DataFrame(rows)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"pool_{versi}_{label.replace('/', '_')}.csv"   # versi biar exp1/exp2 tak tabrakan (label = identitas base-model)
    df.to_csv(out, index=False, encoding="utf-8-sig")
    print(f"[pool] {len(df)} baris ({df['query_id'].nunique()} kueri x top{POOL_K}) -> {out}")
    return df, label


def validate(df, name):
    """Faithful? Bandingkan set (query_id, sutta_id) + cosine vs anotasi beku model sama."""
    template = sorted((config.EVAL_DIR / "anotasi").glob("anotasi_*.csv"))[0]
    a = pd.read_csv(template)
    a = a[a["model"].astype(str) == name]
    if a.empty:
        print(f"[validasi] '{name}' tak ada di anotasi beku (model baru) -> lewati.")
        return
    key = ["query_id", "ref", "author"]                        # unit = passage (bukan sutta)
    new = set(map(tuple, df[key].astype(str).values))
    old = set(map(tuple, a[key].astype(str).values))
    inter = new & old
    print(f"[validasi vs anotasi beku] passage cocok: {len(inter)}/{len(old)} "
          f"({len(inter)/len(old)*100:.0f}%)  | hanya-baru={len(new-old)} hanya-lama={len(old-new)}")
    m = df.merge(a, on=key, suffixes=("_new", "_old"))
    if len(m):
        d = (m["cosine_sim_new"].astype(float) - m["cosine_sim_old"].astype(float)).abs()
        print(f"[validasi cosine] |Δ| max={d.max():.4f} mean={d.mean():.4f} "
              f"(≈0 = retrieval identik dgn pool lama)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, help="nama eval (HF id / gpl-<short> / gpl-<exp>-*)")
    ap.add_argument("--label", help="nilai kolom 'model' di CSV (default = --model)")
    ap.add_argument("--versi", help="label versi (base/gpl/exp1; default: infer)")
    ap.add_argument("--validate", action="store_true", help="bandingkan vs anotasi beku (model lama)")
    args = ap.parse_args()
    df, label = build(args.model, args.label, args.versi)
    if args.validate:
        validate(df, args.label or args.model)


if __name__ == "__main__":
    main()
