"""
5-simulasi-chunk.py — Dry-run analyzer untuk mendeteksi chunk raksasa (>5.000 karakter)
dan merekomendasikan rule pemotongan (seperti PTS marker atau slash) ke dalam file
chunk_rules.json.
"""

import sys
import json
import re
from pathlib import Path
from bs4 import BeautifulSoup
import unicodedata

_BASE = next(p for p in Path(__file__).resolve().parents if (p / "config.py").exists())
sys.path.insert(0, str(_BASE))
import config

RAW_DIR = config.RAW_DIR
THRESHOLD = 5000

PTS_PATTERN = re.compile(r'\bPTS\s+\S+\s+\S+\s+\d+\b', re.IGNORECASE)

def clean_text(text):
    text = PTS_PATTERN.sub('', text)
    return re.sub(r'\s+', ' ', text).strip()

def analyze_html_dir(html_dir, htmltext):
    all_html = list(Path(html_dir).rglob("*.html"))
    if not all_html:
        return []

    giants = []
    for html_file in all_html:
        rel_id = str(html_file.relative_to(htmltext).with_suffix(""))
        soup = BeautifulSoup(html_file.read_text(encoding="utf-8"), "lxml")
        
        for el in soup.find_all(["footer", "script", "style"]):
            el.decompose()

        for tag in soup.find_all(["p", "li", "h1", "h2", "h3", "h4", "h5", "h6"]):
            block_source = tag.decode_contents()
            soup_raw = BeautifulSoup(block_source, "html.parser")
            text_only = clean_text(soup_raw.get_text(separator=" "))
            
            if len(text_only) > THRESHOLD:
                giants.append((rel_id, len(text_only)))
                break  # Satu aja cukup untuk menandai file ini bermasalah
                
    return giants

def main():
    out_txt = config.EKSPLOR_DIR / "5-simulasi-chunk.txt"
    sys.stdout = open(out_txt, "w", encoding="utf-8")
    
    print(f"=== SIMULASI CHUNKING (THRESHOLD > {THRESHOLD} chars) ===\n")
    htmltext = RAW_DIR / "html_text"
    
    id_html = htmltext / "id" / "pli"
    en_html = htmltext / "en" / "pli"
    
    all_giants = []
    if id_html.exists():
        all_giants.extend(analyze_html_dir(id_html, htmltext))
    if en_html.exists():
        all_giants.extend(analyze_html_dir(en_html, htmltext))
        
    print(f"Ditemukan {len(all_giants)} file dengan chunk > {THRESHOLD} karakter:\n")
    # Urutkan berdasarkan panjang karakter (descending)
    all_giants.sort(key=lambda x: x[1], reverse=True)
    
    for rel_id, length in all_giants:
        print(f"- {rel_id}: {length:,} karakter")
        
    print("\n[INFO] Simulasi selesai. Hasil perlu diinspeksi manual untuk menentukan rule pemotongan.")
    sys.stdout.close()
    
    # Cetak info ke console (karena stdout di-redirect)
    sys.__stdout__.write(f"Simulasi selesai! Laporan tersimpan di: {out_txt}\n")
    sys.__stdout__.write(f"Total chunk raksasa: {len(all_giants)} file.\n")

if __name__ == "__main__":
    main()
