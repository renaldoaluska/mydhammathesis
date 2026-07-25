#!/bin/bash
# Script untuk menjalankan semua pool rerank exp5 secara berurutan

cd "$(dirname "$0")"

chmod +x run_exp5_base.sh run_exp5_0.sh run_exp5_1.sh run_exp5_2.sh run_exp5_3.sh run_exp5_4.sh

echo "==========================================="
echo "Memulai Pipeline Rerank Seluruh Keluarga exp5"
echo "==========================================="

./run_exp5_base.sh
./run_exp5_0.sh
./run_exp5_1.sh
./run_exp5_2.sh
./run_exp5_3.sh
./run_exp5_4.sh

echo "==========================================="
echo "SEMUA EKSPERIMEN 5 SELESAI!"
echo "Hasil bisa dicek di: src/output/7-retraining/pool/"
echo "==========================================="
