"""
1-get_pasase.py — ekstrak pasase unik dari anotasi pakar → DATA_pasase.txt.

Membaca CSV anotasi pakar (frozen cache, 897 baris), de-duplikasi berdasarkan
kunci pasase (query_id||ref||author), dan menulis DATA_pasase.txt dalam format
yang siap ditempelkan ke chat LLM-judge:

  ===== Q<id> | <teks kueri> =====
  <query_id>||<ref>||<author><TAB><retrieved_text>

Usage:
  python 1-get_pasase.py
"""
import sys
from pathlib import Path

import pandas as pd

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402

HUMAN_DIR  = config.EVAL_DIR / "anotasi"
TEMPLATE   = sorted(HUMAN_DIR.glob("anotasi_*.csv"))[0]       # CSV pakar mana pun (897 baris)
OUT_DIR    = config.OUTPUT_DIR / "6-eval-llm"                  # artefak -> output/, bukan code/
OUT        = OUT_DIR / "DATA_pasase.txt"
MAX_CHARS  = 480                                               # potong pasase (sama utk semua penilai)


def main():
    df = pd.read_csv(TEMPLATE)
    df["key"] = (df["query_id"].astype(str) + "||"
                 + df["ref"].astype(str) + "||"
                 + df["author"].astype(str))

    # de-duplikasi: ambil pasase UNIK (satu pasase bisa muncul di beberapa model)
    seen = set()
    unique = []
    for _, row in df.iterrows():
        if row["key"] not in seen:
            seen.add(row["key"])
            unique.append(row)
    udf = pd.DataFrame(unique)

    lines = []
    for qid, grp in udf.groupby("query_id", sort=True):
        query_text = grp.iloc[0]["query"]
        lines.append(f"===== Q{qid} | {query_text} =====")
        for _, row in grp.iterrows():
            text = str(row["retrieved_text"])[:MAX_CHARS]
            lines.append(f"{row['key']}\t{text}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"[done] {len(udf)} pasase unik dari {len(df)} baris → {OUT.name}")
    print(f"       {udf['query_id'].nunique()} kueri, {len(lines)} baris total")


if __name__ == "__main__":
    main()
