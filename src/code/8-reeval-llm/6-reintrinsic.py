"""
6-reintrinsic.py — RE-EVAL INTRINSIK: gap cosine intra/inter-sutta utk SEMUA model,
termasuk eksperimen penyempurnaan 7-retraining (exp1..exp4.X).

Counterpart 5-eval/2-intrinsic.py utk tahap re-eval. Stage 5-eval = artefak BEKU
pra-retraining (base + exp0 saja) — JANGAN disentuh; script ini yang di-rerun
tiap ada model eksperimen baru.

Pengukuran IDENTIK dgn 5-eval/2-intrinsic.py: korpus EN, N_SAMPLE=200 pasangan
intra + 200 inter, seed config.GPL_SEED (pasangan sama persis) -> angka
apple-to-apple lintas stage (reproduksi base/exp0 diverifikasi identik s.d. 4
desimal, 2026-07-08). Sinyal DEV geometri, BUKAN metrik buku.

Cakupan model (aturan scan seragam: dir gpl-* ber-config.json):
  - base   : config.REGISTRY (HF vanilla)
  - gpl    : output/4-training/models/gpl-*        (exp0)
  - retrain: output/7-retraining/models/gpl-*      (exp1..exp4.X)
Prefix "query:/passage:": base = lookup config.NEEDS_PREFIX; model lokal =
konvensi "e5" in name — SAMA dgn _prefixer 7-retraining/5-embed.py (konvensi
yang dipakai membangun semua embedding retraining).

Output: src/output/8-reeval-llm/6-reintrinsic/ (intra_inter_per_model.csv + plot + txt)
Usage : python src/code/8-reeval-llm/6-reintrinsic.py [exp6]
        (GPU kepakai? jalankan CUDA_VISIBLE_DEVICES="" ... -> CPU, tetap deterministik)

Mode exp6 (keputusan naskah 2026-07-20, struktur Bab 4: ablasi steps = subbab
sendiri 4.2.3, terpisah dari Penyempurna 1-4 di 4.2.2): default = retrain
exp1..exp4.X saja (tabel gabungan, output lama TIDAK berubah); `exp6` = base +
exp0 + gpl-exp6-* -> output terpisah src/output/8-reeval-llm/6-reintrinsic-exp6/.
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
from sentence_transformers import util    # noqa: E402

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402

sns.set_theme(style="whitegrid")
MODE = sys.argv[1] if len(sys.argv) > 1 else ""   # "" = Penyempurna 1-4 (perilaku lama)
if MODE not in ("", "exp6"):
    sys.exit("Usage: python src/code/8-reeval-llm/6-reintrinsic.py [exp6]")
# exp6 SENGAJA dipisah dari tabel gabungan (naskah: 4.2.3 ablasi steps != 4.2.2)
RETRAIN_GLOBS = ["gpl-exp6-*"] if MODE == "exp6" else \
                ["gpl-exp1-*", "gpl-exp2-*", "gpl-exp3-*", "gpl-exp4.*"]
OUT_DIR = config.OUTPUT_DIR / "8-reeval-llm" / ("6-reintrinsic" + (f"-{MODE}" if MODE else ""))
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT_TXT = OUT_DIR / "ringkasan_reintrinsic.txt"
N_SAMPLE = 200


class Logger:
    def __init__(self, fn):
        self.t = sys.stdout; self.f = open(fn, "w", encoding="utf-8")
    def write(self, m): self.t.write(m); self.f.write(m)
    def flush(self): self.t.flush(); self.f.flush()
    def __getattr__(self, name): return getattr(self.t, name)


def _needs_prefix(name):
    """Base = lookup kanonik config.NEEDS_PREFIX; model lokal (gpl-* 4-training &
    7-retraining) = konvensi "e5" in name (selaras 7-retraining/5-embed._prefixer):
    gpl-multilingual-e5-base & gpl-expN-e5 butuh prefix; varian gte tidak."""
    n = str(name)
    if n in config.NEEDS_PREFIX:
        return config.NEEDS_PREFIX[n]
    return "e5" in Path(n).name.lower()


def load_en_by_sutta():
    """{file_base: [en chunk texts]} dari 3-praproses (heading & teks pendek di-skip)."""
    by = {}
    for jsonl in sorted(config.PRAPROSES_DIR.rglob("*_chunked.jsonl")):
        parts = jsonl.relative_to(config.PRAPROSES_DIR).parts
        if len(parts) < 3 or parts[1] != "en":
            continue
        author = jsonl.stem[:-8] if jsonl.stem.endswith("_chunked") else jsonl.stem
        is_blurb = (author == "blurb")
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
                        # Blurb = file level-koleksi (1 grup = banyak sutta) -> pisah per
                        # sutta asli (ref) biar tiap grup intra = 1 sutta. Non-blurb pakai
                        # file_base_name. Sama spt _sid_for build-cache (konsisten).
                        cids = ch.get("chunk_ids") or []
                        sid = cids[0].split(":")[0] if (is_blurb and cids) else base
                        by.setdefault(sid, []).append(t)
    return by


def collect_models():
    """[(path_or_name, label)] base (REGISTRY) + gpl/exp0 (4-training)
    + seluruh model retraining exp1..exp4.X (7-retraining/models)."""
    items = [
        (n, f"{n.split('/')[-1]} (base)")
        for e in config.REGISTRY
        for n in [str(e["name"])]
    ]
    if config.MODELS_DIR.exists():                                     # exp0 (4-training)
        for d in sorted(config.MODELS_DIR.iterdir()):
            if d.is_dir() and (d / "config.json").exists() and d.name.startswith("gpl-"):
                items.append((str(d), f"{d.name[len('gpl-'):]} (gpl)"))
    retrain_dir = config.OUTPUT_DIR / "7-retraining" / "models"        # subset per MODE
    for pat in RETRAIN_GLOBS:
        for d in sorted(retrain_dir.glob(pat)):
            if d.is_dir() and (d / "config.json").exists():
                items.append((str(d), f"{d.name[len('gpl-'):]} (retrain)"))
    return items


def main():
    sys.stdout = Logger(OUT_TXT)
    print("=== RE-EVAL INTRINSIK — gap cosine intra/inter-sutta (korpus EN) ===\n")

    by = load_en_by_sutta()
    if not by:
        print("Tidak ada chunk EN. Jalankan 3-praproses/1-chunk.py dulu.")
        return

    random.seed(config.GPL_SEED)
    keys = [k for k, v in by.items() if len(v) >= 2]
    all_keys = list(by.keys())
    intra = [tuple(random.sample(by[k], 2)) for k in random.sample(keys, min(N_SAMPLE, len(keys)))]
    # inter = 2 sutta BERBEDA (pilih 2 key beda dulu, baru 1 teks tiap key). Bukan 2 teks
    # acak global: itu bisa nyasar ambil 2 chunk se-sutta jadi 'inter' -> distribusi inter
    # kotor & gap mengecil semu. intra tak berubah (RNG sama, di-konsumsi sebelum inter).
    inter = []
    for _ in range(N_SAMPLE):
        ka, kb = random.sample(all_keys, 2)
        inter.append((random.choice(by[ka]), random.choice(by[kb])))
    pairs = intra + inter
    labels = ["Intra"] * len(intra) + ["Inter"] * len(inter)
    A = [p[0] for p in pairs]
    B = [p[1] for p in pairs]
    print(f"Pasangan: intra={len(intra)}, inter={len(inter)}  (dari {len(keys)} sutta >=2 chunk)\n")

    rows = []
    for name, label in collect_models():
        print(f"  [{label}] ...")
        try:
            model = config.load_st_model(name)
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
    sns.boxplot(data=df, y="Model", x="Cosine", hue="Tipe", palette="Set2", ax=ax)  # type: ignore[arg-type]
    ax.set_title("Intra vs Inter-Sutta Cosine (EN) — base + exp0 + retraining")
    fig.tight_layout()
    fig.savefig(OUT_DIR / "intra-inter-similarity.png", dpi=150, bbox_inches="tight")
    plt.close(fig)

    print(f"\n[INFO] {OUT_DIR}")


if __name__ == "__main__":
    main()
