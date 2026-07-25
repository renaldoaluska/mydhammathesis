/* ============================================================
   Dhammakathika — Expert Evaluation Page (eval.js)
   Steps are per (query × corpus); passages from all models
   are pooled and deduplicated — one grade per unique passage.
   Shared rendering from DK (eval_common.js).
   ============================================================ */

(function () {
  "use strict";

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  SAKLAR KUNCI EVALUASI  —  cukup ganti true/false di baris ini saja. ║
  // ║    true  = tombol "Mulai Asesmen" TERKUNCI + info "SUDAH BERAKHIR".  ║
  // ║    false = evaluasi jalan normal (buka kembali).                     ║
  // ║  UI tetap utuh; yg dikunci hanya aksi mulai/lanjut menilai.          ║
  // ╚══════════════════════════════════════════════════════════════════════╝
  const EVAL_LOCKED = true;
  const EVAL_LOCKED_MSG = "SUDAH BERAKHIR PER 24 JUNI 2026";

  // Crossing logic: model lang_mode -> valid corpora untuk asesmen pakar.
  // PLI dikecualikan dari asesmen pakar — dinilai via evaluasi intrinsik saja.
  const CORPUS_MAP = {
    multi: ["id", "en"],
    en: ["en"],
    indo: ["id"],
  };

  // ========== i18n ==========
  const i18n = {
    id: {
      subtitle: "Asesmen Pakar",
      intro_title: '<i data-lucide="clipboard-list"></i> Selamat Datang',
      intro_desc: "Selamat datang di form asesmen relevansi hasil pencarian semantik. Anda akan menilai kualitas hasil pencarian untuk setiap kueri.",
      section_definitions: "Definisi Istilah",
      def_corpus_term: "Korpus",
      def_corpus_desc_html: "<strong>ID</strong> = teks Indonesia, <strong>EN</strong> = teks Inggris.",
      def_query_term: "Kueri",
      def_query_desc_html: "Pertanyaan atau topik pencarian yang diuji pada sistem pencarian semantik (berbasis makna), sebagai <i>input</i> untuk model.",
      def_passage_term: "Pasase",
      def_passage_desc_html: "Bagian atau pasal yang dikutip dari sebuah korpus. Istilah ini merupakan terjemahan dari <i>passage</i>.",
      passage_example_caption: "Contoh tampilan sebuah pasase:",
      tip_appearance: "Tip: Anda dapat mengaktifkan <strong>mode gelap</strong> dan menyesuaikan <strong>ukuran teks</strong> (A−/A+) melalui tombol di pojok kanan atas, sesuai kenyamanan Anda.",
      // def_extra_term: "Informasi Ekstra",
      // def_extra_desc: "Informasi lain di dalam pasase yang tidak berkaitan dengan kueri, sehingga jawaban yang ada menjadi terselip atau sulit ditemukan.",
      section_criteria: "Kriteria Penilaian",
      grade_0_title: "Tidak Relevan",
      grade_0_desc: "Pasase tidak memiliki hubungan apa pun dengan kueri.",
      grade_1_title: "Terkait",
      grade_1_desc: "Pasase tampak terkait dengan kueri, tetapi tidak menjawab kueri.",
      grade_2_title: "Sangat Relevan",
      grade_2_desc: "Pasase memuat jawaban untuk kueri, tetapi jawabannya mungkin sedikit kurang jelas, atau tersembunyi di antara informasi yang tidak relevan.",
      grade_3_title: "Relevan Sempurna",
      grade_3_desc: "Pasase berfokus khusus pada kueri dan memuat jawaban yang tepat.",
      criteria_honest_note: "Mohon memberikan penilaian <strong>apa adanya</strong> sesuai kriteria di atas. Apabila suatu pasase memang tidak relevan, nilailah demikian <strong>tanpa rasa sungkan</strong>. Penilaian ini digunakan sebagai acuan kebenaran (<em>ground truth</em>) untuk mengevaluasi sistem, sehingga objektivitas penilaian sangat menentukan kualitas hasil.",
      section_start: "Mulai Asesmen",
      lbl_expert: "Nama Pakar",
      select_expert: "— Pilih nama pakar —",
      btn_start: '<i data-lucide="play"></i> Mulai Asesmen',
      btn_resume: '<i data-lucide="play"></i> Lanjutkan Asesmen',
      btn_next: 'Selanjutnya <i data-lucide="chevron-right"></i>',
      btn_next_full: "Selanjutnya",
      btn_next_short: "Lanjut",
      btn_prev: '<i data-lucide="chevron-left"></i> Sebelumnya',
      btn_prev_full: "Sebelumnya",
      btn_prev_short: "Sebelum",
      btn_exit_form: "Keluar dari Form",
      btn_submit: '<i data-lucide="circle-check"></i> Selesai & Simpan',
      loading: "Menjalankan pencarian…",
      lbl_grade: "Nilai",
      no_results_eval: "Tidak ada hasil ditemukan.",
      done_title: "Asesmen Selesai!",
      done_body: "Terima kasih atas partisipasi Anda. Data penilaian telah tersimpan.",
      done_lbl_expert: "Pakar",
      done_lbl_type: "Tipe",
      done_lbl_steps: "langkah",
      no_queries: "Belum ada kueri. Isi queries_pakar.json terlebih dahulu.",
      no_models: "Belum ada model tersedia untuk tipe evaluasi ini.",
      alert_expert: "Pilih nama pakar terlebih dahulu.",
      alert_corpus: "Pilih korpus terlebih dahulu.",
      alert_grade: "Harap beri nilai untuk semua hasil sebelum melanjutkan.",
      step_query: "Kueri",
      step_corpus: "Korpus",
      step_of: "dari",
      attention_query: "Kueri saat ini:",
      sidebar_query: '<i data-lucide="search"></i> Kueri',
      sidebar_criteria: '<i data-lucide="clipboard-list"></i> Kriteria Penilaian',
      lbl_corpus_select: "Korpus",
      add_expert_option: "＋ Tambah Pengisi Baru…",
      add_expert_prompt: "Masukkan nama pakar:",
      add_expert_error: "Gagal menyimpan nama pakar.",
      corpus_done_id: "✓ ID",
      corpus_done_en: "✓ EN",
      notice_autosave: 'Setiap penilaian yang Anda berikan <strong>kini langsung tersimpan otomatis</strong> — tidak perlu menekan tombol Lanjut untuk menyimpan. Perhatikan indikator <em style="color: #16a34a;">✓ Tersimpan</em> yang muncul setelah setiap perubahan. <br><br>Jika ada masalah, mohon hubungi via WhatsApp <a href="https://wa.me/6285814566133" target="_blank" rel="noopener">+6285814566133</a> (Alfa Renaldo Aluska). Mohon maaf apabila ada ketidaknyamanan. <em>Vandāmi.</em>',
      disclaimer_title: "Penafian",
      disclaimer_body: 'Dengan melanjutkan, saya bersedia data yang dimasukkan digunakan untuk kepentingan riset di Institut Teknologi Sepuluh Nopember (ITS) Surabaya dalam rangka Tugas Akhir (skripsi) serta pelatihan model AI lebih lanjut. Data yang dikumpulkan dilisensikan di bawah <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener">Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)</a> dan digunakan semata-mata untuk tujuan akademis dan nonkomersial.',
    },
    en: {
      subtitle: "Expert Assessment",
      intro_title: '<i data-lucide="clipboard-list"></i> Welcome',
      intro_desc: "Welcome to the semantic search relevance evaluation form. You will rate the quality of search results for each query.",
      section_definitions: "Term Definitions",
      def_corpus_term: "Corpus",
      def_corpus_desc_html: "<strong>ID</strong> = Indonesian text, <strong>EN</strong> = English text.",
      def_query_term: "Query",
      def_query_desc_html: "A question or search topic tested on the semantic search system, as <i>input</i> to the model.",
      def_passage_term: "Passage",
      def_passage_desc_html: "A section or paragraph quoted from a corpus.",
      passage_example_caption: "Example of how a passage looks:",
      tip_appearance: "Tip: You can switch to <strong>dark mode</strong> and adjust the <strong>text size</strong> (A−/A+) using the controls at the top-right, for your comfort.",
      // def_extra_term: "Extra Information",
      // def_extra_desc: "Other content within the passage that is unrelated to the query, causing the answer to be buried or hard to find.",
      section_criteria: "Grading Criteria",
      grade_0_title: "Not Relevant",
      grade_0_desc: "The passage has nothing to do with the query.",
      grade_1_title: "Related",
      grade_1_desc: "The passage seems related to the query but does not answer it.",
      grade_2_title: "Highly Relevant",
      grade_2_desc: "The passage has some answer for the query, but the answer may be a bit unclear, or hidden amongst extraneous information.",
      grade_3_title: "Perfectly Relevant",
      grade_3_desc: "The passage is dedicated to the query and contains the exact answer.",
      criteria_honest_note: "Please grade <strong>as-is</strong> according to the criteria above. If a passage is genuinely irrelevant, rate it as such <strong>without hesitation</strong>. These judgments serve as the ground truth for evaluating the system, so objective grading directly determines the quality of the results.",
      section_start: "Start Evaluation",
      lbl_expert: "Expert Name",
      select_expert: "— Select expert —",
      btn_start: '<i data-lucide="play"></i> Start Evaluation',
      btn_resume: '<i data-lucide="play"></i> Resume Evaluation',
      btn_next: 'Next <i data-lucide="chevron-right"></i>',
      btn_next_full: "Next",
      btn_next_short: "Next",
      btn_prev: '<i data-lucide="chevron-left"></i> Previous',
      btn_prev_full: "Previous",
      btn_prev_short: "Prev",
      btn_exit_form: "Exit Form",
      btn_submit: '<i data-lucide="circle-check"></i> Finish & Save',
      loading: "Running search…",
      lbl_grade: "Grade",
      no_results_eval: "No results found.",
      done_title: "Evaluation Complete!",
      done_body: "Thank you for your participation. Grades have been saved.",
      done_lbl_expert: "Expert",
      done_lbl_type: "Type",
      done_lbl_steps: "steps",
      no_queries: "No queries found. Please fill queries_pakar.json first.",
      no_models: "No models available for this evaluation type.",
      alert_expert: "Please select an expert name first.",
      alert_corpus: "Please select a corpus first.",
      alert_grade: "Please grade all results before continuing.",
      step_query: "Query",
      step_corpus: "Corpus",
      step_of: "of",
      attention_query: "Current query:",
      sidebar_query: '<i data-lucide="search"></i> Query',
      sidebar_criteria: '<i data-lucide="clipboard-list"></i> Grading Criteria',
      lbl_corpus_select: "Corpus",
      add_expert_option: "＋ Add New Expert…",
      add_expert_prompt: "Enter expert name:",
      add_expert_error: "Failed to save expert name.",
      corpus_done_id: "✓ ID",
      corpus_done_en: "✓ EN",
      notice_autosave: 'Every grade you give is <strong>now saved automatically</strong> — no need to press the Next button to save. Look for the <em style="color: #16a34a;">✓ Saved</em> indicator that appears after each change. <br><br>If you encounter any issues, please contact via WhatsApp <a href="https://wa.me/6285814566133" target="_blank" rel="noopener">+6285814566133</a> (Alfa Renaldo Aluska). We apologize for any inconvenience. <em>Vandāmi.</em>',
      disclaimer_title: "Disclaimer",
      disclaimer_body: 'By proceeding, I consent to the data entered being used for research purposes at Institut Teknologi Sepuluh Nopember (ITS) Surabaya as part of a Final Project (undergraduate thesis) and for further AI model training. All collected data is licensed under <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener">Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)</a> and used solely for academic and non-commercial purposes.',
    },
  };

  // ========== State ==========
  const state = {
    lang: "id",
    expert: "",
    selectedCorpus: "",
    queries: [],
    models: [],
    modelLangs: {},
    steps: [],            // [{db, query}] — unique (corpus × query) pairs
    expertStatus: {},     // {name: {id: n, en: n}}
    expertCorpora: {},    // {name: ["id","en"]} — korpus yang di-assign ke pakar
    topK: 10,             // HARUS = TOP_K precompute (1-build-cache.py) & EVAL_TOP_K (eval_app.py)
    includeTitles: false,
    phase: "intro",
    stepIndex: 0,
    totalSteps: 0,
    currentResults: null, // [{sutta, frag, sources: [{model, rank, score}]}]
    shuffleMap: null,
    grades: {},
    completed: new Set(),
    adminMode: false,
    isReviewMode: false,
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  function t(key) {
    return (i18n[state.lang] || i18n.id)[key] || (DK.t ? DK.t(key) : key);
  }

  // ========== Step helpers ==========
  function getStep(idx) {
    return state.steps[idx];
  }
  function stepKey(idx) {
    const s = state.steps[idx];
    return `${s.query.id}_${s.db}`;
  }

  // Kunci pasase = ref + author (ref saja tidak unik lintas penerjemah). Dipakai
  // utk dedup, restore grade, & cocokin dgn grade tersimpan di server.
  function passageKey(ref, author) {
    return `${ref}␟${author || ""}`;
  }

  // ========== Language ==========
  function initLang() {
    state.lang = localStorage.getItem("dk-lang") || "id";
    const pill = $("#btn-lang-toggle");
    if (pill) {
      pill.addEventListener("click", () => {
        state.lang = state.lang === "id" ? "en" : "id";
        localStorage.setItem("dk-lang", state.lang);
        applyLang();
      });
    }
    applyLang();
  }
  function applyLang() {
    const pill = $("#btn-lang-toggle");
    if (pill) {
      pill.setAttribute("data-active", state.lang);
      pill.querySelectorAll(".lang-pill-opt").forEach((o) =>
        o.classList.toggle("active", o.dataset.lang === state.lang)
      );
    }
    document.documentElement.lang = state.lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const v = t(el.getAttribute("data-i18n"));
      if (v !== el.getAttribute("data-i18n")) el.textContent = v;
    });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const v = t(el.getAttribute("data-i18n-html"));
      if (v !== el.getAttribute("data-i18n-html")) el.innerHTML = v;
    });
    if (state.totalSteps > 0) {
      const startBtn = $("#btn-eval-start");
      if (startBtn) startBtn.innerHTML = t("btn_start");
      updateStartInfo();
    }
    if (state.phase === "grading") updateNavButtons();
    refreshIcons();
  }



  // ========== Shuffle ==========
  // Seeded PRNG (mulberry32) for deterministic shuffle per expert+step
  function seededRng(seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
    }
    return function () {
      h |= 0; h = h + 0x6D2B79F5 | 0;
      let t = Math.imul(h ^ h >>> 15, 1 | h);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffleArray(arr, seed) {
    const rng = seed ? seededRng(seed) : Math.random;
    const shuffled = arr.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // ========== Data loading ==========
  async function loadData() {
    try {
      const [experts, queries, modelsData, modelLangs, expertStatus] = await Promise.all([
        fetch(`/api/eval/${window.EVAL_TYPE}/experts`).then((r) => r.json()),
        fetch(`/api/eval/${window.EVAL_TYPE}/queries`).then((r) => r.json()),
        fetch(`/api/eval/${window.EVAL_TYPE}/models`).then((r) => r.json()),
        fetch("/api/model-langs").then((r) => r.json()),
        fetch(`/api/eval/${window.EVAL_TYPE}/expert_status`).then((r) => r.json()).catch(() => ({})),
      ]);

      // Populate expert dropdown
      const sel = $("#eval-expert-select");
      if (sel && Array.isArray(experts)) {
        experts.forEach((exp) => {
          // /experts kini balikin objek {name, corpora}; toleran string lama.
          const name = typeof exp === "string" ? exp : exp.name;
          const corpora = (typeof exp === "object" && Array.isArray(exp.corpora)) ? exp.corpora : ["id", "en"];
          state.expertCorpora[name] = corpora;
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          sel.appendChild(opt);
        });
      }

      state.queries = (Array.isArray(queries) ? queries : []).filter((q) => q.query && q.query.trim());
      state.models = modelsData.models || [];
      state.modelLangs = modelLangs || {};

      // Compute all available corpora (excl. PLI) from model registry
      const corporaSet = new Set();
      state.models.forEach((model) => {
        const lm = state.modelLangs[model] || "multi";
        (CORPUS_MAP[lm] || ["id"]).forEach((db) => corporaSet.add(db));
      });
      state._allCorpora = corporaSet;

      state.expertStatus = typeof expertStatus === "object" ? expertStatus : {};

      // Mark done per-corpus in expert dropdown
      if (sel && state.queries.length > 0) {
        sel.querySelectorAll("option[value]").forEach((opt) => {
          const st = state.expertStatus[opt.value];
          if (!st) return;
          const badges = [];
          if (st.id >= state.queries.length) badges.push(t("corpus_done_id"));
          if (st.en >= state.queries.length) badges.push(t("corpus_done_en"));
          if (badges.length) {
            opt.textContent = `${opt.value}  ${badges.join(" ")}`;
            if (badges.length >= corporaSet.size) {
              opt.disabled = true;
              opt.dataset.done = "1";
            }
          }
        });
      }

      rebuildSteps();

      // Restore last selected expert & corpus from localStorage
      const savedExpert = localStorage.getItem("dk-eval-expert");
      const savedCorpus = localStorage.getItem("dk-eval-corpus");
      if (savedExpert && sel) {
        const opt = sel.querySelector(`option[value="${CSS.escape(savedExpert)}"]`);
        if (opt && !opt.disabled) {
          sel.value = savedExpert;
          state.expert = savedExpert;
          syncCorpusDropdown(state.expert);  // bisa auto-pilih korpus tunggal
          if (savedCorpus && !state.selectedCorpus) {
            const corpusSel = $("#eval-corpus-select");
            if (corpusSel) {
              const cOpt = corpusSel.querySelector(`option[value="${CSS.escape(savedCorpus)}"]`);
              if (cOpt && !cOpt.disabled && !cOpt.hidden) {
                corpusSel.value = savedCorpus;
                state.selectedCorpus = savedCorpus;
              }
            }
          }
          rebuildSteps();
        }
      }

      if (!state.queries.length) showIntroWarning(t("no_queries"));
      if (!state.models.length) showIntroWarning(t("no_models"));

      updateStartInfo();

      // Auto-resume: kalau expert + corpus sudah tersimpan DAN punya progress,
      // langsung masuk grading tanpa perlu klik "Mulai Asesmen" lagi.
      if (state.expert && state.selectedCorpus && state.steps.length) {
        const st = state.expertStatus[state.expert] || {};
        const hasProgress = (st[state.selectedCorpus] || 0) > 0;
        if (hasProgress) {
          startEval();
          return;
        }
      }
    } catch (e) {
      console.error("Failed to load eval data:", e);
    }
  }

  // ========== Sync corpus dropdown based on selected expert ==========
  function syncCorpusDropdown(expertName) {
    const corpusSel = $("#eval-corpus-select");
    if (!corpusSel) return;
    corpusSel.disabled = false;
    const st = state.expertStatus[expertName] || {};
    const nQ = state.queries.length;
    const allowed = state.expertCorpora[expertName] || ["id", "en"];
    const group = corpusSel.closest(".control-group");

    let visibleCount = 0, lastVisible = "";
    corpusSel.querySelectorAll("option[value]:not([value=''])").forEach((opt) => {
      const db = opt.value;
      const inScope = allowed.includes(db);
      opt.hidden = !inScope;  // korpus yang tak di-assign ke pakar disembunyikan
      const done = nQ > 0 && (st[db] || 0) >= nQ;
      opt.disabled = !inScope || done;
      // Restore/preserve original label (strip trailing ✓ first)
      const base = (opt.dataset.origLabel = opt.dataset.origLabel || opt.textContent.replace(/\s*✓$/, "").trim());
      opt.textContent = done ? `${base} ✓` : base;
      if (inScope) { visibleCount++; lastVisible = db; }
    });

    if (visibleCount === 1) {
      // Cuma 1 korpus di-assign -> auto-pilih & sembunyikan dropdown.
      corpusSel.value = lastVisible;
      state.selectedCorpus = lastVisible;
      localStorage.setItem("dk-eval-corpus", lastVisible);
      if (group) group.style.display = "none";
    } else {
      // Reset ke placeholder supaya pakar memilih eksplisit.
      if (group) group.style.display = "";
      corpusSel.value = "";
      state.selectedCorpus = "";
    }
  }

  // ========== Steps filtered by selected corpus ==========
  function rebuildSteps() {
    if (!state.selectedCorpus) {
      state.steps = [];
      state.totalSteps = 0;
      return;
    }
    state.steps = state.queries.map((query) => ({ db: state.selectedCorpus, query }));
    state.totalSteps = state.steps.length;
  }

  function updateStartInfo() {
    const info = $("#eval-start-info");
    const startBtn = $("#btn-eval-start");
    if (EVAL_LOCKED) {
      if (startBtn) {
        startBtn.disabled = true;
        startBtn.classList.add("btn-locked");
        startBtn.innerHTML = '<i data-lucide="lock"></i> Mulai Asesmen';
        refreshIcons();
      }
      if (info) info.textContent = EVAL_LOCKED_MSG;
      return;
    }
    if (!info) return;
    if (state.totalSteps > 0 && state.selectedCorpus) {
      const corpusLabel = state.selectedCorpus.toUpperCase();
      info.textContent = `${state.totalSteps} ${t("done_lbl_steps")}: ${t("step_corpus")} ${corpusLabel} × ${state.queries.length} ${t("step_query").toLowerCase()}`;

      // Check if expert has existing progress for this corpus
      const hasProgress = state.expert && state.expertStatus[state.expert] &&
        (state.expertStatus[state.expert][state.selectedCorpus] || 0) > 0;
      if (startBtn) {
        startBtn.innerHTML = hasProgress ? t("btn_resume") : t("btn_start");
        refreshIcons();
      }
    } else {
      info.textContent = "";
      if (startBtn) { startBtn.innerHTML = t("btn_start"); refreshIcons(); }
    }
  }

  function showIntroWarning(msg) {
    const el = document.createElement("div");
    el.className = "eval-warning";
    el.textContent = msg;
    const section = $("#eval-intro .eval-intro-card");
    if (section) section.appendChild(el);
  }

  // Kalau pakar belum dipilih: bawa fokus ke dropdown pakar — scroll ke sana,
  // sorot (flash), fokuskan, dan (kalau didukung) langsung buka pilihannya.
  function focusExpertPicker() {
    const sel = $("#eval-expert-select");
    if (!sel) return;
    (sel.closest(".control-group") || sel).scrollIntoView({ behavior: "smooth", block: "center" });
    sel.classList.remove("eval-query-flash");
    void sel.offsetWidth; // paksa reflow biar animasi bisa diputar ulang
    sel.classList.add("eval-query-flash");
    sel.addEventListener("animationend", () => sel.classList.remove("eval-query-flash"), { once: true });
    setTimeout(() => {
      sel.focus({ preventScroll: true });
      if (typeof sel.showPicker === "function") {
        try { sel.showPicker(); } catch (_) { /* butuh gesture / tak didukung — fokus saja */ }
      }
    }, 350); // tunggu smooth-scroll settle dulu
  }

  // ========== Intro ==========
  function setupIntro() {
    const startBtn = $("#btn-eval-start");
    const expertSel = $("#eval-expert-select");
    const corpusSel = $("#eval-corpus-select");

    if (expertSel) {
      expertSel.addEventListener("change", () => {
        state.expert = expertSel.value;
        localStorage.setItem("dk-eval-expert", state.expert);
        syncCorpusDropdown(state.expert);
        rebuildSteps();
        updateStartInfo();
      });
    }

    if (corpusSel) {
      corpusSel.addEventListener("change", () => {
        state.selectedCorpus = corpusSel.value;
        localStorage.setItem("dk-eval-corpus", state.selectedCorpus);
        rebuildSteps();
        updateStartInfo();
      });
    }

    if (startBtn) {
      startBtn.addEventListener("click", () => {
        if (EVAL_LOCKED) return;   // saklar kunci: tombol Mulai mati
        if (!state.expert) { focusExpertPicker(); return; }
        if (!state.selectedCorpus) { DK.alert(t("alert_corpus")); return; }
        if (!state.steps.length) return;
        startEval();
      });
    }
  }

  // ========== Admin eye ==========
  function setupAdmin() {
    const btn = $("#btn-eval-admin");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      if (state.adminMode) {
        state.adminMode = false;
        document.getElementById("eval-app").classList.add("eval-hide-scores");
        document.querySelectorAll(".eval-model-sources").forEach((el) => (el.style.display = "none"));
        btn.innerHTML = '<i data-lucide="eye"></i>';
        btn.classList.remove("admin-active");
        btn.title = "Admin view";
        refreshIcons();
        return;
      }
      const pw = await DK.prompt("Password:", { type: "password" });
      if (pw === "alfaganteng") {
        state.adminMode = true;
        document.getElementById("eval-app").classList.remove("eval-hide-scores");
        document.querySelectorAll(".eval-model-sources").forEach((el) => (el.style.display = "block"));
        btn.innerHTML = '<i data-lucide="eye"></i>';
        btn.classList.add("admin-active");
        btn.title = "Admin mode ON";
        refreshIcons();
      }
    });
  }

  // ========== Start evaluation ==========
  async function startEval() {
    if (EVAL_LOCKED) { updateStartInfo(); return; }   // saklar kunci: cegah mulai/auto-resume
    state.phase = "grading";
    $("#eval-intro").classList.add("hidden");
    $("#eval-grading").classList.remove("hidden");
    document.getElementById("eval-app").classList.add("eval-hide-scores");
    const queryPanel = $("#eval-sidebar-query-card");
    if (queryPanel) queryPanel.classList.remove("hidden");
    const expertDisp = $("#eval-sticky-expert");
    if (expertDisp) expertDisp.textContent = state.expert;

    // Show demo skip toggle only for demo accounts
    const demoToggle = $("#demo-skip-toggle");
    if (demoToggle) {
      const isDemo = (state.expert || "").toLowerCase().includes("demo");
      demoToggle.classList.toggle("hidden", !isDemo);
    }

    // Load progress + saved grades + summary to resume (each independent)
    try {
      const [progressData, gradesData, summaryRes] = await Promise.all([
        fetch(`/api/eval/${window.EVAL_TYPE}/progress/${encodeURIComponent(state.expert)}`)
          .then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/eval/${window.EVAL_TYPE}/grades/${encodeURIComponent(state.expert)}`)
          .then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/eval/${window.EVAL_TYPE}/summary`)
          .then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);
      state.completed = new Set((progressData && progressData.completed) || []);
      state.savedGrades = (gradesData && gradesData.grades) || {};
      if (summaryRes) {
        try { renderSidebarProgress(summaryRes); } catch (e) { console.error("Sidebar error:", e); }
      }
    } catch (e) {
      console.error("Failed to load progress:", e);
      state.savedGrades = {};
    }

    // Find first incomplete step
    state.stepIndex = 0;
    for (let i = 0; i < state.totalSteps; i++) {
      if (!state.completed.has(stepKey(i))) {
        state.stepIndex = i;
        break;
      }
      if (i === state.totalSteps - 1) {
        state.stepIndex = state.totalSteps;
      }
    }

    // Send initial heartbeat immediately
    fetch(`/api/eval/${window.EVAL_TYPE}/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expert: state.expert, step: state.steps[state.stepIndex] ? stepKey(state.stepIndex) : "" }),
    }).catch(() => { });

    goToStep(state.stepIndex);
  }

  // Sorot kueri sebentar (animasi kelap-kelip) tiap ganti ke KUERI baru — biar
  // penilai ngeh konteks pertanyaan berganti, bukan cuma pindah korpus/step yg sama.
  // Kena dua-duanya: kartu kueri di bilah sisi (desktop) + baris kueri sticky (mobile).
  function flashQueryEls() {
    [$("#eval-sidebar-query-card"), $("#eval-sticky-query")].forEach((el) => {
      if (!el) return;
      el.classList.remove("eval-query-flash");
      void el.offsetWidth; // paksa reflow biar animasi bisa diputar ulang
      el.classList.add("eval-query-flash");
    });
  }

  // Overlay "spotlight": blur + dim seisi halaman, tampilkan pesan + kueri di tengah,
  // lalu auto-hilang (atau di-tap). Begitu pudar, elemen kueri asli (sidebar/sticky)
  // nge-glow biar penilai tahu di mana letak kuerinya.
  let _attnTimer = null;
  function announceNewQuery(queryText) {
    let ov = document.getElementById("eval-query-attention");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "eval-query-attention";
      ov.innerHTML =
        '<div class="eqa-card">' +
        '<div class="eqa-title"></div>' +
        '<div class="eqa-query"></div>' +
        "</div>";
      document.body.appendChild(ov);
    }
    ov.querySelector(".eqa-title").textContent = t("attention_query");
    ov.querySelector(".eqa-query").textContent = `"${queryText}"`;

    const dismiss = () => {
      clearTimeout(_attnTimer);
      _attnTimer = null;
      ov.classList.remove("show");
      ov.onclick = null;
      flashQueryEls(); // tandai letak kueri asli setelah overlay pudar
    };
    // restart animasi tiap dipanggil
    ov.classList.remove("show");
    void ov.offsetWidth;
    ov.classList.add("show");
    ov.onclick = dismiss; // tap di mana saja buat tutup lebih cepat
    clearTimeout(_attnTimer);
    _attnTimer = setTimeout(dismiss, 1800);
  }

  // ========== Navigation ==========
  async function goToStep(idx, fromReviewModeBounce = false) {
    if (idx < 0 || idx >= state.totalSteps) return;

    // Kalau navigasi manual (bukan lemparan dari "Selanjutnya" di ujung), matikan review mode.
    if (!fromReviewModeBounce) {
      state.isReviewMode = false;
    }

    state.stepIndex = idx;
    const step = getStep(idx);

    // Smooth scroll ke atas tiap kali pindah kueri
    window.scrollTo({ top: 0, behavior: "smooth" });
    const results = $("#eval-results");
    const navs = $$(".eval-nav");
    const loading = $("#eval-loading");
    loading.classList.remove("hidden");
    results.innerHTML = "";
    results.classList.add("hidden");
    navs.forEach(nav => nav.classList.add("hidden"));

    // Update sidebar & sticky info
    const infoDisp = $("#eval-sidebar-step-info");
    const queryDisp = $("#eval-sidebar-query-content");
    const queryCountDisp = $("#eval-sidebar-query-count");
    const stickyStepDisp = $("#eval-sticky-step-info");
    const stickyQueryDisp = $("#eval-sticky-query");

    const queryIdx = state.queries.indexOf(step.query);

    if (queryCountDisp) {
      queryCountDisp.textContent = `${queryIdx + 1} / ${state.queries.length}`;
    }
    if (stickyStepDisp) {
      stickyStepDisp.textContent = `${idx + 1} / ${state.totalSteps}`;
    }
    if (stickyQueryDisp) {
      stickyQueryDisp.innerHTML = `<span class="eval-sticky-expert-inline">${t("done_lbl_expert")}: <strong>${DK.esc(state.expert)}</strong></span><span class="eval-sticky-query-text">${t("step_query")}: <strong>${DK.esc(step.query.query)}</strong></span>`;
    }
    if (infoDisp) {
      infoDisp.innerHTML = `
        <div class="eval-sidebar-info-item horizontal">
          <label><i data-lucide="globe"></i> <span data-i18n="step_corpus">${t("step_corpus")}</span></label>
          <span class="lang-tag ${step.db}">${step.db.toUpperCase()}</span>
        </div>`;
    }
    refreshIcons();
    if (queryDisp) {
      queryDisp.innerHTML = `"${DK.esc(step.query.query)}"`;
    }

    // Kelap-kelip cuma pas KUERI-nya beneran ganti (bukan tiap re-render / step korpus
    // yg kuerinya sama). Pemuatan pertama (_lastFlashQuery undefined) ikut nge-flash.
    if (state._lastFlashQuery !== step.query.query) {
      state._lastFlashQuery = step.query.query;
      announceNewQuery(step.query.query);
    }

    // Determine which models support this corpus
    const modelsForStep = state.models.filter((m) => {
      const lm = state.modelLangs[m] || "multi";
      return (CORPUS_MAP[lm] || ["id"]).includes(step.db);
    });

    try {
      // Fetch results from all relevant models in parallel
      const fetchAll = await Promise.all(
        modelsForStep.map((model) =>
          fetch(`/api/eval/${window.EVAL_TYPE}/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: step.query.query,
              model,
              db: step.db,
              top_k: state.topK,
              include_titles: state.includeTitles,
            }),
          })
            .then((r) => r.json())
            .then((data) => ({ model, results: data.results || [] }))
            .catch(() => ({ model, results: [] }))
        )
      );

      // Merge and deduplicate passages by ref across all models
      const passageMap = new Map();
      fetchAll.forEach(({ model, results }) => {
        // Flatten all fragments from this model, then sort by score to get true global rank
        const allFrags = [];
        results.forEach((sutta) => {
          (sutta.fragments || []).forEach((frag) => allFrags.push({ sutta, frag }));
        });
        allFrags.sort((a, b) => b.frag.score - a.frag.score);

        allFrags.forEach(({ sutta, frag }, globalIdx) => {
          // ref (sutta:mdN) TIDAK unik lintas penerjemah — author berbeda = potongan
          // berbeda. Dedup per (ref + author) supaya tiap terjemahan jadi pasase sendiri.
          const refBase =
            frag.ref_display ||
            (frag.ref || []).join(",") ||
            `${sutta.sutta_id}_f${globalIdx}`;
          const key = passageKey(refBase, frag.author);
          if (!passageMap.has(key)) {
            passageMap.set(key, { sutta, frag, sources: [] });
          }
          passageMap.get(key).sources.push({
            model,
            rank: globalIdx + 1,
            score: frag.score,
          });
        });
      });

      state.currentResults = Array.from(passageMap.values());
      renderGrading(step, state.currentResults);
      updateProgressUI();
    } catch (e) {
      console.error("Eval search error:", e);
      results.innerHTML = `<div class="empty-state"><p>Error: ${DK.esc(e.message)}</p></div>`;
      results.classList.remove("hidden");
    } finally {
      loading.classList.add("hidden");
    }
  }

  // ========== Render grading results ==========
  // passages: [{sutta, frag, sources: [{model, rank, score}]}]
  function renderGrading(step, passages) {
    const container = $("#eval-results");
    container.innerHTML = "";

    if (!passages.length) {
      container.innerHTML = `<div class="empty-state"><p>${t("no_results_eval")}</p></div>`;
      container.classList.remove("hidden");
      $$(".eval-nav").forEach(nav => nav.classList.remove("hidden"));
      updateNavButtons();
      return;
    }

    // Shuffle passage order for evaluator
    const indexed = passages.map((p, i) => ({ ...p, origIdx: i }));
    const shuffled = shuffleArray(indexed, `${state.expert}_${stepKey(state.stepIndex)}`);
    state.shuffleMap = shuffled.map((p) => p.origIdx);

    const ctx = {
      method: "semantic",
      query: step.query.query,
      showPreview: true,
      evalMode: true,   // halaman eval: teks penuh tanpa truncation "...", tanpa tombol "Buka"
      onlyLangs: [step.db],  // tampilkan HANYA bahasa korpus yang di-search (cegah pairing mdN nyasar)
    };

    const sKey = state.stepIndex;
    if (!state.grades[sKey]) state.grades[sKey] = {};

    // Pre-populate grades from server-saved data
    const sk = stepKey(state.stepIndex);
    const savedForStep = (state.savedGrades || {})[sk] || {};

    // Cek jumlah pasase yang SUDAH dinilai sebelum halaman ini di-render
    let preGradedCount = 0;
    shuffled.forEach((passage, displayIdx) => {
      const passageRef = passageKey(passage.frag.ref_display || (passage.frag.ref || []).join(","), passage.frag.author);
      if (state.grades[sKey][displayIdx] !== undefined || savedForStep[passageRef] !== undefined) {
        preGradedCount++;
      }
    });

    // Debt mode: sembunyiin pasase yg SUDAH dinilai tiap masuk kueri yg cuma terisi sebagian
    // (mode isi-lubang) — bukan cuma pas Review Mode. Pakar ga perlu scroll lewatin yg udah
    // dinilai; cukup yg kosong yg nongol. First-pass (preGraded=0) -> semua tampil spt biasa.
    const isDebtMode = preGradedCount > 0 && preGradedCount < passages.length;

    if (isDebtMode) {
      const banner = document.createElement("div");
      banner.className = "eval-debt-banner";
      banner.innerHTML = `<i data-lucide="info"></i> <span>Menyembunyikan ${preGradedCount} pasase yang sudah dinilai sebelumnya.</span>`;
      const toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "btn-secondary eval-show-hidden-btn";
      toggleBtn.style.marginLeft = "auto";
      toggleBtn.textContent = "Tampilkan pasase yang disembunyikan";
      let shown = false;
      toggleBtn.addEventListener("click", () => {
        shown = !shown;
        container.querySelectorAll('.sutta-card[data-graded-hidden="1"]').forEach((c) =>
          c.classList.toggle("eval-hidden-graded", !shown)
        );
        toggleBtn.textContent = shown
          ? "Sembunyikan pasase yang disembunyikan"
          : "Tampilkan pasase yang disembunyikan";
      });
      banner.appendChild(toggleBtn);
      container.appendChild(banner);
    }

    shuffled.forEach((passage, displayIdx) => {
      const { sutta, frag } = passage;
      const fragEl = DK.createFragmentEl(frag, sutta, ctx);

      // Restore grade from server if not already in memory
      const passageRef = passageKey(frag.ref_display || (frag.ref || []).join(","), frag.author);
      const isGraded = state.grades[sKey][displayIdx] !== undefined || savedForStep[passageRef] !== undefined;

      if (state.grades[sKey][displayIdx] === undefined && savedForStep[passageRef] !== undefined) {
        state.grades[sKey][displayIdx] = savedForStep[passageRef];
      }


      // Grade row
      const gradeRow = document.createElement("div");
      gradeRow.className = "eval-grade-row";

      const label = document.createElement("span");
      label.className = "eval-grade-label";
      label.textContent = `${t("lbl_grade")}:`;
      gradeRow.appendChild(label);

      [0, 1, 2, 3].forEach((g) => {
        const lbl = document.createElement("label");
        lbl.className = "eval-grade-option";

        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = `grade_${sKey}_${displayIdx}`;
        radio.value = g;
        const isChecked = state.grades[sKey][displayIdx] === g;
        if (isChecked) radio.checked = true;

        const badge = document.createElement("span");
        badge.className = `eval-grade-badge grade-${g}`;
        badge.textContent = g;

        const desc = document.createElement("span");
        desc.className = "eval-grade-desc";
        desc.textContent = t(`grade_${g}_title`);

        radio.addEventListener("change", () => {
          state.grades[sKey][displayIdx] = g;
          gradeRow.querySelectorAll(".eval-grade-option").forEach((opt) =>
            opt.classList.remove("selected")
          );
          lbl.classList.add("selected");
          updatePassageBar();
          updateSidebarPartial();
          // Update label count
          const infoEl = $("#eval-sticky-step-info");
          if (infoEl) {
            const gr = Object.keys(state.grades[sKey] || {}).length;
            const tot = state.currentResults ? state.currentResults.length : 0;
            infoEl.innerHTML = `${t("step_query")} ${state.stepIndex + 1}/${state.totalSteps} &middot; ${gr}/${tot} pasase`;
          }
          // Show saving indicator
          saveIndicator.textContent = "…";
          saveIndicator.className = "eval-save-indicator saving";
          saveCurrentGrades().then(() => {
            saveIndicator.textContent = "✓ Tersimpan";
            saveIndicator.className = "eval-save-indicator saved";
          }).catch(() => {
            saveIndicator.textContent = "✗ Gagal";
            saveIndicator.className = "eval-save-indicator failed";
          });
        });

        if (isChecked) lbl.classList.add("selected");
        lbl.appendChild(radio);
        lbl.appendChild(badge);
        lbl.appendChild(desc);
        gradeRow.appendChild(lbl);
      });

      // Save indicator at the end of grade row
      const saveIndicator = document.createElement("span");
      saveIndicator.className = "eval-save-indicator";
      if (state.grades[sKey][displayIdx] !== undefined) {
        saveIndicator.textContent = "✓ Tersimpan";
        saveIndicator.className = "eval-save-indicator saved";
      }
      gradeRow.appendChild(saveIndicator);

      const card = document.createElement("div");
      card.className = "sutta-card";
      // Sembunyiin SATU unit penuh (kartu + kotak nilai + sources), bukan cuma teks pasase —
      // dulu class nempel di fragEl doang jadi kotak penilaian nyangkut melayang.
      if (isDebtMode && isGraded) {
        card.classList.add("eval-hidden-graded");
        card.dataset.gradedHidden = "1";   // ditandai biar tombol "Tampilkan yg disembunyikan" bisa toggle
      }
      const header = document.createElement("div");
      header.className = "sutta-card-header";
      const nameSpan = sutta.sutta_name ? ` <span class="sutta-card-name">${DK.esc(sutta.sutta_name)}</span>` : "";
      // Kiri: nomor + nama sutta. Kanan: badge piṭaka + nama kitab + rank tampil.
      const pitaka = sutta.pitaka || "";
      if (pitaka) card.classList.add("pitaka-" + pitaka);
      const pitakaBadge = pitaka ? `<span class="sutta-pitaka-badge ${pitaka}">${pitaka.charAt(0).toUpperCase() + pitaka.slice(1)}</span>` : "";
      const collName = sutta.collection_name || "";
      const collBadge = collName ? `<span class="sutta-collection-badge">${DK.esc(collName)}</span>` : "";
      let metaBadge = "";
      if (pitaka && collName) {
        metaBadge = `<span class="sutta-meta-pill">${collBadge}${pitakaBadge}</span>`;
      } else {
        metaBadge = `${collBadge}${pitakaBadge}`;
      }
      header.innerHTML = `
        <span class="sutta-card-title">${sutta.formatted_id}${nameSpan}</span>
        <span class="sutta-card-meta">${metaBadge}<span class="eval-display-rank">#${displayIdx + 1}</span></span>`;
      const sourcesDiv = document.createElement("div");
      sourcesDiv.className = "eval-model-sources";
      sourcesDiv.style.display = state.adminMode ? "block" : "none";
      sourcesDiv.innerHTML = passage.sources
        .map(({ model, rank, score }) => {
          const name = model.split(/[/\\]/).pop();
          return `<span class="eval-model-source-item"><strong>${DK.esc(name)}</strong> rank ${rank}${score != null ? ` · sim ${score.toFixed(3)}` : ""}</span>`;
        })
        .join("");

      card.appendChild(header);
      card.appendChild(fragEl);
      card.appendChild(gradeRow);
      card.appendChild(sourcesDiv);
      container.appendChild(card);
    });

    container.classList.remove("hidden");
    $$(".eval-nav").forEach(nav => nav.classList.remove("hidden"));
    updateNavButtons();

    const scroll = $("#search-scroll");
    if (scroll) {
      // Auto-scroll to first ungraded passage so expert doesn't have to scroll past already-graded ones
      const firstUngraded = container.querySelector(".sutta-card:not(:has(.eval-grade-option.selected))");
      if (firstUngraded) {
        requestAnimationFrame(() => firstUngraded.scrollIntoView({ behavior: "smooth", block: "start" }));
      } else {
        scroll.scrollTop = 0;
      }
    }
  }

  function updateNavButtons() {
    const prevBtns = $$(".btn-eval-prev");
    const nextBtns = $$(".btn-eval-next");
    const infos = $$(".eval-nav-info");

    const topNav = $("#eval-nav-top");
    if (topNav) {
      topNav.style.display = "";   // tombol next/prev atas tampil utk SEMUA pakar (dulu demo-only)
    }

    prevBtns.forEach(btn => btn.disabled = state.stepIndex === 0);

    let hasOtherIncomplete = false;
    for (let i = 0; i < state.totalSteps; i++) {
      if (i !== state.stepIndex && isStepIncomplete(i)) {
        hasOtherIncomplete = true;
        break;
      }
    }

    const isLastAction = !hasOtherIncomplete;

    nextBtns.forEach(btn => {
      if (isLastAction) {
        btn.innerHTML = t("btn_submit");
      } else {
        btn.innerHTML = `<span class="nav-full">${DK.esc(t("btn_next_full"))}</span><span class="nav-short">${DK.esc(t("btn_next_short"))}</span> <i data-lucide="chevron-right"></i>`;
      }
    });

    infos.forEach(info => info.textContent = `${state.stepIndex + 1} ${t("step_of")} ${state.totalSteps}`);
    refreshIcons();
  }

  // ========== Navigation handlers ==========
  async function goNext() {
    const sKey = state.stepIndex;
    const grades = state.grades[sKey] || {};
    const fragCount = document.querySelectorAll("#eval-results .fragment").length;

    const demoSkip = $("#demo-skip-check");
    const isDemo = (state.expert || "").toLowerCase().includes("demo");
    const canSkip = isDemo && demoSkip && demoSkip.checked;   // skip HANYA akun demo (bukan pakar asli)
    if (!canSkip && Object.keys(grades).length < fragCount) {
      // DALAM kueri: wajib semua dinilai dulu — tandai merah + auto-scroll ke yg kosong.
      DK.alert(t("alert_grade"));
      let idx = 0;
      let firstUngraded = null;
      document.querySelectorAll("#eval-results .fragment").forEach((f) => {
        if (grades[idx] === undefined) {
          f.classList.add("eval-ungraded");
          setTimeout(() => f.classList.remove("eval-ungraded"), 2000);
          if (!firstUngraded) firstUngraded = f;
        }
        idx++;
      });
      if (firstUngraded) {
        firstUngraded.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }

    await saveCurrentGrades();
    const sk = stepKey(state.stepIndex);
    const allGraded = Object.keys(grades).length >= fragCount;
    if (allGraded) {
      state.completed.add(sk);
      markSidebarStepDone(sk);
      // Mark step as fully completed on server
      fetch(`/api/eval/${window.EVAL_TYPE}/mark_complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expert: state.expert, step_key: sk }),
      }).catch((e) => console.error("Failed to mark complete:", e));
    }

    if (state.stepIndex >= state.totalSteps - 1 || state.isReviewMode) {
      // Kueri terakhir selesai ATAU sedang dalam review mode — lompat ke kueri bolong berikutnya
      const nextIncomplete = findFirstIncompleteStep(state.stepIndex + 1);
      if (nextIncomplete !== -1) {
        if (!state.isReviewMode) {
          DK.alert(state.lang === "id"
            ? "Masih ada kueri yang belum selesai dinilai. Anda akan diarahkan ke kueri tersebut."
            : "There are still ungraded queries. You will be redirected.");
          state.isReviewMode = true; // Aktifkan mode sembunyiin grade khusus pas dilempar balik
        }
        goToStep(nextIncomplete, true);
      } else {
        showDone();
      }
    } else {
      // Lompat ke kueri belum-selesai berikutnya (skip yg sudah komplit). Pas fase isi-lubang
      // pakar ga perlu klik Next berkali-kali lewatin kueri penuh. Saat first-pass semua step
      // masih incomplete -> findFirstIncompleteStep(i+1) == i+1 == perilaku lama (sekuensial).
      const nextInc = findFirstIncompleteStep(state.stepIndex + 1);
      if (nextInc === -1) showDone();
      else goToStep(nextInc);
    }
  }

  function goPrev() {
    if (state.stepIndex > 0) goToStep(state.stepIndex - 1);
  }

  // ========== Save grades ==========
  async function saveCurrentGrades() {
    const step = getStep(state.stepIndex);
    const sKey = state.stepIndex;
    const grades = state.grades[sKey] || {};

    const entries = [];

    Object.keys(grades).forEach((displayIdxStr) => {
      const displayIdx = parseInt(displayIdxStr);
      const origIdx = state.shuffleMap ? state.shuffleMap[displayIdx] : displayIdx;
      const grade = grades[displayIdx];
      const passage = state.currentResults ? state.currentResults[origIdx] : null;
      if (grade === undefined || !passage) return;

      const { sutta, frag, sources } = passage;
      const texts = frag.texts || {};
      const mainText = texts[step.db] || texts.en || texts.id || texts.pli || "";

      // Write one entry per model that retrieved this passage
      sources.forEach(({ model, rank, score }) => {
        entries.push({
          query_id: step.query.id,
          query: step.query.query,
          model,
          db: step.db,
          rank,
          sutta_id: sutta.sutta_id,
          ref: frag.ref_display || (frag.ref || []).join(","),
          author: frag.author || "",
          retrieved_text: mainText,
          cosine_sim: score,
          grade,
        });
      });
    });

    if (entries.length) {
      try {
        await fetch(`/api/eval/${window.EVAL_TYPE}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expert: state.expert,
            entries,
          }),
        });
      } catch (e) {
        console.error("Failed to save grades:", e);
      }
    }
  }

  // ========== Progress UI ==========
  function updateProgressUI() {
    updateSidebarHighlight();
    // Top bar: per kueri progress
    const bar = $("#eval-progress-bar");
    if (bar) {
      const completedCount = state.completed.size;
      const pct = state.totalSteps > 0 ? (completedCount / state.totalSteps) * 100 : 0;
      bar.style.width = `${pct}%`;
    }
    // Bottom bar: per pasase in current step
    updatePassageBar();
    // Label: progress KUERI (X/Y) + jumlah PASASE agregat SEMUA kueri (bukan kueri ini).
    const info = $("#eval-sticky-step-info");
    if (info) {
      const ps = passageStatsAll();
      info.innerHTML = `${t("step_query")} ${state.stepIndex + 1}/${state.totalSteps} &middot; ${ps.graded}/${ps.total} pasase`;
    }
  }

  // Agregat pasase LINTAS SEMUA KUERI (step) di korpus terpilih, bukan cuma kueri aktif.
  // Per step: graded = max(grade lokal sesi ini, partial dari summary), capped ke total step.
  // Sumber total/partial = summary (step_totals/partial), keduanya sudah top-5 aware (EVAL_PASSAGE_K).
  function passageStatsAll() {
    const partial = (state._summaryData && state._summaryData.partial && state._summaryData.partial[state.expert]) || {};
    const totals = (state._summaryData && state._summaryData.step_totals) || {};
    let graded = 0, total = 0;
    for (let i = 0; i < state.totalSteps; i++) {
      const sk = stepKey(i);
      let st = totals[sk] || 0;
      // Kueri aktif: kalau summary belum punya total-nya, pakai jumlah hasil yg termuat.
      if (st === 0 && i === state.stepIndex && state.currentResults) st = state.currentResults.length;
      if (st === 0) continue;
      const localCount = state.grades[i] ? Object.keys(state.grades[i]).length : 0;
      const backendCount = partial[sk] || 0;
      total += st;
      graded += Math.min(Math.max(localCount, backendCount), st);
    }
    return { graded, total };
  }

  function updatePassageBar() {
    const bar = $("#eval-passage-bar");
    if (!bar) return;
    const { graded, total } = passageStatsAll();
    const pct = total > 0 ? (graded / total) * 100 : 0;
    bar.style.width = `${pct}%`;
  }

  // ========== Sidebar progress table ==========
  function renderSidebarProgress(summary) {
    const panel = $("#eval-sidebar-progress-table");
    const content = $("#eval-sidebar-progress-content");
    if (!panel || !content) return;

    state._summaryData = summary; // cache for updates
    const { queries, matrix, partial, step_totals } = summary;
    const doneSet = new Set(matrix[state.expert] || []);
    const expertPartial = partial[state.expert] || {};
    const allowed = state.expertCorpora[state.expert] || ["id", "en"];
    const dbs = ["id", "en"].filter((db) => allowed.includes(db));
    const totals = step_totals || {};

    let html = `<table class="eval-sidebar-prog-table">
      <thead><tr><th>#</th>`;
    dbs.forEach((db) => { html += `<th><span class="lang-tag ${db}">${db.toUpperCase()}</span></th>`; });
    html += `</tr></thead><tbody>`;

    queries.forEach((q, i) => {
      const isCurrent = state.steps[state.stepIndex] &&
        q.id === state.steps[state.stepIndex].query.id;
      html += `<tr class="${isCurrent ? "eval-prog-current" : ""}" data-qid="${q.id}">
        <td class="eval-prog-num" title="${DK.esc(q.query || "")}">${i + 1}</td>`;
      dbs.forEach((db) => {
        const key = `${q.id}_${db}`;
        const total = totals[key] || "";
        if (doneSet.has(key)) {
          const graded = expertPartial[key] || total || "";
          html += `<td class="eval-prog-done" data-key="${key}" title="${total} pasase"><i data-lucide="check" class="lucide-sm"></i>${graded && total ? ` <span class="eval-prog-count">${graded}/${total}</span>` : ""}</td>`;
        } else if (expertPartial[key]) {
          const graded = expertPartial[key];
          html += `<td class="eval-prog-partial" data-key="${key}"><i data-lucide="loader" class="lucide-sm lucide-spin"></i>${total ? ` ${graded}/${total}` : ` ${graded}`}</td>`;
        } else {
          html += `<td class="eval-prog-empty" data-key="${key}">${total || "—"}</td>`;
        }
      });
      html += `</tr>`;
    });

    html += `</tbody></table>`;
    content.innerHTML = html;
    panel.classList.remove("hidden");
    refreshIcons();

    // Klik baris sidebar → loncat ke kueri itu (memungkinkan skip)
    content.querySelectorAll("tr[data-qid]").forEach((tr) => {
      tr.style.cursor = "pointer";
      tr.addEventListener("click", () => {
        const qid = tr.dataset.qid;
        const targetIdx = state.steps.findIndex((s) => s.query.id === qid);
        if (targetIdx !== -1 && targetIdx !== state.stepIndex) {
          // Simpan grade yg sudah diisi di step saat ini (tanpa validasi wajib-lengkap)
          saveCurrentGrades().then(() => goToStep(targetIdx));
        }
      });
    });
  }

  function updateSidebarHighlight() {
    const table = $(".eval-sidebar-prog-table");
    if (!table) return;
    const step = state.steps[state.stepIndex];
    if (!step) return;
    table.querySelectorAll("tr").forEach((tr) => {
      tr.classList.toggle("eval-prog-current", tr.dataset.qid == step.query.id);
    });
  }

  function markSidebarStepDone(sk) {
    const cell = document.querySelector(`.eval-sidebar-prog-table td[data-key="${sk}"]`);
    if (cell) {
      const total = state.currentResults ? state.currentResults.length : 0;
      cell.className = "eval-prog-done";
      cell.innerHTML = `<i data-lucide="check" class="lucide-sm"></i>${total ? ` <span class="eval-prog-count">${total}/${total}</span>` : ""}`;
      refreshIcons();
    }
  }

  function updateSidebarPartial() {
    const sk = stepKey(state.stepIndex);
    const cell = document.querySelector(`.eval-sidebar-prog-table td[data-key="${sk}"]`);
    if (!cell || cell.classList.contains("eval-prog-done")) return;
    const graded = Object.keys(state.grades[state.stepIndex] || {}).length;
    const total = state.currentResults ? state.currentResults.length : 0;
    cell.className = "eval-prog-partial";
    cell.innerHTML = total ? `<i data-lucide="loader" class="lucide-sm lucide-spin"></i> ${graded}/${total}` : `<i data-lucide="loader" class="lucide-sm lucide-spin"></i> ${graded}`;
    refreshIcons();
  }

  // ========== Find first incomplete step ==========
  function isStepIncomplete(idx) {
    const partial = (state._summaryData && state._summaryData.partial && state._summaryData.partial[state.expert]) || {};
    const totals = (state._summaryData && state._summaryData.step_totals) || {};
    const sk = stepKey(idx);

    const localCount = state.grades[idx] ? Object.keys(state.grades[idx]).length : 0;
    const backendCount = partial[sk] || 0;
    const graded = Math.max(localCount, backendCount);
    const total = totals[sk] || 0;

    if (total === 0) {
      return !state.completed.has(sk);
    } else {
      if (graded >= total) state.completed.add(sk);
      return graded < total;
    }
  }

  function findFirstIncompleteStep(startIdx = 0) {
    for (let i = 0; i < state.totalSteps; i++) {
      const idx = (startIdx + i) % state.totalSteps;
      if (isStepIncomplete(idx)) return idx;
    }
    return -1; // semua sudah complete
  }

  // ========== Done ==========
  function showDone() {
    state.phase = "done";
    $("#eval-grading").classList.add("hidden");
    $("#eval-sidebar-query-card").classList.add("hidden");
    $("#eval-done").classList.remove("hidden");
    const summary = $("#eval-done-summary");
    if (summary) {
      summary.innerHTML = `<p style="margin-top:16px;color:var(--text-secondary)">
        ${t("done_lbl_expert")}: <strong>${DK.esc(state.expert)}</strong><br>
        ${t("step_corpus")}: <strong>${state.selectedCorpus.toUpperCase()}</strong> &mdash;
        ${state.totalSteps} ${t("done_lbl_steps")}
      </p>`;
    }
    const bar = $("#eval-progress-bar");
    if (bar) bar.style.width = "100%";
  }

  // ========== Init ==========
  function init() {
    initLang();
    setupIntro();
    setupAdmin();
    loadData();

    document.addEventListener("click", (e) => {
      if (e.target.closest(".btn-eval-next")) goNext();
      if (e.target.closest(".btn-eval-prev")) goPrev();

      // "Keluar dari Form" — clear auto-resume keys supaya balik ke intro
      const exitBtn = e.target.closest(".eval-exit-btn");
      if (exitBtn) {
        e.preventDefault();
        localStorage.removeItem("dk-eval-expert");
        localStorage.removeItem("dk-eval-corpus");
        window.location.href = exitBtn.href;
      }
    });

    // Heartbeat — ping server every 30s while grading
    setInterval(() => {
      if (state.phase !== "grading" || !state.expert) return;
      const sk = state.steps[state.stepIndex] ? stepKey(state.stepIndex) : "";
      fetch(`/api/eval/${window.EVAL_TYPE}/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expert: state.expert, step: sk }),
      }).catch(() => { });
    }, 30000);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
