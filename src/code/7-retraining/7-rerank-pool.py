"""
7-rerank-pool.py — Eksperimen 5: two-stage retrieval (base retriever -> cross-encoder rerank).

Beda kelas dari exp0-exp3 (adaptasi bobot retriever): di sini bobot TIDAK disentuh.
Retriever base ambil kandidat top-K passage, lalu bge-reranker-v2-m3 (Chen dkk. 2024)
menyusun ulang dan top-5 masuk pool eval. Lawan banding sah: base (1 variabel: +stage rerank).
Landasan: retrieve-then-rerank standar IR (Nogueira & Cho 2019; RocketQA, Qu dkk. 2021).
Catatan simetri: bge yang sama gagal DIDISTILASI ke student (exp3); exp5 memakainya
LANGSUNG saat inferensi — menguji "pengetahuan bge"-nya sendiri, tanpa perantara distilasi.

Output : pool_<versi>_<label>.csv di output/7-retraining/pool/ (format = 6-build-pool).
         rank  = urutan HASIL RERANK 1..POOL_K (dipakai nDCG/P@5/MRR di 8-reeval).
         cosine_sim = skor cross-encoder (bukan cosine; dipakai Spearman skor-vs-grade).

Pakai:
  python 7-rerank-pool.py --retriever intfloat/multilingual-e5-base
  python 7-rerank-pool.py --retriever Alibaba-NLP/gte-multilingual-base
  CUDA_VISIBLE_DEVICES= python 7-rerank-pool.py ... --limit 2   # smoke CPU tanpa ganggu GPU
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

BUILD_CACHE = _BASE / "code" / "5-eval" / "1-build-cache.py"
POOL_K   = 5                                                   # = EVAL_PASSAGE_K
CE_MODEL = "BAAI/bge-reranker-v2-m3"                           # reranker exp5 (= teacher exp3)
OUT_DIR  = config.OUTPUT_DIR / "7-retraining" / "pool"


def _load_buildcache():
    spec = importlib.util.spec_from_file_location("buildcache", BUILD_CACHE)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--retriever", required=True, help="model base (HF id, mis. intfloat/multilingual-e5-base)")
    ap.add_argument("--label", help="kolom 'model' di CSV (default: nama pendek retriever)")
    ap.add_argument("--versi", default="exp5.0", help="versi eksperimen (default exp5.0)")
    ap.add_argument("--k", type=int, default=100, help="kandidat passage yang di-rerank (default 100)")
    ap.add_argument("--ce", default=CE_MODEL)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--limit", type=int, help="batasi N kueri pertama (smoke test)")
    ap.add_argument("--use-retraining-dir", action="store_true", help="Override config untuk membaca model/vektor dari 7-retraining (wajib untuk exp1-exp4)")
    args = ap.parse_args()
    label = args.label or args.retriever.split("/")[-1]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"pool_{args.versi}_{label.replace('/', '_')}.csv"
    if out.exists():
        print(f"[skip] {out.name} sudah ada. Melewati proses rerank.")
        return

    if args.use_retraining_dir:
        config.MODELS_DIR = config.OUTPUT_DIR / "7-retraining" / "models"
        config.VECTOR_DIR = config.OUTPUT_DIR / "7-retraining" / "vectors"

    from sentence_transformers import CrossEncoder               # import lambat -> di sini
    ce = CrossEncoder(args.ce, max_length=config.GPL_MAX_SEQ, trust_remote_code=True)

    bc = _load_buildcache()
    bc.reader.init()
    bc._build_index()
    search_id = bc._search_model(args.retriever)
    queries = json.loads((config.EVAL_INPUT_DIR / "queries_pakar.json").read_text(encoding="utf-8"))
    if args.limit:
        queries = queries[:args.limit]

    rows = []
    for q in queries:
        qt = q["query"].strip()
        flat = bc.websearch.semantic_search(qt, search_id, "id",
                                            top_k=args.k, include_titles=bc.INCLUDE_TITLES)
        suttas = bc._build_results(flat)
        pairs = [(s, fr) for s in suttas for fr in s.get("fragments", [])]
        texts = [((fr.get("texts") or {}).get("id", "")
                  or fr.get("texts", {}).get(fr.get("db_source", ""), "")) for _, fr in pairs]
        skor = ce.predict([(qt, t) for t in texts], batch_size=args.batch, show_progress_bar=False)
        urut = sorted(zip(pairs, texts, skor), key=lambda x: -float(x[2]))
        for rk, ((s, fr), txt, sc) in enumerate(urut[:POOL_K], start=1):
            rows.append({"query_id": q["id"], "query": qt, "model": label, "versi": args.versi,
                         "db": "id", "rank": rk, "sutta_id": s["sutta_id"],
                         "ref": fr.get("ref_display", ""), "author": fr.get("author", ""),
                         "retrieved_text": txt, "cosine_sim": float(sc), "grade": ""})
        print(f"[Q{q['id']}] {qt[:50]:50s} kandidat={len(pairs)} -> top{POOL_K} CE "
              f"max={max(map(float, skor)):.3f}")

    df = pd.DataFrame(rows)
    df.to_csv(out, index=False, encoding="utf-8-sig")
    print(f"[pool] {len(df)} baris ({df['query_id'].nunique()} kueri x top{POOL_K}) -> {out}")


if __name__ == "__main__":
    main()
