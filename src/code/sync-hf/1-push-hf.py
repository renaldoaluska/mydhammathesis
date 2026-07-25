"""
1-push-hf.py — Upload artefak myDhamma ke HF Hub (server kampus -> Hub).

  --m  model GPL (output/4-training/models/gpl-*)  -> repo model per-model
  --e  embeddings (output/embeddings/)             -> dataset HF (subfolder embeddings/)
  --c  search cache (output/5-eval/search_cache.pkl) -> dataset HF (cache/search_cache.pkl)
  --a  semua
  (tanpa argumen: DRY-RUN, cuma lihat apa yang akan di-push)

Usage: python src/code/sync-hf/1-push-hf.py --a
"""

import sys
import argparse
from pathlib import Path

from huggingface_hub import login, HfApi

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402


def ensure_login():
    try:
        HfApi().whoami()
    except Exception:
        print("Belum login HF. Masukkan token:")
        login()


def collect_models():
    dirs = [
        config.MODELS_DIR,
        config.OUTPUT_DIR / "7-retraining" / "models"
    ]
    models = []
    seen = set()
    for d in dirs:
        if not d.exists():
            continue
        for s in sorted(d.iterdir()):
            if s.is_dir() and (s / "config.json").exists() and not s.name.startswith(".") and s.name not in seen:
                seen.add(s.name)
                models.append((s, s.name))
    return models


def push_models(dry, force=False):
    models = collect_models()
    print(f"=== MODEL ({len(models)} ditemukan) ===")
    api = HfApi()
    for path, name in models:
        repo = config.hf_repo_id(name)
        on = config.is_on_hub(name)
        should_push = force or not on
        status_label = '[push (force)]' if (force and on) else ('[HF ok] skip' if on else '[push]')
        print(f"  {status_label}  {name} -> {repo}")
        if not dry and should_push:
            api.create_repo(repo_id=repo, repo_type="model", private=config.HF_PRIVATE, exist_ok=True)
            api.upload_folder(folder_path=str(path), repo_id=repo, repo_type="model")
            print(f"    done: https://huggingface.co/{repo}")


def push_dataset_dir(local_dir, path_in_repo, label, dry):
    print(f"=== {label} ===")
    if not local_dir.exists():
        print(f"  {local_dir} tidak ada, skip.")
        return
    print(f"  {local_dir} -> {config.HF_CACHE_REPO}/{path_in_repo}/")
    if not dry:
        api = HfApi()
        api.create_repo(repo_id=config.HF_CACHE_REPO, repo_type="dataset",
                        private=config.HF_PRIVATE, exist_ok=True)
        api.upload_folder(folder_path=str(local_dir), path_in_repo=path_in_repo,
                          repo_id=config.HF_CACHE_REPO, repo_type="dataset")
        print(f"    done: https://huggingface.co/datasets/{config.HF_CACHE_REPO}")


def push_dataset_file(local_file, path_in_repo, label, dry):
    print(f"=== {label} ===")
    if not local_file.exists():
        print(f"  {local_file} tidak ada, skip.")
        return
    print(f"  {local_file} -> {config.HF_CACHE_REPO}/{path_in_repo}")
    if not dry:
        api = HfApi()
        api.create_repo(repo_id=config.HF_CACHE_REPO, repo_type="dataset",
                        private=config.HF_PRIVATE, exist_ok=True)
        api.upload_file(path_or_fileobj=str(local_file), path_in_repo=path_in_repo,
                        repo_id=config.HF_CACHE_REPO, repo_type="dataset")
        print(f"    done: https://huggingface.co/datasets/{config.HF_CACHE_REPO}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--m", action="store_true", help="model GPL")
    ap.add_argument("--e", action="store_true", help="embeddings")
    ap.add_argument("--c", action="store_true", help="search cache")
    ap.add_argument("--a", action="store_true", help="semua")
    ap.add_argument("--force", "-f", action="store_true", help="paksa upload ulang meskipun sudah di HF")
    a = ap.parse_args()

    dry = not (a.m or a.e or a.c or a.a)
    if dry:
        print("[DRY-RUN] tambah --a/--m/--e/--c untuk benar-benar upload (opsional --force).\n")
    else:
        ensure_login()

    if a.m or a.a or dry:
        push_models(dry, force=a.force)
    if a.e or a.a or dry:
        push_dataset_dir(config.EMBEDDINGS_DIR, "embeddings", "EMBEDDINGS", dry)
    if a.c or a.a or dry:
        push_dataset_file(config.EVAL_DIR / "search_cache.pkl", "cache/search_cache.pkl", "SEARCH CACHE", dry)
    print("\nSelesai.")


if __name__ == "__main__":
    main()
