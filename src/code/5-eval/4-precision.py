"""
4-precision.py — P@5 + MRR@5 dari asesmen pakar (relevan = grade >= REL; REL=2 di common.py).
Per model x versi x korpus, dengan & tanpa heading. Output: src/output/5-eval/4-precision/
Usage : python src/code/5-eval/4-precision.py

⚠ KOREKSI DOCSTRING (2026-07-16): versi lama menulis "P@10 + MRR@10" -> SALAH.
Kode memakai K = 5 (lihat konstanta K di bawah), konsisten dengan pool eval top-5
(POOL_K/EVAL_PASSAGE_K di 7-retraining/7-rerank-pool.py) dan dengan angka yang
dilaporkan di output/8-reeval-llm/rangkuman_bab4_hasil.txt (nDCG@5, P@5).
Kalau ada dokumen/skripsi menulis @10 -> ikuti kode, bukan docstring lama.

RINCIAN RUMUS (fungsi pk_mrr) — dicatat supaya tidak "diperbaiki" jadi bug:
  P@5 : |{grade >= REL pada top-5}| / 5. Penyebut TETAP 5 walau pool suatu kueri
        berisi < 5 pasase (pool nyata bervariasi: 5 atau 3 baris/kueri). Ini
        definisi P@k baku (penyebut = k, bukan jumlah item tersedia) -> BUKAN bug.
  MRR : 1 / (peringkat pertama dengan grade >= REL). Dipindai atas SELURUH pool,
        bukan grades[:k]. Efektif setara MRR@5 karena pool sudah di-cap 5 oleh
        POOL_K; kalau suatu saat pool diperbesar, MRR di sini TIDAK ikut terpotong
        di 5 -> tambahkan slicing bila K harus mengikat.
"""

import sys
from pathlib import Path

import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import load_annotations, short_model, short_versi, figdir, REL, nama_display  # noqa: E402

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

K = 5


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


def per_query_precision(d, k=K):
    from common import load_query_texts
    qtext = load_query_texts()
    rows = []
    for (m, v, db), grp in d.groupby(["model", "versi", "db"]):
        for qid, qg in grp.groupby("query_id"):
            p, mrr = pk_mrr(qg.sort_values("rank")["grade"].tolist(), k)
            rows.append({"query_id": qid, "kueri": qtext.get(str(qid), ""),
                         "Model": short_model(m), "Versi": short_versi(v),
                         "Korpus": db.upper(), f"P@{k}": round(p, 4), f"MRR@{k}": round(mrr, 4)})
    return pd.DataFrame(rows)


def run_eval(df, inc, OUT, title=""):
    print(f"\n=== P@{K} + MRR@{K} (relevan = grade >= {REL}) {title} ===")
    OUT.mkdir(parents=True, exist_ok=True)
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
    _save_plot(res, f"P@{K} (tanpa heading)", f"P@{K} (tanpa heading) {title}", OUT / "plot_precision.png")
    
    pq = per_query_precision(df, K)
    pq.to_csv(OUT / "precision_per_query.csv", index=False, encoding="utf-8-sig")
    
    # Delta Plot
    pq["Family"] = pq["Model"].str.replace(r"^gpl-", "", regex=True)
    piv = pq.pivot_table(index=["Korpus", "Family", "query_id", "kueri"],
                         columns="Versi", values=f"P@{K}")
    if {"B", "GPL"}.issubset(piv.columns):
        piv = piv.dropna(subset=["B", "GPL"]).copy()
        piv["Δ(GPL-B)"] = (piv["GPL"] - piv["B"]).round(4)
        piv = piv.sort_values("Δ(GPL-B)").reset_index()
        piv.to_csv(OUT / "precision_gpl_delta_per_query.csv", index=False, encoding="utf-8-sig")
        
        import matplotlib.pyplot as plt
        import seaborn as sns
        fig_d, ax_d = plt.subplots(figsize=(12, max(5, 0.25 * len(piv))))
        piv["Q_Label"] = piv.apply(lambda r: f"{str(r['kueri'])[:50]}...", axis=1)
        sns.barplot(data=piv, x="Δ(GPL-B)", y="Q_Label", hue="Family", dodge=True, ax=ax_d)
        ax_d.axvline(0, color='black', linewidth=1)
        ax_d.set_title(f"Δ(GPL - Base) P@{K} per Kueri {title}")
        fig_d.tight_layout()
        fig_d.savefig(OUT / "plot_precision_delta.png", dpi=150, bbox_inches="tight")
        plt.close(fig_d)
        
    # Boxplot
    import matplotlib.pyplot as plt
    import seaborn as sns
    fig_b, ax_b = plt.subplots(figsize=(10, max(5, 0.5 * pq["Model"].nunique())))
    pq["Label"] = pq["Model"] + " (" + pq["Versi"] + ", " + pq["Korpus"] + ")"
    sns.boxplot(data=pq, x=f"P@{K}", y="Label", hue="Versi", dodge=False, ax=ax_b)
    sns.stripplot(data=pq, x=f"P@{K}", y="Label", color='black', alpha=0.3, size=3, ax=ax_b)
    ax_b.set_xlim(0, 1)
    ax_b.set_title(f"Sebaran P@{K} Lintas Kueri {title}")
    fig_b.tight_layout()
    fig_b.savefig(OUT / "plot_precision_per_query_dist.png", dpi=150, bbox_inches="tight")
    plt.close(fig_b)

    print(res.to_string(index=False))

    L = [f"=== P@{K} + MRR@{K} (relevan grade>={REL}) {title} ===",
         f"Pakar: {', '.join(inc)}", ""]
    for i, (_, r) in enumerate(res.iterrows()):
        L.append(f"  {i+1:2d}. P@{K}={r[f'P@{K} (tanpa heading)']:.4f} "
                 f"MRR={r[f'MRR@{K} (tanpa heading)']:.4f} (tanpa heading)  "
                 f"{r['Model']} ({r['Versi']},{r['Korpus']})")
    (OUT / "ringkasan_precision.txt").write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"[saved] -> {OUT}")


def main():
    # 1. KONSENSUS
    df_cons, inc = load_annotations(consensus=True)
    if df_cons is not None:
        run_eval(df_cons, inc, figdir("4-precision/konsensus"), title="[KONSENSUS]")

    # 2. PER PAKAR
    df_indiv, _ = load_annotations(consensus=False, verbose=False)
    if df_indiv is not None:
        for pakar in inc:
            df_p = df_indiv[df_indiv["expert"] == pakar].copy()
            run_eval(df_p, [pakar], figdir(f"4-precision/{pakar}"), title=f"[{nama_display(pakar)}]")


if __name__ == "__main__":
    main()
