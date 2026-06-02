#!/usr/bin/env bash
# Unduh korpus SuttaCentral + base model (tmux-friendly).
#   bash src/code/1-get-data/run.sh 2>&1 | tee get-data.log
set -euo pipefail
cd "$(dirname "$0")"
PY="${PY:-python3}"

echo "[get 1/6] bilara ...";       "$PY" 1-get-sc-bilara.py
echo "[get 2/6] htmltext ...";     "$PY" 2-get-sc-htmltext.py
echo "[get 3/6] name ...";         "$PY" 3-get-sc-name.py
echo "[get 4/6] tree ...";         "$PY" 4-get-sc-tree.py
echo "[get 5/6] info ...";         "$PY" 5-get-sc-info.py
echo "[get 6/6] base-models ...";  "$PY" 6-get-base-models.py
echo "[get] SELESAI."
