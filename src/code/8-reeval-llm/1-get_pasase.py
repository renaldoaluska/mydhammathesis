"""
1-get_pasase.py — Ekstrak pasase UNIK yang BELUM dinilai, untuk satu eksperimen.

Membaca pool_*.csv di 7-retraining/pool/ (disaring ke satu eksperimen via --exp,
dicocokkan ke kolom 'versi'), mengecek pasase mana yang sudah ada grade-nya di
6-eval-llm/anotasi-llm/ (agar tak perlu dinilai ulang -> hemat biaya API + grade
tetap konsisten/beku), lalu menulis pasase yang benar-benar baru ke
DATA_pasase_<exp>.txt. File itulah yang disuapkan ke LLM-judge (lihat 2-judge.py).

Usage:
  python 1-get_pasase.py --exp exp1     # cuma pasase eksperimen exp1
  python 1-get_pasase.py                # semua pool (tanpa filter) -> DATA_pasase_all.txt
"""

import argparse
import sys
from pathlib import Path
import pandas as pd

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config

POOL_DIR = config.OUTPUT_DIR / "7-retraining" / "pool"       # artefak 7-1 (dibaca lintas-step)
LLM_DIR  = config.OUTPUT_DIR / "6-eval-llm" / "anotasi-llm"  # grade lama (dipakai ulang)
OUT_DIR  = config.OUTPUT_DIR / "8-reeval-llm"
MAX_CHARS = 480

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--exp", help="filter ke satu eksperimen (cocok kolom 'versi', mis. exp1); "
                                  "tanpa ini = gabung semua pool")
    args = ap.parse_args()

    if not POOL_DIR.exists():
        print(f"Folder pool belum ada: {POOL_DIR}")
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT = OUT_DIR / (f"DATA_pasase_{args.exp}.txt" if args.exp else "DATA_pasase_all.txt")

    # 1. Kumpulkan semua pasase dari pool
    dfs = [pd.read_csv(f) for f in POOL_DIR.glob("pool_*.csv")]
    if not dfs:
        print("Belum ada file pool_*.csv di folder pool.")
        return
    df_all = pd.concat(dfs, ignore_index=True)

    # 1b. Saring ke satu eksperimen (kolom 'versi')
    if args.exp:
        df_pool = df_all[df_all["versi"].astype(str) == args.exp].copy()
        if df_pool.empty:
            tersedia = sorted(df_all["versi"].astype(str).unique())
            print(f"[kosong] tak ada pool dgn versi '{args.exp}'. Versi tersedia: {tersedia}")
            return
    else:
        df_pool = df_all

    df_pool["key"] = (df_pool["query_id"].astype(str) + "||"
                      + df_pool["ref"].astype(str) + "||"
                      + df_pool["author"].astype(str))

    # 2. Kunci pasase yang sudah dinilai sebelumnya (grade-nya dipakai ulang, bukan dinilai lagi)
    old_keys = set()
    if LLM_DIR.exists():
        for old_csv in LLM_DIR.glob("anotasi_*.csv"):
            try:
                old_df = pd.read_csv(old_csv)
                old_key = (old_df["query_id"].astype(str) + "||"
                           + old_df["ref"].astype(str) + "||"
                           + old_df["author"].astype(str))
                old_keys.update(old_key.tolist())
            except Exception as e:
                print(f"Gagal baca {old_csv.name}: {e}")

    # 3. Sisakan pasase baru (belum dinilai) + buang duplikat internal
    df_new = df_pool[~df_pool["key"].isin(old_keys)].drop_duplicates(subset="key").copy()
    if df_new.empty:
        print("Tidak ada pasase baru yang perlu dinilai! Semua sudah ada di anotasi lama.")
        OUT.write_text("", encoding="utf-8")
        return

    # 4. Tulis ke file (dikelompokkan per kueri)
    lines = []
    for qid, grp in df_new.groupby("query_id", sort=True):
        query_text = grp.iloc[0]["query"]
        lines.append(f"===== Q{qid} | {query_text} =====")
        for _, row in grp.iterrows():
            text = str(row["retrieved_text"])[:MAX_CHARS]
            lines.append(f"{row['key']}\t{text}")

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    cakupan = f"eksperimen '{args.exp}'" if args.exp else "semua pool"
    print(f"[done] {len(df_new)} pasase BARU ({cakupan}) -> {OUT.name}")
    print(f"       (dilewati {len(df_pool) - len(df_new)} pasase ganda/sudah dinilai)")

if __name__ == "__main__":
    main()
