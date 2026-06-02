"""
4-precision.py — P@10 + MRR@10 dari asesmen pakar (relevan = grade >= REL).
Per model x versi x korpus, dengan & tanpa heading. Output: src/output/5-eval/4-precision/
Usage : python src/code/5-eval/4-precision.py
"""

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import load_annotations, short_model, short_versi, figdir, REL  # noqa: E402

K = 10


def pk_mrr(grades, k=K):
    top = grades[:k]
    p = sum(1 for g in top if g >= REL) / k
    mrr = 0.0
    for i, g in enumerate(grades):
        if g >= REL:
            mrr = 1.0 / (i + 1)
            break
    return p, mrr


def by_group(d):
    out = {}
    for (m, v, db), grp in d.groupby(["model", "versi", "db"]):
        ps, ms = [], []
        for _, qg in grp.groupby("query_id"):
            p, mrr = pk_mrr(qg.sort_values("rank")["grade"].tolist())
            ps.append(p); ms.append(mrr)
        out[(m, v, db.upper())] = (round(sum(ps) / len(ps), 4) if ps else float("nan"),
                                   round(sum(ms) / len(ms), 4) if ms else float("nan"))
    return out


def main():
    print(f"=== P@{K} + MRR@{K} (relevan = grade >= {REL}) ===")
    df, inc = load_annotations()
    if df is None:
        return
    OUT = figdir("4-precision")
    full  = by_group(df)
    clean = by_group(df[~df["is_heading"]])

    rows = []
    for (m, v, db), (p, mrr) in full.items():
        cp, cm = clean.get((m, v, db), (float("nan"), float("nan")))
        rows.append({"Model": short_model(m), "Versi": short_versi(v), "Korpus": db,
                     f"P@{K}": p, f"MRR@{K}": mrr,
                     f"P@{K} (tanpa heading)": cp, f"MRR@{K} (tanpa heading)": cm})
    res = pd.DataFrame(rows).sort_values(f"P@{K} (tanpa heading)", ascending=False).reset_index(drop=True)
    res.to_csv(OUT / "precision_per_model.csv", index=False, encoding="utf-8-sig")
    print("\n" + res.to_string(index=False))

    L = [f"=== P@{K} + MRR@{K} (relevan grade>={REL}) ===",
         f"Pakar: {', '.join(inc)}", ""]
    for i, r in res.iterrows():
        L.append(f"  {i+1:2d}. P@{K}={r[f'P@{K} (tanpa heading)']:.4f} "
                 f"MRR={r[f'MRR@{K} (tanpa heading)']:.4f} (tanpa heading)  "
                 f"{r['Model']} ({r['Versi']},{r['Korpus']})")
    (OUT / "ringkasan_precision.txt").write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"\n[saved] -> {OUT}")


if __name__ == "__main__":
    main()
