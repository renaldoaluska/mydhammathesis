"""
6-iaa.py — Inter-Annotator Agreement antar pakar (eval-2/3, butuh >= 2 pakar).

Cohen's kappa (quadratic-weighted, cocok untuk grade ordinal 0-3) + persen setuju,
dihitung pada pasase yang DINILAI >1 pakar (irisan per query_id+ref).
consensus=False supaya grade per-pakar dipertahankan.
Output: src/output/5-eval/6-iaa/  Usage: python src/code/5-eval/6-iaa.py
"""

import sys
from itertools import combinations
from pathlib import Path

import pandas as pd
from sklearn.metrics import cohen_kappa_score

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import load_annotations, figdir  # noqa: E402


def main():
    print("=== Inter-Annotator Agreement (IAA) ===")
    df, inc = load_annotations(consensus=False)
    if df is None:
        return
    if df["expert"].nunique() < 2:
        print(f"  Hanya {df['expert'].nunique()} pakar -> IAA butuh >= 2. "
              f"(eval-1: 1 pakar; tunggu eval-2/3.)")
        return
    if "ref" not in df.columns:
        print("  Kolom 'ref' tidak ada; tidak bisa cocokkan pasase antar pakar.")
        return

    OUT = figdir("6-iaa")
    # 1 grade per (pakar, query_id, ref)
    g = (df.groupby(["expert", "query_id", "ref"], as_index=False)["grade"].mean())
    piv = g.pivot_table(index=["query_id", "ref"], columns="expert", values="grade")

    rows = []
    for a, b in combinations(sorted(piv.columns), 2):
        sub = piv[[a, b]].dropna()
        n = len(sub)
        if n < 2:
            rows.append({"Pakar A": a, "Pakar B": b, "n_overlap": n,
                         "Kappa(quad)": float("nan"), "%setuju": float("nan")})
            continue
        ra = sub[a].round().astype(int)
        rb = sub[b].round().astype(int)
        try:
            kappa = cohen_kappa_score(ra, rb, weights="quadratic")
        except Exception:
            kappa = float("nan")
        agree = float((ra == rb).mean())
        rows.append({"Pakar A": a, "Pakar B": b, "n_overlap": n,
                     "Kappa(quad)": round(kappa, 4), "%setuju": round(agree, 4)})

    res = pd.DataFrame(rows)
    res.to_csv(OUT / "iaa_pairwise.csv", index=False, encoding="utf-8-sig")
    print("\n" + res.to_string(index=False))

    valid = res["Kappa(quad)"].dropna()
    L = ["=== IAA (Cohen kappa quadratic) ===",
         f"Pakar: {', '.join(inc)}",
         f"Rata-rata kappa pasangan: {valid.mean():.4f}" if len(valid) else "Irisan antar-pakar terlalu kecil.",
         "", "Interpretasi kappa: <0.2 buruk, 0.2-0.4 cukup, 0.4-0.6 sedang, 0.6-0.8 baik, >0.8 sangat baik.", ""]
    for _, r in res.iterrows():
        L.append(f"  {r['Pakar A']} vs {r['Pakar B']}: kappa={r['Kappa(quad)']}, "
                 f"setuju={r['%setuju']}, n={r['n_overlap']}")
    (OUT / "ringkasan_iaa.txt").write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"\n[saved] -> {OUT}")


if __name__ == "__main__":
    main()
