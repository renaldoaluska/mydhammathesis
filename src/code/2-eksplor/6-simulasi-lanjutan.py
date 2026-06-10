"""
6-simulasi-lanjutan.py — Mengevaluasi chunk raksasa dan membuat rule pemotongan.

Berdasarkan laporan dari 5-simulasi-chunk.py, script ini menginspeksi file-file 
yang memiliki chunk > 5000 karakter. Script ini menguji tiga strategi pemotongan:
1. Double <br> (default praproses)
2. Marker PTS (<a class="ref pts...">)
3. Marker etc

Hasilnya akan digenerate ke chunk_rules.json untuk dipakai oleh 1-chunk.py.
"""

import sys
import json
import re
from pathlib import Path
from bs4 import BeautifulSoup

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config

RAW_DIR = config.RAW_DIR
THRESHOLD = 5000
PTS_PATTERN = re.compile(r'\bPTS\s+\S+\s+\S+\s+\d+\b', re.IGNORECASE)

def clean_text(text):
    text = PTS_PATTERN.sub('', text)
    return re.sub(r'\s+', ' ', text).strip()

def analyze_giant_chunks(html_dir, rules, stats, htmltext):
    all_html = list(Path(html_dir).rglob("*.html"))
    if not all_html:
        return

    double_br_split = re.compile(r'(?:<br\s*/?>\s*){2,}', re.IGNORECASE)
    horner_split_re = re.compile(r'\[\d+\]')

    for html_file in all_html:
        rel_id = str(html_file.relative_to(htmltext).with_suffix(""))
        soup = BeautifulSoup(html_file.read_text(encoding="utf-8"), "lxml")
        
        for el in soup.find_all(["footer", "script", "style"]):
            el.decompose()

        has_giant = False
        giant_blocks = []
        for tag in soup.find_all(["p", "li", "h1", "h2", "h3", "h4", "h5", "h6"]):
            block_source = tag.decode_contents()
            soup_raw = BeautifulSoup(block_source, "html.parser")
            text_only = clean_text(soup_raw.get_text(separator=" "))
            
            if len(text_only) > THRESHOLD:
                has_giant = True
                giant_blocks.append(block_source)
                
        if not has_giant:
            continue
            
        # File ini punya chunk raksasa. Mari kita uji strategi pemecahannya.
        
        # 1. Uji Double BR (karena ini akan dilakukan secara default oleh 1-chunk.py)
        is_still_giant_after_br = False
        for block in giant_blocks:
            giant_found = False
            for piece in double_br_split.split(block):
                soup_raw = BeautifulSoup(piece, "html.parser")
                piece_text = clean_text(soup_raw.get_text(separator=" "))
                if len(piece_text) > THRESHOLD:
                    giant_found = True
                    break
            if giant_found:
                is_still_giant_after_br = True
                break
                
        if not is_still_giant_after_br:
            stats["resolved_by_double_br"] += 1
            continue  # Terselesaikan oleh default, tidak perlu rule khusus!
            
        # 2. Uji PTS secara aktual (simulasi split)
        is_still_giant_after_pts = False
        for block in giant_blocks:
            soup_test = BeautifulSoup(block, "html.parser")
            has_pts = False
            for el in soup_test.find_all(class_=["ref", re.compile(r"pts", re.I)]):
                if el.name == "a":
                    el.insert_before(soup_test.new_tag("br"))
                    el.insert_before(soup_test.new_tag("br"))
                    has_pts = True
                el.decompose()
            
            if not has_pts:
                is_still_giant_after_pts = True
                break
                
            block_source = soup_test.decode_contents()
            giant_found = False
            for piece in double_br_split.split(block_source):
                piece_soup = BeautifulSoup(piece, "html.parser")
                piece_text = clean_text(piece_soup.get_text(separator=" "))
                if len(piece_text) > THRESHOLD:
                    giant_found = True
                    break
            
            if giant_found:
                is_still_giant_after_pts = True
                break
                
        if not is_still_giant_after_pts:
            rules["pts_split"].add(rel_id)
            stats["resolved_by_pts"] += 1
            continue
            
        # 3. Uji Horner Split (<span class="add">[...]</span>)
        is_still_giant_after_horner = False
        for block in giant_blocks:
            soup_test = BeautifulSoup(block, "html.parser")
            has_horner = False
            for el in soup_test.find_all("span", class_="add", string=horner_split_re):
                el.insert_before(soup_test.new_tag("br"))
                el.insert_before(soup_test.new_tag("br"))
                has_horner = True
                
            if not has_horner:
                is_still_giant_after_horner = True
                break
                
            block_source = soup_test.decode_contents()
            giant_found = False
            for piece in double_br_split.split(block_source):
                piece_soup = BeautifulSoup(piece, "html.parser")
                piece_text = clean_text(piece_soup.get_text(separator=" "))
                if len(piece_text) > THRESHOLD:
                    giant_found = True
                    break
                    
            if giant_found:
                is_still_giant_after_horner = True
                break
                
        if not is_still_giant_after_horner:
            rules["horner_split"].add(rel_id)
            stats["resolved_by_horner"] += 1
        else:
            stats["unresolved"] += 1

def main():
    out_txt = config.EKSPLOR_DIR / "6-simulasi-lanjutan.txt"
    sys.stdout = open(out_txt, "w", encoding="utf-8")
    
    print(f"=== SIMULASI LANJUTAN (PENENTUAN RULE CHUNKING) ===\n")
    htmltext = RAW_DIR / "html_text"
    
    rules = {
        "pts_split": set(),
        "horner_split": set()
    }
    
    stats = {
        "resolved_by_double_br": 0,
        "resolved_by_pts": 0,
        "resolved_by_horner": 0,
        "unresolved": 0
    }
    
    id_html = htmltext / "id" / "pli"
    if id_html.exists():
        analyze_giant_chunks(id_html, rules, stats, htmltext)
        
    en_html = htmltext / "en" / "pli"
    if en_html.exists():
        analyze_giant_chunks(en_html, rules, stats, htmltext)
        
    print("\nHasil Evaluasi Chunk Raksasa:")
    print(f"  - Selesai via Double BR (Default)  : {stats['resolved_by_double_br']} file")
    print(f"  - Selesai via PTS Split (Rule)     : {stats['resolved_by_pts']} file")
    print(f"  - Selesai via Horner Split (Rule)  : {stats['resolved_by_horner']} file")
    print(f"  - Tidak Terselesaikan              : {stats['unresolved']} file")
    
    # Konversi set ke list agar bisa di JSON serialize
    final_rules = {k: sorted(list(v)) for k, v in rules.items()}

    # Policy CLASS struktural & heading — kurasi dari inventaris 4-analisis-lanjutan.txt [A].
    # Dipakai 1-chunk.py: class struktural -> tag structural (exclude body + SUMBER latih GPL);
    # class heading -> tag heading. (rule/question/add = KONTEN, sengaja TIDAK dimasukkan.)
    final_rules["structural_classes"] = [
        "end", "endsutta", "endsection", "endvagga", "endbook", "endkanda",  # penanda akhir seksi
        "namo",          # formula homage "Namo tassa bhagavato..."
        "pe",            # peyyala / elipsis pengulangan
        "uddana-intro",  # pengantar uddana (mnemonic)
    ]
    final_rules["heading_classes"] = ["subheading", "vagga"]

    out_file = config.EKSPLOR_DIR / "chunk_rules.json"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(final_rules, f, ensure_ascii=False, indent=2)
        
    print(f"\nRule pemotongan tersimpan di: {out_file}")
    print(f"[INFO] Laporan evaluasi ini tersimpan di: {out_txt}")
    sys.stdout.close()
    
    sys.__stdout__.write(f"Evaluasi selesai! Laporan tersimpan di: {out_txt}\n")
    sys.__stdout__.write(f"Rule pemotongan tersimpan di: {out_file}\n")

if __name__ == "__main__":
    main()
