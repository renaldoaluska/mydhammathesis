# 🪷 myDhamma — Pencarian Semantik & RAG Sutta SuttaCentral

Sistem Pencarian Semantik dan Assistant RAG (Retrieval-Augmented Generation) berbasis model *General Purpose Line (GPL)* & *Sentence-Transformers* untuk korpus Tipiṭaka / SuttaCentral (Bahasa Indonesia & Pali).

---

## 🚀 Panduan Cepat (Quick Start Setelah `git pull`)

Jika Anda baru saja me-clone atau me-`pull` repositori ini di perangkat baru (misal: PC Pribadi atau Server Baru), ikuti 3 langkah mudah berikut:

### 1️⃣ Tarik Update Kode dari GitHub
```bash
git pull origin main
```

### 2️⃣ Install Dependensi Python
*(Pastikan virtual environment sudah aktif)*
```bash
pip install -r requirements.txt
```

### 3️⃣ Tarik Model AI & Embeddings Cache dari Hugging Face Hub
Semua pembobotan model biner (*weights*) dan *cache embeddings* disimpan secara efisien di Hugging Face Hub (`renaldoaluska`). Cukup jalankan skrip sync berikut:

```bash
python src/code/sync-hf/2-pull-hf.py --a
```

> ℹ️ **Catatan**: Skrip ini bersifat *idempotent* (hanya mengunduh file yang belum ada di disk lokal, tidak mengunduh ulang file yang sudah ada).

---

## 🌐 Menjalankan Aplikasi Web (`web-md`)

### Opsi A: Jalankan Semua Service Sekaligus (Rekomendasi via Tmux)
Jalankan skrip manajemen 1-klik:
```bash
./start-dev.sh
```
Aplikasi web akan otomatis aktif di:
- 📱 **web-md**: `http://localhost:5002` (atau IP Server `http://<IP-SERVER>:5002`)

*Perintah utilitas:*
- Cek Status: `./start-dev.sh status`
- Matikan Service: `./start-dev.sh stop`
- Attach ke Terminal Tmux: `tmux attach -t mydhamma`

### Opsi B: Jalankan Web Secara Manual
```bash
python web-md/app.py
```
Akses di peramban (browser) melalui: `http://localhost:5002`

---

## 📂 Struktur Utama Repositori

```text
mydhamma/
├── src/
│   ├── config.py                   # Central truth path, HF username, & registry model
│   └── code/
│       ├── 1-get-data/             # Pipeline pengambil data korpus SuttaCentral
│       ├── 2-eksplor/              # Eksplorasi & analisis justifikasi chunking
│       ├── 3-praproses/            # Pembersihan & pembentukan chunk korpus
│       ├── 4-training/             # Training model GPL base (exp0)
│       ├── 5-eval/                 # Evaluasi intrinsik & ekstrinsik (nDCG, MAP, Spearman)
│       ├── 6-eval-llm/             # Evaluasi LLM penilai
│       ├── 7-retraining/           # Eksperimen retrain & model soups (exp1 - exp6)
│       ├── 8-reeval-llm/           # Re-evaluasi komprehensif LLM & konsensus
│       └── sync-hf/
│           ├── 1-push-hf.py        # Upload model & cache ke Hugging Face Hub
│           └── 2-pull-hf.py        # Download model & cache dari Hugging Face Hub
├── web-md/                         # Aplikasi Web Pencarian Semantik & Chatbot RAG
│   ├── app.py                      # Server Flask backend
│   ├── reader.py                   # Parser & viewer teks Sutta
│   └── static/ & templates/        # antarmuka UI/UX (Vanilla CSS & JS)
├── start-dev.sh                    # Skrip pengelola service tmux
├── cara_cek.txt                    # Panduan pengecekan evaluasi & web
└── requirements.txt                # Dependensi paket Python
```

---

## 🤝 Hubungan GitHub vs Hugging Face Hub

- **GitHub** (`mydhammathesis`): Menyimpan seluruh kode sumber, skrip pipeline, konfigurasi, antarmuka web, dan laporan evaluasi teks/grafik.
- **Hugging Face Hub** (`renaldoaluska`): Menyimpan 17 model biner AI (GPL & Model Soups) serta *precomputed embeddings* (`mydhamma-cache`).

---
*Dibuat untuk kelengkapan Tesis & Replikasi Eksperimen myDhamma.*
