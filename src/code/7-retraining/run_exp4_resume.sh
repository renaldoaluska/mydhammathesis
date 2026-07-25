#!/bin/bash
# run_exp4_resume.sh — Resume run_exp4_all.sh setelah OOM di embedding exp4.1-gte/pli
# Skip step 1 (soup, sudah jadi semua); jalankan step 2 (embed, auto-skip
# file yang sudah ada) + step 3 (build-pool, belum tersentuh sama sekali).

set -e

# Mitigasi OOM semalam: fragmentasi VRAM (1.27 GiB reserved-unallocated)
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True

# Aktifkan virtual environment
source /home/paps21/palisemantic5026221144/venv/bin/activate

# Masuk ke folder script ini berada agar script python bisa berjalan benar
cd "$(dirname "$0")"

echo "======================================================================"
echo " 2. PRECOMPUTE EMBEDDING UNTUK MODEL exp4.0 - exp4.3 (resume)"
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
echo " SELESAI SELURUH KELUARGA EXP4 (resume)!"
echo " Hasil pool tersimpan di: src/output/7-retraining/pool/"
echo "======================================================================"
