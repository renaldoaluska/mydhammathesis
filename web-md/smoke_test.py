#!/usr/bin/env python3
"""
smoke_test.py — verifikasi cepat fitur retrieval chat web-md SETELAH restart server
(GPU & LLM fresh). Jalankan dari mana saja:

    ../venv/bin/python web-md/smoke_test.py
    # atau dari dalam web-md:  ../../venv/bin/python smoke_test.py

Cek:
  [A] Kamus Sanskerta->Pali (deterministik, tanpa GPU)        — _enforce_theravada_terms
  [B] Scope otomatis: db-bahasa aditif + pitaka aditif        — _auto_scope
  [C] Query rewrite + ekspansi + saran pitaka (butuh Ollama)  — _rewrite_query
  [D] Retrieval menyurfacekan sutta yang benar (butuh embed)  — _retrieve_suttas

[A] & [B] deterministik: kalau FAIL, itu bug kode. [C] & [D] bergantung model/embedding:
kalau aneh, cek LLM/GPU sehat (lihat catatan 'inference degraded' di sesi pengembangan).
"""
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
_SRC = next(p / "src" for p in [BASE] + list(BASE.parents) if (p / "src" / "config.py").exists())
sys.path.insert(0, str(_SRC))
sys.path.insert(0, str(_SRC.parent / "web"))
sys.path.insert(0, str(BASE))

import reader  # noqa: E402
reader.init()
import app     # noqa: E402

GREEN, RED, YEL, NC = "\033[32m", "\033[31m", "\033[33m", "\033[0m"
def ok(m):   print(f"{GREEN}  PASS{NC} {m}")
def bad(m):  print(f"{RED}  FAIL{NC} {m}")
def info(m): print(f"{YEL}  INFO{NC} {m}")

fails = 0

# ── [A] Kamus Sanskerta -> Pali ────────────────────────────────────────────
print("\n[A] Kamus Sanskerta -> Pali (deterministik)")
A_CASES = [
    ("kumpul-kumpul (skandhas)", "khandha"),
    ("meditasi dhyana", "jhāna"),
    ("kebijaksanaan prajna", "paññā"),
    ("kesadaran vijnana", "viññāṇa"),
    ("bentukan samskara", "saṅkhāra"),
    ("keinginan trishna", "taṇhā"),
    ("tanpa-aku anatman", "anattā"),
    ("para bhikshu", "bhikkhu"),
    ("Dharma dan Karma dan Nirvana", "Dhamma"),
]
for src, expect in A_CASES:
    out = app._enforce_theravada_terms(src)
    if expect.lower() in out.lower():
        ok(f"{src!r} -> {out!r}")
    else:
        bad(f"{src!r} -> {out!r}  (harusnya memuat {expect!r})"); fails += 1

# ── [B] Deteksi bahasa kueri (deterministik) ───────────────────────────────
# Arsitektur kini AGENTIC: scope (bahasa korpus / pitaka) ditentukan LLM lewat
# argumen tool search_sutta, bukan _auto_scope. Yg dites di sini: detect_query_lang.
print("\n[B] Deteksi bahasa kueri (deterministik)")
B_CASES = [
    ("what is the cause of suffering", "en"),
    ("apa penyebab penderitaan", "id"),
    ("nibbāna itu apa", "pli"),
]
for q, want in B_CASES:
    got = app.detect_query_lang(q)
    (ok if got == want else bad)(f"{q!r} -> {got} (harusnya {want})")
    if got != want: fails += 1

# ── [C] Rewrite + ekspansi + saran pitaka (butuh Ollama) ───────────────────
print("\n[C] Query rewrite (butuh Ollama; ekspansi 2-3 kueri + #pitaka)")
C_QUERIES = [
    ("cariin sutta tentang kewajiban perumah tangga", "id"),
    ("bolehkah bhikkhu makan sambil berdiri", "id"),
    ("what is the cause of suffering", "en"),
    ("aku lagi sedih banget", "id"),
    ("makasih ya kak", "id"),
]
for q, lang in C_QUERIES:
    try:
        qs, hint = app._rewrite_query(q, lang)
    except Exception as e:
        bad(f"{q!r} -> ERROR {e}"); fails += 1; continue
    n = len(qs)
    tag = "SKIP" if qs == ["SKIP_SEARCH"] else f"{n} kueri"
    (ok if (qs == ["SKIP_SEARCH"] or n >= 1) else bad)(f"{q!r}\n         -> [{tag}] {qs} | pitaka={hint}")
    if n == 1 and qs != ["SKIP_SEARCH"]:
        info("ekspansi cuma 1 kueri — model mungkin belum nurut format (cek LLM/GPU sehat)")

# ── [D] Retrieval surface (butuh embedding) ────────────────────────────────
print("\n[D] Retrieval surface (butuh embedding cache)")
D_CASES = [
    # (deskripsi, kueri-kueri, sutta_id yang DIHARAPKAN muncul di kandidat)
    ("Sigālovāda utk kewajiban perumah tangga",
     ["kewajiban perumah tangga", "nasihat untuk umat awam perumah tangga",
      "tugas terhadap orang tua, pasangan, anak, dan sahabat"], "dn31"),
    ("Satipaṭṭhāna (typo) -> MN 10 / DN 22",
     ["satipatthana", "perhatian penuh sadar"], "mn10"),
]
for desc, qs, want in D_CASES:
    try:
        suttas = []
        for q in qs:
            suttas.extend(app._retrieve_suttas(q, "id", max_suttas=8))
        ids = []
        seen = set()
        for s in sorted(suttas, key=lambda x: x.get("max_score", 0), reverse=True):
            if s["sutta_id"] not in seen:
                seen.add(s["sutta_id"]); ids.append(s["sutta_id"])
        hit = want in ids
        rank = ids.index(want) + 1 if hit else None
        (ok if hit else bad)(f"{desc}: {want} {'rank '+str(rank) if hit else 'TIDAK muncul'}  | top5={ids[:5]}")
        if not hit: fails += 1
    except Exception as e:
        bad(f"{desc} -> ERROR {e}"); fails += 1

# ── Ringkasan ──────────────────────────────────────────────────────────────
print("\n" + ("="*60))
if fails == 0:
    print(f"{GREEN}SMOKE TEST OK{NC} — semua cek deterministik lolos.")
else:
    print(f"{RED}{fails} cek GAGAL{NC} — lihat baris FAIL di atas.")
sys.exit(1 if fails else 0)
