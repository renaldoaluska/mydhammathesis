"""
4-train-marginmse.py -- GPL langkah 4: fine-tune model core dengan MarginMSELoss untuk eksperimen retraining (di-reeval).

MSE( BE(q,pos) - BE(q,neg), margin ). Memakai SentenceTransformerTrainer
(API ST 5.x, pola sama dgn training dhammakathika) + auto-retry OOM.
Base diambil dari snapshot lokal (output/1-get-data/base-models) via
config.resolve_model -- fallback ke HF id kalau belum di-download.

Input : 7-retraining/gpl/train.jsonl
Output: 7-retraining/models/gpl-<model>/
"""

import os
os.environ["HF_HUB_TRUST_REMOTE_CODE"] = "1"

import sys
import gc
import shutil
import argparse
from pathlib import Path

import json
import time
import torch
from datasets import Dataset
from transformers import TrainerCallback
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


class _LossLogger(TrainerCallback):
    """Rekam loss training tiap logging_steps -> loss_history.json (utk kurva belajar, standar akademis)."""
    def __init__(self):
        self.history = []
    def on_log(self, args, state, control, logs=None, **kwargs):
        if logs and "loss" in logs:
            self.history.append({"step": state.global_step,
                                 **{k: round(float(logs[k]), 6)
                                    for k in ("loss", "learning_rate", "grad_norm", "epoch") if k in logs}})


def build_dataset(model_name):
    """train.jsonl -> Dataset(query, positive, negative, label=margin). Prefix e5 otomatis."""
    q, pos, neg, lab = [], [], [], []
    for r in _gpl.read_jsonl(_gpl.TRAIN):
        q.append(_gpl.with_prefix(model_name, r["query"], "query"))
        pos.append(_gpl.with_prefix(model_name, r["pos"], "passage"))
        neg.append(_gpl.with_prefix(model_name, r["neg"], "passage"))
        lab.append(float(r["margin"]))
    return Dataset.from_dict({"query": q, "positive": pos, "negative": neg, "label": lab})


def train_one(model_name, max_steps=None, out_name=None):
    steps   = max_steps or config.GPL_STEPS
    short   = out_name or model_name.split("/")[-1]
    out_dir = _gpl.MODELS_DIR / f"gpl-{short}"
    tmp_dir = _gpl.MODELS_DIR / f".tmp-{short}"

    if (out_dir / "train_meta.json").exists():
        print(f"[train] {short} sudah selesai sebelumnya (skip).")
        return

    if not _gpl.TRAIN.exists():
        sys.exit(f"[FATAL] train.jsonl ga ada di {_gpl.TRAIN}. Jalankan 3-pseudo-label.py dulu "
                 f"(cek GPL_EXP_DIR & import _gpl). Stop biar ga lanjut ke 5-embed.")
    dataset = build_dataset(model_name)
    if len(dataset) == 0:
        sys.exit(f"[FATAL] train.jsonl kosong di {_gpl.TRAIN}.")
    print(f"[train] {short}: {len(dataset):,} contoh, max_steps={steps} -> {out_dir}")

    for batch_size, grad_accum in BATCH_STEPS:
        model = trainer = loss = None
        try:
            model = config.load_st_model(model_name)   # +fix buffer RoPE gte (lihat config.load_st_model)
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
                # ASURANSI CRASH (2026-07-16): run panjang (140k langkah ~55 jam) TIDAK BOLEH
                # tanpa checkpoint — crash di jam ke-50 = hangus total. Simpan tiap 10k langkah
                # (~4 jam untuk gte), simpan 2 terakhir saja (disk ~2,4GB). Checkpoint ada di
                # tmp_dir dan otomatis terhapus saat run SUKSES (shutil.rmtree di bawah), jadi
                # tak ada sampah bila lancar. Bila crash: checkpoint terakhir SELAMAT di tmp_dir
                # -> masih bisa dievaluasi, tidak mulai dari nol.
                save_strategy="steps",
                save_steps=10000,
                save_total_limit=2,
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
            losslog = _LossLogger()
            trainer = SentenceTransformerTrainer(model=model, args=args, train_dataset=dataset,
                                                 loss=loss, callbacks=[losslog])
            _t0 = time.time()
            trainer.train()
            _dur = time.time() - _t0

            out_dir.mkdir(parents=True, exist_ok=True)
            model.save_pretrained(str(out_dir))
            (out_dir / "loss_history.json").write_text(
                json.dumps(losslog.history, ensure_ascii=False, indent=2), encoding="utf-8")
            (out_dir / "train_meta.json").write_text(json.dumps({
                "model": model_name, "loss": "MarginMSE", "max_steps": steps,
                "n_examples": len(dataset), "eff_batch": batch_size * grad_accum,
                "batch_size": batch_size, "grad_accum": grad_accum,
                "learning_rate": 1e-5, "warmup_ratio": 0.1, "weight_decay": 0.01,
                "optim": "adamw_8bit", "max_seq_length": config.GPL_MAX_SEQ, "seed": config.GPL_SEED,
                "duration_sec": round(_dur, 1),
                "final_loss": (losslog.history[-1].get("loss") if losslog.history else None),
            }, ensure_ascii=False, indent=2), encoding="utf-8")
            shutil.rmtree(tmp_dir, ignore_errors=True)
            print(f"  [done] -> {out_dir}  ({len(losslog.history)} titik loss + train_meta.json)")
            return

        except RuntimeError as e:
            if "out of memory" in str(e).lower():
                print(f"  OOM batch={batch_size}, retry lebih kecil ...")
            else:
                sys.exit(f"  [FATAL] training {short} error: {e}")
        except Exception as e:
            sys.exit(f"  [FATAL] training {short} error: {e}")
        finally:
            del model, loss, trainer
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

    sys.exit(f"  [FATAL] {short}: semua batch size kehabisan memori (OOM), model ga ke-train.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", help="HF id; default: semua CORE_MODELS")
    ap.add_argument("--max-steps", type=int, default=0, help="override GPL_STEPS (smoke test)")
    ap.add_argument("--out-name", help="override output directory name")
    args = ap.parse_args()
    steps = args.max_steps or None
    for m in ([args.model] if args.model else config.CORE_MODELS):
        train_one(m, max_steps=steps, out_name=args.out_name)


if __name__ == "__main__":
    main()
