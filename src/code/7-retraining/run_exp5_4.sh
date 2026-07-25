#!/bin/bash
# Script untuk menjalankan pool rerank exp5.4 (GPL model soup + Reranker)

PYTHON_CMD="/home/paps21/palisemantic5026221144/venv/bin/python3"
SCRIPT_PATH="/home/paps21/palisemantic5026221144/mydhamma/src/code/7-retraining/7-rerank-pool.py"

echo "Mulai menjalankan exp5.4 untuk gpl-exp4-e5..."
CUDA_VISIBLE_DEVICES="" $PYTHON_CMD $SCRIPT_PATH --retriever gpl-exp4-e5 --versi exp5.4 --label gpl-exp4-e5 --use-retraining-dir

echo "Mulai menjalankan exp5.4 untuk gpl-exp4-gte..."
CUDA_VISIBLE_DEVICES="" $PYTHON_CMD $SCRIPT_PATH --retriever gpl-exp4-gte --versi exp5.4 --label gpl-exp4-gte --use-retraining-dir

echo "Selesai exp5.4!"
