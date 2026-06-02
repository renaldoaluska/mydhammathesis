#!/usr/bin/env bash
# Pipeline GPL berurutan — tmux-friendly. Stop kalau ada step gagal.
# Prasyarat: 3-praproses/1-chunk.py sudah dijalankan (+ disarankan 6-get-base-models).
#
#   tmux new -s gpl
#   bash src/code/4-training/run.sh 2>&1 | tee gpl.log
#   (Ctrl-b d untuk detach; tmux attach -t gpl untuk balik)
set -euo pipefail
cd "$(dirname "$0")"
PY="${PY:-python3}"

echo "[GPL 1/4] query-gen ...";       "$PY" 1-query-gen.py
echo "[GPL 2/4] hard-neg ...";        "$PY" 2-hard-neg.py
echo "[GPL 3/4] pseudo-label ...";    "$PY" 3-pseudo-label.py
echo "[GPL 4/4] train marginmse ..."; "$PY" 4-train-marginmse.py
echo "[GPL] SELESAI."
