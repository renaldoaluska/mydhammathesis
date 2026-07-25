"""
9-kurva-loss.py — Kurva loss pelatihan (MarginMSE) dari loss_history.json.

Generator PERMANEN pengganti one-off pembuat 4-training/kurva-loss/kurva_loss_semua.png
(2026-07-16; file lama dibiarkan). Sumber = artefak beku loss_history.json tiap model;
skrip hanya baca + plot (netral, tanpa kesimpulan).

SATU PNG PER BACKBONE (e5/gte dipisah, bukan 2 panel kiri-kanan — permintaan naskah
2026-07-20 biar tiap gambar full-size). Branding naskah Bab 4:
  1-kurva_loss_gpl-{e5,gte}.png            exp0                  -> 4.2.1 Pelatihan GPL
  2-kurva_loss_penyempurna1-4-{e5,gte}.png P1-3 (P4 = interpolasi bobot,
                                           NOL pelatihan -> tak ada kurva)  -> 4.2.2
  3-kurva_loss_ablasi-steps.png            exp6 gte 140k + overlay exp0-gte -> 4.2.3
                                           Ablasi Jumlah Langkah Penuh (bukan "exp6")
  4-kurva_loss_semua-{e5,gte}.png          exp0 + P1-3 (pengganti kurva_loss_semua
                                           lama, utk lampiran)

Output: src/output/7-retraining/9-kurva-loss/
Usage : python src/code/7-retraining/9-kurva-loss.py
"""

import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt                                # noqa: E402

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402

OUT_DIR = config.OUTPUT_DIR / "7-retraining" / "9-kurva-loss"
OUT_DIR.mkdir(parents=True, exist_ok=True)
RETRAIN_MODELS = config.OUTPUT_DIR / "7-retraining" / "models"

# (label naskah, dir model per backbone) — urutan = urutan legend
EXP0 = {"e5": config.MODELS_DIR / "gpl-multilingual-e5-base",
        "gte": config.MODELS_DIR / "gpl-gte-multilingual-base"}
PENYEMPURNA = [("Penyempurna 1", "gpl-exp1"), ("Penyempurna 2", "gpl-exp2"),
               ("Penyempurna 3", "gpl-exp3")]  # P4 soup: nol pelatihan, tak ada loss
BACKBONE = [("e5", "multilingual-e5-base"), ("gte", "gte-multilingual-base")]


def hist(d):
    p = Path(d) / "loss_history.json"
    if not p.exists():
        return None
    h = json.load(open(p, encoding="utf-8"))
    return [r["step"] for r in h], [r["loss"] for r in h]


def plot_single(series, judul, nama):
    """series: [(label, xs, ys)] -> 1 gambar full-size."""
    if not series:
        return
    fig, ax = plt.subplots(figsize=(10, 6))
    for label, xs, ys in series:
        ax.plot(xs, ys, label=label)
    ax.set_title(judul)
    ax.set_xlabel("Langkah pelatihan (step)")
    ax.set_ylabel("MarginMSE loss")
    ax.legend()
    ax.grid(alpha=0.4)
    path = OUT_DIR / nama
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"[grafik] {path}")


def main():
    for bk, bk_judul in BACKBONE:
        h0 = hist(EXP0[bk])
        pn = [(lbl, *h) for lbl, pref in PENYEMPURNA
              if (h := hist(RETRAIN_MODELS / f"{pref}-{bk}"))]

        # 1. exp0 doang (GPL)
        plot_single([("Eksperimen 0", *h0)] if h0 else [],
                    f"Kurva Loss Pelatihan GPL, Eksperimen 0 ({bk_judul})",
                    f"1-kurva_loss_gpl-{bk}.png")

        # 2. Penyempurna 1-4 (P1-3 punya kurva; P4 nol pelatihan)
        plot_single(pn,
                    f"Kurva Loss Pelatihan Penyempurna 1–3 ({bk_judul})\n"
                    "(Penyempurna 4 = interpolasi bobot, tanpa pelatihan)",
                    f"2-kurva_loss_penyempurna1-4-{bk}.png")

        # 4. Gabungan exp0 + P1-3 (lampiran)
        plot_single(([("Eksperimen 0", *h0)] if h0 else []) + pn,
                    f"Kurva Loss Pelatihan, Eksperimen 0 dan Penyempurna 1–3 ({bk_judul})",
                    f"4-kurva_loss_semua-{bk}.png")

    # 1b. exp0 versi gabungan (e5 + gte dalam 1 sumbu; cuma 2 kurva, tetap terbaca)
    plot_single([(bk_judul, *h) for bk, bk_judul in BACKBONE if (h := hist(EXP0[bk]))],
                "Kurva Loss Pelatihan GPL, Eksperimen 0 (kedua model)",
                "1-kurva_loss_gpl-gabungan.png")

    # 3. Ablasi Jumlah Langkah Penuh (exp6 gte 140k) + overlay exp0-gte (10k)
    h6 = hist(RETRAIN_MODELS / "gpl-exp6-gte")
    h0 = hist(EXP0["gte"])
    plot_single(([("Ablasi Jumlah Langkah Penuh (140.000 langkah)", *h6)] if h6 else []) +
                ([("Eksperimen 0 (10.000 langkah)", *h0)] if h0 else []),
                "Kurva Loss Ablasi Jumlah Langkah Penuh (gte-multilingual-base)",
                "3-kurva_loss_ablasi-steps.png")

    # 5. Rekap train_meta (durasi + loss akhir) — hasil pelatihan utk tabel Bab 4.
    #    P4 (soup) & P5 (rerank) nol pelatihan -> memang tak punya train_meta.
    dirs = ([("Eksperimen 0", EXP0[bk], bk) for bk, _ in BACKBONE] +
            [(lbl, RETRAIN_MODELS / f"{pref}-{bk}", bk)
             for lbl, pref in PENYEMPURNA for bk, _ in BACKBONE] +
            [("Ablasi Jumlah Langkah Penuh", RETRAIN_MODELS / "gpl-exp6-gte", "gte")])
    lines = [f"{'Eksperimen':<28} {'Backbone':<8} {'Langkah':>8} {'Durasi (jam)':>12} "
             f"{'Loss awal':>10} {'Loss akhir':>11} {'Loss min':>9}"]
    for lbl, d, bk in dirs:
        p = Path(d) / "train_meta.json"
        if not p.exists():
            continue
        m = json.load(open(p, encoding="utf-8"))
        h = hist(d)
        awal, lmin = (h[1][0], min(h[1])) if h else (float("nan"),) * 2
        lines.append(f"{lbl:<28} {bk:<8} {m['max_steps']:>8,} "
                     f"{m['duration_sec'] / 3600:>12.1f} {awal:>10.4f} "
                     f"{m['final_loss']:>11.4f} {lmin:>9.4f}")
    lines.append("(Penyempurna 4 = interpolasi bobot, Penyempurna 5 = rerank: nol pelatihan)")
    out = OUT_DIR / "5-rekap-pelatihan.txt"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"[rekap]  {out}")


if __name__ == "__main__":
    main()
