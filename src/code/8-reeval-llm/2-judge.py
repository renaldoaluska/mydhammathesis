"""
2-judge.py — template prompt all-in-one untuk LLM-as-judge eksperimen via chat/ekstensi.

File ini BUKAN script yang dijalankan. Ini adalah template prompt tunggal yang bisa di-copy
lalu dikirim ke model LLM manapun (Claude, Gemini, dll) via chat ekstensi IDE.
Ganti <exp> dengan eksperimen yang dinilai (mis. exp1).

============ PROMPT UNTUK LLM ============

Tugasmu adalah menjadi evaluator LLM-as-a-judge untuk menilai pasase baru hasil retraining (eksperimen <exp>).
1. Baca file src/code/6-eval-llm/PROMPT_penilai.txt dan src/output/8-reeval-llm/DATA_pasase_<exp>.txt.
2. Ikuti instruksi di PROMPT_penilai.txt secara murni (menggunakan kemampuan nalar LLM) untuk menilai semua pasase di DATA_pasase_<exp>.txt.
3. Output HANYA berupa JSON {"ID": skor} tanpa penjelasan atau teks lain.
4. Simpan hasilnya ke file `grades_<exp>_<Nama_Model>.json` di folder src/output/8-reeval-llm/.
   (Gunakan format nama dengan underscore, contoh: grades_exp1_Gemini_3.1_Pro.json atau grades_exp1_Claude_Opus_4.8.json).
5. Setelah SEMUA judge tersimpan, jalankan orkestrasi (assemble semua judge + eval + signifikansi):
   `./run_eval.sh <exp>`   (di folder src/code/8-reeval-llm/) — ketik 'y' saat diminta.

   Atau assemble manual per-judge:
   `python 8-reeval-llm/3-assemble.py src/output/8-reeval-llm/grades_<exp>_<Nama_Model>.json "<Nama Model Asli>" --exp <exp>`

   Contoh: python 8-reeval-llm/3-assemble.py src/output/8-reeval-llm/grades_exp1_Gemini_3.1_Pro.json "Gemini 3.1 Pro" --exp exp1

==========================================
"""
