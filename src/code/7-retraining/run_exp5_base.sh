#!/bin/bash
# Script untuk menjalankan pool rerank exp5.base (Baseline + Reranker)
# Jalankan dari root mydhamma atau dalam src/

PYTHON_CMD="/home/paps21/palisemantic5026221144/venv/bin/python3"
SCRIPT_PATH="/home/paps21/palisemantic5026221144/mydhamma/src/code/7-retraining/7-rerank-pool.py"

echo "Mulai menjalankan exp5.base untuk intfloat/multilingual-e5-base..."
CUDA_VISIBLE_DEVICES="" $PYTHON_CMD $SCRIPT_PATH --retriever intfloat/multilingual-e5-base --versi exp5.base --label multilingual-e5-base

echo "Mulai menjalankan exp5.base untuk Alibaba-NLP/gte-multilingual-base..."
CUDA_VISIBLE_DEVICES="" $PYTHON_CMD $SCRIPT_PATH --retriever Alibaba-NLP/gte-multilingual-base --versi exp5.base --label gte-multilingual-base

echo "Selesai exp5.base!"
