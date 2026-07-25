"""
3-pseudo-label.py — GPL langkah 3: pseudo-labeling via cross-encoder.

margin = CE(query, pos) - CE(query, neg). Langkah kunci GPL: cross-encoder
"membersihkan" kueri sintetis jelek & negatif yang ternyata relevan.
Input: triples.jsonl + passages | Output: train.jsonl {query, pos, neg, margin}
Usage: python src/code/4-training/3-pseudo-label.py  (CE: config.GPL_CROSS_ENCODER)
"""

import os
os.environ["HF_HUB_TRUST_REMOTE_CODE"] = "1"

import sys
from pathlib import Path

from sentence_transformers import CrossEncoder

sys.path.insert(0, str(Path(__file__).resolve().parent))     # _gpl lokal (honor GPL_EXP_DIR, sedir)
_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402
import _gpl                                                    # noqa: E402


def main():
    passages = _gpl.load_passages()
    pid2text = {p["pid"]: p["text"] for p in passages}
    triples = list(_gpl.read_jsonl(_gpl.TRIPLES)) if _gpl.TRIPLES.exists() else []
    if not triples:
        print("triples.jsonl kosong. Jalankan 2-hard-neg.py dulu.")
        return
    print(f"[pseudo-label] {len(triples):,} triple, cross-encoder={config.GPL_CROSS_ENCODER}")

    ce = CrossEncoder(config.GPL_CROSS_ENCODER, max_length=config.GPL_MAX_SEQ, trust_remote_code=True)
    pos_pairs = [(t["query"], pid2text[t["pos_pid"]]) for t in triples]
    neg_pairs = [(t["query"], pid2text[t["neg_pid"]]) for t in triples]
    s_pos = ce.predict(pos_pairs, batch_size=config.GPL_BATCH_SIZE, show_progress_bar=True)
    s_neg = ce.predict(neg_pairs, batch_size=config.GPL_BATCH_SIZE, show_progress_bar=True)

    # Skala margin teacher -> rentang yang dapat dicapai bi-encoder. Model ST (e5/gte)
    # menormalisasi embedding (cos in [-1,1]) -> selisih cos terbatas (~<=2); margin CE
    # mentah (std~5, max~21) mustahil dikejar -> MarginMSE tak konvergen (loss mentok,
    # grad meledak). Kalibrasi self-scaling: bagi agar std(margin) ~ GPL_MARGIN_TARGET_STD.
    raw = s_pos - s_neg                                    # np.ndarray (ce.predict -> numpy)
    sd = float(raw.std())
    scale = sd / config.GPL_MARGIN_TARGET_STD if sd > 0 else 1.0
    print(f"[margin-scale] raw mean={float(raw.mean()):.2f} std={sd:.2f} "
          f"-> bagi {scale:.3f} -> std~{config.GPL_MARGIN_TARGET_STD}")

    out = [{"query": t["query"], "pos": pid2text[t["pos_pid"]],
            "neg": pid2text[t["neg_pid"]], "margin": float(m) / scale}
           for t, m in zip(triples, raw)]

    _gpl.write_jsonl(_gpl.TRAIN, out)
    print(f"[done] {len(out):,} contoh latih -> {_gpl.TRAIN}")


if __name__ == "__main__":
    main()
