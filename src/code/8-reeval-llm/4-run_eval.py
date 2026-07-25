"""
4-run-eval.py — eval metrik (nDCG, P@k, Spearman, IAA) pakai anotasi LLM judge.

Sama persis logikanya dgn 5-eval/3..6, tapi baca dari anotasi-llm/ (TERPISAH
dari anotasi/ pakar manusia). Output ke 6-eval-llm/output/.

Usage:
  python 4-run-eval.py              # semua
  python 4-run-eval.py ndcg         # ndcg doang
  python 4-run-eval.py iaa          # iaa doang
"""

import sys
import argparse
import math
from pathlib import Path
from itertools import combinations
from datetime import datetime

import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
sns.set_theme(style="whitegrid")

def _save_plot(df_result, x_col, title, outfile):
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

def _save_heatmap(df, val_col, title, outfile):
    sns.set_theme(style="white")
    pakars = sorted(list(set(df["Judge A"]).union(set(df["Judge B"]))))
    matrix = pd.DataFrame(index=pakars, columns=pakars, dtype=float)
    for _, row in df.iterrows():
        a, b, val = row["Judge A"], row["Judge B"], row[val_col]
        matrix.loc[a, b] = matrix.loc[b, a] = val
    for p in pakars:
        matrix.loc[p, p] = 1.0
    # rapikan label sumbu jadi nama judge (bukan underscore)
    matrix.index = [nama_display(p) for p in matrix.index]
    matrix.columns = [nama_display(p) for p in matrix.columns]
    fig, ax = plt.subplots(figsize=(7, 6))
    sns.heatmap(matrix, annot=True, fmt=".2f", cmap="YlGnBu", vmin=-1, vmax=1, ax=ax)
    ax.set_title(title)
    fig.tight_layout()
    fig.savefig(outfile, dpi=150, bbox_inches="tight")
    plt.close(fig)
    import config

# Harus import common dari 6-eval-llm (robust thd kedalaman folder)
_SRC = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_SRC / "code" / "6-eval-llm"))
from common import (load_annotations, ndcg_at_k, short_model, short_versi,  # noqa: E402
                    load_query_texts, REL, nama_display)

ROOT = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(ROOT))
import config  # noqa: E402

# OUTPUT LAMA LLM -> OUTPUT BARU
ANOTASI_DIR = config.OUTPUT_DIR / "8-reeval-llm" / "anotasi"
METRIK_DIR  = config.OUTPUT_DIR / "8-reeval-llm" / "metrik"
current_eval_name = "konsensus"


def outdir(nama):
    d = METRIK_DIR / current_eval_name / nama
    d.mkdir(parents=True, exist_ok=True)
    return d


# ---------- nDCG ----------

def ideal_pool(df):
    """Union passage unik per (db, query_id) buat IDCG global-pool."""
    cols = ["query_id", "db", "ref"] + (["author"] if "author" in df.columns else [])
    unik = df.drop_duplicates(subset=cols)
    return {k: g["grade"].tolist() for k, g in unik.groupby(["db", "query_id"])}


def hitung_ndcg(df, k):
    pool = ideal_pool(df)
    hasil = {}
    for (model, versi, db), grp in df.groupby(["model", "versi", "db"]):
        skor = [ndcg_at_k(qg.sort_values("rank")["grade"].tolist(), k,
                          ideal_grades=pool.get((db, qid)))
                for qid, qg in grp.groupby("query_id")]
        rata2 = round(sum(skor) / len(skor), 4) if skor else float("nan")
        hasil[(model, versi, db.upper())] = rata2
    return hasil


def eval_ndcg(df, judges):
    print("\n=== nDCG (LLM judge) ===")
    dest = outdir("ndcg")

    n5  = hitung_ndcg(df, 5)

    tabel = pd.DataFrame([
        {"Model": short_model(m), "Versi": short_versi(v), "Korpus": db,
         "nDCG@5": n5[(m, v, db)]}
        for (m, v, db) in n5
    ]).sort_values("nDCG@5", ascending=False).reset_index(drop=True)

    tabel.to_csv(dest / "ndcg_per_model.csv", index=False, encoding="utf-8-sig")
    _save_plot(tabel, "nDCG@5", f"nDCG@5 (LLM: {', '.join(nama_display(j) for j in judges)})", dest / "plot_ndcg.png")
    print("\n" + tabel.to_string(index=False))

    # per-kueri breakdown
    teks_kueri = load_query_texts()
    pool = ideal_pool(df)
    baris = []
    for (m, v, db), grp in df.groupby(["model", "versi", "db"]):
        for qid, qg in grp.groupby("query_id"):
            sc = ndcg_at_k(qg.sort_values("rank")["grade"].tolist(), 5,
                           ideal_grades=pool.get((db, qid)))
            baris.append({"query_id": qid, "kueri": teks_kueri.get(str(qid), ""),
                          "Model": short_model(m), "Versi": short_versi(v),
                          "Korpus": db.upper(), "nDCG@5": round(sc, 4)})
    pq = pd.DataFrame(baris)
    pq.to_csv(dest / "ndcg_per_query.csv", index=False, encoding="utf-8-sig")
    
    # --- Delta (versi - Base) nDCG@5 per Kueri, per target (exp1 & GPL) — samakan precision/spearman ---
    pq["Family"] = pq["Model"].str.replace(r"^gpl-", "", regex=True)
    piv = pq.pivot_table(index=["Korpus", "Family", "query_id", "kueri"], columns="Versi", values="nDCG@5")
    if "B" in piv.columns:
        targets = [c for c in piv.columns if c not in ("B", "Korpus", "Family", "query_id", "kueri")]
        for tgt in targets:
            df_tgt = piv.dropna(subset=["B", tgt]).copy()
            if df_tgt.empty:
                continue
            col_name = f"Δ({tgt}-B)"
            df_tgt[col_name] = (df_tgt[tgt] - df_tgt["B"]).round(4)
            df_tgt = df_tgt.sort_values(col_name).reset_index()
            df_tgt.to_csv(dest / f"ndcg_{tgt}_delta_per_query.csv", index=False, encoding="utf-8-sig")
            fig_d, ax_d = plt.subplots(figsize=(12, max(5, 0.25 * len(df_tgt))))
            df_tgt["Q_Label"] = df_tgt.apply(lambda r: f"{str(r['kueri'])[:50]}...", axis=1)
            sns.barplot(data=df_tgt, x=col_name, y="Q_Label", hue="Family", dodge=True, ax=ax_d)
            ax_d.axvline(0, color='black', linewidth=1)
            ax_d.set_title(f"Δ({tgt} - Base) nDCG@5 per Kueri (LLM: {', '.join(nama_display(j) for j in judges)})")
            fig_d.tight_layout()
            fig_d.savefig(dest / f"plot_ndcg_{tgt}_delta.png", dpi=150, bbox_inches="tight")
            plt.close(fig_d)

    # --- Plot Boxplot Distribusi nDCG per Kueri ---
    fig_b, ax_b = plt.subplots(figsize=(10, max(5, 0.5 * pq["Model"].nunique())))
    pq["Label"] = pq["Model"] + " (" + pq["Versi"] + ", " + pq["Korpus"] + ")"
    sns.boxplot(data=pq, x="nDCG@5", y="Label", hue="Versi", dodge=False, ax=ax_b)
    sns.stripplot(data=pq, x="nDCG@5", y="Label", color='black', alpha=0.3, size=3, ax=ax_b)
    ax_b.set_xlim(0, 1)
    ax_b.set_title(f"Sebaran nDCG@5 Lintas Kueri (LLM: {', '.join(nama_display(j) for j in judges)})")
    fig_b.tight_layout()
    fig_b.savefig(dest / "plot_ndcg_per_query_dist.png", dpi=150, bbox_inches="tight")
    plt.close(fig_b)

    # --- Heatmap nDCG@5 per-kueri berlabel (Q1..Qn x model) ---
    # Baris = model (urut nDCG rata2, terbaik di atas), kolom = query_id terurut.
    # Sel kosong (NaN) = kueri itu belum dinilai utk model tsb (mis. baseline Q23-30).
    hm = pq.pivot_table(index="Label", columns="query_id", values="nDCG@5")
    hm = hm.reindex(sorted(hm.columns), axis=1)
    hm = hm.loc[hm.mean(axis=1).sort_values(ascending=False).index]
    fig_h, ax_h = plt.subplots(figsize=(max(10, 0.45 * hm.shape[1]),
                                        max(4, 0.6 * hm.shape[0])))
    sns.heatmap(hm, ax=ax_h, cmap="RdYlGn", vmin=0, vmax=1, annot=True, fmt=".2f",
                annot_kws={"size": 7}, linewidths=.5, linecolor="white",
                cbar_kws={"label": "nDCG@5"})
    ax_h.set_title(f"nDCG@5 per Kueri (LLM: {', '.join(nama_display(j) for j in judges)}) — sel kosong = kueri belum dinilai")
    ax_h.set_xlabel("query_id")
    ax_h.set_ylabel("")
    fig_h.tight_layout()
    fig_h.savefig(dest / "plot_ndcg_per_query_heatmap.png", dpi=150, bbox_inches="tight")
    plt.close(fig_h)

    ringkasan = [f"=== nDCG (LLM judge) — {datetime.now():%Y-%m-%d %H:%M} ===",
                 f"Judge: {', '.join(nama_display(j) for j in judges)}", ""]
    for i, (_, r) in enumerate(tabel.iterrows()):
        ringkasan.append(f"  {i+1:2d}. @5={r['nDCG@5']:.4f}  "
                         f"{r['Model']} ({r['Versi']},{r['Korpus']})")
    (dest / "ringkasan_ndcg.txt").write_text("\n".join(ringkasan) + "\n", encoding="utf-8")
    print(f"[saved] -> {dest}")


# ---------- P@k + MRR ----------

def pk_mrr(grades, k=10):
    top = grades[:k]
    p = sum(1 for g in top if g >= REL) / k
    mrr = 0.0
    for i, g in enumerate(grades):
        if g >= REL:
            mrr = 1.0 / (i + 1)
            break
    return p, mrr


def eval_precision(df, judges):
    print("\n=== P@5 + MRR@5 (LLM judge) ===")
    dest = outdir("precision")
    K = 5

    def hitung(data):
        hasil = {}
        for (m, v, db), grp in data.groupby(["model", "versi", "db"]):
            ps, ms = [], []
            for _, qg in grp.groupby("query_id"):
                p, m_val = pk_mrr(qg.sort_values("rank")["grade"].tolist(), K)
                ps.append(p); ms.append(m_val)
            hasil[(m, v, db.upper())] = (round(sum(ps)/len(ps), 4) if ps else float("nan"),
                                         round(sum(ms)/len(ms), 4) if ms else float("nan"))
        return hasil

    semua = hitung(df)
    tanpa_heading = hitung(df[~df["is_heading"]])

    baris = []
    for (m, v, db), (p, mrr) in semua.items():
        cp, cm = tanpa_heading.get((m, v, db), (float("nan"), float("nan")))
        baris.append({"Model": short_model(m), "Versi": short_versi(v), "Korpus": db,
                      f"P@{K}": p, f"MRR@{K}": mrr,
                      f"P@{K} (tanpa heading)": cp, f"MRR@{K} (tanpa heading)": cm})
    tabel = pd.DataFrame(baris).sort_values(f"P@{K} (tanpa heading)", ascending=False).reset_index(drop=True)
    tabel.to_csv(dest / "precision_per_model.csv", index=False, encoding="utf-8-sig")
    _save_plot(tabel, f"P@{K} (tanpa heading)", f"P@{K} (tanpa heading) (LLM: {', '.join(nama_display(j) for j in judges)})", dest / "plot_precision.png")
    
    # per kueri
    teks_kueri = load_query_texts()
    baris_pq = []
    for (m, v, db), grp in df.groupby(["model", "versi", "db"]):
        for qid, qg in grp.groupby("query_id"):
            p, m_val = pk_mrr(qg.sort_values("rank")["grade"].tolist(), K)
            baris_pq.append({"query_id": qid, "kueri": teks_kueri.get(str(qid), ""),
                             "Model": short_model(m), "Versi": short_versi(v),
                             "Korpus": db.upper(), f"P@{K}": round(p, 4), f"MRR@{K}": round(m_val, 4)})
    pq = pd.DataFrame(baris_pq)
    pq.to_csv(dest / "precision_per_query.csv", index=False, encoding="utf-8-sig")
    
    # Delta Plot
    pq["Family"] = pq["Model"].str.replace(r"^gpl-", "", regex=True)
    piv = pq.pivot_table(index=["Korpus", "Family", "query_id", "kueri"], columns="Versi", values=f"P@{K}")
    if "B" in piv.columns:
        targets = [c for c in piv.columns if c not in ("B", "Korpus", "Family", "query_id", "kueri")]
        for tgt in targets:
            df_tgt = piv.dropna(subset=["B", tgt]).copy()
            if df_tgt.empty: continue
            col_name = f"Δ({tgt}-B)"
            df_tgt[col_name] = (df_tgt[tgt] - df_tgt["B"]).round(4)
            df_tgt = df_tgt.sort_values(col_name).reset_index()
            df_tgt.to_csv(dest / f"precision_{tgt}_delta_per_query.csv", index=False, encoding="utf-8-sig")
            
            fig_d, ax_d = plt.subplots(figsize=(12, max(5, 0.25 * len(df_tgt))))
            df_tgt["Q_Label"] = df_tgt.apply(lambda r: f"{str(r['kueri'])[:50]}...", axis=1)
            sns.barplot(data=df_tgt, x=col_name, y="Q_Label", hue="Family", dodge=True, ax=ax_d)
            ax_d.axvline(0, color='black', linewidth=1)
            ax_d.set_title(f"Δ({tgt} - Base) P@{K} per Kueri (LLM: {', '.join(nama_display(j) for j in judges)})")
            fig_d.tight_layout()
            fig_d.savefig(dest / f"plot_precision_{tgt}_delta.png", dpi=150, bbox_inches="tight")
            plt.close(fig_d)

    # Boxplot
    fig_b, ax_b = plt.subplots(figsize=(10, max(5, 0.5 * pq["Model"].nunique())))
    pq["Label"] = pq["Model"] + " (" + pq["Versi"] + ", " + pq["Korpus"] + ")"
    sns.boxplot(data=pq, x=f"P@{K}", y="Label", hue="Versi", dodge=False, ax=ax_b)
    sns.stripplot(data=pq, x=f"P@{K}", y="Label", color='black', alpha=0.3, size=3, ax=ax_b)
    ax_b.set_xlim(0, 1)
    ax_b.set_title(f"Sebaran P@{K} Lintas Kueri (LLM: {', '.join(nama_display(j) for j in judges)})")
    fig_b.tight_layout()
    fig_b.savefig(dest / "plot_precision_per_query_dist.png", dpi=150, bbox_inches="tight")
    plt.close(fig_b)

    print("\n" + tabel.to_string(index=False))
    print(f"[saved] -> {dest}")


# ---------- Spearman ----------

def eval_spearman(df, judges):
    from scipy.stats import spearmanr
    print("\n=== Spearman rho (LLM judge) ===")
    dest = outdir("spearman")

    def hitung_rho(data):
        hasil = {}
        for (m, v, db), grp in data.groupby(["model", "versi", "db"]):
            if grp["grade"].nunique() < 2 or len(grp) < 3:
                hasil[(m, v, db.upper())] = float("nan")
                continue
            r, _ = spearmanr(grp["cosine_sim"], grp["grade"])
            hasil[(m, v, db.upper())] = round(float(r), 4)
        return hasil

    semua = hitung_rho(df)
    tanpa_heading = hitung_rho(df[~df["is_heading"]])

    tabel = pd.DataFrame([
        {"Model": short_model(m), "Versi": short_versi(v), "Korpus": db,
         "Spearman": semua[(m, v, db)],
         "Spearman (tanpa heading)": tanpa_heading.get((m, v, db), float("nan"))}
        for (m, v, db) in semua
    ]).sort_values("Spearman (tanpa heading)", ascending=False).reset_index(drop=True)

    tabel.to_csv(dest / "spearman_per_model.csv", index=False, encoding="utf-8-sig")
    _save_plot(tabel, "Spearman (tanpa heading)", f"Spearman (tanpa heading) (LLM: {', '.join(nama_display(j) for j in judges)})", dest / "plot_spearman.png")

    # per kueri
    teks_kueri = load_query_texts()
    baris_pq = []
    for (m, v, db), grp in df.groupby(["model", "versi", "db"]):
        for qid, qg in grp.groupby("query_id"):
            if qg["grade"].nunique() < 2 or len(qg) < 3:
                r = float("nan")
            else:
                r, _ = spearmanr(qg["cosine_sim"], qg["grade"])
            baris_pq.append({"query_id": qid, "kueri": teks_kueri.get(str(qid), ""),
                             "Model": short_model(m), "Versi": short_versi(v),
                             "Korpus": db.upper(), "Spearman": round(float(r), 4) if not math.isnan(float(r)) else float("nan")})
    pq = pd.DataFrame(baris_pq)
    pq.to_csv(dest / "spearman_per_query.csv", index=False, encoding="utf-8-sig")

    # Delta Plot
    pq["Family"] = pq["Model"].str.replace(r"^gpl-", "", regex=True)
    piv = pq.pivot_table(index=["Korpus", "Family", "query_id", "kueri"], columns="Versi", values="Spearman")
    if "B" in piv.columns:
        targets = [c for c in piv.columns if c not in ("B", "Korpus", "Family", "query_id", "kueri")]
        for tgt in targets:
            df_tgt = piv.dropna(subset=["B", tgt]).copy()
            if df_tgt.empty: continue
            col_name = f"Δ({tgt}-B)"
            df_tgt[col_name] = (df_tgt[tgt] - df_tgt["B"]).round(4)
            df_tgt = df_tgt.sort_values(col_name).reset_index()
            df_tgt.to_csv(dest / f"spearman_{tgt}_delta_per_query.csv", index=False, encoding="utf-8-sig")
            
            fig_d, ax_d = plt.subplots(figsize=(12, max(5, 0.25 * len(df_tgt))))
            df_tgt["Q_Label"] = df_tgt.apply(lambda r: f"{str(r['kueri'])[:50]}...", axis=1)
            sns.barplot(data=df_tgt, x=col_name, y="Q_Label", hue="Family", dodge=True, ax=ax_d)
            ax_d.axvline(0, color='black', linewidth=1)
            ax_d.set_title(f"Δ({tgt} - Base) Spearman per Kueri (LLM: {', '.join(nama_display(j) for j in judges)})")
            fig_d.tight_layout()
            fig_d.savefig(dest / f"plot_spearman_{tgt}_delta.png", dpi=150, bbox_inches="tight")
            plt.close(fig_d)

    # Boxplot
    fig_b, ax_b = plt.subplots(figsize=(10, max(5, 0.5 * pq["Model"].nunique())))
    pq["Label"] = pq["Model"] + " (" + pq["Versi"] + ", " + pq["Korpus"] + ")"
    sns.boxplot(data=pq, x="Spearman", y="Label", hue="Versi", dodge=False, ax=ax_b)
    sns.stripplot(data=pq, x="Spearman", y="Label", color='black', alpha=0.3, size=3, ax=ax_b)
    ax_b.set_xlim(-1, 1)
    ax_b.set_title(f"Sebaran Spearman Lintas Kueri (LLM: {', '.join(nama_display(j) for j in judges)})")
    fig_b.tight_layout()
    fig_b.savefig(dest / "plot_spearman_per_query_dist.png", dpi=150, bbox_inches="tight")
    plt.close(fig_b)

    print("\n" + tabel.to_string(index=False))
    print(f"[saved] -> {dest}")


# ---------- IAA ----------

def eval_iaa():
    """IAA antar LLM judge. Butuh >= 2 judge di anotasi-llm/."""
    from sklearn.metrics import cohen_kappa_score
    print("\n=== IAA antar LLM judge ===")

    # baca ulang TANPA consensus — grade tiap judge dipertahankan
    df, daftar_judge = load_annotations(consensus=False, anotasi_dir=ANOTASI_DIR)
    if df is None:
        return
    if df["expert"].nunique() < 2:
        print(f"  Baru {df['expert'].nunique()} judge -> IAA butuh minimal 2.")
        return
    if "ref" not in df.columns:
        print("  Kolom 'ref' tidak ada.")
        return

    dest = outdir("iaa")
    kunci_pasase = ["query_id", "ref"] + (["author"] if "author" in df.columns else [])
    rata2 = df.groupby(["expert"] + kunci_pasase, as_index=False)["grade"].mean()
    pivot = rata2.pivot_table(index=kunci_pasase, columns="expert", values="grade")

    baris = []
    for judge_a, judge_b in combinations(sorted(pivot.columns), 2):
        irisan = pivot[[judge_a, judge_b]].dropna()
        n = len(irisan)
        if n < 2:
            baris.append({"Judge A": judge_a, "Judge B": judge_b, "n_overlap": n,
                          "Kappa(quad)": float("nan"), "%setuju": float("nan")})
            continue
        ga = irisan[judge_a].round().astype(int)
        gb = irisan[judge_b].round().astype(int)
        try:
            kappa = cohen_kappa_score(ga, gb, weights="quadratic")
        except Exception:
            kappa = float("nan")
        setuju = float((ga == gb).mean())
        baris.append({"Judge A": judge_a, "Judge B": judge_b, "n_overlap": n,
                      "Kappa(quad)": round(kappa, 4), "%setuju": round(setuju, 4)})

    tabel = pd.DataFrame(baris)
    tabel.to_csv(dest / "iaa_pairwise.csv", index=False, encoding="utf-8-sig")
    if len(tabel) > 0:
        _save_heatmap(tabel, "Kappa(quad)", "IAA (Cohen's Kappa) LLM", dest / "plot_iaa.png")
    print("\n" + tabel.to_string(index=False))

    kappa_valid = tabel["Kappa(quad)"].dropna()
    ringkasan = [
        "=== IAA antar LLM judge (Cohen kappa quadratic) ===",
        f"Judge: {', '.join(daftar_judge)}",
        f"Rata-rata kappa: {kappa_valid.mean():.4f}" if len(kappa_valid) else "Irisan antar-judge terlalu kecil.",
        "",
        "Interpretasi: <0.2 buruk, 0.2-0.4 cukup, 0.4-0.6 sedang, 0.6-0.8 baik, >0.8 sangat baik.",
        "",
    ]
    for _, r in tabel.iterrows():
        ringkasan.append(f"  {r['Judge A']} vs {r['Judge B']}: kappa={r['Kappa(quad)']}, "
                         f"setuju={r['%setuju']}, n={r['n_overlap']}")
    (dest / "ringkasan_iaa.txt").write_text("\n".join(ringkasan) + "\n", encoding="utf-8")
    print(f"[saved] -> {dest}")


# ---------- main ----------

def main():
    global current_eval_name, ANOTASI_DIR, METRIK_DIR
    ap = argparse.ArgumentParser()
    ap.add_argument("metric", nargs="?", default="all", help="all/ndcg/precision/spearman/iaa")
    ap.add_argument("--exp", help="scope anotasi & metrik ke subfolder eksperimen (mis. exp1)")
    args = ap.parse_args()
    pilihan = args.metric.lower()
    if args.exp:
        ANOTASI_DIR = ANOTASI_DIR / args.exp
        METRIK_DIR  = METRIK_DIR / args.exp

    print(f"{'='*60}")
    print(f"  EVAL LLM JUDGE — sumber: {ANOTASI_DIR}")
    print(f"  Output: {config.OUTPUT_DIR}")
    print(f"{'='*60}")

    df, judges = load_annotations(anotasi_dir=ANOTASI_DIR)
    if df is None:
        print("Belum ada anotasi LLM. Jalankan 3-assemble_anotasi.py dulu.")
        return

    current_eval_name = "konsensus"
    print(f"\n\n{'='*40}\n  EVALUASI: {current_eval_name.upper()}\n{'='*40}")
    if pilihan in ("all", "ndcg"):      eval_ndcg(df, judges)
    if pilihan in ("all", "precision"): eval_precision(df, judges)
    if pilihan in ("all", "spearman"):  eval_spearman(df, judges)
    if pilihan in ("all", "iaa"):       eval_iaa()

    # Evaluasi per-pakar individu
    df_indiv, _ = load_annotations(anotasi_dir=ANOTASI_DIR, consensus=False, verbose=False)
    if df_indiv is not None:
        for judge in judges:
            current_eval_name = judge
            print(f"\n\n{'='*40}\n  EVALUASI PER PAKAR: {current_eval_name}\n{'='*40}")
            df_j = df_indiv[df_indiv["expert"] == judge].copy()
            if pilihan in ("all", "ndcg"):      eval_ndcg(df_j, [judge])
            if pilihan in ("all", "precision"): eval_precision(df_j, [judge])
            if pilihan in ("all", "spearman"):  eval_spearman(df_j, [judge])

    print(f"\n{'='*60}")
    print("  SELESAI.")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
