#!/usr/bin/env bash
# Analisis korpus PRA-chunk (param model, hierarki, justifikasi chunk).
# Bisa jalan sebelum 3-praproses. (1-parameter butuh base-models.)
#   bash src/code/2-eksplor/run.sh 2>&1 | tee eksplor.log
set -euo pipefail
cd "$(dirname "$0")"
PY="${PY:-python3}"

echo "[eksplor 1/5] parameter ...";       "$PY" 1-parameter.py
echo "[eksplor 2/5] hierarki ...";        "$PY" 2-hierarki.py
echo "[eksplor 3/5] analisis-korpus ...";  "$PY" 3-analisis-korpus.py
echo "[eksplor 4/5] simulasi-chunk ...";    "$PY" 4-simulasi-chunk.py
#echo "[eksplor 5/5] simulasi-lanjutan ..."; "$PY" 5-simulasi-lanjutan.py
echo "[eksplor] SELESAI."
