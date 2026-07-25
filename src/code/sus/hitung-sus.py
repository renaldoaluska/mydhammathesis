import os
import sys
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from wordcloud import WordCloud

def get_sus_adjective(score):
    """Get adjective rating based on Bangor, Kortum, and Miller (2009)."""
    if score >= 85.5: return "Excellent (Sangat Bagus)"
    if score >= 71.4: return "Good (Bagus)"
    if score >= 50.9: return "OK (Cukup)"
    return "Poor (Buruk)"

def get_sus_grade(score):
    if score >= 80.3: return "A"
    if score >= 68: return "B"
    if score >= 68: return "C"
    if score >= 51: return "D"
    return "F"

def get_sus_acceptability(score):
    if score >= 71.4: return "Acceptable (Dapat Diterima)"
    if score >= 50.9: return "Marginal (Ambang Batas)"
    return "Not Acceptable (Tidak Dapat Diterima)"

def main():
    # Direktori saat ini (src/code/sus)
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Direktori output (src/output/sus)
    out_dir = os.path.join(current_dir, '..', '..', 'output', 'sus')
    os.makedirs(out_dir, exist_ok=True)
    
    # File data dibaca dari direktori saat ini
    filename = os.path.join(current_dir, "sus.csv")
    
    if not os.path.exists(filename):
        print(f"Error: File '{filename}' tidak ditemukan.")
        return

    print("Membaca data dari", filename)
    df = pd.read_csv(filename)
    
    # Filter hanya responden yang valid (minimal menjawab 10 pertanyaan SUS)
    # Asumsi: Pertanyaan SUS ada di kolom ke-4 hingga ke-13 (index 3:13)
    if len(df.columns) < 13:
        print("Error: Format CSV tidak sesuai. Pastikan ada 13 kolom (3 Profil + 10 SUS).")
        return

    # ---------------------------------------------------------
    # 0. BUAT GRAFIK DEMOGRAFI PENGGUNA (Perangkat, Tema, Bahasa)
    # ---------------------------------------------------------
    demo_cols = df.columns[0:3]
    demo_names = ['perangkat', 'tema', 'bahasa']
    
    for i, col in enumerate(demo_cols):
        plt.figure(figsize=(6, 6))
        counts = df[col].value_counts()
        # Gabungkan nama kategori dan persentase
        pie_labels = [f'{idx}\n{val:.1f}%' for idx, val in zip(counts.index, counts/counts.sum()*100)]
        
        plt.pie(counts, labels=pie_labels, labeldistance=0.4, startangle=90, colors=sns.color_palette("pastel"), textprops={'fontsize': 14, 'weight': 'bold', 'ha': 'center', 'color': '#333333'})
        plt.title(f'Demografi Berdasarkan {demo_names[i].capitalize()}', fontsize=16)
        plt.tight_layout()
        demo_path = os.path.join(out_dir, f'grafik_demografi_{demo_names[i]}.png')
        plt.savefig(demo_path, bbox_inches='tight', pad_inches=0.1)
        plt.close()
        print(f"Grafik demografi disimpan: {demo_path}")

    # ---------------------------------------------------------
    # 1. HITUNG SKOR SUS
    # ---------------------------------------------------------
    sus_cols = df.columns[3:13]
    
    # Pastikan data berupa numerik
    for col in sus_cols:
        df[col] = pd.to_numeric(df[col], errors='coerce')
        
    df = df.dropna(subset=sus_cols).copy()
    
    print(f"Total responden yang valid: {len(df)}")
    
    # Perhitungan SUS:
    # Pertanyaan Ganjil (Odd): Skor - 1
    # Pertanyaan Genap (Even): 5 - Skor
    
    odd_cols = sus_cols[0::2]   # Q1, Q3, Q5, Q7, Q9
    even_cols = sus_cols[1::2]  # Q2, Q4, Q6, Q8, Q10
    
    df_odd = df[odd_cols] - 1
    df_even = 5 - df[even_cols]
    
    # Gabungkan kembali dan kalikan 2.5
    df['SUS_Score'] = (df_odd.sum(axis=1) + df_even.sum(axis=1)) * 2.5
    
    avg_score = df['SUS_Score'].mean()
    min_score = df['SUS_Score'].min()
    max_score = df['SUS_Score'].max()
    median_score = df['SUS_Score'].median()
    
    print(f"\nRata-rata Skor SUS: {avg_score:.2f}")
    
    # ---------------------------------------------------------
    # 1. BUAT GRAFIK DISTRIBUSI SKOR SUS
    # ---------------------------------------------------------
    plt.figure(figsize=(8, 5))
    ax = sns.histplot(df['SUS_Score'], bins=10, kde=True, color='skyblue')
    
    # Tambahkan angka di atas tiap bar
    for p in ax.patches:
        height = p.get_height()
        if height > 0:
            ax.annotate(f'{int(height)}', 
                        (p.get_x() + p.get_width() / 2., height), 
                        ha='center', va='bottom', fontsize=10, color='black', xytext=(0, 2), textcoords='offset points')
                        
    plt.axvline(avg_score, color='red', linestyle='dashed', linewidth=2, label=f'Rata-rata: {avg_score:.2f}')
    plt.axvline(68, color='green', linestyle='dashed', linewidth=2, label='Standar Kelayakan (68)')
    plt.title('Distribusi Keseluruhan Skor SUS')
    plt.xlabel('Skor SUS')
    plt.ylabel('Jumlah Responden')
    plt.legend()
    plt.tight_layout()
    dist_path = os.path.join(out_dir, 'grafik_distribusi_sus.png')
    plt.savefig(dist_path)
    plt.close()
    print(f"Grafik distribusi disimpan sebagai '{dist_path}'")

    # ---------------------------------------------------------
    # 1B. BUAT GRAFIK RATA-RATA PER PERTANYAAN (STANDAR RISET SUS)
    # ---------------------------------------------------------
    # Untuk SUS, skor tiap item dikonversi ke skala 0-4 di mana 4 selalu berarti paling positif/baik.
    # df_odd dan df_even sudah dalam skala 0-4.
    df_item_scores = pd.concat([df_odd, df_even], axis=1)
    df_item_scores = df_item_scores[sus_cols] # Urutkan kembali Q1-Q10
    
    item_means = df_item_scores.mean()
    # Ubah label index menjadi Q1-Q10 agar tidak terlalu panjang di grafik
    item_means.index = [f"Q{i}" for i in range(1, 11)]
    
    plt.figure(figsize=(10, 6))
    ax2 = sns.barplot(x=item_means.index, y=item_means.values, hue=item_means.index, palette="viridis", legend=False)
    plt.title('Rata-rata Skor per Pertanyaan (Skala 0 - 4)')
    plt.xlabel('Pertanyaan (Q1 - Q10)')
    plt.ylabel('Rata-rata Skor (Makin tinggi makin baik)')
    plt.ylim(0, 4.5)
    plt.xticks(rotation=45, ha='right')
    
    # Tambahkan angka di atas bar
    for p in ax2.patches:
        ax2.annotate(f'{p.get_height():.2f}', 
                     (p.get_x() + p.get_width() / 2., p.get_height()), 
                     ha='center', va='bottom', fontsize=10, color='black', xytext=(0, 3), textcoords='offset points')
                     
    plt.tight_layout()
    item_path = os.path.join(out_dir, 'grafik_rata_per_item.png')
    plt.savefig(item_path)
    plt.close()
    print(f"Grafik rata-rata per item disimpan sebagai '{item_path}'")
    
    # ---------------------------------------------------------
    # 2. BUAT REKAP KELUHAN / SARAN (rekap_keluhan.md)
    # ---------------------------------------------------------
    if len(df.columns) > 13:
        text_cols = [col for col in df.columns[13:] if col != 'SUS_Score']
        rekap_path = os.path.join(out_dir, 'rekap_keluhan.md')
        
        with open(rekap_path, 'w', encoding='utf-8') as f:
            f.write("# Rekapitulasi Masukan dan Keluhan Pengguna\n\n")
            
            ada_masukan = False
            for col in text_cols:
                feedbacks = df[col].dropna().astype(str).tolist()
                valid_feedbacks = [text.strip() for text in feedbacks if text.strip() and text.strip().lower() not in ['-', 'tidak ada', 'kosong', 'none']]
                
                if valid_feedbacks:
                    ada_masukan = True
                    f.write(f"## {col}\n\n")
                    for i, text in enumerate(valid_feedbacks, 1):
                        f.write(f"{i}. {text}\n")
                    f.write("\n")
            
            if not ada_masukan:
                f.write("*Tidak ada masukan/saran spesifik dari responden.*\n")
                
        print(f"Rekap keluhan disimpan sebagai '{rekap_path}'")

        # BUAT WORDCLOUD JIKA ADA MASUKAN
        all_text = ""
        for col in text_cols:
            texts = df[col].dropna().astype(str).tolist()
            all_text += " ".join(texts) + " "
            
        if all_text.strip():
            indo_stopwords = set([
                "dan", "untuk", "ini", "itu", "yang", "di", "ke", "dari", "dengan", "saya", 
                "ada", "bisa", "lebih", "udah", "sudah", "sih", "juga", "atau", "agak", 
                "sangat", "banget", "aja", "saja", "tapi", "kalau", "karena", "klo", "yg", 
                "dgn", "utk", "nya", "dalam", "pada", "hal", "tidak", "gak", "nggak", "ga", 
                "buat", "biar", "dong", "deh", "lah", "sana", "sini", "begitu", "begini", 
                "terus", "lalu", "jadi", "akan", "telah", "belum", "sih", "ya", "satu", "sama",
                "seperti", "sedikit", "semua", "banyak", "beberapa", "lagi", "terus", "nah"
            ])
            wordcloud = WordCloud(width=800, height=400, background_color='white', stopwords=indo_stopwords, max_words=100).generate(all_text)
            plt.figure(figsize=(10, 5))
            plt.imshow(wordcloud, interpolation='bilinear')
            plt.axis("off")
            plt.title('Word Cloud dari Masukan/Saran')
            plt.tight_layout()
            wordcloud_path = os.path.join(out_dir, 'wordcloud_saran.png')
            plt.savefig(wordcloud_path)
            plt.close()
            print(f"Wordcloud disimpan sebagai '{wordcloud_path}'")

    # ---------------------------------------------------------
    # 3. BUAT KESIMPULAN (kesimpulan.txt)
    # ---------------------------------------------------------
    adjective = get_sus_adjective(avg_score)
    grade = get_sus_grade(avg_score)
    acceptability = get_sus_acceptability(avg_score)
    
    # Apakah sistem sudah bagus?
    if avg_score >= 68:
        hasil_sistem = "Sistem sudah dinilai BAGUS dan LAYAK DIGUNAKAN. Skor berada di atas standar industri (68)."
    else:
        hasil_sistem = "Sistem masih PERLU BANYAK PERBAIKAN. Skor berada di bawah standar kelayakan industri (68)."

    kesimpulan = f"""HASIL EVALUASI SYSTEM USABILITY SCALE (SUS)
==============================================
Total Responden  : {len(df)}
Skor Terendah    : {min_score}
Skor Tertinggi   : {max_score}
Median Skor      : {median_score}
RATA-RATA SKOR   : {avg_score:.2f}

ANALISIS SKOR:
- Grade (A-F)    : {grade}
- Adjective      : {adjective}
- Acceptability  : {acceptability}

KESIMPULAN AKHIR:
{hasil_sistem}

Interpretasi:
- Berdasarkan skor rata-rata {avg_score:.2f}, antarmuka purwarupa myDhamma dikategorikan sebagai '{acceptability}' dengan tingkat kebergunaan '{adjective}'.
- Skor di atas 68 menunjukkan bahwa secara umum pengguna dapat menggunakan sistem ini tanpa masalah yang berarti.
- Masukan kualitatif dan keluhan responden telah direkap secara terpisah pada file `rekap_keluhan.md` untuk dianalisis lebih dalam.
- Kata kunci utama dari masukan/saran divisualisasikan pada gambar wordcloud.

RINGKASAN KUALITATIF (TEMA MASUKAN PENGGUNA):
Berdasarkan analisis teks dari saran/masukan pengguna, didapatkan pola sebagai berikut:

1. Kekuatan Sistem:
   - Navigasi dirasa sudah bagus dan lancar.
   - Fitur pencarian AI sangat membantu memahami konteks Sutta lebih dalam.

2. Kritik & Masalah UI/UX:
   - Visual: Halaman beranda dirasa terlalu hambar. Kombinasi warna perlu diperbaiki (contoh: teks hitam di latar abu-abu sukar dibaca, hindari warna terlalu mencolok/ungu, dan font kurang besar).
   - Discoverability: Fitur tersembunyi (seperti Mode Gelap) tidak langsung disadari, disarankan ada "guide" singkat di awal.
   - Navigasi: Memerlukan terlalu banyak klik untuk mengakses menu tertentu.

3. Permintaan Fitur (Feature Requests):
   - Integrasi Kamus Pali & terjemahan kata-demi-kata.
   - Penambahan kitab komentar (Atthakatha & Tika).
   - Fitur pembacaan paralel (teks Pali dan Indonesia bersebelahan).
   - Akses komunikasi/tanya-jawab dengan Bhikkhu Sangha.
   - Peningkatan kecepatan respons model AI.
"""
    
    kesimpulan_path = os.path.join(out_dir, 'kesimpulan.txt')
    with open(kesimpulan_path, 'w', encoding='utf-8') as f:
        f.write(kesimpulan)
    print(f"Kesimpulan berhasil disimpan ke '{kesimpulan_path}'")
    
if __name__ == "__main__":
    main()
