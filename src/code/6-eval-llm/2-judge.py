"""
2-judge.py — prompt all-in-one untuk LLM-as-judge via ekstensi IDE.

File ini BUKAN script yang dijalankan. Ini adalah template prompt tunggal yang bisa di-copy
lalu dikirim ke model LLM manapun (Claude, Gemini, dll) via chat ekstensi IDE.

============ PROMPT UNTUK LLM ============

Tugasmu adalah menjadi evaluator LLM-as-a-judge.
1. Baca file PROMPT_penilai.txt di src/code/6-eval-llm/ dan DATA_pasase.txt di src/output/6-eval-llm/.
2. Ikuti instruksi di PROMPT_penilai.txt secara murni (menggunakan kemampuan nalar LLM) untuk menilai semua pasase di DATA_pasase.txt.
3. Output HANYA berupa JSON {"ID": skor} tanpa penjelasan atau teks lain.
4. Simpan hasilnya ke file `grades_<Nama_Model>.json` di folder src/output/6-eval-llm/.
   (Gunakan format nama dengan underscore, contoh: grades_Claude_Opus_4.8.json atau grades_Gemini_3.1_Pro.json).
5. Setelah file tersimpan, jalankan assembler untuk merakit hasilnya:
   `python 3-assemble_anotasi.py grades_<Nama_Model>.json "<Nama Model Asli>"`

   Contoh eksekusi:
   python 3-assemble_anotasi.py grades_Claude_Opus_4.8.json "Claude Opus 4.8"
   python 3-assemble_anotasi.py grades_Gemini_3.1_Pro.json "Gemini 3.1 Pro"

==========================================
"""
