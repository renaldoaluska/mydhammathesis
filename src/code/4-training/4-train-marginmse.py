"""
4-train-marginmse.py — GPL langkah 4: fine-tune model core dengan MarginMSELoss.

MSE( BE(q,pos) - BE(q,neg), margin ). Memakai SentenceTransformerTrainer
(API ST 5.x, pola sama dgn training dhammakathika) + auto-retry OOM.
Base diambil dari snapshot lokal (output/1-get-data/base-models) via
config.resolve_model — fallback ke HF id kalau belum di-download.

Input : 4-training/gpl/train.jsonl
Output: 4-training/models/gpl-<model>/
Usage : python src/code/4-training/4-train-marginmse.py [--model <hf_id>]
        (tanpa --model: latih semua config.CORE_MODELS)
"""

import os
os.environ["HF_HUB_TRUST_REMOTE_CODE"] = "1"

import sys
import gc
import shutil
import argparse
from pathlib import Path

import torch
from datasets import Dataset
from sentence_transformers import SentenceTransformer
try:                                              # ST 5.4.x (pola dhammakathika, proven)
    from sentence_transformers.sentence_transformer.losses import MarginMSELoss
    from sentence_transformers.sentence_transformer.trainer import SentenceTransformerTrainer
    from sentence_transformers.sentence_transformer.training_args import SentenceTransformerTrainingArguments
except ModuleNotFoundError:                       # ST versi lain: API top-level
    from sentence_transformers import (SentenceTransformerTrainer,
                                       SentenceTransformerTrainingArguments, losses)
    MarginMSELoss = losses.MarginMSELoss

sys.path.insert(0, str(Path(__file__).resolve().parent))                                # _gpl (sedir)
_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402
import _gpl                                                    # noqa: E402

# Auto-retry OOM: effective batch ~ GPL_BATCH_SIZE
BATCH_STEPS = [(config.GPL_BATCH_SIZE, 1), (16, 2), (8, 4), (4, 8), (2, 16)]


def build_dataset(model_name):
    """train.jsonl -> Dataset(query, positive, negative, label=margin). Prefix e5 otomatis."""
    q, pos, neg, lab = [], [], [], []
    for r in _gpl.read_jsonl(_gpl.TRAIN):
        q.append(_gpl.with_prefix(model_name, r["query"], "query"))
        pos.append(_gpl.with_prefix(model_name, r["pos"], "passage"))
        neg.append(_gpl.with_prefix(model_name, r["neg"], "passage"))
        lab.append(float(r["margin"]))
    return Dataset.from_dict({"query": q, "positive": pos, "negative": neg, "label": lab})


def train_one(model_name, max_steps=None):
    steps   = max_steps or config.GPL_STEPS
    short   = model_name.split("/")[-1]
    out_dir = _gpl.MODELS_DIR / f"gpl-{short}"
    tmp_dir = _gpl.MODELS_DIR / f".tmp-{short}"

    if not _gpl.TRAIN.exists():
        print("train.jsonl belum ada. Jalankan 3-pseudo-label.py dulu.")
        return
    dataset = build_dataset(model_name)
    if len(dataset) == 0:
        print("train.jsonl kosong.")
        return
    print(f"[train] {short}: {len(dataset):,} contoh, max_steps={steps} -> {out_dir}")

    for batch_size, grad_accum in BATCH_STEPS:
        model = trainer = loss = None
        try:
            model = SentenceTransformer(config.resolve_model(model_name), trust_remote_code=True)
            model.max_seq_length = config.GPL_MAX_SEQ
            loss = MarginMSELoss(model)

            # gradient checkpointing kalau didukung arsitektur (e5/gte XLM-R: ya)
            use_grad_ckpt = True
            try:
                if not model[0].auto_model.supports_gradient_checkpointing:
                    use_grad_ckpt = False
            except (AttributeError, IndexError):
                use_grad_ckpt = False

            args = SentenceTransformerTrainingArguments(
                output_dir=str(tmp_dir),
                max_steps=steps,
                learning_rate=1e-5,
                warmup_ratio=0.1,
                weight_decay=0.01,
                save_strategy="no",
                logging_steps=100,
                report_to="none",
                per_device_train_batch_size=batch_size,
                gradient_accumulation_steps=grad_accum,
                fp16=False, bf16=True, tf32=True,
                optim="adamw_8bit",
                gradient_checkpointing=use_grad_ckpt,
                dataloader_num_workers=4,
                seed=config.GPL_SEED,
            )

            print(f"  -> batch={batch_size}, grad_accum={grad_accum} (eff={batch_size * grad_accum})")
            trainer = SentenceTransformerTrainer(model=model, args=args, train_dataset=dataset, loss=loss)
            trainer.train()

            out_dir.mkdir(parents=True, exist_ok=True)
            model.save_pretrained(str(out_dir))
            shutil.rmtree(tmp_dir, ignore_errors=True)
            print(f"  [done] -> {out_dir}")
            return

        except RuntimeError as e:
            if "out of memory" in str(e).lower():
                print(f"  OOM batch={batch_size}, retry lebih kecil ...")
            else:
                print(f"  ERROR: {e}")
                return
        except Exception as e:
            print(f"  ERROR: {e}")
            return
        finally:
            del model, loss, trainer
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", help="HF id; default: semua CORE_MODELS")
    ap.add_argument("--max-steps", type=int, default=0, help="override GPL_STEPS (smoke test)")
    args = ap.parse_args()
    steps = args.max_steps or None
    for m in ([args.model] if args.model else config.CORE_MODELS):
        train_one(m, max_steps=steps)


if __name__ == "__main__":
    main()
