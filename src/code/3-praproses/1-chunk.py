"""
1-chunk.py — Chunking seluruh korpus Tipitaka (semua pitaka) untuk myDhamma.

Sumber & deteksi author dari struktur folder:
  - sc_bilara_data/root/pli/ms           -> PLI (Mahāsaṅgīti)
  - sc_bilara_data/translation/en/<author> -> EN bilara
  - sc_bilara_data/translation/id/<author> -> ID bilara (bila ada)
  - html_text/id/pli, html_text/en/pli   -> terjemahan format HTML

Chunking HTML-aware (lxml: <p> tak tertutup ditutup otomatis seperti browser),
heading di-TAG (`heading: <level>`) bukan digabung, `parts` untuk speaker/verse,
double-<br> memecah bait. TANPA min-length (teks suci sengaja utuh); HANYA junk
murni (simbol/angka tanpa konten) yang dibuang.

Output: src/output/3-praproses/<source>/<lang>/<author>_chunked.jsonl
Usage : python src/code/3-praproses/1-chunk.py
"""

import sys
import json
import re
import unicodedata
from pathlib import Path
from bs4 import BeautifulSoup

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config                                                  # noqa: E402

RAW_DIR = config.RAW_DIR

# Junk filter (buang chunk body simbol/angka murni) ada di config.is_junk_body —
# dipakai bersama praproses & eksplor (no redundan).


# ── Author resolution ──────────────────────────────────────────────────────
def bersihkan_diakritik(text: str) -> str:
    if not text:
        return ""
    norm = unicodedata.normalize("NFD", text)
    clean = "".join(c for c in norm if not unicodedata.combining(c))
    return unicodedata.normalize("NFC", clean).lower()


_STRUCTURAL_HTML_DIRS = {
    "sutta", "vinaya", "abhidhamma",
    "dn", "mn", "sn", "an", "kn",
    "ds", "vb", "dt", "pp", "kv", "ya", "patthana",
    "kp", "dhp", "ud", "iti", "snp", "vv", "pv",
    "thag", "thig", "tha-ap", "thi-ap", "bv", "cp",
    "ja", "mnd", "cnd", "ps", "ne", "pe", "mil",
    "pli", "en", "id",
}


def _is_structural_html_dir(name: str) -> bool:
    if name in _STRUCTURAL_HTML_DIRS:
        return True
    if re.match(r'^(an|sn|vol)\d+$', name):
        return True
    if name.startswith('pli-tv') or name.startswith('pli-ms'):
        return True
    return False


_AUTHOR_UID_MAP: dict[str, str] = {}
_BILARA_AUTHOR_UIDS: set[str] = set()


def _build_author_uid_map():
    """Load author_edition.json + nama folder bilara. Konsisten dgn app.py."""
    bilara_translation_dir = RAW_DIR / "sc_bilara_data" / "translation"
    if bilara_translation_dir.exists():
        for lang_dir in bilara_translation_dir.iterdir():
            if not lang_dir.is_dir():
                continue
            for author_dir in lang_dir.iterdir():
                if author_dir.is_dir() and not author_dir.name.startswith('.'):
                    _BILARA_AUTHOR_UIDS.add(author_dir.name)

    author_json = RAW_DIR / "author_edition.json"
    if author_json.exists():
        try:
            for record in json.loads(author_json.read_text(encoding="utf-8")):
                if record.get("type") == "author":
                    uid = record.get("uid")
                    for field in ("long_name", "short_name"):
                        name = record.get(field)
                        if name and uid:
                            _AUTHOR_UID_MAP.setdefault(name.lower(), uid)
        except Exception as e:
            print(f"  [WARN] gagal load author_edition.json: {e}")


def _normalize_author_from_meta(meta_str: str) -> str:
    original = meta_str.split(",")[0].strip()
    key = original.lower()
    if key in _AUTHOR_UID_MAP:
        return _AUTHOR_UID_MAP[key]
    return bersihkan_diakritik(original).replace('_', '-').replace(' ', '-')


# ── Shared ──────────────────────────────────────────────────────────────
def natural_keys(path):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', path.name)]


# ── Blurb chunking (key-value: sutta_id -> ringkasan) ──────────────────────
def chunk_blurbs(text_dir, text_key, output_file, valid_leaf_ids):
    dataset = []
    for f in sorted(Path(text_dir).rglob("*.json"), key=natural_keys):
        base = f.name.split('_')[0]
        data = json.loads(f.read_text(encoding="utf-8"))
        chunks = []
        for key, text in data.items():
            text = text.strip()
            if not text:
                continue
            sutta_id = key.split(':')[-1] if ':' in key else key
            if sutta_id not in valid_leaf_ids:
                continue
            if config.is_junk_body(text, 0):
                continue
            chunks.append({"chunk_ids": [sutta_id], text_key: text})
        if chunks:
            dataset.append({"file_base_name": base, "chunks": chunks})

    if not dataset:
        return 0
    Path(output_file).parent.mkdir(parents=True, exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        for item in dataset:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    return sum(len(d["chunks"]) for d in dataset)


# ── Bilara JSON chunking (sec struktur HTML + teks) ────────────────────────
def chunk_bilara(sec_dir, text_dir, text_key, output_file):
    text_dict = {f.name.split('_')[0]: f for f in text_dir.rglob("*.json")}

    open_tag  = re.compile(r'<(p|h[1-6]|li|blockquote)[^>]*>')
    close_tag = re.compile(r'</(p|h[1-6]|li|blockquote)>')
    heading_pat = re.compile(r'<h([1-6])')

    dataset = []
    for sec_file in sorted(sec_dir.rglob("*.json"), key=natural_keys):
        base = sec_file.name.split('_')[0]
        if base not in text_dict:
            continue
        sec_data  = json.loads(sec_file.read_text(encoding="utf-8"))
        text_data = json.loads(text_dict[base].read_text(encoding="utf-8"))

        chunks, ids, texts = [], [], []
        current_heading = 0
        for seg_id, html in sec_data.items():
            text = text_data.get(seg_id, "")
            if open_tag.search(html) and ids:
                chunks.append({"chunk_ids": ids, text_key: " ".join(texts).strip(), "heading": current_heading})
                ids, texts, current_heading = [], [], 0
            hm = heading_pat.search(html)
            if hm:
                current_heading = int(hm.group(1))
            ids.append(seg_id)
            if text.strip():
                texts.append(text)
            if close_tag.search(html):
                chunks.append({"chunk_ids": ids, text_key: " ".join(texts).strip(), "heading": current_heading})
                ids, texts, current_heading = [], [], 0

        # Heading body tetap chunk sendiri (heading>0), disaring include_titles di web.
        cleaned = [c for c in chunks
                   if c[text_key] and not config.is_junk_body(c[text_key], c["heading"])]
        if cleaned:
            dataset.append({"file_base_name": base, "chunks": cleaned})

    Path(output_file).parent.mkdir(parents=True, exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        for item in dataset:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    return len(dataset)


# ── HTML chunking (html_text) ──────────────────────────────────────────────
PTS_PATTERN = re.compile(r'\bPTS\s+\S+\s+\S+\s+\d+\b', re.IGNORECASE)


def clean_text(text):
    text = PTS_PATTERN.sub('', text)
    return re.sub(r'\s+', ' ', text).strip()


BR_SPLIT = re.compile(r'<br\s*/?>', re.IGNORECASE)
DOUBLE_BR_SPLIT = re.compile(r'(?:<br\s*/?>\s*){2,}', re.IGNORECASE)

# Fix "chunk raksasa": beberapa sutta punya satu <p> raksasa tanpa <br>; pecah di
# satu-satunya batas yang tersedia sumber. Harus identik dengan app.py.
PTS_BLOCK_SUTTAS   = {"ja522", "ja531", "ja534", "ja535", "ja536", "ja537", "ja538", "ja543"}
SLASH_BLOCK_SUTTAS = {"pli-tv-kd18"}
SLASH_BLOCK_RE     = re.compile(r'\s*/\s*(?=<br\s*/?>)', re.IGNORECASE)


def chunk_html(html_dir, text_key, output_dir):
    """Chunk HTML cocok dengan app.py `_get_sutta_from_html` (chunk_ids/parts konsisten)."""
    all_html = list(Path(html_dir).rglob("*.html"))
    if not all_html:
        return {}

    datasets = {}
    for html_file in sorted(all_html, key=natural_keys):
        stem = html_file.stem
        # lxml: <p> tak tertutup ditutup otomatis (cegah chunk raksasa).
        soup = BeautifulSoup(html_file.read_text(encoding="utf-8"), "lxml")

        # author dari path; fallback ke <meta>/<span class=author>.
        author = None
        for p in html_file.parent.relative_to(Path(html_dir)).parts:
            if not _is_structural_html_dir(p):
                author = p.replace('_', '-').replace(' ', '-')
                break
        if not author:
            meta = soup.find("meta", attrs={"name": "author"})
            if meta and meta.get("content"):
                author = _normalize_author_from_meta(meta["content"])
            else:
                span = soup.find("span", class_="author")
                author = _normalize_author_from_meta(span.get_text(strip=True)) if span else "unknown"

        for el in soup.find_all(["footer", "script", "style"]):
            el.decompose()
        for el in soup.find_all(class_=["ref", re.compile(r"pts", re.I)]):
            if stem in PTS_BLOCK_SUTTAS and el.name == "a":
                el.insert_before(soup.new_tag("br"))
                el.insert_before(soup.new_tag("br"))
            el.decompose()

        file_chunks = []
        hdr_ctr, body_ctr = 1, 1
        pending_speaker_pairs = []

        for tag in soup.find_all(["p", "li", "h1", "h2", "h3", "h4", "h5", "h6"]):
            is_speaker_tag = "speaker" in tag.get("class", [])
            block_source = tag.decode_contents()
            if stem in SLASH_BLOCK_SUTTAS:
                block_source = SLASH_BLOCK_RE.sub('<br/><br/>', block_source)

            for block in DOUBLE_BR_SPLIT.split(block_source):
                line_pairs = []
                for raw in BR_SPLIT.split(block):
                    cleaned_html = clean_text(raw)
                    soup_raw = BeautifulSoup(raw, "html.parser")
                    text_only = clean_text(soup_raw.get_text(separator=" "))
                    if text_only:
                        is_speaker = is_speaker_tag or bool(soup_raw.find(class_="speaker"))
                        if is_speaker:
                            cleaned_html = f"<span class='speaker'>{text_only}</span>"
                        line_pairs.append((text_only, cleaned_html, is_speaker))

                if not line_pairs:
                    continue
                if len(line_pairs) == 1 and line_pairs[0][2]:
                    pending_speaker_pairs.extend(line_pairs)
                    continue

                if tag.find_parent("header"):
                    p_id = f"md0{hdr_ctr}"; hdr_ctr += 1
                else:
                    p_id = f"md{body_ctr}"; body_ctr += 1
                heading = int(tag.name[1]) if re.fullmatch(r"h[1-6]", tag.name) else 0
                chunk_id = f"{stem}:{p_id}"

                parts = []
                for i, (_, spk_html, _) in enumerate(pending_speaker_pairs):
                    sub = ".0" if i == 0 else f".0{i}"
                    parts.append({"id": f"{chunk_id}{sub}", "num": "", "text": spk_html})
                pending_speaker_pairs = []

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

                full_text = " ".join(
                    clean_text(BeautifulSoup(p["text"], "html.parser").get_text(separator=" ")) for p in parts
                )
                if config.is_junk_body(full_text, heading):
                    continue
                file_chunks.append({text_key: full_text, "chunk_ids": [chunk_id], "heading": heading, "parts": parts})

        if pending_speaker_pairs:
            chunk_id = f"{stem}:md{body_ctr}"
            parts = []
            for i, (_, spk_html, _) in enumerate(pending_speaker_pairs):
                sub = ".0" if i == 0 else f".0{i}"
                parts.append({"id": f"{chunk_id}{sub}", "num": "", "text": spk_html})
            full_text = " ".join(
                clean_text(BeautifulSoup(p["text"], "html.parser").get_text(separator=" ")) for p in parts
            )
            if not config.is_junk_body(full_text, 0):
                file_chunks.append({text_key: full_text, "chunk_ids": [chunk_id], "heading": 0, "parts": parts})

        if file_chunks:
            datasets.setdefault(author, []).append({"file_base_name": stem, "chunks": file_chunks})

    counts = {}
    for author, dataset in datasets.items():
        out_file = Path(output_dir) / f"{author}_chunked.jsonl"
        out_file.parent.mkdir(parents=True, exist_ok=True)
        with open(out_file, "w", encoding="utf-8") as f:
            for item in dataset:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")
        counts[author] = len(dataset)
    return counts


# ── Main ────────────────────────────────────────────────────────────────
def main():
    _build_author_uid_map()

    out_dir   = config.PRAPROSES_DIR
    bilara_out = out_dir / "bilara"
    html_out   = out_dir / "html"

    bilara_dir = RAW_DIR / "sc_bilara_data"
    htmltext   = RAW_DIR / "html_text"
    sec_dir    = bilara_dir / "html" / "pli" / "ms"

    valid_leaf_ids = {f.name.split('_')[0] for f in sec_dir.rglob("*.json")}

    print("=== Chunking korpus Tipitaka (semua pitaka) ===\n")

    # 1. PLI root
    n = chunk_bilara(sec_dir, bilara_dir / "root" / "pli" / "ms", "pli_text",
                     bilara_out / "pli" / "ms_chunked.jsonl")
    print(f"  bilara/pli/ms: {n} teks")

    # 2. EN bilara (auto-detect author) + blurb
    en_base = bilara_dir / "translation" / "en"
    if en_base.exists():
        for author_dir in sorted(en_base.iterdir()):
            if author_dir.is_dir() and author_dir.name != "name":
                author = author_dir.name.replace('_', '-').replace(' ', '-')
                out = bilara_out / "en" / f"{author}_chunked.jsonl"
                if author == "blurb":
                    n = chunk_blurbs(author_dir, "en_text", out, valid_leaf_ids)
                else:
                    n = chunk_bilara(sec_dir, author_dir, "en_text", out)
                print(f"  bilara/en/{author}: {n} teks")

    en_blurb = bilara_dir / "root" / "en" / "blurb"
    if en_blurb.exists():
        n = chunk_blurbs(en_blurb, "en_text", bilara_out / "en" / "blurb_chunked.jsonl", valid_leaf_ids)
        print(f"  bilara/en/blurb (root): {n} blurb")

    # 3. ID bilara (bila ada) + blurb
    id_base = bilara_dir / "translation" / "id"
    if id_base.exists():
        for author_dir in sorted(id_base.iterdir()):
            if author_dir.is_dir() and author_dir.name != "name":
                author = author_dir.name.replace('_', '-').replace(' ', '-')
                out = bilara_out / "id" / f"{author}_chunked.jsonl"
                if author == "blurb":
                    n = chunk_blurbs(author_dir, "id_text", out, valid_leaf_ids)
                else:
                    n = chunk_bilara(sec_dir, author_dir, "id_text", out)
                print(f"  bilara/id/{author}: {n} teks")

    # 4. ID html_text
    id_html = htmltext / "id" / "pli"
    if id_html.exists():
        for author, n in chunk_html(id_html, "id_text", html_out / "id").items():
            print(f"  html/id/{author}: {n} teks")

    # 5. EN html_text
    en_html = htmltext / "en" / "pli"
    if en_html.exists():
        for author, n in chunk_html(en_html, "en_text", html_out / "en").items():
            print(f"  html/en/{author}: {n} teks")

    print(f"\nSelesai! -> {out_dir}")


if __name__ == "__main__":
    main()
