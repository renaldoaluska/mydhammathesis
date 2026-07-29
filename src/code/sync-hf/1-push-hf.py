"""
1-push-hf.py — Upload artefak myDhamma ke HF Hub (server kampus -> Hub).

  --m  model GPL (output/4-training/models/gpl-*)  -> repo model per-model
  --e  embeddings (output/embeddings/)             -> dataset HF (subfolder embeddings/)
  --c  search cache (output/5-eval/search_cache.pkl) -> dataset HF (cache/search_cache.pkl)
  --d  data GPL (train.jsonl, ~400MB/eksperimen)   -> dataset HF (gpl-data/<eksperimen>/)
  --a  semua
  (tanpa argumen: DRY-RUN, cuma lihat apa yang akan di-push)

Kenapa train.jsonl di HF, bukan git: >100MB, ditolak GitHub. Sisa jsonl GPL
(queries/triples/passages) tetap di git karena masih muat.

Usage: python src/code/sync-hf/1-push-hf.py --a
"""

import sys
import argparse
from pathlib import Path

from huggingface_hub import login, HfApi

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402


# File data GPL yang ditaruh di HF (bukan git) karena >100MB.
GPL_DATA_FILES = ("train.jsonl",)


def ensure_login():
    try:
        HfApi().whoami()
    except Exception:
        print("Belum login HF. Masukkan token:")
        login()


def collect_gpl_data():
    """Dir data GPL: 4-training/gpl (exp0) + 7-retraining/gpl-exp*. -> [(file, nama_eksperimen)]"""
    dirs = [config.TRAINING_DIR / "gpl"]
    retrain = config.OUTPUT_DIR / "7-retraining"
    if retrain.exists():
        dirs += sorted(d for d in retrain.iterdir() if d.is_dir() and d.name.startswith("gpl-exp"))
    found = []
    for d in dirs:
        for fname in GPL_DATA_FILES:
            f = d / fname
            if f.exists():
                found.append((f, d.name))
    return found


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


def hub_files(path_in_repo):
    """Nama file (relatif thd path_in_repo) yang sudah ada di dataset cache."""
    try:
        prefix = f"{path_in_repo}/"
        return {f[len(prefix):] for f in HfApi().list_repo_files(
            config.HF_CACHE_REPO, repo_type="dataset") if f.startswith(prefix)}
    except Exception:
        return set()                    # repo belum ada -> semua dianggap baru


def push_dataset_dir(local_dir, path_in_repo, label, dry, force=False):
    print(f"=== {label} ===")
    if not local_dir.exists():
        print(f"  {local_dir} tidak ada, skip.")
        return
    print(f"  {local_dir} -> {config.HF_CACHE_REPO}/{path_in_repo}/")
    local = sorted(p for p in local_dir.rglob("*") if p.is_file())
    on = hub_files(path_in_repo)
    todo = [p for p in local if force or p.relative_to(local_dir).as_posix() not in on]
    print(f"  {len(local)} file lokal | {len(local) - len(todo)} sudah di Hub | {len(todo)} akan di-push")
    if dry or not todo:
        return
    api = HfApi()
    api.create_repo(repo_id=config.HF_CACHE_REPO, repo_type="dataset",
                    private=config.HF_PRIVATE, exist_ok=True)
    for p in todo:
        rel = p.relative_to(local_dir).as_posix()
        print(f"  [push] {rel} ({p.stat().st_size / 1048576:.0f} MB)")
        api.upload_file(path_or_fileobj=str(p), path_in_repo=f"{path_in_repo}/{rel}",
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


def push_gpl_data(dry, force=False):
    files = collect_gpl_data()
    print(f"=== DATA GPL ({len(files)} file ditemukan) ===")
    if not files:
        print("  tidak ada train.jsonl, skip.")
        return
    api = HfApi()
    for path, exp in files:
        target = f"gpl-data/{exp}/{path.name}"
        on = not dry and api.file_exists(repo_id=config.HF_CACHE_REPO, filename=target,
                                         repo_type="dataset")
        should_push = force or not on
        status_label = "[push (force)]" if (force and on) else ("[HF ok] skip" if on else "[push]")
        mb = path.stat().st_size / 1048576
        print(f"  {status_label}  {exp}/{path.name} ({mb:.0f} MB) -> {config.HF_CACHE_REPO}/{target}")
        if not dry and should_push:
            api.create_repo(repo_id=config.HF_CACHE_REPO, repo_type="dataset",
                            private=config.HF_PRIVATE, exist_ok=True)
            api.upload_file(path_or_fileobj=str(path), path_in_repo=target,
                            repo_id=config.HF_CACHE_REPO, repo_type="dataset")
            print(f"    done: https://huggingface.co/datasets/{config.HF_CACHE_REPO}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--m", action="store_true", help="model GPL")
    ap.add_argument("--e", action="store_true", help="embeddings")
    ap.add_argument("--c", action="store_true", help="search cache")
    ap.add_argument("--d", action="store_true", help="data GPL (train.jsonl)")
    ap.add_argument("--a", action="store_true", help="semua")
    ap.add_argument("--force", "-f", action="store_true", help="paksa upload ulang meskipun sudah di HF")
    a = ap.parse_args()

    dry = not (a.m or a.e or a.c or a.d or a.a)
    if dry:
        print("[DRY-RUN] tambah --a/--m/--e/--c/--d untuk benar-benar upload (opsional --force).\n")
    else:
        ensure_login()

    if a.m or a.a or dry:
        push_models(dry, force=a.force)
    if a.e or a.a or dry:
        push_dataset_dir(config.EMBEDDINGS_DIR, "embeddings", "EMBEDDINGS", dry, force=a.force)
    if a.c or a.a or dry:
        push_dataset_file(config.EVAL_DIR / "search_cache.pkl", "cache/search_cache.pkl", "SEARCH CACHE", dry)
    if a.d or a.a or dry:
        push_gpl_data(dry, force=a.force)
    print("\nSelesai.")


if __name__ == "__main__":
    main()
