"""
3-assemble_anotasi.py — rakit anotasi_<judge>.csv dari grades JSON LLM-judge.

Broadcast grade pasase UNIK (query_id||ref||author) ke semua baris template (frozen
cache, struktur identik dgn anotasi pakar), tulis completed_<judge>.json + daftar judge.
Output DIPISAH ke folder anotasi-llm/ (TERPISAH dari anotasi/ pakar manusia) supaya tidak
ke-blend di consensus 3-ndcg. Dipakai utk Opus, Gemini-Pro, Gemini-Flash (format sama).

Usage : python 3-assemble_anotasi.py <grades.json> "<Nama Judge>" [--corpora id]
Contoh: python 3-assemble_anotasi.py grades_gemini-3.1-pro.json "Gemini 3.1 Pro"
"""
import sys
import json
from pathlib import Path

import pandas as pd

ROOT = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(ROOT))
import config  # noqa: E402

DIR_MANUSIA   = config.EVAL_DIR / "anotasi"
GRADES_DIR    = config.OUTPUT_DIR / "6-eval-llm"                    # grades_<judge>.json ada di output/
DIR_LLM       = config.OUTPUT_DIR / "6-eval-llm" / "anotasi-llm"
FILE_JUDGES   = DIR_LLM / "judges.json"
FILE_TEMPLATE = sorted(DIR_MANUSIA.glob("anotasi_*.csv"))[0]   # 897 baris, frozen


def bersihkan_nama(nama):
    """Sanitize nama judge jadi filename-safe."""
    return "".join(c if (c.isalnum() or c in "._-") else "_" for c in nama)


def main():
    if len(sys.argv) < 3:
        print(__doc__); return

    # baca grades dari JSON (cari di output/6-eval-llm/ kalau cuma dikasih nama file)
    file_grades = Path(sys.argv[1])
    if not file_grades.exists():
        file_grades = GRADES_DIR / file_grades.name
    skor = json.loads(file_grades.read_text(encoding="utf-8"))
    skor = {k: int(v) for k, v in skor.items()}
    nama_judge = sys.argv[2]
    korpus = [sys.argv[sys.argv.index("--corpora") + 1]] if "--corpora" in sys.argv else ["id"]

    # baca template CSV, map grade ke tiap baris via kunci pasase
    df = pd.read_csv(FILE_TEMPLATE)
    kunci = (df["query_id"].astype(str) + "||"
             + df["ref"].astype(str) + "||"
             + df["author"].astype(str))
    df["grade"] = kunci.map(skor.get)

    # cek pasase yg belum dinilai
    belum_dinilai = sorted(set(kunci[df["grade"].isna()]))
    if belum_dinilai:
        print(f"[WARN] {df['grade'].isna().sum()} baris tanpa grade "
              f"({len(belum_dinilai)} pasase unik belum dinilai):")
        for k in belum_dinilai[:15]:
            print("   -", k)

    df = df.dropna(subset=["grade"]).copy()
    df["grade"] = df["grade"].astype(int)

    # tulis CSV anotasi + completed list
    DIR_LLM.mkdir(parents=True, exist_ok=True)
    nama_file = bersihkan_nama(nama_judge)
    file_csv = DIR_LLM / f"anotasi_{nama_file}.csv"
    df.to_csv(file_csv, index=False, encoding="utf-8-sig")

    selesai = sorted(set(df["query_id"].astype(str) + "_" + df["db"].astype(str)))
    (DIR_LLM / f"completed_{nama_file}.json").write_text(json.dumps(selesai), encoding="utf-8")

    # update registry judges.json
    daftar = json.loads(FILE_JUDGES.read_text(encoding="utf-8")) if FILE_JUDGES.exists() else []
    if not any(j.get("name") == nama_judge for j in daftar):
        daftar.append({"corpora": korpus, "name": nama_judge})
        FILE_JUDGES.write_text(json.dumps(daftar, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[judges.json] + '{nama_judge}'")

    distribusi = df["grade"].value_counts().sort_index().to_dict()
    print(f"[done] {len(df)} baris -> {file_csv.name}  | distribusi grade {distribusi}")


if __name__ == "__main__":
    main()
