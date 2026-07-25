#!/bin/bash
# Script untuk menjalankan pool rerank exp5.0 (GPL 10k + Reranker)
# HANYA INI yang TIDAK menggunakan --use-retraining-dir karena model ada di 4-training/models

PYTHON_CMD="/home/paps21/palisemantic5026221144/venv/bin/python3"
SCRIPT_PATH="/home/paps21/palisemantic5026221144/mydhamma/src/code/7-retraining/7-rerank-pool.py"

echo "Mulai menjalankan exp5.0 untuk gpl-multilingual-e5-base..."
CUDA_VISIBLE_DEVICES="" $PYTHON_CMD $SCRIPT_PATH --retriever gpl-multilingual-e5-base --versi exp5.0 --label gpl-multilingual-e5-base

echo "Mulai menjalankan exp5.0 untuk gpl-gte-multilingual-base..."
CUDA_VISIBLE_DEVICES="" $PYTHON_CMD $SCRIPT_PATH --retriever gpl-gte-multilingual-base --versi exp5.0 --label gpl-gte-multilingual-base

echo "Selesai exp5.0!"
