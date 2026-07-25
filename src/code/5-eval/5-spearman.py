"""
5-spearman.py — Spearman rho (kalibrasi cosine_sim vs grade pakar). SEKUNDER.
Mengukur apakah skor cosine model selaras dgn penilaian pakar. Per model x versi x korpus.
Output: src/output/5-eval/5-spearman/  Usage: python src/code/5-eval/5-spearman.py
"""

import sys
from pathlib import Path

import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from scipy.stats import spearmanr

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import load_annotations, short_model, short_versi, figdir, nama_display  # noqa: E402

def _save_plot(df_result, x_col, title, outfile):
    import math
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import seaborn as sns
    sns.set_theme(style="whitegrid")

    rp = df_result.copy()
    rp["Label"] = rp["Model"] + " (" + rp["Versi"] + ", " + rp["Korpus"] + ")"
    fig, ax = plt.subplots(figsize=(10, max(4, 0.45 * len(rp))))
    sns.barplot(data=rp, y="Label", x=x_col, hue="Versi",
                dodge=False, palette="Blues_d", ax=ax)
    
    if "Spearman" in x_col:
        ax.set_xlim(min(0, rp[x_col].min() - 0.1), 1)
    else:
        ax.set_xlim(0, 1)
        
    ax.set_title(title)
    for j, val in enumerate(rp[x_col]):
        if not math.isnan(val):
            ax.text(val + 0.01, j, f"{val:.3f}", va="center", fontsize=7)
    fig.tight_layout()
    fig.savefig(outfile, dpi=150, bbox_inches="tight")
    plt.close(fig)


def rho(d):
    out = {}
    for (m, v, db), grp in d.groupby(["model", "versi", "db"]):
        if grp["grade"].nunique() < 2 or len(grp) < 3:
            out[(m, v, db.upper())] = float("nan")
            continue
        r, _ = spearmanr(grp["cosine_sim"], grp["grade"])
        out[(m, v, db.upper())] = round(float(r), 4)
    return out


def per_query_spearman(d):
    from scipy.stats import spearmanr
    from common import load_query_texts
    import math
    qtext = load_query_texts()
    rows = []
    for (m, v, db), grp in d.groupby(["model", "versi", "db"]):
        for qid, qg in grp.groupby("query_id"):
            if qg["grade"].nunique() < 2 or len(qg) < 3:
                r = float("nan")
            else:
                r, _ = spearmanr(qg["cosine_sim"], qg["grade"])
            rows.append({"query_id": qid, "kueri": qtext.get(str(qid), ""),
                         "Model": short_model(m), "Versi": short_versi(v),
                         "Korpus": db.upper(), "Spearman": round(float(r), 4) if not math.isnan(float(r)) else float("nan")})
    return pd.DataFrame(rows)


def run_eval(df, inc, OUT, title=""):
    print(f"\n=== Spearman rho (cosine vs grade) {title} ===")
    OUT.mkdir(parents=True, exist_ok=True)
    full  = rho(df)
    clean = rho(df[~df["is_heading"]])

    res = pd.DataFrame([{"Model": short_model(m), "Versi": short_versi(v), "Korpus": db,
                         "Spearman": full[(m, v, db)],
                         "Spearman (tanpa heading)": clean.get((m, v, db), float("nan"))}
                        for (m, v, db) in full])
    res = res.sort_values("Spearman (tanpa heading)", ascending=False).reset_index(drop=True)
    res.to_csv(OUT / "spearman_per_model.csv", index=False, encoding="utf-8-sig")
    _save_plot(res, "Spearman (tanpa heading)", f"Spearman (tanpa heading) {title}", OUT / "plot_spearman.png")
    
    pq = per_query_spearman(df)
    pq.to_csv(OUT / "spearman_per_query.csv", index=False, encoding="utf-8-sig")
    
    # Delta Plot
    pq["Family"] = pq["Model"].str.replace(r"^gpl-", "", regex=True)
    piv = pq.pivot_table(index=["Korpus", "Family", "query_id", "kueri"],
                         columns="Versi", values="Spearman")
    if {"B", "GPL"}.issubset(piv.columns):
        piv = piv.dropna(subset=["B", "GPL"]).copy()
        piv["Δ(GPL-B)"] = (piv["GPL"] - piv["B"]).round(4)
        piv = piv.sort_values("Δ(GPL-B)").reset_index()
        piv.to_csv(OUT / "spearman_gpl_delta_per_query.csv", index=False, encoding="utf-8-sig")
        
        import matplotlib.pyplot as plt
        import seaborn as sns
        fig_d, ax_d = plt.subplots(figsize=(12, max(5, 0.25 * len(piv))))
        piv["Q_Label"] = piv.apply(lambda r: f"{str(r['kueri'])[:50]}...", axis=1)
        sns.barplot(data=piv, x="Δ(GPL-B)", y="Q_Label", hue="Family", dodge=True, ax=ax_d)
        ax_d.axvline(0, color='black', linewidth=1)
        ax_d.set_title(f"Δ(GPL - Base) Spearman per Kueri {title}")
        fig_d.tight_layout()
        fig_d.savefig(OUT / "plot_spearman_delta.png", dpi=150, bbox_inches="tight")
        plt.close(fig_d)
        
    # Boxplot
    import matplotlib.pyplot as plt
    import seaborn as sns
    fig_b, ax_b = plt.subplots(figsize=(10, max(5, 0.5 * pq["Model"].nunique())))
    pq["Label"] = pq["Model"] + " (" + pq["Versi"] + ", " + pq["Korpus"] + ")"
    sns.boxplot(data=pq, x="Spearman", y="Label", hue="Versi", dodge=False, ax=ax_b)
    sns.stripplot(data=pq, x="Spearman", y="Label", color='black', alpha=0.3, size=3, ax=ax_b)
    ax_b.set_xlim(-1, 1)
    ax_b.set_title(f"Sebaran Spearman Lintas Kueri {title}")
    fig_b.tight_layout()
    fig_b.savefig(OUT / "plot_spearman_per_query_dist.png", dpi=150, bbox_inches="tight")
    plt.close(fig_b)

    print(res.to_string(index=False))

    L = [f"=== Spearman rho (cosine vs grade) {title} ===", f"Pakar: {', '.join(inc)}", ""]
    for rank, (_, r) in enumerate(res.iterrows(), 1):
        L.append(f"  {rank:2d}. rho={r['Spearman (tanpa heading)']:.4f} (tanpa heading)  "
                 f"{r['Model']} ({r['Versi']},{r['Korpus']})")
    (OUT / "ringkasan_spearman.txt").write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"[saved] -> {OUT}")


def main():
    # 1. KONSENSUS
    df_cons, inc = load_annotations(consensus=True)
    if df_cons is not None:
        run_eval(df_cons, inc, figdir("5-spearman/konsensus"), title="[KONSENSUS]")

    # 2. PER PAKAR
    df_indiv, _ = load_annotations(consensus=False, verbose=False)
    if df_indiv is not None:
        for pakar in inc:
            df_p = df_indiv[df_indiv["expert"] == pakar].copy()
            run_eval(df_p, [pakar], figdir(f"5-spearman/{pakar}"), title=f"[{nama_display(pakar)}]")


if __name__ == "__main__":
    main()
