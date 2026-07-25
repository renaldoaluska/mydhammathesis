"""
7-signifikansi.py — uji signifikansi base vs GPL per-kueri (reproducible source
untuk nilai-p yang dikutip di rangkuman_analisis.txt).

Membaca delta per-kueri yang sudah dihasilkan 3-ndcg/4-precision/5-spearman
(konsensus), lalu:
  - Wilcoxon signed-rank (paired, magnitudo)  -> scipy.stats.wilcoxon
  - Sign test / binomial (arah saja)          -> scipy.stats.binomtest
Output: src/output/5-eval/signifikansi.txt  Usage: python src/code/5-eval/7-signifikansi.py
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import wilcoxon, binomtest

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402

EVAL = config.EVAL_DIR
SRC = {
    "nDCG@5":   EVAL / "3-ndcg/konsensus/ndcg_gpl_delta_per_query.csv",
    "P@5":      EVAL / "4-precision/konsensus/precision_gpl_delta_per_query.csv",
    "Spearman": EVAL / "5-spearman/konsensus/spearman_gpl_delta_per_query.csv",
}
OUT = EVAL / "signifikansi.txt"


def analisa(metric, path, L):
    if not path.exists():
        L.append(f"\n[{metric}] sumber tak ada: {path.name}")
        return
    d = pd.read_csv(path).dropna(subset=["B", "GPL"])
    L.append(f"\n=== {metric} ===  (sumber: {path.relative_to(EVAL)})")
    tot_w = tot_l = 0
    for fam, g in d.groupby("Family"):
        b, gp = g["B"].to_numpy(float), g["GPL"].to_numpy(float)
        delta = gp - b
        win = int((delta > 0).sum()); lose = int((delta < 0).sum()); tie = int((delta == 0).sum())
        tot_w += win; tot_l += lose
        try:
            _, pw = wilcoxon(gp, b)
            pw = f"{pw:.4f}"
        except ValueError as e:
            pw = f"NA({e})"
        ps = binomtest(min(win, lose), win + lose, 0.5).pvalue if (win + lose) else float("nan")
        L.append(f"  {fam:26s} n={len(g):2d} | basē={b.mean():.4f} gpl̄={gp.mean():.4f} "
                 f"Δ̄={delta.mean():+.4f} | menang/kalah/seri={win}/{lose}/{tie} | "
                 f"Wilcoxon p={pw} | sign-test p={ps:.4f}")
    # sign test gabungan lintas-keluarga
    p_all = binomtest(min(tot_w, tot_l), tot_w + tot_l, 0.5).pvalue if (tot_w + tot_l) else float("nan")
    L.append(f"  {'GABUNGAN':26s}        | menang/kalah={tot_w}/{tot_l} "
             f"({tot_l/(tot_w+tot_l)*100:.0f}% minus) | sign-test p={p_all:.4f}")


def main():
    L = ["=== UJI SIGNIFIKANSI base vs GPL (konsensus pakar) ===",
         "Wilcoxon signed-rank: paired per-kueri, memperhitungkan magnitudo (scipy.stats.wilcoxon).",
         "Sign test: binomial p=0.5 atas jumlah menang/kalah, arah saja (scipy.stats.binomtest).",
         "Signifikan jika p < 0.05."]
    for metric, path in SRC.items():
        analisa(metric, path, L)
    OUT.write_text("\n".join(L) + "\n", encoding="utf-8")
    print("\n".join(L))
    print(f"\n[saved] -> {OUT}")


if __name__ == "__main__":
    main()
