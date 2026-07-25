"""
3-assemble.py — Gabungkan hasil judge eksperimen baru dengan anotasi lama.

Membaca grades JSON hasil LLM untuk pasase eksperimen, menggabungkannya
dengan anotasi lama di 6-eval-llm, dan menghasilkan anotasi_*.csv
LENGKAP (model lama base & gpl + model eksperimen baru, mis. exp1).
Output disimpan di output/8-reeval-llm/anotasi/.

Usage : python 3-assemble.py <grades.json> "<Nama Judge>"
Contoh: python 3-assemble.py grades_exp1_Gemini_3.1_Pro.json "Gemini 3.1 Pro"
"""

import sys
import json
import argparse
from pathlib import Path
import pandas as pd

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config

POOL_DIR = config.OUTPUT_DIR / "7-retraining" / "pool"          # artefak 7-1
OLD_LLM_DIR = config.OUTPUT_DIR / "6-eval-llm" / "anotasi-llm"
BASE_ANOTASI_DIR = config.OUTPUT_DIR / "8-reeval-llm" / "anotasi"   # di-scope per-exp via --exp

def bersihkan_nama(nama):
    return "".join(c if (c.isalnum() or c in "._-") else "_" for c in nama)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("grades", help="file grades JSON hasil judge")
    ap.add_argument("judge", help="nama judge (cocok anotasi_<judge>.csv lama)")
    ap.add_argument("--exp", help="scope output ke subfolder eksperimen (mis. exp1)")
    args = ap.parse_args()

    file_grades = Path(args.grades)
    nama_judge = args.judge
    nama_file = bersihkan_nama(nama_judge)
    new_anotasi_dir = (BASE_ANOTASI_DIR / args.exp) if args.exp else BASE_ANOTASI_DIR
    
    # 1. Baca grades baru (reeval)
    skor_baru = {}
    if file_grades.exists():
        raw = json.loads(file_grades.read_text(encoding="utf-8"))
        skor_baru = {k: int(v) for k, v in raw.items()}
    else:
        print(f"[WARN] File {file_grades.name} tidak ditemukan. Hanya menggabungkan pool dengan anotasi lama.")

    # 2. Baca anotasi lama dari judge yang sama
    old_csv_path = OLD_LLM_DIR / f"anotasi_{nama_file}.csv"
    if not old_csv_path.exists():
        print(f"[ERROR] Anotasi lama untuk {nama_judge} tidak ditemukan di {old_csv_path}")
        return
        
    df_old = pd.read_csv(old_csv_path)
    old_kunci = (df_old["query_id"].astype(str) + "||"
                 + df_old["ref"].astype(str) + "||"
                 + df_old["author"].astype(str))
    
    skor_lama = dict(zip(old_kunci, df_old["grade"]))
    
    # Gabungkan dictionary skor (lama + baru)
    skor_total = {**skor_lama, **skor_baru}

    # 3. Siapkan template lengkap (Model Lama + Model Baru exp)
    #    Scope pool ke eksperimen ini saja (pool_<exp>_*.csv); tanpa --exp = semua.
    #    Kalau tidak, assemble exp1 ikut narik pool_exp2 -> baris exp2 tak lengkap mencemari eval.
    pool_glob = f"pool_{args.exp}_*.csv" if args.exp else "pool_*.csv"
    dfs_template = [df_old.copy()]
    for f in POOL_DIR.glob(pool_glob):
        dfs_template.append(pd.read_csv(f))
        
    df_full = pd.concat(dfs_template, ignore_index=True)
    
    # Hapus duplikat per (model, versi, db, query_id, rank, ref, author)
    # Ini memastikan pasase yang sama dari model berbeda tetap ada
    dkey = ["model", "versi", "db", "query_id", "rank", "ref", "author"]
    df_full = df_full.drop_duplicates(subset=dkey, keep="last")

    # 4. Map skor ke template lengkap
    kunci = (df_full["query_id"].astype(str) + "||"
             + df_full["ref"].astype(str) + "||"
             + df_full["author"].astype(str))
    df_full["grade"] = kunci.map(skor_total.get)

    # 4b. Propagasi grade utk pasase kembar-teks: segmen (ref) beda tapi
    #     (query_id, isi teks) persis sama dgn pasase yang SUDAH dinilai
    #     judge yang sama -> pakai grade itu (perluasan prinsip "pasase sama
    #     tidak dinilai ulang" ke level isi). Kalau kembar-kembarnya tidak
    #     sepakat nilainya, JANGAN diisi -> biarkan NaN + warning.
    na_mask = df_full["grade"].isna()
    if na_mask.any():
        graded = df_full[~na_mask]
        twin_key = list(zip(graded["query_id"], graded["retrieved_text"].astype(str).str.strip()))
        twin_map = {}
        for tk, gr in zip(twin_key, graded["grade"]):
            twin_map.setdefault(tk, set()).add(int(gr))
        n_prop = n_konflik = 0
        for idx in df_full.index[na_mask]:
            tk = (df_full.at[idx, "query_id"], str(df_full.at[idx, "retrieved_text"]).strip())
            grs = twin_map.get(tk)
            if grs is None:
                continue
            if len(grs) == 1:
                df_full.at[idx, "grade"] = grs.pop()
                n_prop += 1
            else:
                n_konflik += 1
                print(f"[WARN] kembar-teks konflik grade {sorted(grs)} -> dibiarkan kosong: "
                      f"{kunci[idx]}")
        if n_prop:
            print(f"[propagasi] {n_prop} pasase kembar-teks diisi dari grade kembarannya")

    # Cek pasase yang belum dinilai
    belum_dinilai = sorted(set(kunci[df_full["grade"].isna()]))
    if belum_dinilai:
        print(f"[WARN] {df_full['grade'].isna().sum()} baris tanpa grade "
              f"({len(belum_dinilai)} pasase unik belum dinilai):")
        for k in belum_dinilai[:5]:
            print("   -", k)
        print("   ...")

    df_full = df_full.dropna(subset=["grade"]).copy()
    df_full["grade"] = df_full["grade"].astype(int)

    # 5. Tulis hasilnya
    new_anotasi_dir.mkdir(parents=True, exist_ok=True)
    out_csv = new_anotasi_dir / f"anotasi_{nama_file}.csv"
    df_full.to_csv(out_csv, index=False, encoding="utf-8-sig")

    distribusi = df_full["grade"].value_counts().sort_index().to_dict()
    print(f"[done] {len(df_full)} baris -> {out_csv.name}")
    print(f"       (Lama: {len(df_old)}, Total: {len(df_full)})")
    print(f"       Distribusi grade: {distribusi}")

if __name__ == "__main__":
    main()
