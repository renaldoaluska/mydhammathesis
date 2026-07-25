#!/bin/bash
# run_exp3.sh — Eksperimen 3: GANTI TEACHER (bge) — 1 variabel: cross-encoder teacher
# ================================================================================
# Hipotesis: teacher mMiniLM (MS MARCO, kecil) kasih margin pseudo-label yang
#   kurang akurat → ganti teacher ke bge-reranker-v2-m3 (lebih besar/kuat).
# SATU-SATUNYA variabel yg berubah dari exp2: teacher (mMiniLM → bge).
# Kueri gemma2 & triples DI-REUSE dari exp2 (copy file, BUKAN regen) →
#   (query, pos, neg) dijamin identik byte-per-byte; re-mining dilarang karena
#   encode GPU non-deterministik bisa geser ranking hard-neg = variabel siluman.
# Margin bge beda skala dari mMiniLM → aman, 3-pseudo-label self-scaling ke
#   GPL_MARGIN_TARGET_STD (CE-agnostic).
# Lawan banding sah: exp2 (1 variabel: TEACHER). Steps tetap 10k (= exp0/exp2).
#
# GATE: jalankan HANYA setelah exp2 selesai + dievaluasi (flow keputusan di
#   perbedaan-eksperimen.txt: exp2 naik vs exp0 → baru exp3).
#
# NUMBERING (perbedaan-eksperimen.txt):
#   base = zero-shot acuan | exp0 = "gpl" (mT5+mMiniLM 10k) | exp1 = steps 5k (beku)
#   exp2 = kueri gemma2 | exp3 = INI (teacher bge)
#   AWAS: "exp3" LAMA (4-perubahan, mati) beda barang; arsipnya di
#   output/8-reeval-llm_old/ (lihat catatan_arsip.txt).
# ================================================================================
# CATATAN WAKTU:
#   - Pseudo-label bge (~568M param) jauh lebih lambat dari mMiniLM:
#     563k triple × 2 pasangan → kasar ~6-12 jam di GPU 12GB.
#     Kalau OOM: turunkan GPL_BATCH_SIZE di config.py (default 32).
#   - Training 10k steps + embed + pool: ~5-8 jam.
# ================================================================================

set -e
cd "$(dirname "$0")"
source ../../../../venv/bin/activate

echo "======================================================================"
echo " EKSPERIMEN E3: TEACHER bge-reranker-v2-m3 — 1 var: teacher"
echo " Kueri gemma2 + triples reuse exp2; semua lain = exp2 (10k, vanilla)"
echo "======================================================================"

# --- Variabel eksperimen ---
export GPL_EXP_DIR="gpl-exp3"
export PYTHONUNBUFFERED=1     # output real-time walau di-pipe ke tee
export GPL_CROSS_ENCODER="BAAI/bge-reranker-v2-m3"   # SATU-SATUNYA yg beda dari exp2

SRCDIR=../../output/7-retraining/gpl-exp2
OUTDIR=../../output/7-retraining/gpl-exp3
mkdir -p "$OUTDIR"

# --- 0. GATE + reuse artefak exp2 (queries/passages/triples identik) ---
if [ ! -f "$SRCDIR/triples.jsonl" ]; then
    echo "[GATE] $SRCDIR/triples.jsonl belum ada → exp2 belum sampai hard-neg."
    echo "       Selesaikan run_exp2.sh (dan evaluasinya) dulu. STOP."
    exit 1
fi
for f in passages.jsonl queries.jsonl triples.jsonl; do
    if [ ! -f "$OUTDIR/$f" ]; then
        echo "Reuse $f dari exp2 (copy, bukan regen)..."
        cp "$SRCDIR/$f" "$OUTDIR/"
    fi
done
# TIDAK menjalankan 1-query-gen-llm.py & 2-hard-neg.py — inputnya reuse exp2.

# --- 3. Pseudo-labeling ULANG dgn teacher bge (satu-satunya perbedaan) ---
echo "3. Pseudo-labeling triples exp2 dgn teacher bge (margin self-scaling)..."
python 3-pseudo-label.py

# --- 4. Training dari BASE (10k steps, = exp0/exp2) ---
echo "4. Training exp3 dari BASE (10k steps, batch 32)..."
python 4-train-marginmse.py --model intfloat/multilingual-e5-base --max-steps 10000 --out-name exp3-e5
python 4-train-marginmse.py --model Alibaba-NLP/gte-multilingual-base --max-steps 10000 --out-name exp3-gte

# --- 5. Precompute embedding ---
echo "5. Precompute embedding korpus model exp3..."
python 5-embed.py --model gpl-exp3-e5
python 5-embed.py --model gpl-exp3-gte

# --- 6. Build pool evaluasi ---
echo "6. Build pool evaluasi (top-K) untuk model exp3..."
python 6-build-pool.py --model gpl-exp3-e5 --label gpl-multilingual-e5-base --versi exp3
python 6-build-pool.py --model gpl-exp3-gte --label gpl-gte-multilingual-base --versi exp3

echo "======================================================================"
echo " SELESAI. Evaluasi exp3 (8-reeval-llm):"
echo "   python ../8-reeval-llm/1-get_pasase.py --exp exp3"
echo "   → judge (2-judge.py) → grades_exp3_<Judge>.json"
echo "   → 3-assemble.py ; 4-run_eval.py ; 5-signifikansi.py --exp exp3"
echo "======================================================================"
