"""
5-embed.py — Encode korpus web per (model, bahasa) -> embeddings cache (Makna/semantic) untuk model eksperimen (reeval).

Sumber korpus: 3-praproses (via _corpus). Model: base (REGISTRY) + GPL (models/gpl-*).
Bahasa: id, en, pli. Incremental (skip yang sudah ada; --force untuk timpa).
Output: output/embeddings/web/embed_<lang>_<model>.pt + meta_<lang>_<model>.pkl
"""

import os
os.environ["HF_HUB_TRUST_REMOTE_CODE"] = "1"

import sys
import gc
import pickle
import argparse
from pathlib import Path

import torch

_SRC = next(p / "src" for p in Path(__file__).resolve().parents if (p / "src" / "config.py").exists())
sys.path.insert(0, str(_SRC))
import config                                                  # noqa: E402
sys.path.insert(0, str(_SRC.parent / "web"))
from _corpus import load_corpus                                # noqa: E402

# Override MODELS_DIR agar menunjuk ke folder retraining
config.MODELS_DIR = config.OUTPUT_DIR / "7-retraining" / "models"

OUT   = config.EMBEDDINGS_DIR / "web"
LANGS = ("id", "en", "pli")


def _prefixer(name):
    return (lambda x: f"passage: {x}") if "e5" in name.lower() else (lambda x: x)


def _models(arg_model):
    if arg_model:
        # Jika arg_model berupa path relatif/lokal, cari foldernya
        short_name = Path(arg_model).name
        # Jika itu nama di MODELS_DIR, jadikan path absolut
        if (config.MODELS_DIR / short_name).exists():
            return [(str(config.MODELS_DIR / short_name), short_name)]
        return [(arg_model, short_name)]
        
    items = [(e["name"], e["name"].split("/")[-1]) for e in config.REGISTRY]   # base
    if config.MODELS_DIR.exists():
        for d in sorted(config.MODELS_DIR.iterdir()):
            if d.is_dir() and (d / "config.json").exists() and d.name.startswith("gpl-"):
                items.append((str(d), d.name))                                 # GPL
    return items


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model")
    ap.add_argument("--lang", choices=LANGS)
    ap.add_argument("--force", action="store_true", help="timpa cache yang ada")
    a = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    langs = [a.lang] if a.lang else LANGS

    for name, clean in _models(a.model):
        pref, model = _prefixer(name), None
        for lang in langs:
            emb_p  = OUT / f"embed_{lang}_{clean}.pt"
            meta_p = OUT / f"meta_{lang}_{clean}.pkl"
            if emb_p.exists() and meta_p.exists() and not a.force:
                print(f"  [skip] {clean}/{lang} (sudah ada)")
                continue
            corpus = load_corpus(lang)
            if not corpus:
                print(f"  [empty] {clean}/{lang} (korpus kosong)")
                continue
            if model is None:
                print(f"[load] {clean} dari {name}")
                model = config.load_st_model(name)
            print(f"  [{clean}/{lang}] encode {len(corpus):,} chunk ...")
            emb = model.encode([pref(c["text"]) for c in corpus], batch_size=64,
                               convert_to_tensor=True, show_progress_bar=True,
                               normalize_embeddings=True)
            torch.save(emb.float().cpu(), emb_p)
            with open(meta_p, "wb") as f:
                pickle.dump(corpus, f)
            print(f"    -> {emb_p.name} ({len(corpus):,} chunk)")
        if model is not None:
            del model
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
    print("Selesai.")


if __name__ == "__main__":
    main()
