"""
8-soup-all.py — Eksperimen 4: MODEL SOUP ALL (garis adaptasi, nol training).

Interpolasi bobot θ = α·base + (1−α)·gpl.
Script ini mengekspansi eksperimen soup untuk mencakup seluruh keluarga GPL:
- Base + exp0 (GPL 10k) -> exp4.0
- Base + exp1 (GPL 5k)  -> exp4.1
- Base + exp2 (GPL Gemma)-> exp4.2
- Base + exp3 (Teacher) -> exp4.3

α = 0.5 DIKUNCI DI MUKA.
"""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
_BASE = next(p for p in HERE.parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402

ALPHA = 0.5
OUT_MODELS = config.OUTPUT_DIR / "7-retraining" / "models"

# Format: (base_name, gpl_name, out_name)
PAIRS = [
    # exp4.0 (Base + exp0)
    ("intfloat/multilingual-e5-base",     "gpl-multilingual-e5-base",  "gpl-exp4.0-e5"),
    ("Alibaba-NLP/gte-multilingual-base", "gpl-gte-multilingual-base", "gpl-exp4.0-gte"),
    
    # exp4.1 (Base + exp1)
    ("intfloat/multilingual-e5-base",     "gpl-exp1-e5",  "gpl-exp4.1-e5"),
    ("Alibaba-NLP/gte-multilingual-base", "gpl-exp1-gte", "gpl-exp4.1-gte"),

    # exp4.2 (Base + exp2)
    ("intfloat/multilingual-e5-base",     "gpl-exp2-e5",  "gpl-exp4.2-e5"),
    ("Alibaba-NLP/gte-multilingual-base", "gpl-exp2-gte", "gpl-exp4.2-gte"),

    # exp4.3 (Base + exp3)
    ("intfloat/multilingual-e5-base",     "gpl-exp3-e5",  "gpl-exp4.3-e5"),
    ("Alibaba-NLP/gte-multilingual-base", "gpl-exp3-gte", "gpl-exp4.3-gte"),
]


def soup(base_name, gpl_name, out_name):
    import torch
    print(f"[soup] {out_name}: {ALPHA}*base + {1-ALPHA}*{gpl_name}")
    
    base = config.load_st_model(base_name)
    
    # exp0 ada di 4-training/models, sisanya ada di 7-retraining/models
    if "exp1" in gpl_name or "exp2" in gpl_name or "exp3" in gpl_name:
        gpl_path = str(config.OUTPUT_DIR / "7-retraining" / "models" / gpl_name)
    else:
        gpl_path = str(config.OUTPUT_DIR / "4-training" / "models" / gpl_name)
        
    gpl = config.load_st_model(gpl_path)
    
    sd_b, sd_g = base.state_dict(), gpl.state_dict()
    if sd_b.keys() != sd_g.keys():
        beda = sd_b.keys() ^ sd_g.keys()
        raise SystemExit(f"[FATAL] state_dict beda kunci ({len(beda)}): {sorted(beda)[:5]} ...")
    
    sd_avg = {}
    for k in sd_b:
        a, b = sd_b[k], sd_g[k]
        if a.shape != b.shape:
            raise SystemExit(f"[FATAL] shape beda di {k}: {a.shape} vs {b.shape}")
        sd_avg[k] = (ALPHA * a.float() + (1 - ALPHA) * b.float()) if a.is_floating_point() else a
        
    base.load_state_dict(sd_avg)
    out = OUT_MODELS / out_name
    out.mkdir(parents=True, exist_ok=True)
    base.save(str(out))
    
    with open(out / "SOUP.txt", "w") as f:
        f.write(f"alpha={ALPHA}\nbase={base_name}\ngpl={gpl_name}\n"
                f"resep=alpha*base+(1-alpha)*gpl (Wortsman 2022 / WiSE-FT)\n")
        
    n_avg = sum(1 for k in sd_b if sd_b[k].is_floating_point())
    print(f"  [ok] {n_avg} tensor float di-interpolasi -> {out}")


if __name__ == "__main__":
    for base_name, gpl_name, out_name in PAIRS:
        soup(base_name, gpl_name, out_name)
    print("[selesai] model soup untuk exp4.0 sampai exp4.3 berhasil dibuat!")
