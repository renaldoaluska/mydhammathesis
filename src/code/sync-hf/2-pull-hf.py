"""
2-pull-hf.py — Download artefak myDhamma dari HF Hub (Hub -> PC lokal).

  --m  model GPL (repo mydhamma-gpl-*)  -> output/4-training/models/gpl-*
  --e  embeddings                        -> output/embeddings/
  --c  search cache                      -> output/5-eval/cache/
  --a  semua

Aman diulang: snapshot_download hanya menarik file yang belum ada.
Base model TIDAK ditarik di sini (pakai 1-get-data/6-get-base-models.py).

Usage: python src/code/sync-hf/2-pull-hf.py --a
"""

import sys
import argparse
from pathlib import Path

from huggingface_hub import login, HfApi, snapshot_download

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402

_PREFIX = config.HF_REPO_PREFIX.split("/")[-1] + "-"           # "mydhamma-"


def ensure_login():
    try:
        HfApi().whoami()
    except Exception:
        print("Belum login HF. Masukkan token:")
        login()


def pull_models():
    print("=== MODEL ===")
    api = HfApi()
    try:
        repos = [r.id for r in api.list_models(author=config.HF_USERNAME, search="mydhamma")]
    except Exception as e:
        print(f"  gagal list model: {e}")
        return
    found = 0
    for repo in sorted(repos):
        name = repo.split("/")[-1]
        if not name.startswith(_PREFIX):
            continue
        folder = name[len(_PREFIX):]                            # gpl-<model>
        if not folder.startswith("gpl"):                        # base model: pakai 6-get-base-models
            continue
        local = config.MODELS_DIR / folder
        local.mkdir(parents=True, exist_ok=True)
        print(f"  > {folder} ...", end=" ", flush=True)
        snapshot_download(repo_id=repo, repo_type="model", local_dir=str(local))
        print("done.")
        found += 1
    if not found:
        print("  Tidak ada model GPL di Hub.")


def pull_dataset(path_in_repo, local_dir, label):
    print(f"=== {label} ===")
    local_dir.mkdir(parents=True, exist_ok=True)
    try:
        snapshot_download(repo_id=config.HF_CACHE_REPO, repo_type="dataset",
                          allow_patterns=f"{path_in_repo}/*", local_dir=str(local_dir.parent))
        print(f"  done -> {local_dir}")
    except Exception as e:
        print(f"  gagal: {e}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--m", action="store_true", help="model GPL")
    ap.add_argument("--e", action="store_true", help="embeddings")
    ap.add_argument("--c", action="store_true", help="search cache")
    ap.add_argument("--a", action="store_true", help="semua")
    a = ap.parse_args()

    if not (a.m or a.e or a.c or a.a):
        print("Pilih: --a (semua) | --m (model) | --e (embeddings) | --c (cache)")
        return
    ensure_login()

    if a.m or a.a:
        pull_models()
    if a.e or a.a:
        pull_dataset("embeddings", config.EMBEDDINGS_DIR, "EMBEDDINGS")
    if a.c or a.a:
        pull_dataset("cache", config.EVAL_DIR / "cache", "SEARCH CACHE")
    print("\nSelesai.")


if __name__ == "__main__":
    main()
