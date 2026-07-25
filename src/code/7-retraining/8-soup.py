"""
8-soup.py — Eksperimen 4: MODEL SOUP / WiSE-FT (garis adaptasi, nol training).

Interpolasi bobot θ = α·base + (1−α)·gpl (Wortsman dkk. 2022 model soups;
WiSE-FT utk robust fine-tuning). Hipotesis: obat DRIFT — adaptasi GPL merusak
kueri base-kuat (tercile monoton) sambil menang intrinsik (paradoks [6]
rangkuman_analisis 5-eval); interpolasi mempertahankan geometri base + sebagian
ketajaman GPL.

α = 0.5 DIKUNCI DI MUKA (uniform soup / titik tengah WiSE-FT, robust di paper
aslinya). TANPA sweep α: 30 kueri pakar terlalu kecil utk tuning — sweep lalu
pilih terbaik = overfit test set. Pasangan = base ⊕ exp0 (gpl 4-training,
"GPL as published"), BUKAN exp2/exp3 (biar 1 variabel: +interpolasi saja).

Loader WAJIB config.load_st_model (fix buffer RoPE gte transformers v5).
Output: models/gpl-exp4-{e5,gte} (dir 7-retraining/models, format ST).
Lanjut: 5-embed.py --model gpl-exp4-* (3 korpus, seragam exp lain; eval cuma
butuh id tapi web-md pakai ketiganya) ; 6-build-pool --versi exp4.
"""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
_BASE = next(p for p in HERE.parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402

ALPHA = 0.5                                                    # dikunci; lihat docstring
OUT_MODELS = config.OUTPUT_DIR / "7-retraining" / "models"
PAIRS = [   # (base HF, checkpoint gpl exp0 di 4-training/models, nama output)
    ("intfloat/multilingual-e5-base",     "gpl-multilingual-e5-base",  "gpl-exp4-e5"),
    ("Alibaba-NLP/gte-multilingual-base", "gpl-gte-multilingual-base", "gpl-exp4-gte"),
]


def soup(base_name, gpl_name, out_name):
    import torch
    print(f"[soup] {out_name}: {ALPHA}*base + {1-ALPHA}*gpl")
    base = config.load_st_model(base_name)
    gpl = config.load_st_model(str(config.MODELS_DIR / gpl_name))
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
    print("[selesai] lanjut: 5-embed.py --model gpl-exp4-{e5,gte} "
          "lalu 6-build-pool.py --versi exp4")
