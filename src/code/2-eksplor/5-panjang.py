"""
5-panjang.py — Panjang chunk dalam TOKEN per tokenizer model (justifikasi max_seq).

Memastikan mayoritas chunk tidak terpotong pada max_seq_length terpilih (config.GPL_MAX_SEQ).
Sumber: src/output/3-praproses (via _load) | Output: src/output/2-eksplor/5-panjang.txt
Usage : python src/code/2-eksplor/5-panjang.py
"""

import os
os.environ["HF_HUB_TRUST_REMOTE_CODE"] = "1"   # tokenizer remote (gte/Alibaba)

import sys
from pathlib import Path

import numpy as np
from transformers import AutoTokenizer

sys.path.insert(0, str(Path(__file__).resolve().parent))                                # _load (sedir)
_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402
from _load import iter_chunks, chunk_text                      # noqa: E402

OUT_TXT = config.EKSPLOR_DIR / "5-panjang.txt"


class Logger:
    def __init__(self, fn):
        Path(fn).parent.mkdir(parents=True, exist_ok=True)
        self.t = sys.stdout; self.f = open(fn, "w", encoding="utf-8")
    def write(self, m): self.t.write(m); self.f.write(m)
    def flush(self): self.t.flush(); self.f.flush()


def main():
    sys.stdout = Logger(OUT_TXT)
    print("=== EKSPLOR 5 — PANJANG TEKS (TOKEN) ===\n")

    # teks chunk unik (semua bahasa; korpus dipakai lintas-bahasa saat retrieval)
    texts = list({t for *_, ch in iter_chunks() if (t := chunk_text(ch))})
    if not texts:
        print("Tidak ada chunk. Jalankan 3-praproses/1-chunk.py dulu.")
        return
    print(f"Chunk unik dianalisis: {len(texts):,}\n")

    hdr = f"{'MODEL':<42} | {'MEAN':>6} | {'P95':>4} | {'P99':>4} | {'MAX':>5} | {'%<=256':>7} | {'%<=512':>7}"
    print(hdr)
    print("-" * len(hdr))
    for entry in config.REGISTRY:
        short = entry["name"].split("/")[-1]
        try:
            tok = AutoTokenizer.from_pretrained(config.resolve_model(entry["name"]), trust_remote_code=True)
            lens = [len(ids) for ids in tok(texts, add_special_tokens=False, verbose=False)["input_ids"]]
            a = np.array(lens)
            print(f"{short:<42} | {a.mean():>6.1f} | {np.percentile(a,95):>4.0f} | {np.percentile(a,99):>4.0f} | "
                  f"{a.max():>5} | {(a<=256).mean()*100:>6.1f}% | {(a<=512).mean()*100:>6.1f}%")
        except Exception as e:
            print(f"{short:<42} | ERROR: {str(e)[:40]}")
    print("-" * len(hdr))
    print(f"\nGPL_MAX_SEQ saat ini = {config.GPL_MAX_SEQ}. Pilih max_seq agar P99 muat tanpa potong signifikan.")
    print(f"\n[INFO] {OUT_TXT}")


if __name__ == "__main__":
    main()
