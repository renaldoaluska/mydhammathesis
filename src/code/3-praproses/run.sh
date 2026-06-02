#!/usr/bin/env bash
# Chunking + karakterisasi hasil (statistik + panjang token).
#   bash src/code/3-praproses/run.sh 2>&1 | tee praproses.log
set -euo pipefail
cd "$(dirname "$0")"
PY="${PY:-python3}"

echo "[praproses 1/4] chunk ...";      "$PY" 1-chunk.py
echo "[praproses 2/4] statistik ...";  "$PY" 2-statistik.py
echo "[praproses 3/4] panjang ...";    "$PY" 3-panjang.py
#echo "[praproses 4/4] spot check ...";    "$PY" 4-spot-check.py
echo "[praproses] SELESAI."
