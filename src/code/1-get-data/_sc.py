"""
_sc.py — Helper git sparse-checkout dari repo sc-data SuttaCentral.

Dipakai semua skrip 1-get-data/* agar boilerplate clone/checkout TIDAK diduplikasi
(satu tempat, bukan 5x). Butuh git terinstall.
"""

import os
import stat
import shutil
import subprocess
import sys
from pathlib import Path

REPO_URL = "https://github.com/suttacentral/sc-data.git"


def _remove_readonly(func, path, _exc):
    os.chmod(path, stat.S_IWRITE)
    func(path)


def _run(cmd, cwd=None):
    print(f"  $ {' '.join(cmd)}")
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  ERROR: {r.stderr.strip()}")
        sys.exit(1)
    if r.stdout.strip():
        print(f"  {r.stdout.strip()}")


def check_git():
    try:
        subprocess.run(["git", "--version"], capture_output=True, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("ERROR: git tidak ditemukan. Install dulu: https://git-scm.com/")
        sys.exit(1)


def sparse_checkout(sparse_paths, tmp_dir):
    """Clone sparse sc-data lalu checkout `sparse_paths` ke `tmp_dir`.
    Return Path(tmp_dir). Caller WAJIB panggil cleanup(tmp_dir) setelah menyalin."""
    tmp_dir = Path(tmp_dir)
    check_git()
    if tmp_dir.exists():
        print(f"Membersihkan temp lama: {tmp_dir}")
        shutil.rmtree(tmp_dir, onerror=_remove_readonly)
    print("\n1. Clone sparse (metadata saja, bukan ~2GB repo)...")
    _run(["git", "clone", "--filter=blob:none", "--sparse", "--depth", "1",
          REPO_URL, str(tmp_dir)])
    print(f"\n2. Set sparse-checkout: {', '.join(sparse_paths)}")
    _run(["git", "sparse-checkout", "set", *sparse_paths], cwd=tmp_dir)
    return tmp_dir


def cleanup(tmp_dir):
    shutil.rmtree(Path(tmp_dir), onerror=_remove_readonly)


def copy_tree(src_dir, dst_dir, pattern="*.json", keep=None):
    """Salin file `pattern` dari src_dir ke dst_dir (mirror struktur asli).

    keep: fungsi(base_name)->bool untuk filter file (mis. hanya ID kanon Pali).
          base_name = nama file sebelum '_' (skema sc-data: 'dn1_translation-...').
    Return jumlah file tersalin.
    """
    src_dir, dst_dir = Path(src_dir), Path(dst_dir)
    if not src_dir.exists():
        print(f"  WARNING: tidak ditemukan, skip: {src_dir}")
        return 0
    dst_dir.mkdir(parents=True, exist_ok=True)
    n = 0
    for f in src_dir.rglob(pattern):
        if keep is not None and not keep(f.name.split('_')[0]):
            continue
        out = dst_dir / f.relative_to(src_dir)
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, out)
        n += 1
    return n


def copy_file(src, dst):
    """Salin satu file (mkdir parent otomatis). Return 1 kalau sukses, 0 kalau tak ada."""
    src, dst = Path(src), Path(dst)
    if not src.exists():
        print(f"  WARNING: file tidak ada, skip: {src}")
        return 0
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    return 1
