"""
2-hard-neg.py — GPL langkah 2: hard-negative mining (dense retriever).

Untuk tiap (query, pos) ambil negatif dari top-K retrieval (lewati top-1 = hindari
false negative/paraphrase pos). Input: queries.jsonl + passages | Output: triples.jsonl
Usage: python src/code/4-training/2-hard-neg.py   (retriever: config.GPL_RETRIEVER)
"""

import os
os.environ["HF_HUB_TRUST_REMOTE_CODE"] = "1"

import sys
import random
from pathlib import Path

import torch
from sentence_transformers import util

sys.path.insert(0, str(Path(__file__).resolve().parent))     # _gpl lokal (honor GPL_EXP_DIR, sedir)
_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402
import _gpl                                                    # noqa: E402


def main():
    passages = _gpl.load_passages()
    pid2text = {p["pid"]: p["text"] for p in passages}
    queries = _gpl.load_queries(valid_pids=set(pid2text))        # sinkron dgn passage bersih (min-words)
    if not queries:
        print("queries.jsonl kosong/terfilter habis. Jalankan 1-query-gen.py dulu.")
        return
    rn = config.GPL_RETRIEVER
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = config.load_st_model(rn, device=device)
    random.seed(config.GPL_SEED)

    # LANGUAGE-CONSISTENT: negatif kueri bahasa-L hanya dari korpus bahasa-L.
    # Cegah false-negative terjemahan (en<->id) yang merusak alignment cross-lingual;
    # md# juga tak align antar bahasa (lihat gpl/rangkuman.txt).
    pids_by_lang = {}
    for p in passages:
        pids_by_lang.setdefault(p["lang"], []).append(p["pid"])

    out = []
    for lang, lang_pids in pids_by_lang.items():
        lang_q = [q for q in queries if q["pid"].split(":", 1)[0] == lang]
        if not lang_q:
            continue
        print(f"[hard-neg/{lang}] {len(lang_q):,} kueri, {len(lang_pids):,} pasase, retriever={rn}")
        corpus = [_gpl.with_prefix(rn, pid2text[p], "passage") for p in lang_pids]
        emb = model.encode(corpus, batch_size=config.GPL_BATCH_SIZE, convert_to_tensor=True,
                           show_progress_bar=True, normalize_embeddings=True)
        qtexts = [_gpl.with_prefix(rn, q["query"], "query") for q in lang_q]
        qemb = model.encode(qtexts, batch_size=config.GPL_BATCH_SIZE, convert_to_tensor=True,
                            show_progress_bar=True, normalize_embeddings=True)
        hits = util.semantic_search(qemb, emb, top_k=config.GPL_NEG_TOP_K + 1)
        for q, h in zip(lang_q, hits):
            pos = q["pid"]
            pos_key = pos.split(":", 2)[2]                      # base:seg (tanpa lang/author)
            cands = [lang_pids[x["corpus_id"]] for x in h
                     if lang_pids[x["corpus_id"]] != pos
                     and lang_pids[x["corpus_id"]].split(":", 2)[2] != pos_key]   # buang terjemahan-alt segmen sama
            cands = cands[1:] if len(cands) > 1 else cands     # lewati top-1
            if not cands:
                continue
            for neg in random.sample(cands, min(config.GPL_NEGS_PER_QUERY, len(cands))):
                out.append({"query": q["query"], "pos_pid": pos, "neg_pid": neg})

    _gpl.write_jsonl(_gpl.TRIPLES, out)
    print(f"[done] {len(out):,} triple -> {_gpl.TRIPLES}")


if __name__ == "__main__":
    main()
