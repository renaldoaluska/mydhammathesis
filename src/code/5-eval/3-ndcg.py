"""
3-ndcg.py — nDCG@10 (UTAMA, nyambung BEIR/GPL) + nDCG@5, dari asesmen pakar.
Per model x versi(base/gpl) x korpus, DENGAN & TANPA heading (robustness).
Output: src/output/5-eval/3-ndcg/  (ndcg_per_model.csv, plot_ndcg.png, ringkasan_ndcg.txt)
Usage : python src/code/5-eval/3-ndcg.py   (perlu CSV anotasi dari web)
"""

import sys
from pathlib import Path
from datetime import datetime

import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt                                # noqa: E402
import seaborn as sns                                          # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import load_annotations, ndcg_at_k, short_model, short_versi, figdir  # noqa: E402

sns.set_theme(style="whitegrid")


def by_group(d, k):
    out = {}
    for (m, v, db), grp in d.groupby(["model", "versi", "db"]):
        sc = [ndcg_at_k(qg.sort_values("rank")["grade"].tolist(), k)
              for _, qg in grp.groupby("query_id")]
        out[(m, v, db.upper())] = round(sum(sc) / len(sc), 4) if sc else float("nan")
    return out


def main():
    print("=== nDCG (asesmen pakar) ===")
    df, inc = load_annotations()
    if df is None:
        return
    OUT = figdir("3-ndcg")

    full10  = by_group(df, 10)
    clean10 = by_group(df[~df["is_heading"]], 10)
    full5   = by_group(df, 5)

    res = pd.DataFrame([{"Model": short_model(m), "Versi": short_versi(v), "Korpus": db,
                         "nDCG@10": full10[(m, v, db)],
                         "nDCG@10 (tanpa heading)": clean10.get((m, v, db), float("nan")),
                         "nDCG@5": full5[(m, v, db)]} for (m, v, db) in full10])
    res["Δheading"] = (res["nDCG@10 (tanpa heading)"] - res["nDCG@10"]).round(4)
    res = res.sort_values("nDCG@10 (tanpa heading)", ascending=False).reset_index(drop=True)
    res.to_csv(OUT / "ndcg_per_model.csv", index=False, encoding="utf-8-sig")
    print("\n" + res.to_string(index=False))

    rp = res.copy()
    rp["Label"] = rp["Model"] + " (" + rp["Versi"] + ", " + rp["Korpus"] + ")"
    fig, ax = plt.subplots(figsize=(10, max(4, 0.45 * len(rp))))
    sns.barplot(data=rp, y="Label", x="nDCG@10 (tanpa heading)", hue="Versi",
                dodge=False, palette="Blues_d", ax=ax)
    ax.set_xlim(0, 1); ax.set_title("nDCG@10 (tanpa heading) per Model/Versi/Korpus")
    for j, val in enumerate(rp["nDCG@10 (tanpa heading)"]):
        ax.text(val + 0.01, j, f"{val:.3f}", va="center", fontsize=7)
    fig.tight_layout(); fig.savefig(OUT / "plot_ndcg.png", dpi=150, bbox_inches="tight"); plt.close(fig)

    bf = res.sort_values("nDCG@10", ascending=False).iloc[0]
    bc = res.iloc[0]
    L = [f"=== nDCG — {datetime.now():%Y-%m-%d %H:%M} ===",
         f"Pakar: {', '.join(inc)}   Korpus: {', '.join(sorted(df['db'].str.upper().unique()))}",
         f"Kueri/Model: {df['query_id'].nunique()}/{df['model'].nunique()}", "",
         f"Terbaik nDCG@10 (dgn heading)  : {bf['Model']} ({bf['Versi']},{bf['Korpus']}) = {bf['nDCG@10']:.4f}",
         f"Terbaik nDCG@10 (tanpa heading): {bc['Model']} ({bc['Versi']},{bc['Korpus']}) = {bc['nDCG@10 (tanpa heading)']:.4f}",
         "", "-- Peringkat (acuan: nDCG@10 tanpa heading) --"]
    for i, r in res.iterrows():
        L.append(f"  {i+1:2d}. @10={r['nDCG@10 (tanpa heading)']:.4f} "
                 f"(dgn head {r['nDCG@10']:.4f}, @5 {r['nDCG@5']:.4f}, Δ {r['Δheading']:+.4f})  "
                 f"{r['Model']} ({r['Versi']},{r['Korpus']})")
    (OUT / "ringkasan_ndcg.txt").write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"\n[saved] -> {OUT}")


if __name__ == "__main__":
    main()
