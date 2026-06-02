"""
1-query-gen.py -- GPL langkah 1: generate kueri sintetis per pasase (mT5 doc2query).

Input : 3-praproses (pasase Sutta en+id) | Output: 4-training/gpl/queries.jsonl
Usage : python src/code/4-training/1-query-gen.py
Butuh : GPU (disarankan). Komponen: config.GPL_QUERY_GEN.
"""

import os
os.environ["HF_HUB_TRUST_REMOTE_CODE"] = "1"

import sys
from pathlib import Path

import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

sys.path.insert(0, str(Path(__file__).resolve().parent))                                # _gpl (sedir)
_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402
import _gpl                                                    # noqa: E402

BATCH = 32


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="SMOKE TEST: batasi N pasase (0=semua)")
    args = ap.parse_args()

    passages = _gpl.build_passages()
    print(f"[query-gen] pasase Sutta ({'+'.join(config.GPL_TRAIN_LANGS)}): {len(passages):,}")
    if not passages:
        print("Kosong. Jalankan 3-praproses/1-chunk.py dulu.")
        return
    if args.limit:
        passages = passages[:args.limit]
        print(f"[SMOKE] dibatasi -> {len(passages)} pasase")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    tok = AutoTokenizer.from_pretrained(config.GPL_QUERY_GEN)
    model = AutoModelForSeq2SeqLM.from_pretrained(config.GPL_QUERY_GEN).to(device).eval()
    torch.manual_seed(config.GPL_SEED)

    n = config.GPL_QUERIES_PER_PASSAGE
    out = []
    for i in range(0, len(passages), BATCH):
        batch = passages[i:i + BATCH]
        enc = tok([p["text"] for p in batch], truncation=True, max_length=config.GPL_MAX_SEQ,
                  padding=True, return_tensors="pt").to(device)
        with torch.no_grad():
            gen = model.generate(**enc, max_length=64, do_sample=True, top_k=10,
                                  num_return_sequences=n)
        dec = tok.batch_decode(gen, skip_special_tokens=True)
        for j, p in enumerate(batch):
            for q in dec[j * n:(j + 1) * n]:
                q = q.strip()
                if q:
                    out.append({"query": q, "pid": p["pid"]})
        if (i // BATCH) % 20 == 0:
            print(f"  {i + len(batch):,}/{len(passages):,} pasase ...")

    _gpl.write_jsonl(_gpl.QUERIES, out)
    print(f"[done] {len(out):,} kueri -> {_gpl.QUERIES}")


if __name__ == "__main__":
    main()
