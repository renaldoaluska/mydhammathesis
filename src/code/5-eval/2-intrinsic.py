"""
2-intrinsic.py — Evaluasi INTRINSIK: gap cosine intra-sutta vs inter-sutta.

Sinyal DEV (untuk menyetel GPL tanpa menyentuh test-set pakar), BUKAN metrik buku.
Self-contained: butuh chunk (3-praproses) + model. Korpus EN (paling netral).
Mengukur model base (REGISTRY) + GPL (output/4-training/models/gpl-*).
Output: src/output/5-eval/2-intrinsic/ (intra_inter_per_model.csv + plot + txt)
Usage : python src/code/5-eval/2-intrinsic.py
"""

import os
os.environ["HF_HUB_TRUST_REMOTE_CODE"] = "1"

import sys
import gc
import json
import random
from pathlib import Path

import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt                                # noqa: E402
import seaborn as sns                                          # noqa: E402
import torch                                                   # noqa: E402
from sentence_transformers import SentenceTransformer, util    # noqa: E402

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402

sns.set_theme(style="whitegrid")
OUT_DIR = config.EVAL_DIR / "2-intrinsic"
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT_TXT = OUT_DIR / "ringkasan_intrinsic.txt"
N_SAMPLE = 200


class Logger:
    def __init__(self, fn):
        self.t = sys.stdout; self.f = open(fn, "w", encoding="utf-8")
    def write(self, m): self.t.write(m); self.f.write(m)
    def flush(self): self.t.flush(); self.f.flush()
    def __getattr__(self, name): return getattr(self.t, name)


def _needs_prefix(name): return "e5" in name.lower()


def load_en_by_sutta():
    """{file_base: [en chunk texts]} dari 3-praproses (heading & teks pendek di-skip)."""
    by = {}
    for jsonl in sorted(config.PRAPROSES_DIR.rglob("*_chunked.jsonl")):
        parts = jsonl.relative_to(config.PRAPROSES_DIR).parts
        if len(parts) < 3 or parts[1] != "en":
            continue
        with open(jsonl, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                doc = json.loads(line)
                base = doc.get("file_base_name", "?")
                for ch in doc.get("chunks", []):
                    if ch.get("heading", 0):
                        continue
                    t = ch.get("en_text", "").strip()
                    if t and len(t.split()) > 5:
                        by.setdefault(base, []).append(t)
    return by


def collect_models():
    """[(path_or_name, label)] base (REGISTRY) + gpl (MODELS_DIR)."""
    items = [(e["name"], f"{e['name'].split('/')[-1]} (base)") for e in config.REGISTRY]
    if config.MODELS_DIR.exists():
        for d in sorted(config.MODELS_DIR.iterdir()):
            if d.is_dir() and (d / "config.json").exists() and d.name.startswith("gpl-"):
                items.append((str(d), f"{d.name[len('gpl-'):]} (gpl)"))
    return items


def main():
    sys.stdout = Logger(OUT_TXT)
    print("=== EVAL INTRINSIK — gap cosine intra/inter-sutta (korpus EN) ===\n")

    by = load_en_by_sutta()
    if not by:
        print("Tidak ada chunk EN. Jalankan 3-praproses/1-chunk.py dulu.")
        return

    random.seed(config.GPL_SEED)
    keys = [k for k, v in by.items() if len(v) >= 2]
    all_texts = [t for v in by.values() for t in v]
    intra = [tuple(random.sample(by[k], 2)) for k in random.sample(keys, min(N_SAMPLE, len(keys)))]
    inter = [tuple(random.sample(all_texts, 2)) for _ in range(N_SAMPLE)]
    pairs = intra + inter
    labels = ["Intra"] * len(intra) + ["Inter"] * len(inter)
    A = [p[0] for p in pairs]
    B = [p[1] for p in pairs]
    print(f"Pasangan: intra={len(intra)}, inter={len(inter)}  (dari {len(keys)} sutta >=2 chunk)\n")

    rows = []
    for name, label in collect_models():
        print(f"  [{label}] ...")
        try:
            model = SentenceTransformer(config.resolve_model(name), trust_remote_code=True)
            pre = (lambda x: f"passage: {x}") if _needs_prefix(name) else (lambda x: x)
            ea = model.encode([pre(x) for x in A], convert_to_tensor=True, show_progress_bar=False, normalize_embeddings=True)
            eb = model.encode([pre(x) for x in B], convert_to_tensor=True, show_progress_bar=False, normalize_embeddings=True)
            sims = util.cos_sim(ea, eb).diagonal().cpu().tolist()
            rows += [{"Model": label, "Tipe": lb, "Cosine": s} for s, lb in zip(sims, labels)]
            del model, ea, eb
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception as e:
            print(f"    GAGAL: {e}")

    if not rows:
        print("Tidak ada model berhasil dievaluasi.")
        return

    df = pd.DataFrame(rows)
    summary = df.groupby(["Model", "Tipe"])["Cosine"].mean().round(4).unstack()
    if "Intra" in summary.columns and "Inter" in summary.columns:
        summary["Gap"] = (summary["Intra"] - summary["Inter"]).round(4)
        summary = summary.sort_values("Gap", ascending=False)
    print("\nMean cosine (Gap = Intra - Inter; makin besar makin baik):")
    print(summary.to_string())
    summary.to_csv(OUT_DIR / "intra_inter_per_model.csv", encoding="utf-8-sig")

    fig, ax = plt.subplots(figsize=(10, max(4, 0.5 * df["Model"].nunique())))
    sns.boxplot(data=df, y="Model", x="Cosine", hue="Tipe", palette="Set2", ax=ax)
    ax.set_title("Intra vs Inter-Sutta Cosine (EN)")
    fig.tight_layout()
    fig.savefig(OUT_DIR / "intra-inter-similarity.png", dpi=150, bbox_inches="tight")
    plt.close(fig)

    print(f"\n[INFO] {OUT_DIR}")


if __name__ == "__main__":
    main()
