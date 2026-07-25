"""
5-signifikansi.py — uji signifikansi base vs GPL vs exp1 per-kueri.

Membaca skor per-kueri yang dihasilkan 4-run_eval.py (konsensus), lalu
melakukan Wilcoxon signed-rank dan Sign test antara versi yang ditentukan
(misalnya 'exp1' vs 'GPL', atau 'exp1' vs 'B').
Output: output/8-reeval-llm/metrik/signifikansi.txt
"""
import sys
import argparse
from pathlib import Path
import pandas as pd
from scipy.stats import wilcoxon, binomtest

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config

BASE_METRIK = config.OUTPUT_DIR / "8-reeval-llm" / "metrik"   # di-scope per-eksperimen via --exp

def analisa(metric, path, L, baseline_ver, target_ver):
    if not path.exists():
        L.append(f"\n[{metric}] sumber tak ada: {path.name}")
        return
        
    df = pd.read_csv(path)
    if metric == "nDCG@5":
        val_col = "nDCG@5"
    elif metric == "P@5":
        val_col = "P@5"
    else:
        val_col = "Spearman"
        
    df["Family"] = df["Model"].str.replace(r"^gpl-", "", regex=True)
    
    # Pivot versi
    piv = df.pivot_table(index=["Korpus", "Family", "query_id", "kueri"], columns="Versi", values=val_col).reset_index()
    
    if baseline_ver not in piv.columns or target_ver not in piv.columns:
        L.append(f"\n[{metric}] Tidak ada kolom {baseline_ver} atau {target_ver} untuk dibandingkan.")
        return
        
    piv = piv.dropna(subset=[baseline_ver, target_ver]).copy()
    L.append(f"\n=== {metric} ({target_ver} vs {baseline_ver}) ===")
    
    tot_w = tot_l = 0
    for fam, g in piv.groupby("Family"):
        b = g[baseline_ver].to_numpy(float)
        gp = g[target_ver].to_numpy(float)
        delta = gp - b
        win = int((delta > 0).sum())
        lose = int((delta < 0).sum())
        tie = int((delta == 0).sum())
        
        tot_w += win; tot_l += lose
        try:
            _, pw = wilcoxon(gp, b)
            pw = f"{pw:.4f}"
        except ValueError as e:
            pw = f"NA({e})"
            
        ps = binomtest(min(win, lose), win + lose, 0.5).pvalue if (win + lose) else float("nan")
        L.append(f"  {fam:26s} n={len(g):2d} | {baseline_ver}̄={b.mean():.4f} {target_ver}̄={gp.mean():.4f} "
                 f"Δ̄={delta.mean():+.4f} | menang/kalah/seri={win}/{lose}/{tie} | "
                 f"Wilcoxon p={pw} | sign-test p={ps:.4f}")
                 
    # sign test gabungan lintas-keluarga
    p_all = binomtest(min(tot_w, tot_l), tot_w + tot_l, 0.5).pvalue if (tot_w + tot_l) else float("nan")
    L.append(f"  {'GABUNGAN':26s}        | menang/kalah={tot_w}/{tot_l} "
             f"({tot_l/(tot_w+tot_l)*100:.0f}% minus) | sign-test p={p_all:.4f}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--exp", help="scope metrik ke subfolder eksperimen (mis. exp1); juga target default")
    ap.add_argument("--baseline", default="GPL", help="versi pembanding (default GPL)")
    ap.add_argument("--target", help="versi yang diuji (default = --exp)")
    args = ap.parse_args()

    baseline = args.baseline
    target = args.target or args.exp or "exp1"
    metrik_dir = (BASE_METRIK / args.exp) if args.exp else BASE_METRIK
    src = {
        "nDCG@5":   metrik_dir / "konsensus" / "ndcg" / "ndcg_per_query.csv",
        "P@5":      metrik_dir / "konsensus" / "precision" / "precision_per_query.csv",
        "Spearman": metrik_dir / "konsensus" / "spearman" / "spearman_per_query.csv",
    }
    out = metrik_dir / "signifikansi.txt"
    out.parent.mkdir(parents=True, exist_ok=True)

    L = [f"=== UJI SIGNIFIKANSI {baseline} vs {target} ===",
         "Wilcoxon signed-rank: paired per-kueri, memperhitungkan magnitudo (scipy.stats.wilcoxon).",
         "Sign test: binomial p=0.5 atas jumlah menang/kalah, arah saja (scipy.stats.binomtest).",
         "Signifikan jika p < 0.05."]

    for metric, path in src.items():
        analisa(metric, path, L, baseline, target)

    out.write_text("\n".join(L) + "\n", encoding="utf-8")
    print("\n".join(L))
    print(f"\n[saved] -> {out}")

if __name__ == "__main__":
    main()
