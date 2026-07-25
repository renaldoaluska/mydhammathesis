#!/bin/bash
# run_exp2.sh — Eksperimen 2: KUERI LLM (gemma2:2b) — 1 variabel: query generator
# ================================================================================
# Hipotesis: kueri sintetis mT5 (doc2query) mismatch dgn pertanyaan natural →
#   ganti generator kueri ke LLM (gemma2) yang menulis pertanyaan ID/EN natural.
# SATU-SATUNYA variabel yg berubah dari exp0 (gpl): query generator (mT5 → gemma2).
# Semua lain IDENTIK exp0: teacher mMiniLM, scope en+id 189k, vanilla hard-neg,
#   10k steps (2-hard-neg & 3-pseudo-label identik script base 4-training).
# Lawan banding sah: exp0/gpl (1 variabel: kueri). Steps WAJIB 10k — kalau 5k jadi
#   2 variabel (kueri + steps); 5k sudah diuji terpisah di exp1 dan gagal.
#
# NUMBERING (perbedaan-eksperimen.txt):
#   base = zero-shot acuan (tanpa training)
#   exp0 = "gpl" (adaptasi awal 4-training: mT5 + mMiniLM, 10k steps)
#   exp1 = ablasi steps 5k (beku; gagal sig<base)
#   exp2 = INI (kueri gemma2)
#   exp3 = teacher bge (gated oleh exp2)
#   AWAS: exp2/exp3 LAMA (bundel E2 & 4-perubahan, mati) nomornya DIPAKAI ULANG;
#   eval lamanya diarsip di output/8-reeval-llm_old/ (lihat catatan_arsip.txt).
# ================================================================================
# CATATAN WAKTU:
#   - Query gen gemma2: ~1s/pasase, 189k pasase × 3 kueri. queries.jsonl RESUMABLE
#     (checkpoint tiap 200 pasase; ~47.7k kueri sudah ada per 2026-07-02).
#     Sisa ~50 jam. Ctrl+C aman, lanjut kapan saja.
#   - Hard-neg + pseudo-label + train: ~8-15 jam total.
# ================================================================================

set -e
cd "$(dirname "$0")"
source ../../../../venv/bin/activate

echo "======================================================================"
echo " EKSPERIMEN E2: LLM QUERY-GEN (gemma2:2b) — 1 var: kueri"
echo " Semua lain = exp0/gpl (mMiniLM, en+id, vanilla, 10k steps)"
echo "======================================================================"

# --- Variabel eksperimen ---
export GPL_EXP_DIR="gpl-exp2"
export PYTHONUNBUFFERED=1     # output real-time walau di-pipe ke tee
# Teacher = mMiniLM (default config.py, JANGAN override GPL_CROSS_ENCODER)

OUTDIR=../../output/7-retraining/gpl-exp2
mkdir -p "$OUTDIR"

# --- 0. Siapkan passages.jsonl (scope en+id, IDENTIK exp0) ---
if [ ! -f "$OUTDIR/passages.jsonl" ]; then
    echo "Menyalin passages.jsonl dari 4-training/gpl/ (scope identik exp0)..."
    cp ../../output/4-training/gpl/passages.jsonl "$OUTDIR/"
fi

# --- 1. Generate kueri NATURAL via LLM (gemma2:2b) — SEMUA pasase (en+id) ---
#     queries.jsonl di OUTDIR resumable (reuse 42.9k kueri gemma2 lama + lanjutan).
echo "1. Generate kueri gemma2 utk SEMUA pasase en+id (~189k). Resumable."
python 1-query-gen-llm.py --model gemma2:2b
# TIDAK pakai --lang atau --sample → semua pasase, semua bahasa (= scope exp0)

# --- 2. Mining Hard-Negative (vanilla, = exp0) ---
echo "2. Mining Hard-Negative (vanilla, = exp0)..."
python 2-hard-neg.py

# --- 3. Pseudo-labeling (teacher mMiniLM, = exp0) ---
echo "3. Pseudo-labeling (mMiniLM teacher, vanilla = exp0)..."
python 3-pseudo-label.py

# --- 4. Training dari BASE (10k steps, = exp0) ---
echo "4. Training exp2 dari BASE (10k steps, batch 32)..."
python 4-train-marginmse.py --model intfloat/multilingual-e5-base --max-steps 10000 --out-name exp2-e5
python 4-train-marginmse.py --model Alibaba-NLP/gte-multilingual-base --max-steps 10000 --out-name exp2-gte

# --- 5. Precompute embedding ---
echo "5. Precompute embedding korpus model exp2..."
python 5-embed.py --model gpl-exp2-e5
python 5-embed.py --model gpl-exp2-gte

# --- 6. Build pool evaluasi ---
echo "6. Build pool evaluasi (top-K) untuk model exp2..."
python 6-build-pool.py --model gpl-exp2-e5 --label gpl-multilingual-e5-base --versi exp2
python 6-build-pool.py --model gpl-exp2-gte --label gpl-gte-multilingual-base --versi exp2

echo "======================================================================"
echo " SELESAI. Evaluasi exp2 (8-reeval-llm):"
echo "   python ../8-reeval-llm/1-get_pasase.py --exp exp2"
echo "   → judge (2-judge.py) → grades_exp2_<Judge>.json"
echo "   → 3-assemble.py ; 4-run_eval.py ; 5-signifikansi.py --exp exp2"
echo "======================================================================"
