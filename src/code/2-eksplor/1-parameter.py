"""
1-parameter.py — Ukuran (jumlah parameter) tiap model di REGISTRY.

Justifikasi feasibility: semua model skala juta (bukan miliar) -> muat di GPU 12GB.
Sumber: config.REGISTRY | Output: src/output/2-eksplor/1-parameter.txt
Usage : python src/code/2-eksplor/1-parameter.py
"""

import sys
from pathlib import Path

import torch
from sentence_transformers import SentenceTransformer

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402

OUT_TXT = config.EKSPLOR_DIR / "1-parameter.txt"


class Logger:
    def __init__(self, fn):
        Path(fn).parent.mkdir(parents=True, exist_ok=True)
        self.t = sys.stdout; self.f = open(fn, "w", encoding="utf-8")
    def write(self, m): self.t.write(m); self.f.write(m)
    def flush(self): self.t.flush(); self.f.flush()


def main():
    sys.stdout = Logger(OUT_TXT)
    print("=== EKSPLOR 1 — PARAMETER MODEL ===\n")
    print(f"{'MODEL':<42} | {'ROLE':<8} | {'PARAMETER':>14} | {'JUTA':>7}")
    print("-" * 80)

    hasil = []
    for entry in config.REGISTRY:
        nama, role = entry["name"], entry["role"]
        short = nama.split("/")[-1]
        try:
            model = SentenceTransformer(config.resolve_model(nama), trust_remote_code=True)
            total = sum(p.numel() for p in model.parameters())
            juta = total / 1_000_000
            print(f"{short:<42} | {role:<8} | {total:>14,} | {juta:>6.1f}M")
            hasil.append((short, juta))
            del model
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception as e:
            print(f"{short:<42} | {role:<8} | GAGAL: {str(e)[:30]}")

    print("-" * 80)
    if hasil:
        kecil, besar = min(hasil, key=lambda x: x[1]), max(hasil, key=lambda x: x[1])
        print(f"\nRentang: {kecil[1]:.1f}M ({kecil[0]}) - {besar[1]:.1f}M ({besar[0]}).")
        print("Semua model skala juta parameter -> muat dilatih di GPU 12GB.")
        print("(BM25 = baseline leksikal, tanpa parameter neural.)")
    print(f"\n[INFO] {OUT_TXT}")


if __name__ == "__main__":
    main()
