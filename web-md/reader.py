"""
reader.py — Machinery READER web-md: baca sutta dari korpus MENTAH (sc_bilara_data +
html_text), peta file/nama/pitaka, navigasi (prev/next, breadcrumb, tree).

Di-port dari dhammakathika web-md (proven) dengan PATH diarahkan ke src/config.py
(config.RAW_DIR). TIDAK ada dependensi Flask di sini — app.py yang mendaftarkan route.
Korpus SEARCH terpisah (web/_corpus + web/search); reader sengaja baca raw agar
viewer per-segmen (parts) lengkap & konsisten dgn chunker (lxml, double-<br>, heading-tag).
"""

import re
import sys
import json
import time
import unicodedata
from pathlib import Path

_SRC = next(p / "src" for p in Path(__file__).resolve().parents if (p / "src" / "config.py").exists())
sys.path.insert(0, str(_SRC))
import config                                               # noqa: E402

RAW_DIR      = config.RAW_DIR
BILARA_DIR   = RAW_DIR / "sc_bilara_data"
HTMLTEXT_DIR = RAW_DIR / "html_text"
TREE_DIR     = RAW_DIR / "tree"
NAME_DIR     = RAW_DIR / "name"

# ── state global (diisi init()) ──────────────────────────────────────────────
_RAW_FILE_MAP: dict = {}      # sutta_id -> {key(lang_author|sec): Path}
_HTML_FILE_MAP: dict = {}     # sutta_id -> {(lang, author): Path}
_SHORT_TO_FULL: dict = {}     # short id -> full id
_sutta_names: dict = {}       # sutta_id -> nama Pāli
_SUTTA_PITAKA: dict = {}      # sutta_id -> pitaka
_SUTTA_BOOK: dict = {}        # sutta_id -> kitab/koleksi (mis. an1.1 -> "an"); nama via _sutta_names
_blurbs: dict = {}            # (sutta_id, lang) -> teks blurb
_BILARA_AUTHOR_LONG_NAMES: dict = {}
_EDITION_AUTHOR_LONG_NAMES: dict = {}
_AUTHOR_UID_MAP: dict = {}
_LANG_NAME_MAP: dict = {}
_BILARA_AUTHOR_UIDS: set = set()
_html_chunk_cache: dict = {}
_tree_cache = None            # memo build_tree() (korpus statis selama proses; ganti -> restart)
_tree_by_pitaka: dict = {}    # {pitaka: [(book, children, leaves)]} — sumber prev/next + breadcrumb tanpa baca disk ulang
_tree_ids_cache = None        # set id (leaf + kunci grup) yg muncul di build_tree() -> trim /api/sutta-names

PITAKAS = ("sutta", "vinaya", "abhidhamma")


# ============================================================
# Util id / teks
# ============================================================
def bersihkan_diakritik(text: str) -> str:
    if not text:
        return ""
    norm = unicodedata.normalize("NFD", text)
    clean = "".join(c for c in norm if not unicodedata.combining(c))
    return unicodedata.normalize("NFC", clean).lower()


def shorten_sutta_id(s: str) -> str:
    if not s:
        return s
    s = s.lower()
    s = re.sub(r"^pli-tv-", "", s)
    s = re.sub(r"^(bu|bi)-vb-", r"\1-", s)
    return s


def format_sutta_id(sutta_id: str) -> str:
    s = shorten_sutta_id(sutta_id)
    m = re.match(r"([a-z\-]+?)([0-9].*)", s)
    if m:
        prefix, number = m.groups()
        if prefix in ("dn", "mn", "sn", "an"):
            return f"{prefix.upper()} {number}"
        return "-".join(p.capitalize() for p in prefix.split("-")) + f" {number}"
    if s in ("dn", "mn", "sn", "an"):
        return s.upper()
    return "-".join(p.capitalize() for p in s.split("-"))


def ringkas_referensi(refs: list) -> str:
    if not refs:
        return ""

    def split_ref(r):
        m = re.match(r"(.*?)(\d+)$", r)
        return (m.group(1), int(m.group(2)), len(m.group(2))) if m else (r, -1, 0)

    hasil, prefix_skrg, angka_skrg, pad_skrg = [], None, [], 0

    def simpan():
        if not angka_skrg:
            return
        a0 = str(angka_skrg[0]).zfill(pad_skrg)
        hasil.append(f"{prefix_skrg}{a0}" if len(angka_skrg) == 1
                     else f"{prefix_skrg}{a0}-{str(angka_skrg[-1]).zfill(pad_skrg)}")

    for r in sorted(refs, key=split_ref):
        prefix, angka, pad = split_ref(r)
        if angka == -1:
            simpan(); angka_skrg.clear(); hasil.append(r); prefix_skrg = None; continue
        if prefix == prefix_skrg and angka_skrg and angka == angka_skrg[-1] + 1:
            angka_skrg.append(angka)
        else:
            simpan(); prefix_skrg, angka_skrg, pad_skrg = prefix, [angka], pad
    simpan()
    return ", ".join(hasil)


def resolve_sutta_id(sid: str) -> str:
    sid = sid.lower()
    if sid in _RAW_FILE_MAP:
        return sid
    if sid in _SHORT_TO_FULL:
        return _SHORT_TO_FULL[sid]
    return sid


# ============================================================
# Peta nama + pitaka (dari tree/ + name/)
# ============================================================
def _load_sutta_names():
    if not NAME_DIR.exists():
        return
    for fpath in NAME_DIR.rglob("*-name_root-misc-site.json"):
        try:
            data = json.loads(fpath.read_text(encoding="utf-8"))
        except Exception:
            continue
        for key, name in data.items():           # "dn-name:2.dn1" -> "dn1"
            parts = key.split(".")
            if len(parts) >= 2:
                _sutta_names[".".join(parts[1:])] = name


def _collect_leaves(arr):
    out = []
    if isinstance(arr, list):
        for item in arr:
            if isinstance(item, str):
                out.append(item)
            elif isinstance(item, dict):
                for ch in item.values():
                    out.extend(_collect_leaves(ch))
    return out


def _find_in_tree(arr, target, path):
    if not isinstance(arr, list):
        return None
    for item in arr:
        if isinstance(item, str):
            if item == target:
                return path
        elif isinstance(item, dict):
            for key, children in item.items():
                r = _find_in_tree(children, target, path + [key])
                if r is not None:
                    return r
    return None


def _build_pitaka_map():
    for pitaka in PITAKAS:
        p_dir = TREE_DIR / pitaka
        if not p_dir.exists():
            continue
        for fp in p_dir.glob("*-tree.json"):
            book = fp.stem.replace("-tree", "")
            try:
                raw = json.loads(fp.read_text(encoding="utf-8"))
            except Exception:
                continue
            children = raw[book] if isinstance(raw, dict) and book in raw else raw
            leaves = _collect_leaves(children)
            for leaf in leaves:
                _SUTTA_PITAKA.setdefault(leaf, pitaka)
                _SUTTA_BOOK.setdefault(leaf, book)
            _SUTTA_PITAKA.setdefault(book, pitaka)
            _SUTTA_BOOK.setdefault(book, book)
            _tree_by_pitaka.setdefault(pitaka, []).append((book, children, leaves))

    ORDER = {
        "sutta": ["dn", "mn", "sn", "an", "kp", "dhp", "ud", "iti", "snp", "vv", "pv", "thag", "thig", "tha-ap", "thi-ap", "bv", "cp", "ja", "mnd", "cnd", "ps", "ne", "pe", "mil"],
        "vinaya": ["pli-tv-bu-vb", "pli-tv-bi-vb", "pli-tv-kd", "pli-tv-pvr", "pli-tv-bu-pm", "pli-tv-bi-pm"],
        "abhidhamma": ["ds", "vb", "dt", "pp", "kv", "ya", "patthana"]
    }
    for p, items in _tree_by_pitaka.items():
        order_list = ORDER.get(p, [])
        order_idx = {k: i for i, k in enumerate(order_list)}
        items.sort(key=lambda x: order_idx.get(x[0], 999))


def _get_prev_next(sutta_id):
    for pitaka in PITAKAS:
        for book, children, leaves in _tree_by_pitaka.get(pitaka, []):
            if sutta_id in leaves:
                i = leaves.index(sutta_id)
                return (leaves[i - 1] if i > 0 else None,
                        leaves[i + 1] if i < len(leaves) - 1 else None)
    return None, None


_KN_BOOKS = {"kp", "dhp", "ud", "iti", "snp", "vv", "pv", "thag", "thig",
             "tha-ap", "thi-ap", "bv", "cp", "ja", "mnd", "cnd", "ps", "ne", "pe", "mil"}


def _get_breadcrumbs(sutta_id):
    for pitaka in PITAKAS:
        for book, children, leaves in _tree_by_pitaka.get(pitaka, []):
            found = [] if sutta_id == book else _find_in_tree(children, sutta_id, [])
            if found is not None:
                crumbs = [{"id": pitaka, "label": _sutta_names.get(pitaka, pitaka.title())}]
                if pitaka == "sutta" and book in _KN_BOOKS:
                    crumbs.append({"id": "kn", "label": _sutta_names.get("kn", "Khuddaka Nikāya")})
                if sutta_id != book:
                    crumbs.append({"id": shorten_sutta_id(book),
                                   "label": _sutta_names.get(book, format_sutta_id(book))})
                    for seg in found:
                        crumbs.append({"id": shorten_sutta_id(seg),
                                       "label": _sutta_names.get(seg, format_sutta_id(seg))})
                return crumbs
    return []


# ============================================================
# Peta file MENTAH: bilara (sc_bilara_data) + html_text
# ============================================================
def _build_raw_file_map():
    scan = [
        ("sec", "ms", BILARA_DIR / "html" / "pli" / "ms"),
        ("pli", "ms", BILARA_DIR / "root" / "pli" / "ms"),
    ]
    trans_dir = BILARA_DIR / "translation"
    if trans_dir.exists():
        for lang_dir in trans_dir.iterdir():
            if not lang_dir.is_dir() or lang_dir.name.startswith("."):
                continue
            for author_dir in lang_dir.iterdir():
                if author_dir.is_dir() and not author_dir.name.startswith("."):
                    scan.append((lang_dir.name, author_dir.name, author_dir))

    for lang, author, lang_dir in scan:
        if not lang_dir.exists():
            continue
        key = lang if lang == "sec" else f"{lang}_{author}"
        is_translation = key not in ("sec", "pli_ms")
        for f in lang_dir.rglob("*.json"):
            base = f.name.split("_")[0]
            if is_translation and base not in _RAW_FILE_MAP:
                continue
            _RAW_FILE_MAP.setdefault(base, {})[key] = f

    for sid in _RAW_FILE_MAP:
        _SHORT_TO_FULL[shorten_sutta_id(sid)] = sid


_STRUCTURAL_HTML_DIRS = {
    "sutta", "vinaya", "abhidhamma", "dn", "mn", "sn", "an", "kn",
    "ds", "vb", "dt", "pp", "kv", "ya", "patthana",
    "kp", "dhp", "ud", "iti", "snp", "vv", "pv",
    "thag", "thig", "tha-ap", "thi-ap", "bv", "cp",
    "ja", "mnd", "cnd", "ps", "ne", "pe", "mil",
}


def _is_structural_html_dir(name: str) -> bool:
    if name in _STRUCTURAL_HTML_DIRS:
        return True
    if re.match(r"^(an|sn|vol)\d+$", name):
        return True
    return name.startswith("pli-tv") or name.startswith("pli-ms")


def _read_meta_author_html(html_path: Path):
    try:
        with open(html_path, "r", encoding="utf-8") as f:
            for line in f:
                m = re.search(r"<meta\s+name=['\"]author['\"]\s+content=['\"]([^'\"]+)['\"]", line, re.I)
                if m:
                    return m.group(1)
                if "</head>" in line.lower():
                    break
    except Exception:
        pass
    return None


def _normalize_author_from_meta(meta_str: str) -> str:
    original = meta_str.split(",")[0].strip()
    if original.lower() in _AUTHOR_UID_MAP:
        return _AUTHOR_UID_MAP[original.lower()]
    return bersihkan_diakritik(original).replace("_", "-").replace(" ", "-")


def _build_html_file_map():
    if not HTMLTEXT_DIR.exists():
        return
    for html_file in HTMLTEXT_DIR.rglob("*.html"):
        parts = list(html_file.relative_to(HTMLTEXT_DIR).parts)
        if len(parts) < 3 or parts[1] != "pli":
            continue
        lang = parts[0]
        stem = html_file.stem
        inner = tuple(parts[2:-1])
        author = None
        for p in inner:
            if not _is_structural_html_dir(p):
                author = p.replace("_", "-").replace(" ", "-")
                break
        if author is None:
            # Meta author WAJIB dibaca per file — satu folder bisa campuran
            # penerjemah (mis. en/pli/sutta/dn: dn1 Bodhi, dn3 Rhys Davids,
            # dn16 Ānandajoti). Cache per folder bikin semua file ikut author
            # file pertama; konsisten dgn deteksi per-file di 3-praproses.
            meta = _read_meta_author_html(html_file)
            author = _normalize_author_from_meta(meta) if meta else "unknown"
        _HTML_FILE_MAP.setdefault(stem, {})[(lang, author)] = html_file
        if stem not in _RAW_FILE_MAP and stem not in _SHORT_TO_FULL:
            _SHORT_TO_FULL[shorten_sutta_id(stem)] = stem


def _load_author_lang_names():
    for sub in ("translation", "root"):
        sub_dir = BILARA_DIR / sub
        if not sub_dir.exists():
            continue
        for lang_dir in sub_dir.iterdir():
            if not lang_dir.is_dir() or lang_dir.name.startswith("."):
                continue
            for author_dir in lang_dir.iterdir():
                if author_dir.is_dir() and not author_dir.name.startswith("."):
                    _BILARA_AUTHOR_UIDS.add(author_dir.name)
    try:
        p = BILARA_DIR / "_author.json"
        if p.exists():
            for uid, info in json.loads(p.read_text(encoding="utf-8")).items():
                name = info.get("name") if isinstance(info, dict) else None
                if name and uid in _BILARA_AUTHOR_UIDS:
                    _BILARA_AUTHOR_LONG_NAMES[uid] = name
                    _AUTHOR_UID_MAP[name.lower()] = uid
    except Exception as e:
        print(f"[reader] warn _author.json: {e}")
    try:
        p = RAW_DIR / "author_edition.json"
        if p.exists():
            for rec in json.loads(p.read_text(encoding="utf-8")):
                if "uid" in rec and "long_name" in rec:
                    _EDITION_AUTHOR_LONG_NAMES[rec["uid"]] = rec["long_name"]
                    if rec.get("type") == "author":
                        _AUTHOR_UID_MAP.setdefault(rec["long_name"].lower(), rec["uid"])
    except Exception as e:
        print(f"[reader] warn author_edition.json: {e}")
    try:
        p = RAW_DIR / "language.json"
        if p.exists():
            for rec in json.loads(p.read_text(encoding="utf-8")):
                if "uid" in rec and "name" in rec:
                    _LANG_NAME_MAP[rec["uid"]] = rec["name"]
    except Exception as e:
        print(f"[reader] warn language.json: {e}")
    try:
        # Fallback terakhir: uid yang tidak punya display name dari sumber
        # resmi (_author.json / author_edition.json). Tidak menimpa yang
        # sudah resolve, dan TIDAK menambah _AUTHOR_UID_MAP — slug harus
        # tetap sama dengan korpus search hasil 3-praproses.
        p = Path(__file__).resolve().parent / "custom_author.json"
        if p.exists():
            for uid, name in json.loads(p.read_text(encoding="utf-8")).items():
                if uid.startswith("_"):
                    continue
                if uid not in _BILARA_AUTHOR_LONG_NAMES and uid not in _EDITION_AUTHOR_LONG_NAMES:
                    _EDITION_AUTHOR_LONG_NAMES[uid] = name
    except Exception as e:
        print(f"[reader] warn custom_author.json: {e}")


def _load_blurbs():
    for lang, blurb_dir in [("en", BILARA_DIR / "root" / "en" / "blurb"),
                            ("id", BILARA_DIR / "translation" / "id" / "blurb")]:
        if not blurb_dir.exists():
            continue
        for fpath in blurb_dir.rglob("*.json"):
            for key, text in json.loads(fpath.read_text(encoding="utf-8")).items():
                sid = key.split(":")[1] if ":" in key else key
                if text and (sid, lang) not in _blurbs:
                    _blurbs[(sid, lang)] = text


# ============================================================
# Parse sutta -> segmen (html_text + bilara) — sinkron dgn chunker
# ============================================================
def _load_chunk_rules():
    f = config.EKSPLOR_DIR / "chunk_rules.json"
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"[reader] warn chunk_rules.json: {e}")
    return {"pts_split": [], "horner_split": []}


_RULES        = _load_chunk_rules()
PTS_BLOCK     = set(_RULES.get("pts_split", []))      # rel_id -> PTS <a> jadi pemecah blok
HORNER_BLOCK  = set(_RULES.get("horner_split", []))   # rel_id -> span.add "[N]" jadi pemecah blok
_PTS_PAT      = re.compile(r"\bPTS\s+\S+\s+\S+\s+\d+\b", re.IGNORECASE)
_BR_SPLIT     = re.compile(r"<br\s*/?>", re.IGNORECASE)
_DOUBLE_BR    = re.compile(r"(?:<br\s*/?>\s*){2,}", re.IGNORECASE)
_HORNER_RE    = re.compile(r"\[\d+\]")


def _clean_text(t):
    return re.sub(r"\s+", " ", _PTS_PAT.sub("", t or "")).strip()


def _get_sutta_from_html(sutta_id, lang, author):
    """1:1 dengan 3-praproses/1-chunk.py:chunk_html pada CHUNK_IDS/PARTS (partitioning) —
    inilah yang menjamin ref hasil search mendarat tepat di viewer. Counter md# maju identik
    (junk di chunker juga increment lalu `continue`), jadi id chunk non-junk tetap cocok.
    CATATAN: flag `heading`/`structural` BOLEH BEDA dari pipeline untuk lemma-tebal & penanda
    struktural (reader sengaja tampilkan inline + outline bersih; pipeline meng-exclude-nya
    dari search/training). Lihat web/flow.txt INVARIAN-3. Reader juga TIDAK membuang junk."""
    cache_key = (sutta_id, lang, author)
    if cache_key in _html_chunk_cache:
        return _html_chunk_cache[cache_key]
    html_path = _HTML_FILE_MAP.get(sutta_id, {}).get((lang, author))
    if not html_path or not html_path.exists():
        _html_chunk_cache[cache_key] = None
        return None

    from bs4 import BeautifulSoup
    stem = html_path.stem
    rel_id = html_path.relative_to(HTMLTEXT_DIR).with_suffix("").as_posix()
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "lxml")
    for el in soup.find_all(["footer", "script", "style"]):
        el.decompose()
    for el in soup.find_all(class_=["ref", re.compile(r"pts", re.I)]):
        if rel_id in PTS_BLOCK and el.name == "a":
            el.insert_before(soup.new_tag("br")); el.insert_before(soup.new_tag("br"))
        el.decompose()
    if rel_id in HORNER_BLOCK:
        for el in soup.find_all("span", class_="add", string=_HORNER_RE):
            el.insert_before(soup.new_tag("br")); el.insert_before(soup.new_tag("br"))

    text_key = f"{lang}_text"
    chunks = []
    hdr_ctr, body_ctr = 1, 1
    pending = []

    for tag in soup.find_all(["p", "li", "h1", "h2", "h3", "h4", "h5", "h6"]):
        is_speaker_tag = "speaker" in tag.get("class", [])
        block_source = tag.decode_contents()
        for block in _DOUBLE_BR.split(block_source):
            line_pairs = []
            for raw in _BR_SPLIT.split(block):
                cleaned_html = _clean_text(raw)
                soup_raw = BeautifulSoup(raw, "html.parser")
                text_only = _clean_text(soup_raw.get_text(separator=" "))
                if text_only:
                    is_spk = is_speaker_tag or bool(soup_raw.find(class_="speaker"))
                    if is_spk:
                        cleaned_html = f"<span class='speaker'>{text_only}</span>"
                    line_pairs.append((text_only, cleaned_html, is_spk))
            if not line_pairs:
                continue
            if len(line_pairs) == 1 and line_pairs[0][2]:
                pending.extend(line_pairs)
                continue
            in_header = tag.find_parent("header") is not None
            if in_header:
                p_id = f"md0{hdr_ctr}"; hdr_ctr += 1
            else:
                p_id = f"md{body_ctr}"; body_ctr += 1
            if re.fullmatch(r"h[1-6]", tag.name):       # heading: <hN> -> level; non-<hN> di <header> -> 1
                heading = int(tag.name[1])
            elif in_header:
                heading = 1
            else:
                heading = 0
            chunk_id = f"{stem}:{p_id}"
            parts = []
            for i, (_, spk_html, _) in enumerate(pending):
                sub = ".0" if i == 0 else f".0{i}"
                parts.append({"id": f"{chunk_id}{sub}", "num": "", "text": spk_html})
            pending = []
            verse_idx = 1
            for i, (_, html_line, is_spk) in enumerate(line_pairs):
                if is_spk:
                    sub = ".0" if i == 0 else f".0{i}"
                    parts.append({"id": f"{chunk_id}{sub}", "num": "", "text": html_line})
                elif len(line_pairs) == 1 and not parts:
                    parts.append({"id": f"{chunk_id}.1", "num": "", "text": html_line})
                else:
                    parts.append({"id": f"{chunk_id}.{verse_idx}", "num": f"{p_id}.{verse_idx}", "text": html_line})
                    verse_idx += 1
            full_text = " ".join(_clean_text(BeautifulSoup(p["text"], "html.parser").get_text(separator=" ")) for p in parts)
            chunks.append({text_key: full_text, "chunk_ids": [chunk_id], "heading": heading,
                           "tag": tag.name, "parts": parts})

    if pending:
        chunk_id = f"{stem}:md{body_ctr}"
        parts = [{"id": f"{chunk_id}{'.0' if i == 0 else f'.0{i}'}", "num": "", "text": spk}
                 for i, (_, spk, _) in enumerate(pending)]
        full_text = " ".join(_clean_text(BeautifulSoup(p["text"], "html.parser").get_text(separator=" ")) for p in parts)
        chunks.append({text_key: full_text, "chunk_ids": [chunk_id], "heading": 0, "tag": "p", "parts": parts})

    result = chunks or None
    _html_chunk_cache[cache_key] = result
    return result


def _get_sutta_from_raw(sutta_id, target_lang, author=None):
    paths = _RAW_FILE_MAP.get(sutta_id)
    if not paths:
        return None
    pli_key = next((k for k in paths if k.startswith("pli_")), None)
    lang_key = target_lang if target_lang == "sec" else f"{target_lang}_{author}"

    if "sec" in paths:
        sec_data = json.loads(paths["sec"].read_text(encoding="utf-8"))
    else:
        ref_path = (paths[pli_key] if pli_key else None) or paths.get(lang_key)
        if not ref_path:
            return None
        sec_data = {k: "<p></p>" for k in json.loads(ref_path.read_text(encoding="utf-8")).keys()}

    pli_data = json.loads(paths[pli_key].read_text(encoding="utf-8")) if pli_key else {}
    lang_data = json.loads(paths[lang_key].read_text(encoding="utf-8")) if lang_key in paths else {}
    en_data = {}
    if target_lang == "pli" and "en_sujato" in paths:
        en_data = json.loads(paths["en_sujato"].read_text(encoding="utf-8"))

    open_tag = re.compile(r"<(p|h[1-6]|li|blockquote)[^>]*>")
    close_tag = re.compile(r"</(p|h[1-6]|li|blockquote)>")
    heading_pat = re.compile(r"<h([1-6])")
    chunks, parts, heading = [], [], 0

    def _flush(parts, heading):
        return {
            "chunk_ids": [p["id"] for p in parts],
            "lang_text": " ".join(p["lang"] for p in parts if p["lang"].strip()).strip(),
            "pli_text": " ".join(p["pli"] for p in parts if p["pli"].strip()).strip(),
            "en_text": " ".join(p["en"] for p in parts if p["en"].strip()).strip(),
            "parts": parts, "heading": heading,
        }

    for seg_id, html_tmpl in sec_data.items():
        if open_tag.search(html_tmpl) and parts:
            chunks.append(_flush(parts, heading)); parts, heading = [], 0
        hm = heading_pat.search(html_tmpl)
        if hm:
            heading = int(hm.group(1))
        parts.append({"id": seg_id, "lang": lang_data.get(seg_id, ""),
                      "pli": pli_data.get(seg_id, ""), "en": en_data.get(seg_id, ""),
                      "heading": heading})
        if close_tag.search(html_tmpl):
            chunks.append(_flush(parts, heading)); parts, heading = [], 0
    if parts:
        chunks.append(_flush(parts, heading))
    return [c for c in chunks if c["lang_text"] or c["pli_text"]]


# ============================================================
# Tree untuk /api/browse
# ============================================================
def build_tree():
    global _tree_cache
    if _tree_cache is not None:
        return _tree_cache

    def _extract(data, name):
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            if name in data:
                return data[name]
            if len(data) == 1:
                return list(data.values())[0]
        return data

    KN = ["kp", "dhp", "ud", "iti", "snp", "vv", "pv", "thag", "thig",
          "tha-ap", "thi-ap", "bv", "cp", "ja", "mnd", "cnd", "ps", "ne", "pe", "mil"]
    VIN = ["pli-tv-bu-vb", "pli-tv-bi-vb", "pli-tv-kd", "pli-tv-pvr", "pli-tv-bu-pm", "pli-tv-bi-pm"]
    ABH = ["ds", "vb", "dt", "pp", "kv", "ya", "patthana"]

    def _ordered(raw, order):
        return {k: raw[k] for k in order if k in raw}

    tree = {"sutta": {}}
    sutta_dir = TREE_DIR / "sutta"
    if sutta_dir.exists():
        for nikaya in ("dn", "mn", "sn", "an"):
            fp = sutta_dir / f"{nikaya}-tree.json"
            if fp.exists():
                tree["sutta"][nikaya] = _extract(json.loads(fp.read_text(encoding="utf-8")), nikaya)
        kn_raw = {}
        for fp in sutta_dir.glob("*-tree.json"):
            name = fp.stem.replace("-tree", "")
            if name in set(KN):
                kn_raw[name] = _extract(json.loads(fp.read_text(encoding="utf-8")), name)
        if kn_raw:
            tree["sutta"]["kn"] = _ordered(kn_raw, KN)

    for pitaka, order in (("vinaya", VIN), ("abhidhamma", ABH)):
        p_dir = TREE_DIR / pitaka
        if not p_dir.exists():
            continue
        allowed, p_raw = set(order), {}
        for fp in p_dir.glob("*-tree.json"):
            name = fp.stem.replace("-tree", "")
            if name in allowed:
                p_raw[name] = _extract(json.loads(fp.read_text(encoding="utf-8")), name)
        if p_raw:
            if pitaka == "vinaya":
                for pm in ("pli-tv-bi-pm", "pli-tv-bu-pm"):
                    if pm in p_raw:
                        p_raw[pm] = pm
            tree[pitaka] = _ordered(p_raw, order)
    _tree_cache = tree
    return tree


def sutta_names_for_pitaka(pitaka):
    """Nama (leaf + kunci grup/vagga) yg muncul di build_tree()[pitaka] saja —
    dipakai /api/sutta-names/<pitaka> utk lazy-load per-piṭaka (payload kecil)."""
    pit = build_tree().get(pitaka)
    if not pit:
        return {}
    ids = {pitaka}
    def _walk(node):
        if isinstance(node, str):
            ids.add(node)
        elif isinstance(node, list):
            for n in node:
                _walk(n)
        elif isinstance(node, dict):
            for k, v in node.items():
                ids.add(k)
                _walk(v)
    _walk(pit)
    return {i: _sutta_names[i] for i in ids if i in _sutta_names}


def collections_list():
    """Koleksi yg bisa di-alamatkan via kitab+nomor di "Lompat ke Teks":
    [{uid, display}] — uid = prefix leaf (mn, dhp, bu-pj, …), display = format_sutta_id(uid)."""
    prefixes = {}
    def _walk(node):
        if isinstance(node, str):
            m = re.match(r"^([a-z][a-z\-]*?)[0-9]", shorten_sutta_id(node))
            if m:
                uid = m.group(1).rstrip("-")
                prefixes.setdefault(uid, format_sutta_id(uid))
        elif isinstance(node, list):
            for n in node:
                _walk(n)
        elif isinstance(node, dict):
            for v in node.values():
                _walk(v)
    _walk(build_tree())
    return [{"uid": u, "display": d} for u, d in sorted(prefixes.items())]


_NIKAYA_CODES = {"dn", "mn", "sn", "an", "kn"}   # pengelompokan nikaya (kn = virtual, tak punya leaf sendiri)


def collection_codes() -> set:
    """Set kode KOLEKSI yg bisa dirujuk sbg KESELURUHAN (bukan sutta+nomor): piṭaka,
    nikaya, & kitab. Dibangun dari struktur tree — bukan daftar hard-code per-kitab."""
    codes = set(PITAKAS) | set(_NIKAYA_CODES)
    for items in _tree_by_pitaka.values():
        for book, _children, _leaves in items:
            codes.add(shorten_sutta_id(book))
    return codes


def _strip_html(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


def glossary_entry(uid: str, lang: str = "id") -> dict:
    """Entri glosari GROUNDED utk satu kode koleksi (mis. 'dhp', 'an', 'kn'):
    nama kanonik + blurb otoritatif (SuttaCentral) + hierarki + jumlah teks.
    None kalau uid bukan koleksi. Sumber satu-satunya data korpus — anti-halusinasi."""
    uid = shorten_sutta_id(uid)
    if uid not in collection_codes():
        return None
    blurb = (_blurbs.get((uid, lang)) or _blurbs.get((uid, "en"))
             or _blurbs.get((uid, "id")))
    crumbs = [c["label"] for c in _get_breadcrumbs(uid)]
    if not crumbs:                       # kn/piṭaka yg tak jadi 'book' di tree -> fallback piṭaka
        pit = _SUTTA_PITAKA.get(uid)
        if pit and pit != uid:
            crumbs = [_sutta_names.get(pit, pit.title())]
    count = 0
    for items in _tree_by_pitaka.values():
        for book, _children, leaves in items:
            if shorten_sutta_id(book) == uid:
                count = len(leaves)
    return {
        "uid": uid,
        "abbr": format_sutta_id(uid),
        "name": _sutta_names.get(uid),
        "blurb": _strip_html(blurb) if blurb else None,
        "hierarchy": crumbs,
        "count": count,
    }


# ============================================================
# init — bangun semua peta sekali (dipanggil app.py saat startup)
# ============================================================
def init():
    t0 = time.time()
    _load_sutta_names()
    _build_pitaka_map()
    _load_author_lang_names()
    _build_raw_file_map()
    _build_html_file_map()
    _load_blurbs()
    print(f"[reader] {len(_RAW_FILE_MAP):,} bilara, {len(_HTML_FILE_MAP):,} html, "
          f"{len(_sutta_names):,} nama, {len(_SUTTA_PITAKA):,} pitaka, {len(_blurbs):,} blurb "
          f"({time.time()-t0:.2f}s)")
