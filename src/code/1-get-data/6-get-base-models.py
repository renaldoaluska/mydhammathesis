"""
6-get-base-models.py — Snapshot base model (REGISTRY) ke lokal + pin revisi,
untuk reproducibility & eval offline.

Default base di-load by-name dari HF hub (bisa berubah/dihapus → tidak reproducible).
Skrip ini membekukan salinan lokal tiap base ke base-models/<clean_name>/ dan
mencatat commit hash ke base-models/revisions.json. Setelah itu loader otomatis
pakai salinan lokal lewat config.resolve_model().

Usage:
    python src/code/1-get-data/6-get-base-models.py           # semua base di REGISTRY
    python src/code/1-get-data/6-get-base-models.py --force   # re-download walau ada
"""

import sys
import json
import argparse
from pathlib import Path

from huggingface_hub import snapshot_download, HfApi

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402

REVISIONS_FILE = config.BASE_MODELS_DIR / "revisions.json"


def load_revisions() -> dict:
    if REVISIONS_FILE.exists():
        try:
            return json.loads(REVISIONS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-download walau folder sudah ada")
    args = ap.parse_args()

    config.BASE_MODELS_DIR.mkdir(parents=True, exist_ok=True)
    revisions = load_revisions()
    api = HfApi()

    print(f"=== GET BASE MODELS -> {config.BASE_MODELS_DIR} ===\n")
    for entry in config.REGISTRY:
        repo_id    = entry["name"]
        clean_name = repo_id.split("/")[-1]
        local_dir  = config.BASE_MODELS_DIR / clean_name

        revision = revisions.get(repo_id)
        if revision is None:
            try:
                revision = api.model_info(repo_id).sha
            except Exception as e:
                print(f"  [WARN] gagal resolve commit {repo_id}: {e} — pakai 'main'")
                revision = "main"

        if (local_dir / "config.json").exists() and not args.force:
            print(f"  [skip] {clean_name} (sudah ada @ {str(revision)[:8]})")
            revisions[repo_id] = revision
            continue

        print(f"  > {clean_name} @ {str(revision)[:8]} ...", end=" ", flush=True)
        try:
            snapshot_download(repo_id=repo_id, revision=revision, local_dir=str(local_dir))
            revisions[repo_id] = revision
            print("OK")
        except Exception as e:
            print(f"GAGAL: {e}")

    REVISIONS_FILE.write_text(json.dumps(revisions, indent=2), encoding="utf-8")
    print(f"\n[pin] revisi tersimpan -> {REVISIONS_FILE}")
    print(f"[done] {len(revisions)} base model tercatat")


if __name__ == "__main__":
    main()
