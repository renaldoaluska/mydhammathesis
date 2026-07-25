#!/bin/bash
# run_exp1.sh — Orkestrasi Eksperimen 1: Ablasi Hyperparam (GPL_STEPS lebih kecil)
# Hipotesis: GPL sedikit over-adapt. Sentuhan lebih ringan (5000 steps vs 10000)
# mungkin bisa mempertahankan retrieval base.

set -e

# Aktifkan virtual environment
source ../../../../venv/bin/activate

echo "======================================================================"
echo " EKSPERIMEN E1: ABLASI HYPERPARAM (MAX STEPS 5000)"
echo " (Mode Standalone 7-retraining)"
echo "======================================================================"

export GPL_EXP_DIR="gpl-exp1"

# 1. RETRAIN E5
echo "Menjalankan retrain exp1 (independen) untuk E5..."
mkdir -p ../../output/7-retraining/gpl-exp1
if [ ! -f ../../output/7-retraining/gpl-exp1/train.jsonl ]; then
    echo "Menyalin data GPL dari 4-training/gpl/..."
    cp -r ../../output/4-training/gpl/* ../../output/7-retraining/gpl-exp1/
fi
python 4-train-marginmse.py --model intfloat/multilingual-e5-base --max-steps 5000 --out-name exp1-e5

echo "Menjalankan retrain exp1 (independen) untuk GTE..."
python 4-train-marginmse.py --model Alibaba-NLP/gte-multilingual-base --max-steps 5000 --out-name exp1-gte

echo "======================================================================"
echo " 2. PRECOMPUTE EMBEDDING UNTUK MODEL exp1"
echo "======================================================================"
python 5-embed.py --model gpl-exp1-e5
python 5-embed.py --model gpl-exp1-gte

echo "======================================================================"
echo " 3. BUILD POOL EVALUASI UNTUK MODEL exp1"
echo "======================================================================"
python 6-build-pool.py --model gpl-exp1-e5 --label gpl-multilingual-e5-base --versi exp1
python 6-build-pool.py --model gpl-exp1-gte --label gpl-gte-multilingual-base --versi exp1

echo "======================================================================"
echo " SELESAI. Selanjutnya (Evaluasi eksperimen exp1):"
echo " 1. python ../8-reeval-llm/1-get_pasase.py --exp exp1"
echo " 2. Nilai via LLM (template prompt di ../8-reeval-llm/2-judge.py) -> grades_exp1_<Model>.json"
echo " 3. python ../8-reeval-llm/3-assemble.py grades_exp1_<Model>.json '<Nama>'"
echo " 4. python ../8-reeval-llm/4-run_eval.py && python ../8-reeval-llm/5-signifikansi.py GPL exp1"
echo "======================================================================"
