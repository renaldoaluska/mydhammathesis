"""
4-train-marginmse.py — GPL langkah 4: fine-tune model core dengan MarginMSELoss.

MSE( BE(q,pos) - BE(q,neg), margin ). Output model GPL-adapted.
Input : train.jsonl | Output: 4-training/models/gpl-<model>/
Usage : python src/code/4-training/4-train-marginmse.py [--model <hf_id>]
        (tanpa --model: latih semua config.CORE_MODELS)
Catatan: auto-retry OOM (batch turun); prefix e5 query/passage ditangani otomatis.
"""

import os
os.environ["HF_HUB_TRUST_REMOTE_CODE"] = "1"

import sys
import argparse
from pathlib import Path

import torch
from torch.utils.data import DataLoader
from sentence_transformers import SentenceTransformer, InputExample, losses

sys.path.insert(0, str(Path(__file__).resolve().parent))
_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402
import _gpl                                                    # noqa: E402

OOM_BATCHES = [config.GPL_BATCH_SIZE, 16, 8, 4, 2]


def load_examples(model_name):
    ex = []
    for r in _gpl.read_jsonl(_gpl.TRAIN):
        ex.append(InputExample(
            texts=[_gpl.with_prefix(model_name, r["query"], "query"),
                   _gpl.with_prefix(model_name, r["pos"], "passage"),
                   _gpl.with_prefix(model_name, r["neg"], "passage")],
            label=float(r["margin"]),
        ))
    return ex


def train_one(model_name):
    short = model_name.split("/")[-1]
    out_dir = _gpl.MODELS_DIR / f"gpl-{short}"
    examples = load_examples(model_name)
    if not examples:
        print("train.jsonl kosong. Jalankan 3-pseudo-label.py dulu.")
        return
    print(f"[train] {short}: {len(examples):,} contoh -> {out_dir}")

    for bs in OOM_BATCHES:
        try:
            model = SentenceTransformer(config.resolve_model(model_name), trust_remote_code=True)
            model.max_seq_length = config.GPL_MAX_SEQ
            loader = DataLoader(examples, shuffle=True, batch_size=bs)
            loss = losses.MarginMSELoss(model)
            epochs = max(1, config.GPL_STEPS // max(1, len(loader)))
            warmup = int(0.1 * len(loader) * epochs)
            model.fit(train_objectives=[(loader, loss)], epochs=epochs,
                      warmup_steps=warmup, use_amp=True, show_progress_bar=True,
                      optimizer_params={"lr": 1e-5})
            out_dir.mkdir(parents=True, exist_ok=True)
            model.save(str(out_dir))
            print(f"[done] batch={bs}, epochs={epochs} -> {out_dir}")
            return
        except RuntimeError as e:
            if "out of memory" in str(e).lower() and bs != OOM_BATCHES[-1]:
                print(f"  [OOM] batch {bs} gagal, turunkan...")
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                continue
            raise


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", help="HF id; default: semua CORE_MODELS")
    args = ap.parse_args()
    for m in ([args.model] if args.model else config.CORE_MODELS):
        train_one(m)


if __name__ == "__main__":
    main()
