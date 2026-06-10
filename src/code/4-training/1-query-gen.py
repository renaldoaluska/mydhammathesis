"""
1-query-gen.py -- GPL langkah 1: generate kueri sintetis per pasase (mT5 doc2query).

Input : 3-praproses (pasase Sutta en+id) | Output: 4-training/gpl/queries.jsonl
Usage : python src/code/4-training/1-query-gen.py
Butuh : GPU (disarankan). Komponen: config.GPL_QUERY_GEN.
"""

import os
# NB: HF_HUB_TRUST_REMOTE_CODE sengaja TIDAK di-set; generate() pakai
# num_return_sequences=1 loop agar tidak memicu Group Beam Search deprecated.

import sys
import re
from pathlib import Path

import torch
from tqdm import tqdm
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

sys.path.insert(0, str(Path(__file__).resolve().parent))                                # _gpl (sedir)
_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402
import _gpl                                                    # noqa: E402

BATCH = 8

# Token sampah lintas-skrip dari mT5 (vocab 100+ bahasa) yang nyempil saat sampling:
# buang kueri yang mengandung skrip ASING (Yunani/Sirilik/Ibrani/Arab/Devanagari/Thai/
# CJK/Hiragana-Katakana/Hangul). Latin + diakritik Pali (ā/ṁ/ñ/ṭ) TETAP lolos.
_FOREIGN_SCRIPT = re.compile(
    r"[Ͱ-ϿЀ-ӿ֐-׿؀-ۿ܀-ݏ"
    r"ऀ-ॿ฀-๿぀-ヿ㐀-鿿가-힯]")


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
    n_gen = n * 2          # OVER-GENERATE: filter (skrip-asing/pendek/dedup/verbatim) bisa buang
                           # sebagian; buffer ini cegah pasase berakhir 0 kueri (terutama id).
    n_batches = (len(passages) + BATCH - 1) // BATCH
    print(f"[query-gen] device={device}  n_gen={n_gen}  batches={n_batches:,}  "
          f"(ini agak lama, ~{n_gen} generate call per batch)", flush=True)

    out = []
    pbar = tqdm(range(0, len(passages), BATCH), total=n_batches,
                desc="query-gen", unit="batch", dynamic_ncols=True)
    for i in pbar:
        batch = passages[i:i + BATCH]
        enc = tok([p["text"] for p in batch], truncation=True, max_length=config.GPL_MAX_SEQ,
                  padding=True, return_tensors="pt").to(device)
        with torch.no_grad():
            # Nucleus (top-p) sampling. num_beams=1 WAJIB di transformers >= 5.x agar
            # num_return_sequences > 1 tidak memicu Group Beam Search (deprecated).
            gen = model.generate(**enc, max_length=64, do_sample=True,
                                 top_p=0.92, top_k=0, repetition_penalty=1.2,
                                 no_repeat_ngram_size=2,
                                 num_return_sequences=n_gen, num_beams=1)
        dec = tok.batch_decode(gen, skip_special_tokens=True)
        for j, p in enumerate(batch):
            seen = set()
            ptext = p["text"].lower()
            kept = 0
            for q in dec[j * n_gen:(j + 1) * n_gen]:
                if kept >= n:                    # cukup n kueri BERSIH per pasase
                    break
                q = q.strip()
                ql = q.lower()
                if _FOREIGN_SCRIPT.search(q):    # buang kueri ber-skrip asing (noise mT5)
                    continue
                if len(ql.split()) < 3:          # buang fragmen terlalu pendek
                    continue
                if ql in seen:                   # dedup antar-beam per pasase
                    continue
                if ql in ptext:                  # buang salinan verbatim pasase (bukan kueri asli)
                    continue
                seen.add(ql)
                out.append({"query": q, "pid": p["pid"]})
                kept += 1
        pbar.set_postfix(kueri=f"{len(out):,}", refresh=True)

    pids_with_q = {r["pid"] for r in out}
    zero = len(passages) - len(pids_with_q)
    print(f"[query-gen] pasase >=1 kueri: {len(pids_with_q):,}/{len(passages):,}  "
          f"(0 kueri: {zero:,} = {100*zero/max(len(passages),1):.2f}%)")
    _gpl.write_jsonl(_gpl.QUERIES, out)
    print(f"[done] {len(out):,} kueri -> {_gpl.QUERIES}")


if __name__ == "__main__":
    main()
