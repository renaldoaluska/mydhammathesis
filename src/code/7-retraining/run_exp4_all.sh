#!/bin/bash
# run_exp4_all.sh — Orkestrasi Eksperimen 4: Model Soup All Branches
# (exp4.0, exp4.1, exp4.2, exp4.3)

set -e

# Aktifkan virtual environment
source /home/paps21/palisemantic5026221144/venv/bin/activate

# Masuk ke folder script ini berada agar script python bisa berjalan benar
cd "$(dirname "$0")"

echo "======================================================================"
echo " EKSPERIMEN E4 ALL BRANCHES: MODEL SOUP / WiSE-FT"
echo " (Base + exp0, exp1, exp2, exp3)"
echo "======================================================================"

# 1. BUAT SOUP
echo "Menjalankan pembuatan Model Soup untuk seluruh keluarga exp4..."
python 8-soup-all.py

echo "======================================================================"
echo " 2. PRECOMPUTE EMBEDDING UNTUK MODEL exp4.0 - exp4.3"
echo "======================================================================"

for exp in exp4.0 exp4.1 exp4.2 exp4.3; do
    echo "Embedding untuk $exp..."
    python 5-embed.py --model gpl-${exp}-e5
    python 5-embed.py --model gpl-${exp}-gte
done

echo "======================================================================"
echo " 3. BUILD POOL EVALUASI UNTUK MODEL exp4.0 - exp4.3"
echo "======================================================================"

for exp in exp4.0 exp4.1 exp4.2 exp4.3; do
    echo "Building pool untuk $exp..."
    python 6-build-pool.py --model gpl-${exp}-e5 --label gpl-multilingual-e5-base --versi ${exp}
    python 6-build-pool.py --model gpl-${exp}-gte --label gpl-gte-multilingual-base --versi ${exp}
done

echo "======================================================================"
echo " SELESAI SELURUH KELUARGA EXP4!"
echo " Hasil pool tersimpan di: src/output/7-retraining/pool/"
echo "======================================================================"
