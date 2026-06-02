#!/usr/bin/env bash
# Evaluasi: intrinsik (dev) + metrik ekstrinsik pakar.
# Metrik ekstrinsik (nDCG/precision/spearman/IAA) butuh CSV anotasi dari web —
# skripnya skip otomatis kalau belum ada. (1-precompute menyusul bareng web.)
#   bash src/code/5-eval/run.sh 2>&1 | tee eval.log
set -euo pipefail
cd "$(dirname "$0")"
PY="${PY:-python3}"

echo "[eval 1/5] intrinsik (gap cosine) ...";  "$PY" 2-intrinsic.py
echo "[eval 2/5] nDCG@10 ...";                 "$PY" 3-ndcg.py
echo "[eval 3/5] P@10 + MRR ...";              "$PY" 4-precision.py
echo "[eval 4/5] Spearman ...";                "$PY" 5-spearman.py
echo "[eval 5/5] IAA ...";                     "$PY" 6-iaa.py
echo "[eval] SELESAI."
