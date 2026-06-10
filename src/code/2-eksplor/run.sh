#!/usr/bin/env bash
# Analisis korpus PRA-chunk (param model, hierarki, anomali genre, justifikasi chunk).
# Bisa jalan sebelum 3-praproses. (1-parameter butuh base-models.)
#   bash src/code/2-eksplor/run.sh 2>&1 | tee eksplor.log
set -euo pipefail
cd "$(dirname "$0")"
PY="${PY:-python3}"

echo "[eksplor 1/6] parameter ...";         "$PY" 1-parameter.py
echo "[eksplor 2/6] hierarki ...";          "$PY" 2-hierarki.py
echo "[eksplor 3/6] analisis-korpus ...";   "$PY" 3-analisis-korpus.py
echo "[eksplor 4/6] analisis-lanjutan ...";  "$PY" 4-analisis-lanjutan.py
echo "[eksplor 5/6] simulasi-chunk ...";    "$PY" 5-simulasi-chunk.py
echo "[eksplor 6/6] simulasi-lanjutan (-> chunk_rules.json) ..."; "$PY" 6-simulasi-lanjutan.py
echo "[eksplor] SELESAI (PRA-chunk)."
