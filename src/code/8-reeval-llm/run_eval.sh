#!/bin/bash
# run_eval.sh <exp> — orkestrasi evaluasi LLM-judge untuk SATU eksperimen (mis. exp1).
#
# Fase A (otomatis) -> JEDA judge manual (ketik 'y') -> Fase B (otomatis).
# Hasil di-scope per-eksperimen: output/8-reeval-llm/{anotasi,metrik}/<exp>/.
#
# Pakai:  ./run_eval.sh exp1

set -e
EXP="${1:?Usage: ./run_eval.sh <exp>   (contoh: ./run_eval.sh exp1)}"

cd "$(dirname "$0")"                        # cwd = folder 8-reeval-llm
source ../../../../venv/bin/activate
OUTDIR=../../output/8-reeval-llm

echo "######################################################################"
echo " EVAL LLM-JUDGE — eksperimen: $EXP"
echo "######################################################################"

# ---- FASE A: kumpulkan pasase yang perlu dinilai ----
echo ""
echo "===== FASE A: ekstrak pasase ($EXP) ====="
python 1-get_pasase.py --exp "$EXP"
PASASE="$OUTDIR/DATA_pasase_${EXP}.txt"

if [ -s "$PASASE" ]; then
    echo ""
    echo ">>> JEDA MANUAL — nilai pasase via LLM-judge:"
    echo "    1. Buka file : $PASASE"
    echo "    2. Pakai prompt di 2-judge.py, suapin ke TIAP judge (chat sidebar / terminal lain)."
    echo "    3. Simpan hasil ke: $OUTDIR/grades_${EXP}_<Judge>.json"
    echo "       (Judge = nama yg cocok anotasi lama, mis. Claude_Opus_4.8 / Gemini_3.1_Pro)"
    echo ""
    read -p ">>> Ketik 'y' kalau semua grades_${EXP}_*.json sudah disimpan: " ans
    [ "$ans" = "y" ] || { echo "Dibatalkan."; exit 1; }
else
    echo "Tidak ada pasase baru ($EXP) — semua sudah dinilai. Lanjut ke Fase B."
fi

# ---- FASE B: assemble (per judge) + eval + signifikansi ----
echo ""
echo "===== FASE B: assemble + eval + signifikansi ($EXP) ====="
shopt -s nullglob
GRADES=("$OUTDIR"/grades_${EXP}_*.json)
if [ ${#GRADES[@]} -eq 0 ]; then
    echo "[WARN] tak ada grades_${EXP}_*.json — assemble dilewati (pakai grade lama saja)."
fi
for gf in "${GRADES[@]}"; do
    judge="$(basename "$gf" .json)"; judge="${judge#grades_${EXP}_}"
    echo "-- assemble judge: $judge"
    python 3-assemble.py "$gf" "$judge" --exp "$EXP"
done

python 4-run_eval.py --exp "$EXP"
python 5-signifikansi.py --exp "$EXP"

echo ""
echo "######################################################################"
echo " SELESAI ($EXP). Lihat: output/8-reeval-llm/metrik/${EXP}/"
echo "######################################################################"
