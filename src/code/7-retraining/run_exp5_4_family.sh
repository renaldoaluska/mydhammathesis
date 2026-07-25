#!/bin/bash
# run_exp5_4_family.sh — rerank di atas keluarga model soup exp4.1/4.2/4.3.
#
# exp5.4   (SUDAH ADA) = rerank atas exp4.0  -> naskah: Penyempurna 5.4.0
# exp5.4.1 (skrip ini) = rerank atas exp4.1  -> naskah: Penyempurna 5.4.1
# exp5.4.2 (skrip ini) = rerank atas exp4.2  -> naskah: Penyempurna 5.4.2
# exp5.4.3 (skrip ini) = rerank atas exp4.3  -> naskah: Penyempurna 5.4.3
#
# ⚠ KONVENSI --label (2026-07-16): --label WAJIB nama KELUARGA kanonik
#   (gpl-multilingual-e5-base / gpl-gte-multilingual-base), BUKAN nama varian.
#   Eval mengelompokkan per (model=keluarga, versi=eksperimen); kalau label diisi
#   nama varian, varian itu jadi "model" tersendiri dan TIDAK terbandingkan.
#   AWAS: run_exp5_{1,2,3,4}.sh menulis --label gpl-expN-e5 -> TIDAK cocok dengan
#   pool yang benar-benar dihasilkan (cek: kolom `model` di pool_exp5.*.csv semuanya
#   gpl-multilingual-e5-base). Skrip lama itu BASI; ikuti pola di sini.
#
# CPU-only (CUDA_VISIBLE_DEVICES="") supaya tidak merebut GPU dari training.

PY="/home/paps21/palisemantic5026221144/venv/bin/python3"
S="/home/paps21/palisemantic5026221144/mydhamma/src/code/7-retraining/7-rerank-pool.py"

for n in 1 2 3; do
  echo "=========== exp5.4.$n (rerank atas exp4.$n) ==========="
  CUDA_VISIBLE_DEVICES="" $PY $S --retriever gpl-exp4.$n-e5 \
      --versi exp5.4.$n --label gpl-multilingual-e5-base --use-retraining-dir
  CUDA_VISIBLE_DEVICES="" $PY $S --retriever gpl-exp4.$n-gte \
      --versi exp5.4.$n --label gpl-gte-multilingual-base --use-retraining-dir
done
echo "=========== SELESAI exp5.4.1 / 5.4.2 / 5.4.3 ==========="
