#!/bin/bash
# Script untuk menjalankan pool rerank exp5.1 (GPL 5k + Reranker)

PYTHON_CMD="/home/paps21/palisemantic5026221144/venv/bin/python3"
SCRIPT_PATH="/home/paps21/palisemantic5026221144/mydhamma/src/code/7-retraining/7-rerank-pool.py"

echo "Mulai menjalankan exp5.1 untuk gpl-exp1-e5..."
CUDA_VISIBLE_DEVICES="" $PYTHON_CMD $SCRIPT_PATH --retriever gpl-exp1-e5 --versi exp5.1 --label gpl-exp1-e5 --use-retraining-dir

echo "Mulai menjalankan exp5.1 untuk gpl-exp1-gte..."
CUDA_VISIBLE_DEVICES="" $PYTHON_CMD $SCRIPT_PATH --retriever gpl-exp1-gte --versi exp5.1 --label gpl-exp1-gte --use-retraining-dir

echo "Selesai exp5.1!"
