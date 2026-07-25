"""
1-query-gen-llm.py — exp3 langkah 1: generate kueri sintetis via LLM lokal (Ollama).

Pengganti 1-query-gen.py (mT5 doc2query). Menulis PERTANYAAN NATURAL dalam bahasa
pasase (id/en) untuk tiap pasase Sutta -> menyasar mismatch kueri-sintetis vs natural
(rangkuman 5-eval §3, tersangka utama regresi e5). Output format IDENTIK dgn mT5:
  queries.jsonl : {"query": <str>, "pid": <str>}

Independensi (flow_old.txt): query-gen boleh LLM asal teacher relevansi non-LLM
(tetap cross-encoder di 3-pseudo-label) & judge = LLM LAIN (Claude/Gemini). LLM
lokal (gemma2) != judge -> aman, non-sirkular.

Resumable: kalau queries.jsonl sudah ada, pasase yg sudah punya kueri DILEWATI.
Usage : GPL_EXP_DIR=gpl-exp2 python 1-query-gen-llm.py [--limit N] [--model gemma2:2b]
Butuh : Ollama jalan di :11434 dgn model tersedia.
"""

import os
import re
import sys
import json
import argparse
from pathlib import Path

import requests
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).resolve().parent))       # _gpl lokal (honor GPL_EXP_DIR)
_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                   # noqa: E402
import _gpl                                                     # noqa: E402

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
CKPT_EVERY = 200          # tulis queries.jsonl tiap N pasase (aman thd interupsi)

# skrip asing (noise) -> buang; Latin + diakritik Pali (ā/ṁ/ñ/ṭ) tetap lolos
_FOREIGN_SCRIPT = re.compile(r"[Ͱ-ϿЀ-ӿ֐-׿؀-ۿ܀-ݏऀ-ॿ฀-๿぀-ヿ㐀-鿿가-힯]")

_PROMPT = {
    "id": ("Kamu pembuat data latih sistem pencarian teks Buddhis. Baca PASASE di bawah, "
           "lalu tulis {n} PERTANYAAN berbahasa Indonesia yang NATURAL (seperti diketik "
           "pencari awam) dan yang jawabannya ADA di pasase ini. Pertanyaan harus spesifik "
           "ke isi pasase, ringkas, dan BUKAN salinan kalimat pasase. JANGAN sebut nomor/kode "
           "sutta. Keluarkan HANYA array JSON berisi {n} string, tanpa teks lain.\n\nPASASE:\n{text}"),
    "en": ("You build training data for a Buddhist-text search system. Read the PASSAGE below, "
           "then write {n} NATURAL English questions (as a lay searcher would type) whose answer "
           "IS in this passage. Questions must be specific to the passage content, concise, and "
           "NOT a copy of the passage. Do NOT mention sutta numbers/codes. Output ONLY a JSON array "
           "of {n} strings, nothing else.\n\nPASSAGE:\n{text}"),
}


def _parse_queries(raw):
    """Ambil list string dari output LLM (JSON array; toleran fence / teks nyempil)."""
    m = re.search(r"\[.*\]", raw, re.S)
    if not m:
        return []
    try:
        arr = json.loads(m.group(0))
    except Exception:
        return []
    return [str(x).strip() for x in arr if isinstance(x, (str, int, float)) and str(x).strip()]


def _ask_ollama(model, text, lang, n):
    prompt = _PROMPT.get(lang, _PROMPT["id"]).format(n=n, text=text[:2000])
    r = requests.post(f"{OLLAMA_URL}/api/chat", timeout=180, json={
        "model": model, "stream": False,
        "messages": [{"role": "user", "content": prompt}],
        "options": {"temperature": 0.7, "num_ctx": 2048, "seed": config.GPL_SEED},
    })
    r.raise_for_status()
    return _parse_queries(r.json().get("message", {}).get("content", ""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="SMOKE TEST: batasi N pasase pertama (0=semua)")
    ap.add_argument("--sample", type=int, default=0, help="SUBSAMPLE acak N pasase (seeded); 0=semua. "
                                                          "189k pasase terlalu banyak utk LLM -> subsample "
                                                          "(praktik InPars/Promptagator, kualitas>kuantitas).")
    ap.add_argument("--model", default="gemma2:2b", help="model Ollama utk query-gen "
                                                        "(gemma2:2b muat penuh GPU ~4.5s/call; "
                                                        "gemma4:12b lebih bagus tapi CPU-offload ~95s/call)")
    ap.add_argument("--lang", default="", help="filter bahasa pasase (mis. 'id'); kosong=semua. "
                                               "Korpus 82%% EN — utk fokus eval ID pakai --lang id.")
    args = ap.parse_args()

    passages = _gpl.build_passages()
    if args.lang:
        passages = [p for p in passages if p.get("lang") == args.lang]
        print(f"[lang={args.lang}] {len(passages):,} pasase")
    if args.sample and len(passages) > args.sample:
        import random
        random.Random(config.GPL_SEED).shuffle(passages)   # seeded -> reproducible
        passages = passages[:args.sample]
        print(f"[subsample] {len(passages):,} pasase (seed={config.GPL_SEED})")
    if args.limit:
        passages = passages[:args.limit]
    print(f"[query-gen-llm] pasase: {len(passages):,} | model={args.model} | url={OLLAMA_URL}")

    # RESUME: kumpulkan kueri yg sudah ada, lewati pasase yg sudah tergarap
    out, done = [], set()
    if _gpl.QUERIES.exists():
        for r in _gpl.read_jsonl(_gpl.QUERIES):
            out.append(r); done.add(r["pid"])
        print(f"[resume] {len(out):,} kueri lama utk {len(done):,} pasase -> dilewati")

    n = config.GPL_QUERIES_PER_PASSAGE
    todo = [p for p in passages if p["pid"] not in done]
    pbar = tqdm(todo, desc="query-gen-llm", unit="pasase", dynamic_ncols=True)
    for i, p in enumerate(pbar):
        try:
            cand = _ask_ollama(args.model, p["text"], p.get("lang", "id"), n)
        except Exception as e:
            pbar.write(f"[skip] {p['pid']}: {e}")
            continue
        seen, ptext, kept = set(), p["text"].lower(), 0
        for q in cand:
            if kept >= n:
                break
            ql = q.lower()
            if _FOREIGN_SCRIPT.search(q) or len(ql.split()) < 3 or ql in seen or ql in ptext:
                continue
            seen.add(ql)
            out.append({"query": q, "pid": p["pid"]})
            kept += 1
        if (i + 1) % CKPT_EVERY == 0:
            _gpl.write_jsonl(_gpl.QUERIES, out)     # checkpoint
        pbar.set_postfix(kueri=f"{len(out):,}", refresh=True)

    _gpl.write_jsonl(_gpl.QUERIES, out)
    pids = {r["pid"] for r in out}
    print(f"[done] {len(out):,} kueri, {len(pids):,}/{len(passages):,} pasase >=1 kueri -> {_gpl.QUERIES}")


if __name__ == "__main__":
    main()
