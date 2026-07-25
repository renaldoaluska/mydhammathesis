"""
3-ndcg.py — nDCG@10 (UTAMA, nyambung BEIR/GPL) + nDCG@5, dari asesmen pakar.
Per model x versi(base/gpl) x korpus. IDCG = ideal GLOBAL-POOL per (korpus,kueri):
union passage (ref,author) yg dinilai lintas model -> base vs GPL diadu ke ideal SAMA.
(Heading tak relevan: build-cache INCLUDE_TITLES=False -> heading tak pernah dinilai.)
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
from common import (load_annotations, ndcg_at_k, short_model, short_versi,        # noqa: E402
                    figdir, load_query_texts, nama_display)

sns.set_theme(style="whitegrid")


def _ideal_pool(d):
    """{(db, query_id): [grade]} dari passage UNIK (ref,author) yg dinilai per
    korpus/kueri. Union lintas model/versi -> IDCG global-pool (semua model diadu
    ke ideal yang sama; model yg kelewatan dok relevan ter-penalti dengan benar)."""
    pcols = ["query_id", "db", "ref"] + (["author"] if "author" in d.columns else [])
    uniq = d.drop_duplicates(subset=pcols)
    return {key: grp["grade"].tolist() for key, grp in uniq.groupby(["db", "query_id"])}


def by_group(d, k):
    pool = _ideal_pool(d)
    out = {}
    for (m, v, db), grp in d.groupby(["model", "versi", "db"]):
        sc = [ndcg_at_k(qg.sort_values("rank")["grade"].tolist(), k,
                        ideal_grades=pool.get((db, qid)))
              for qid, qg in grp.groupby("query_id")]
        out[(m, v, db.upper())] = round(sum(sc) / len(sc), 4) if sc else float("nan")
    return out


def per_query(d, k=5):
    """nDCG@k per (kueri, model, versi, korpus) — IDCG global-pool sama spt agregat.
    Buat ngebedah: di kueri mana tiap model kuat/lemah (bahan diskusi base-vs-GPL)."""
    pool = _ideal_pool(d)
    qtext = load_query_texts()
    rows = []
    for (m, v, db), grp in d.groupby(["model", "versi", "db"]):
        for qid, qg in grp.groupby("query_id"):
            sc = ndcg_at_k(qg.sort_values("rank")["grade"].tolist(), k,
                           ideal_grades=pool.get((db, qid)))
            rows.append({"query_id": qid, "kueri": qtext.get(str(qid), ""),
                         "Model": short_model(m), "Versi": short_versi(v),
                         "Korpus": db.upper(), f"nDCG@{k}": round(sc, 4)})
    return pd.DataFrame(rows)


def run_eval(df, inc, OUT, title=""):
    print(f"\n=== nDCG (asesmen pakar) {title} ===")
    OUT.mkdir(parents=True, exist_ok=True)
    n5  = by_group(df, 5)

    res = pd.DataFrame([{"Model": short_model(m), "Versi": short_versi(v), "Korpus": db,
                         "nDCG@5": n5[(m, v, db)]} for (m, v, db) in n5])
    res = res.sort_values("nDCG@5", ascending=False).reset_index(drop=True)
    res.to_csv(OUT / "ndcg_per_model.csv", index=False, encoding="utf-8-sig")
    print(res.to_string(index=False))

    # --- per-kueri (bahan diskusi: di kueri mana GPL naik/turun vs base) ---
    pq = per_query(df, 5)
    pq.to_csv(OUT / "ndcg_per_query.csv", index=False, encoding="utf-8-sig")
    pq["Family"] = pq["Model"].str.replace(r"^gpl-", "", regex=True)
    piv = pq.pivot_table(index=["Korpus", "Family", "query_id", "kueri"],
                         columns="Versi", values="nDCG@5")
    if {"B", "GPL"}.issubset(piv.columns):
        piv = piv.dropna(subset=["B", "GPL"]).copy()
        piv["Δ(GPL-B)"] = (piv["GPL"] - piv["B"]).round(4)
        piv = piv.sort_values("Δ(GPL-B)").reset_index()
        piv.to_csv(OUT / "ndcg_gpl_delta_per_query.csv", index=False, encoding="utf-8-sig")
        win = (piv["Δ(GPL-B)"] > 0).sum(); lose = (piv["Δ(GPL-B)"] < 0).sum()
        print(f"\n[per-kueri] GPL vs base: naik={win}, turun={lose}, seri={len(piv)-win-lose} "
              f"dari {len(piv)} (family,kueri)")
              
        # --- Plot Delta GPL vs Base ---
        fig_d, ax_d = plt.subplots(figsize=(12, max(5, 0.25 * len(piv))))
        # Apply truncation properly
        piv["Q_Label"] = piv.apply(lambda r: f"{str(r['kueri'])[:50]}...", axis=1)
        sns.barplot(data=piv, x="Δ(GPL-B)", y="Q_Label", hue="Family", dodge=True, ax=ax_d)
        ax_d.axvline(0, color='black', linewidth=1)
        ax_d.set_title(f"Δ(GPL - Base) nDCG@5 per Kueri {title}")
        fig_d.tight_layout()
        fig_d.savefig(OUT / "plot_ndcg_delta.png", dpi=150, bbox_inches="tight")
        plt.close(fig_d)
        
    # --- Plot Boxplot Distribusi nDCG per Kueri ---
    fig_b, ax_b = plt.subplots(figsize=(10, max(5, 0.5 * pq["Model"].nunique())))
    pq["Label"] = pq["Model"] + " (" + pq["Versi"] + ", " + pq["Korpus"] + ")"
    sns.boxplot(data=pq, x="nDCG@5", y="Label", hue="Versi", dodge=False, ax=ax_b)
    sns.stripplot(data=pq, x="nDCG@5", y="Label", color='black', alpha=0.3, size=3, ax=ax_b)
    ax_b.set_xlim(0, 1)
    ax_b.set_title(f"Sebaran nDCG@5 Lintas Kueri {title}")
    fig_b.tight_layout()
    fig_b.savefig(OUT / "plot_ndcg_per_query_dist.png", dpi=150, bbox_inches="tight")
    plt.close(fig_b)

    rp = res.copy()
    rp["Label"] = rp["Model"] + " (" + rp["Versi"] + ", " + rp["Korpus"] + ")"
    fig, ax = plt.subplots(figsize=(10, max(4, 0.45 * len(rp))))
    sns.barplot(data=rp, y="Label", x="nDCG@5", hue="Versi",
                dodge=False, palette="Blues_d", ax=ax)
    ax.set_xlim(0, 1); ax.set_title(f"nDCG@5 per Model/Versi/Korpus {title}")
    for j, val in enumerate(rp["nDCG@5"]):
        ax.text(val + 0.01, j, f"{val:.3f}", va="center", fontsize=7)
    fig.tight_layout(); fig.savefig(OUT / "plot_ndcg.png", dpi=150, bbox_inches="tight"); plt.close(fig)

    best = res.iloc[0] if len(res) else None
    L = [f"=== nDCG {title} — {datetime.now():%Y-%m-%d %H:%M} ===",
         f"Pakar: {', '.join(inc)}   Korpus: {', '.join(sorted(df['db'].astype(str).str.upper().unique()))}",
         f"Kueri/Model: {df['query_id'].nunique()}/{df['model'].nunique()}",
         "IDCG: global-pool per (korpus,kueri) — base vs GPL diadu ke ideal sama.", ""]
    if best is not None:
        L.extend([f"Terbaik nDCG@5: {best['Model']} ({best['Versi']},{best['Korpus']}) = {best['nDCG@5']:.4f}",
             "", "-- Peringkat (acuan: nDCG@5) --"])
    for i, (_, r) in enumerate(res.iterrows()):
        L.append(f"  {i+1:2d}. @5={r['nDCG@5']:.4f}  "
                 f"{r['Model']} ({r['Versi']},{r['Korpus']})")
    (OUT / "ringkasan_ndcg.txt").write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"\n[saved] -> {OUT}")


def main():
    # 1. KONSENSUS
    df_cons, inc = load_annotations(consensus=True)
    if df_cons is not None:
        run_eval(df_cons, inc, figdir("3-ndcg/konsensus"), title="[KONSENSUS]")

    # 2. PER PAKAR
    df_indiv, _ = load_annotations(consensus=False, verbose=False)
    if df_indiv is not None:
        for pakar in inc:
            df_p = df_indiv[df_indiv["expert"] == pakar].copy()
            run_eval(df_p, [pakar], figdir(f"3-ndcg/{pakar}"), title=f"[{nama_display(pakar)}]")


if __name__ == "__main__":
    main()
