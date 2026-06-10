#!/usr/bin/env bash
# Watcher sekali-pakai: tunggu run.sh (GPL 1..4) kelar, lalu jalankan 5-embed.
# Hanya jalan kalau run.sh selesai bersih (log memuat "SELESAI").
RUN_PID=3208146
LOG=/home/paps21/palisemantic5026221144/mydhamma/src/output/4-training/gpl-train.log
PY=/home/paps21/palisemantic5026221144/venv/bin/python
DIR=/home/paps21/palisemantic5026221144/mydhamma/src/code/4-training

tail --pid="$RUN_PID" -f /dev/null   # blok sampai run.sh mati
if tail -n 5 "$LOG" | grep -q "SELESAI"; then
  echo "=== [chain] run.sh SELESAI -> mulai 5-embed: $(date -Iseconds) ===" | tee -a "$LOG"
  cd "$DIR" && "$PY" 5-embed.py 2>&1 | tee -a "$LOG"
  echo "=== [chain] 5-embed selesai (rc=$?): $(date -Iseconds) ===" | tee -a "$LOG"
else
  echo "=== [chain] run.sh TIDAK selesai bersih -> 5-embed DILEWATI: $(date -Iseconds) ===" | tee -a "$LOG"
fi
