"""
5-spearman.py — Spearman rho (kalibrasi cosine_sim vs grade pakar). SEKUNDER.
Mengukur apakah skor cosine model selaras dgn penilaian pakar. Per model x versi x korpus.
Output: src/output/5-eval/5-spearman/  Usage: python src/code/5-eval/5-spearman.py
"""

import sys
from pathlib import Path

import pandas as pd
from scipy.stats import spearmanr

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import load_annotations, short_model, short_versi, figdir  # noqa: E402


def rho(d):
    out = {}
    for (m, v, db), grp in d.groupby(["model", "versi", "db"]):
        if grp["grade"].nunique() < 2 or len(grp) < 3:
            out[(m, v, db.upper())] = float("nan")
            continue
        r, _ = spearmanr(grp["cosine_sim"], grp["grade"])
        out[(m, v, db.upper())] = round(float(r), 4)
    return out


def main():
    print("=== Spearman rho (cosine vs grade) ===")
    df, inc = load_annotations()
    if df is None:
        return
    OUT = figdir("5-spearman")
    full  = rho(df)
    clean = rho(df[~df["is_heading"]])

    res = pd.DataFrame([{"Model": short_model(m), "Versi": short_versi(v), "Korpus": db,
                         "Spearman": full[(m, v, db)],
                         "Spearman (tanpa heading)": clean.get((m, v, db), float("nan"))}
                        for (m, v, db) in full])
    res = res.sort_values("Spearman (tanpa heading)", ascending=False).reset_index(drop=True)
    res.to_csv(OUT / "spearman_per_model.csv", index=False, encoding="utf-8-sig")
    print("\n" + res.to_string(index=False))

    L = ["=== Spearman rho (cosine vs grade) ===", f"Pakar: {', '.join(inc)}", ""]
    for i, r in res.iterrows():
        L.append(f"  {i+1:2d}. rho={r['Spearman (tanpa heading)']:.4f} (tanpa heading)  "
                 f"{r['Model']} ({r['Versi']},{r['Korpus']})")
    (OUT / "ringkasan_spearman.txt").write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"\n[saved] -> {OUT}")


if __name__ == "__main__":
    main()
