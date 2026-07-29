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

> 🔒 **Akses**: seluruh repo Hugging Face proyek ini (`mydhamma-*`) berstatus **private** (`config.HF_PRIVATE = True`). Langkah ini hanya berhasil bila Anda login dengan token akun `renaldoaluska`; pengguna lain akan menerima galat 401/403. Untuk replikasi oleh pihak ketiga, repo terkait perlu diubah menjadi publik terlebih dahulu.

---

## 🌐 Menjalankan Aplikasi Web (`web-md` & `web-eval`)

### Opsi A: Jalankan Semua Service Sekaligus (Rekomendasi via Tmux)
Jalankan skrip manajemen 1-klik:
```bash
./start-dev.sh
```
Aplikasi web akan otomatis aktif di:
- 📱 **web-md** (Pencarian & Chatbot): `http://localhost:5002` (atau IP `http://<IP-SERVER>:5002`)
- 📊 **web-eval** (Antarmuka Evaluasi): `http://localhost:5001` (atau IP `http://<IP-SERVER>:5001`)

*Perintah utilitas:*
- Cek Status: `./start-dev.sh status`
- Matikan Service: `./start-dev.sh stop`
- Attach ke Terminal Tmux: `tmux attach -t mydhamma`

### Opsi B: Jalankan Web Secara Manual
- **web-md**: `python web-md/app.py` → `http://localhost:5002`
- **web-eval**: `python web-eval/eval_app.py` → `http://localhost:5001`

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
│           ├── 1-push-hf.py        # Upload model, embeddings, cache, & data GPL ke HF Hub
│           └── 2-pull-hf.py        # Download model, embeddings, cache, & data GPL dari HF Hub
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

Pembagiannya berdasarkan **batas 100 MB per file yang diberlakukan GitHub**: apa pun yang lolos batas itu disimpan di git, sisanya di HF Hub.

- **GitHub** (`mydhammathesis`): Seluruh kode sumber, skrip pipeline, konfigurasi, antarmuka web, laporan evaluasi teks/grafik, **dan artefak `src/output/`** — termasuk data antara GPL (`queries.jsonl`, `triples.jsonl`, `passages.jsonl`), anotasi pakar & LLM, serta seluruh plot metrik.
- **Hugging Face Hub** (`renaldoaluska`): Tiga hal yang terlalu besar untuk git —
  - 17 model biner AI (GPL & Model Soups), repo `mydhamma-gpl-*`;
  - *precomputed embeddings* & search cache, dataset `mydhamma-cache`;
  - **`train.jsonl` GPL (±400 MB/eksperimen)**, dataset `mydhamma-cache` subfolder `gpl-data/<eksperimen>/`.

`train.jsonl` sendiri adalah artefak turunan — dihasilkan `3-pseudo-label.py` dari `triples.jsonl` + `passages.jsonl` yang keduanya ada di git — jadi rantai reproduksinya tetap utuh meski file ini ditarik terpisah.

Sinkronisasi dua arah lewat `sync-hf/`, dengan flag yang sama di kedua skrip:

| flag | artefak |
|---|---|
| `--m` | model GPL |
| `--e` | embeddings |
| `--c` | search cache |
| `--d` | data GPL (`train.jsonl`) |
| `--a` | semua |

```bash
python src/code/sync-hf/1-push-hf.py            # DRY-RUN: lihat dulu apa yang akan naik
python src/code/sync-hf/1-push-hf.py --d        # upload train.jsonl saja
python src/code/sync-hf/2-pull-hf.py --d        # tarik train.jsonl ke lokasi aslinya
```

> ⚠️ `1-push-hf.py --a` mengunggah ulang **seluruh** folder embeddings (±28 GB) karena bagian itu belum punya logika lewati-jika-sudah-ada. Untuk update rutin, pakai flag spesifik (`--m` / `--c` / `--d`) yang sudah melewati file yang sudah ada di Hub.

---
*Dibuat untuk kelengkapan Tugas Akhir & Replikasi Eksperimen myDhamma.*
