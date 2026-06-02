"""
config.py — SATU sumber kebenaran untuk myDhamma (registry model, path, komponen GPL).

Diletakkan di src/ (bukan src/code/) sebagai ANCHOR: semua skrip menemukan root
dengan menelusuri parent yang memuat config.py, lalu memakai PATH di bawah.
Tambah/ubah model cukup di sini — file lain mengikuti. (NO redundansi.)

Acuan metodologi: ../rencana.txt, ../STRUKTUR.txt
"""

import re
from pathlib import Path

# =============================================================================
# PATH (output mirror code; lihat STRUKTUR.txt)
# =============================================================================
SRC_DIR    = Path(__file__).resolve().parent          # mydhamma/src
OUTPUT_DIR = SRC_DIR / "output"

RAW_DIR         = OUTPUT_DIR / "1-get-data" / "sc-raw"      # korpus mentah SuttaCentral
BASE_MODELS_DIR = OUTPUT_DIR / "1-get-data" / "base-models" # snapshot base model (pin)
EKSPLOR_DIR     = OUTPUT_DIR / "2-eksplor"                  # statistik + analisis
PRAPROSES_DIR   = OUTPUT_DIR / "3-praproses"                # hasil chunk (jsonl)
TRAINING_DIR    = OUTPUT_DIR / "4-training"                 # pipeline GPL (gpl/, models/)
EVAL_DIR        = OUTPUT_DIR / "5-eval"                     # metrik + grade pakar
MODELS_DIR      = TRAINING_DIR / "models"                   # model hasil GPL (gpl-<name>)
EMBEDDINGS_DIR  = OUTPUT_DIR / "embeddings"                 # precompute embedding (web/eval)

# =============================================================================
# REGISTRY MODEL (retrieval-native + baseline; lihat rencana.txt bagian 2)
# =============================================================================
# role        : "core" (di-GPL: base vs GPL-adapted) | "baseline" (encode-only)
# needs_prefix: True untuk keluarga e5 (butuh "query: "/"passage: " saat inferensi)
#
# Catatan: gte-multilingual-base butuh trust_remote_code=True saat di-LOAD
#          (kode tokenizer/model kustom), tapi tidak saat snapshot-download.
REGISTRY = [
    {"name": "intfloat/multilingual-e5-base",       "role": "core",     "needs_prefix": True},   # 278M, retrieval-native (Wang et al. 2024)
    {"name": "Alibaba-NLP/gte-multilingual-base",    "role": "core",     "needs_prefix": False},  # 305M, retrieval-native (Zhang et al. 2024, mGTE)
    {"name": "sentence-transformers/LaBSE",          "role": "baseline", "needs_prefix": False},  # 471M, cross-lingual (Feng et al. 2022)
]

# BM25 = baseline LEKSIKAL/sparse (Robertson & Zaragoza 2009). Bukan model HF →
# tidak di-download, ditangani terpisah di tahap eval/retrieval.

CORE_MODELS     = [m["name"] for m in REGISTRY if m["role"] == "core"]
BASELINE_MODELS = [m["name"] for m in REGISTRY if m["role"] == "baseline"]
NEEDS_PREFIX    = {m["name"]: m["needs_prefix"] for m in REGISTRY}

# =============================================================================
# KOMPONEN GPL (Generative Pseudo-Labeling; lihat rencana.txt bagian 4)
# =============================================================================
# Train EN + ID (PLI tidak di-GPL: tak ada komponen Pali; lihat rencana.txt).
# NOTE: pilihan default; finalisasi menunggu ACC (rencana.txt TODO).
GPL_QUERY_GEN      = "doc2query/msmarco-14langs-mt5-base-v1"        # mT5 doc2query multilingual (id+en)
GPL_CROSS_ENCODER  = "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1"   # cross-encoder MS MARCO multilingual
GPL_QUERIES_PER_PASSAGE = 3
GPL_TRAIN_LANGS    = ("en", "id")
GPL_SEED           = 42
GPL_RETRIEVER      = "intfloat/multilingual-e5-base"   # dense retriever untuk hard-negative mining
GPL_NEGS_PER_QUERY = 1
GPL_NEG_TOP_K      = 50      # ambil negatif dari top-K (lewati top-1 = hindari false negative)
GPL_BATCH_SIZE     = 32      # auto-retry OOM menurunkan ini
GPL_MAX_SEQ        = 384      # >= P99 panjang token chunk (~375; lih. 3-panjang) -> ~99% utuh, hemat
GPL_STEPS          = 10000   # langkah training MarginMSE (tunable; GPL paper 140k)

# =============================================================================
# HF HUB (sync server kampus <-> PC lokal; lihat sync-hf/)
# =============================================================================
HF_USERNAME    = "renaldoaluska"
HF_REPO_PREFIX = f"{HF_USERNAME}/mydhamma"
HF_PRIVATE     = True
HF_CACHE_REPO  = f"{HF_REPO_PREFIX}-cache"   # dataset HF: embeddings + search cache


def hf_repo_id(folder_name: str) -> str:
    """Folder artefak -> repo id HF. Contoh: 'gpl-multilingual-e5-base'
    -> 'renaldoaluska/mydhamma-gpl-multilingual-e5-base'."""
    return f"{HF_REPO_PREFIX}-{folder_name}"


def resolve_model(name: str) -> str:
    """Resolusi nama model -> path loader.

    Kalau ada snapshot base lokal di base-models/<clean_name>, pakai itu
    (reproducible, offline-safe). Selain itu kembalikan `name` apa adanya
    (path model GPL lewat tanpa diubah; base belum di-download fallback ke HF id).
    """
    name = str(name)
    local = BASE_MODELS_DIR / name.split("/")[-1]
    return str(local) if ("/" in name and local.exists()) else name


def is_on_hub(folder_name: str) -> bool:
    """Cek apakah artefak sudah ada di HF Hub (tanpa download)."""
    try:
        from huggingface_hub import HfApi
        HfApi().repo_info(repo_id=hf_repo_id(folder_name), repo_type="model")
        return True
    except Exception:
        return False


# =============================================================================
# CORPUS CLEANING — junk filter (dipakai praproses 3- & eksplor 2-; no redundan)
# =============================================================================
# Buang chunk BODY (heading==0) yang teksnya hanya simbol/angka/satu huruf —
# tanpa konten semantik (mis. "(", "***", "1"). Heading (heading>0) SELALU
# dibiarkan (dikontrol include_titles di web). TANPA min-length: teks suci
# sengaja utuh (bait pendek tidak dipotong).
JUNK_RE = re.compile(r'^(?:[\W_]+|\d+\.?|[a-zA-Z])$', re.UNICODE)


def is_junk_body(text: str, heading: int = 0) -> bool:
    if heading and heading > 0:
        return False
    t = (text or "").strip()
    return True if not t else bool(JUNK_RE.match(t))


# Pitaka: training GPL = Sutta saja (Vinaya/Abhidhamma tetap DI-INDEKS; lihat rencana.txt).
_ABHIDHAMMA = {"ds", "vb", "dt", "pp", "kv", "ya", "patthana"}


def is_sutta(base: str) -> bool:
    """True jika base termasuk Sutta Pitaka (bukan Vinaya/Abhidhamma)."""
    b = (base or "").lower()
    if b.startswith("pli-tv") or b.startswith("pli-vi"):    # Vinaya
        return False
    m = re.match(r"[a-z]+", b)
    if m and m.group(0) in _ABHIDHAMMA:                     # Abhidhamma
        return False
    return True
