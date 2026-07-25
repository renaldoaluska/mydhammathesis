"""
common.py — util bersama eval ekstrinsik (asesmen pakar) myDhamma. SATU sumber.

KONTRAK CSV anotasi (dihasilkan WEB -> src/output/5-eval/anotasi/anotasi_<pakar>.csv):
  query_id, db(korpus: id|en), model(e5|gte|bm25), versi(base|gpl),
  rank, ref(segmen), author(penerjemah), retrieved_text, cosine_sim, grade(0-3), [is_heading], [method]
  CATATAN: ref TIDAK unik lintas penerjemah -> pasase = (ref, author). Semua dedup/
  konsensus/IAA key by (ref, author), bukan ref saja.
Opsional completed_<pakar>.json = daftar "query_id_db" yang sudah selesai dinilai.

Dipakai: 3-ndcg.py, 4-precision.py, 5-spearman.py, 6-iaa.py.
"""

import sys
import json
import math
from pathlib import Path

import pandas as pd

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402

ANOTASI_DIR     = config.EVAL_DIR / "anotasi"
QUERIES_FILE    = config.EVAL_INPUT_DIR / "queries_pakar.json"   # fix: dulu salah cari "queries.json" di EVAL_DIR (selalu kosong)
EXCLUDE_EXPERTS = ["Demo"]
REL = 2          # grade >= 2 = relevan (untuk P@k & MRR)

_VERSI_SHORT = {"base": "B", "gpl": "GPL"}


def short_versi(v): return _VERSI_SHORT.get(str(v), str(v))
def short_model(m): return str(m).rstrip("/").split("/")[-1]


def _sanitize(s):
    """Sama dgn bersihkan_nama di 3-assemble_anotasi.py (keep alnum + ._-)."""
    return "".join(c if (c.isalnum() or c in "._-") else "_" for c in str(s))


# peta nama-file(underscore) -> nama judge rapi dari judges.json (mis. 'Claude Opus 4.8')
_JUDGES_FILE = config.OUTPUT_DIR / "6-eval-llm" / "anotasi-llm" / "judges.json"
_NAMA_MAP = {}
if _JUDGES_FILE.exists():
    for _e in json.loads(_JUDGES_FILE.read_text(encoding="utf-8")):
        _NAMA_MAP[_sanitize(_e["name"])] = _e["name"]


def nama_display(sanitized):
    """Nama judge rapi utk LABEL grafik; fallback '_'->spasi bila tak ada di judges.json."""
    s = str(sanitized)
    return _NAMA_MAP.get(s, s.replace("_", " ").strip())


def ndcg_at_k(grades, k=10, ideal_grades=None):
    """NDCG@k satu kueri. grades = terurut menurut rank model.
    ideal_grades = pool grade utk IDCG; default None = IDCG lokal (ideal dari grades
    sendiri). Isi pool global-pool (union passage dinilai lintas model) biar base vs
    GPL diadu ke ideal yang SAMA (lebih adil, gaya BEIR)."""
    pool = grades if ideal_grades is None else ideal_grades
    dcg  = sum(g / math.log2(i + 2) for i, g in enumerate(grades[:k]))
    ideal = sorted(pool, reverse=True)[:k]
    idcg = sum(g / math.log2(i + 2) for i, g in enumerate(ideal))
    return dcg / idcg if idcg > 0 else 0.0


def load_query_texts():
    try:
        return {str(q["id"]): q.get("query", "")
                for q in json.loads(QUERIES_FILE.read_text(encoding="utf-8"))}
    except Exception:
        return {}


def figdir(name=None):
    d = config.EVAL_DIR if name is None else config.EVAL_DIR / name
    d.mkdir(parents=True, exist_ok=True)
    return d


def load_annotations(verbose=True, exclude=None, consensus=True, anotasi_dir=None):
    """Baca + filter semua CSV anotasi -> satu DataFrame siap-metrik.

    - anotasi_dir: folder anotasi (default ANOTASI_DIR = pakar manusia). Arahkan ke
      EVAL_DIR/'anotasi-llm' utk ground-truth LLM judge (Opus/Gemini) TANPA ngeblend manusia.
    - skip pakar di `exclude` (default demo/parsial)
    - honor completed_<pakar>.json (kombinasi query_id_db yang selesai)
    - dedup baris ganda (autosave/re-submit) per (expert,query_id,model,versi,db,rank,ref)
    - consensus=True: rata-rata grade antar pakar per (query_id, ref) bila >1 pakar
    Return (df, included_experts) atau (None, []).
    """
    adir = Path(anotasi_dir) if anotasi_dir else ANOTASI_DIR
    if exclude is None:
        exclude = EXCLUDE_EXPERTS
    if not adir.exists() or not list(adir.glob("anotasi_*.csv")):
        if verbose:
            print(f"Anotasi belum ada di: {adir}")
        return None, []

    dfs, included = [], []
    for csv_file in sorted(adir.glob("anotasi_*.csv")):
        name = csv_file.stem[len("anotasi_"):]
        if any(x.lower() in name.lower() for x in exclude):
            if verbose:
                print(f"  [skip] {csv_file.name}")
            continue
        try:
            d = pd.read_csv(csv_file)
        except Exception as e:
            if verbose:
                print(f"  gagal baca {csv_file.name}: {e}")
            continue
        comp = adir / f"completed_{name}.json"
        if comp.exists() and "query_id" in d.columns and "db" in d.columns:
            try:
                done = set(json.loads(comp.read_text(encoding="utf-8")))
            except Exception:
                done = None
            if done is not None:
                key = d["query_id"].astype(str) + "_" + d["db"].astype(str)
                before = len(d)
                d = d[key.isin(done)]
                if verbose:
                    print(f"  [ok] {csv_file.name}: {len(d)}/{before} baris (completed)")
        elif verbose:
            print(f"  [ok] {csv_file.name}: {len(d)} baris")
        if len(d):
            dfs.append(d.assign(expert=name))
            included.append(name)

    if not dfs:
        if verbose:
            print("Tidak ada anotasi valid.")
        return None, []

    df = pd.concat(dfs, ignore_index=True)
    df = df[df["grade"].notna() & (df["grade"] != "")]
    if df.empty:
        if verbose:
            print("Kolom 'grade' kosong.")
        return None, included
    df["grade"]      = df["grade"].astype(float)
    df["cosine_sim"] = df["cosine_sim"].astype(float)
    df["model"]      = df["model"].astype(str).map(short_model)
    if "versi" not in df.columns:
        df["versi"] = "base"

    dkey = [c for c in ["expert", "query_id", "model", "versi", "db", "rank", "ref", "author"] if c in df.columns]
    if dkey:
        before = len(df)
        df = df.drop_duplicates(subset=dkey, keep="last")
        if verbose and before != len(df):
            print(f"  (dedup: {before - len(df)} baris ganda -> {len(df)} unik)")

    if "is_heading" in df.columns:
        df["is_heading"] = df["is_heading"].fillna(False).astype(bool)
    else:
        df["is_heading"] = False

    if consensus and "ref" in df.columns and df["expert"].nunique() > 1:
        # konsensus per PASASE = (query_id, ref, author): ref tak unik lintas
        # penerjemah, jadi anggara vs karniawan TIDAK boleh dirata-rata bareng.
        pcols = ["query_id", "ref"] + (["author"] if "author" in df.columns else [])
        cons = (df.groupby(pcols, as_index=False)["grade"]
                  .mean().rename(columns={"grade": "_c"}))
        key = [c for c in ["query_id", "model", "versi", "db", "rank", "ref", "author"] if c in df.columns]
        df = df.drop_duplicates(subset=key).merge(cons, on=pcols, how="left")
        df["grade"] = df["_c"].round(4)
        df = df.drop(columns="_c")
        df["expert"] = "konsensus"
        if verbose:
            print(f"  (konsensus: grade dirata-rata antar {len(included)} pakar)")

    if verbose:
        print(f"  Pakar disertakan: {', '.join(included)}")
    return df, included
