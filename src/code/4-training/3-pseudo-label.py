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

sys.path.insert(0, str(Path(__file__).resolve().parent))
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

    ce = CrossEncoder(config.GPL_CROSS_ENCODER, max_length=config.GPL_MAX_SEQ)
    pos_pairs = [(t["query"], pid2text[t["pos_pid"]]) for t in triples]
    neg_pairs = [(t["query"], pid2text[t["neg_pid"]]) for t in triples]
    s_pos = ce.predict(pos_pairs, batch_size=config.GPL_BATCH_SIZE, show_progress_bar=True)
    s_neg = ce.predict(neg_pairs, batch_size=config.GPL_BATCH_SIZE, show_progress_bar=True)

    out = [{"query": t["query"], "pos": pid2text[t["pos_pid"]],
            "neg": pid2text[t["neg_pid"]], "margin": float(sp) - float(sn)}
           for t, sp, sn in zip(triples, s_pos, s_neg)]

    _gpl.write_jsonl(_gpl.TRAIN, out)
    print(f"[done] {len(out):,} contoh latih -> {_gpl.TRAIN}")


if __name__ == "__main__":
    main()
