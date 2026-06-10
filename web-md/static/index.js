/* ============================================================
   Dhammakathika — Search Page (index)
   Shared logic (theme, source, notes, resize) lives in common.js
   ============================================================ */

(function () {
  "use strict";

  // ========== i18n ==========
  const i18n = {
    id: {
      subtitle: "Pencarian Tipiṭaka berbasis makna",
      lbl_method: "Metode",
      btn_hybrid: "Hybrid",
      btn_semantic: "Makna",
      btn_keyword: "Kata Kunci",
      lbl_link_source: "Sumber Link",
      loading_browse: "Memuat daftar sutta…",
      lbl_language: "Target Bahasa",
      lbl_options: "Tampilkan",
      cb_titles: "Judul",
      cb_blurbs: "Sinopsis",
      cb_group: "Grup per Teks",
      cb_preview: "Konteks",
      lbl_search: "Kueri",
      ph_search_semantic: "Ketik topik, misal: bahaya kemarahan; bolehkah biksu pegang uang; empat jenis manusia",
      ph_search_keyword: "Ketik kata yang ingin dicari, misal: dukkha…",
      btn_search: '<i data-lucide="search"></i> Cari',
      welcome_title: "Selamat Datang!",
      welcome_body: "Telusuri koleksi sutta di bawah, atau langsung cari topik yang kamu butuhkan.",
      loading_text: "Mencari teks…",
      btn_add_note: "+ Catatan",
      no_results: "Tidak ada hasil ditemukan.",
      btn_retry: '<i data-lucide="refresh-cw"></i> Coba Lagi',
      error_prefix: "Error",
      alert_pick_note: "Buat atau pilih catatan terlebih dahulu di panel kanan.",
      toast_search_updated: "Pencarian diperbarui",
      btn_reset_opts: "Reset Opsi",
      confirm_reset_opts: "Kembalikan semua opsi pencarian ke pengaturan awal?",
      confirm_clear_results: "Mengubah pengaturan ini akan membatalkan hasil pencarian saat ini. Untuk lakukan pencarian, Anda perlu tekan tombol Cari lagi. Lanjutkan?",
      tt_method: "Pilih metode pencarian:\n• Hybrid: Gabungan Makna + Kata Kunci (disarankan).\n• Makna: Mencari berdasarkan makna atau konteks kalimat.\n• Kata Kunci: Mencari berdasarkan kecocokan kata persis.",
      tt_language: "Pilih target bahasa pencarian (bisa lebih dari satu):\n• ID: Bahasa Indonesia\n• EN: English (Bahasa Inggris)\n• PLI: Pāli",
      tt_options: "Opsi tambahan hasil pencarian:\n• Judul: Sertakan judul sutta dalam pencarian.\n• Sinopsis: Sertakan sinopsis sutta dalam pencarian.\n• Grup per Teks: Kelompokkan hasil yang berasal dari teks yang sama.\n• Konteks: Tampilkan teks sebelum dan sesudah hasil (konteks tambahan).",
      tt_mode: "Pilih mode perbandingan model:\n• 1: Menampilkan hasil dari satu model saja.\n• 2: Membandingkan hasil dari dua model secara berdampingan.",
      tt_model1: "Pilih model pencarian utama. Anda dapat mengganti kategori (misal: base, contrastive, dll.) pada dropdown pertama dan model spesifik pada dropdown kedua.",
      tt_model2: "Pilih model kedua untuk membandingkan hasil secara berdampingan dengan Model 1.",
      tt_query: "Masukkan topik atau pertanyaan pencarian Anda di sini. Tekan Enter atau klik tombol Mulai untuk memulai.",
      tt_btn_hybrid: "Gabungan Makna + Kata Kunci, hasil paling lengkap (disarankan).",
      tt_btn_semantic: "Mencari berdasarkan makna atau konteks kalimat.",
      tt_btn_keyword: "Mencari berdasarkan kecocokan kata persis.",
      tt_keyword_adv_disabled: "Tidak tersedia di mode tingkat lanjut.",
      tt_btn_id: "Bahasa Indonesia",
      tt_btn_en: "English (Bahasa Inggris)",
      tt_btn_pli: "Pāli",
      tt_cb_titles: "Sertakan judul sutta dalam pencarian. Matikan jika hanya ingin mencari isi teks sutta.",
      tt_cb_blurbs: "Sertakan sinopsis singkat sutta dalam pencarian.",
      tt_cb_group: "Kelompokkan segmen hasil yang berasal dari teks yang sama menjadi satu.",
      tt_cb_preview: "Tampilkan teks sebelum dan sesudah hasil untuk memberikan konteks tambahan.",
      lbl_pitaka: "Piṭaka",
      tt_pitaka: "Filter hasil berdasarkan Piṭaka (bisa lebih dari satu):\n• Sutta: Sutta Piṭaka\n• Vinaya: Vinaya Piṭaka\n• Abhidhamma: Abhidhamma Piṭaka",
      or_search_directly: "atau langsung cari",
      browse_sutta_divider: "Telusuri Tipiṭaka",
      lbl_search_options: "Opsi Pencarian (Metode, Target Bahasa, Piṭaka, dsb.)",
      lang_name_id: "Indonesia",
      lang_name_en: "Inggris",
      lang_bar_detected: "Bahasa topik terdeteksi",
      lang_bar_manual: "Bahasa topik dipilih",
      lang_bar_switch: "Bukan {x}? Cari sebagai {y}",
      ens_query_lang: "Bahasa Topik",
      ens_query_lang_hint: "Pilih bahasa topik, lalu atur model untuk tiap target di bawahnya.",
      ens_incompat_legend: "tak cocok untuk kombinasi bahasa topik → target ini (hasil bisa kurang relevan)",
    },
    en: {
      subtitle: "Tipiṭaka Search based on meaning",
      lbl_method: "Method",
      btn_hybrid: "Hybrid",
      btn_semantic: "Semantic",
      btn_keyword: "Keyword",
      lbl_link_source: "Link Source",
      loading_browse: "Loading sutta list…",
      lbl_language: "Target Language",
      lbl_options: "Display",
      cb_titles: "Titles",
      cb_blurbs: "Blurbs",
      cb_group: "Group by Text",
      cb_preview: "Context",
      lbl_search: "Query",
      ph_search_semantic: "Type a topic, e.g.: how to overcome anger…",
      ph_search_keyword: "Type a word to search, e.g.: dukkha…",
      btn_search: '<i data-lucide="search"></i> Search',
      welcome_title: "Welcome!",
      welcome_body: "Browse the Tipiṭaka below, or search directly for the topic you need.",
      loading_text: "Searching texts…",
      btn_add_note: "+ Notes",
      no_results: "No results found.",
      btn_retry: '<i data-lucide="refresh-cw"></i> Retry',
      error_prefix: "Error",
      alert_pick_note: "Please create or select a note in the right panel first.",
      toast_search_updated: "Search updated",
      btn_reset_opts: "Reset Options",
      confirm_reset_opts: "Reset all search options to default settings?",
      confirm_clear_results: "Changing this setting will discard your current search results. To re-search, you have to press the Search button again. Continue?",
      tt_method: "Select search method:\n• Hybrid: Combines Semantic + Keyword (recommended).\n• Semantic: Search based on meaning or context.\n• Keyword: Search based on exact word match.",
      tt_language: "Select target language (multiple allowed):\n• ID: Indonesian\n• EN: English\n• PLI: Pāli",
      tt_options: "Additional search options:\n• Titles: Include sutta titles in search.\n• Blurbs: Include sutta summaries (blurbs) in search.\n• Group by Text: Group results from the same text.\n• Context: Show text before and after results (additional context).",
      tt_mode: "Select model comparison mode:\n• 1: Display results from a single model.\n• 2: Compare results from two models side-by-side.",
      tt_model1: "Select the primary search model. You can change the category (e.g., base, contrastive) in the first dropdown and the specific model in the second.",
      tt_model2: "Select the second model to compare results side-by-side with Model 1.",
      tt_query: "Enter your search topic or question here. Press Enter or click Start button to begin.",
      tt_btn_hybrid: "Combines Semantic + Keyword for the most comprehensive results (recommended).",
      tt_btn_semantic: "Search based on meaning or context.",
      tt_btn_keyword: "Search based on exact word match.",
      tt_keyword_adv_disabled: "Not available in advanced mode.",
      tt_btn_id: "Indonesian",
      tt_btn_en: "English",
      tt_btn_pli: "Pāli",
      tt_cb_titles: "Include sutta titles in search. Disable to search only within sutta body text.",
      tt_cb_blurbs: "Include short sutta summaries (blurbs) in search.",
      tt_cb_group: "Group result segments from the same text into one.",
      tt_cb_preview: "Show text before and after results for additional context.",
      lbl_pitaka: "Piṭaka",
      tt_pitaka: "Filter results by Piṭaka (multiple allowed):\n• Sutta: Sutta Piṭaka\n• Vinaya: Vinaya Piṭaka\n• Abhidhamma: Abhidhamma Piṭaka",
      or_search_directly: "or search directly",
      browse_sutta_divider: "Browse Tipiṭaka",
      lbl_search_options: "Search Options (Method, Target Language, Piṭaka, etc.)",
      lang_name_id: "Indonesian",
      lang_name_en: "English",
      lang_bar_detected: "Detected query language",
      lang_bar_manual: "Query language set to",
      lang_bar_switch: "Not {x}? Search as {y}",
      ens_query_lang: "Query Language",
      ens_query_lang_hint: "Pick the query language, then configure models per target below.",
      ens_incompat_legend: "not suitable for this query language → target combination (results may be less relevant)",
    },
  };

  function t(key) {
    return (i18n[state.lang] || i18n.id)[key] || (window.DK && window.DK.t ? window.DK.t(key) : key);
  }

  // ========== DEFAULT State ==========
  const state = {
    method: ["semantic", "keyword"],
    db: ["id"],
    compareMode: "1",
    cat1: "gpl",
    cat2: "base",
    model1: "gpl-multilingual-e5-base",
    model2: "",
    topK: 10,
    limitTopK: false,
    currentPage: 1,
    totalResults: 0,
    pageSize: 20,
    includeTitles: true,
    includeBlurbs: true,
    groupBySutta: true,
    // On by default: overlapping context within a grouped sutta is now deduped
    // (see buildFragTextLines), so Context no longer reads as repetitive.
    showPreview: true,
    pitaka: ["sutta", "vinaya", "abhidhamma"],
    allModels: [],
    categories: [],
    lang: "id",
    searchLevel: "simple",
    // Whether the collapsible "Opsi Pencarian" <details> panel is expanded.
    searchOptionsOpen: false,
    // Query-language routing (ensemble/semantic). null => auto-detect on the
    // server. Set by the "did you mean …?" switch; reset when the query text
    // changes. Not persisted.
    queryLangOverride: null,
    overrideForQuery: "",
  };

  // ========== Preferences persistence ==========
  const PREFS_KEY = "dk-search-prefs";
  function savePrefs() {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      method: state.method,
      db: state.db,
      pitaka: state.pitaka,
      compareMode: state.compareMode,
      cat1: state.cat1,
      cat2: state.cat2,
      model1: state.model1,
      model2: state.model2,
      topK: state.topK,
      includeTitles: state.includeTitles,
      includeBlurbs: state.includeBlurbs,
      groupBySutta: state.groupBySutta,
      showPreview: state.showPreview,
      searchLevel: state.searchLevel,
      searchOptionsOpen: state.searchOptionsOpen,
    }));
  }
  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p.method) state.method = Array.isArray(p.method) ? p.method : [p.method];
      if (p.db) state.db = Array.isArray(p.db) ? p.db : (p.db === "all" ? ["id", "en", "pli"] : [p.db]);
      if (p.pitaka) state.pitaka = Array.isArray(p.pitaka) ? p.pitaka : [p.pitaka];
      if (p.compareMode) state.compareMode = p.compareMode;
      if (p.cat1) state.cat1 = p.cat1;
      if (p.cat2) state.cat2 = p.cat2;
      if (p.model1) state.model1 = p.model1;
      if (p.model2) state.model2 = p.model2;
      if (typeof p.topK === "number") state.topK = p.topK;
      if (typeof p.includeTitles === "boolean") state.includeTitles = p.includeTitles;
      if (typeof p.includeBlurbs === "boolean") state.includeBlurbs = p.includeBlurbs;
      if (typeof p.groupBySutta === "boolean") state.groupBySutta = p.groupBySutta;
      if (typeof p.showPreview === "boolean") state.showPreview = p.showPreview;
      if (p.searchLevel) state.searchLevel = p.searchLevel;
      if (typeof p.searchOptionsOpen === "boolean") state.searchOptionsOpen = p.searchOptionsOpen;
    } catch (e) { /* ignore */ }
  }

  // ========== DOM ==========
  const $ = (s) => document.querySelector(s);

  const dom = {
    langBtn: $("#btn-lang-toggle"),
    langPill: $("#btn-lang-toggle"),
    methodToggle: $("#method-toggle"),
    dbToggle: $("#db-toggle"),
    pitakaToggle: $("#pitaka-toggle"),
    compareToggle: $("#compare-toggle"),
    modeGroup: $("#mode-group"),
    modelRow: $("#model-row"),
    cat1Select: $("#cat-select-1"),
    cat2Select: $("#cat-select-2"),
    model1Select: $("#model-select-1"),
    model2Select: $("#model-select-2"),
    model1Group: $("#model1-group"),
    model2Group: $("#model2-group"),
    searchInput: $("#search-input"),
    searchBtn: $("#btn-search"),
    btnAdvancedToggle: $("#btn-advanced-toggle"),
    btnResetOpts: $("#btn-reset-opts"),
    advancedToggleGroup: $("#advanced-toggle-group"),
    searchOptionsDetails: $("#search-options-details"),
    searchControls: $("#search-controls"),
    cbTitles: $("#cb-titles"),
    cbBlurbs: $("#cb-blurbs"),
    cbGroup: $("#cb-group"),
    cbPreview: $("#cb-preview"),
    pagination: $("#pagination"),
    btnPrevPage: $("#btn-prev-page"),
    btnNextPage: $("#btn-next-page"),
    pageInfo: $("#page-info"),
    welcomeState: $("#welcome-state"),
    loadingState: $("#loading-state"),
    resultsContainer: $("#results-container"),
    searchLegend: $("#search-legend"),
    queryLangBar: $("#query-lang-bar"),
    mainNav: $("#main-nav"),

    // Ensemble Manager
    btnEnsembleConfig: $("#btn-ensemble-config"),
    ensembleManager: $("#ensemble-manager"),
    btnCloseEnsemble: $("#btn-close-ensemble"),
    btnSaveEnsemble: $("#btn-save-ensemble"),
    btnResetEnsemble: $("#btn-reset-ensemble"),
    ensembleCheckboxes: $("#ensemble-checkboxes"),
  };

  // ========== Language ==========
  function initLang() {
    state.lang = localStorage.getItem("dk-lang") || "id";
    applyLang();
    window.addEventListener("dk-lang-change", (e) => {
      state.lang = e.detail.lang;
      applyLang();
    });
  }
  function applyLang() {
    if (!dom.langPill) return;
    dom.langPill.setAttribute("data-active", state.lang);
    dom.langPill.querySelectorAll(".lang-pill-opt").forEach((opt) =>
      opt.classList.toggle("active", opt.dataset.lang === state.lang)
    );
    document.documentElement.lang = state.lang;
    document.querySelectorAll("[data-i18n]").forEach((el) =>
      (el.textContent = t(el.getAttribute("data-i18n")))
    );
    document.querySelectorAll("[data-i18n-html]").forEach((el) =>
      (el.innerHTML = t(el.getAttribute("data-i18n-html")))
    );
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) =>
      (el.placeholder = t(el.getAttribute("data-i18n-placeholder")))
    );
    document.querySelectorAll("[data-i18n-title]").forEach((el) =>
      (el.title = t(el.getAttribute("data-i18n-title")))
    );
    if (window.refreshIcons) window.refreshIcons();
    if (dom.searchInput) updateSearchPlaceholder();
    // The query-language bar is built with dynamic innerHTML (not data-i18n),
    // so re-render it on language change to keep its text in sync.
    renderLangBar(lastLangBarData);
  }

  function updateSearchPlaceholder() {
    const key = state.method.includes("semantic") ? "ph_search_semantic" : "ph_search_keyword";
    dom.searchInput.placeholder = t(key);
  }

  // ========== Helpers ==========
  async function clearResults() {
    // If results or a search are visible, confirm before discarding
    const hasResults = !dom.resultsContainer.classList.contains("hidden");
    const isSearching = !dom.loadingState.classList.contains("hidden");
    if (hasResults || isSearching) {
      if (!await DK.confirm(t("confirm_clear_results"))) return false;
    }
    dom.resultsContainer.innerHTML = "";
    dom.resultsContainer.classList.add("hidden");
    if (dom.searchLegend) dom.searchLegend.classList.add("hidden");
    if (dom.queryLangBar) dom.queryLangBar.style.display = "none";
    dom.loadingState.classList.add("hidden");
    dom.pagination.classList.add("hidden");
    return true;
  }

  function setupToggle(container, onChange) {
    const isMulti = container.dataset.multi === "true";
    container.addEventListener("click", async (e) => {
      const btn = e.target.closest(".toggle-btn");
      if (!btn || btn.classList.contains("is-disabled")) return;
      if (isMulti) {
        const activeBtns = Array.from(container.querySelectorAll(".toggle-btn.active"));
        const currentVals = activeBtns.map(b => b.dataset.value);
        const isActive = btn.classList.contains("active");

        let proposedVals = [...currentVals];
        if (isActive) {
          proposedVals = proposedVals.filter(v => v !== btn.dataset.value);
        } else {
          proposedVals.push(btn.dataset.value);
        }
        if (proposedVals.length === 0) return; // Prevent deselecting all

        const res = await onChange(proposedVals);
        if (res !== false) {
          btn.classList.toggle("active");
        }
      } else {
        if (btn.classList.contains("active")) return;

        const res = await onChange(btn.dataset.value);
        if (res !== false) {
          container.querySelectorAll(".toggle-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
        }
      }
    });
  }
  // ========== Models ==========
  async function loadModels() {
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      state.allModels = data.all || [];
      state.categories = data.categories || [];
      // Populate category dropdowns
      populateCatSelect(dom.cat1Select);
      populateCatSelect(dom.cat2Select);
      // Restore saved category or default to first
      state.cat1 = findCatKey(state.cat1) || (state.categories[0] && state.categories[0].key) || "base";
      state.cat2 = findCatKey(state.cat2) || (state.categories.length > 1 ? state.categories[1].key : state.cat1);
      dom.cat1Select.value = state.cat1;
      dom.cat2Select.value = state.cat2;
      // Populate model dropdowns based on selected category
      populateModelSelect(dom.model1Select, state.cat1, state.model1);
      populateModelSelect(dom.model2Select, state.cat2, state.model2);
      state.model1 = dom.model1Select.value || "";
      state.model2 = dom.model2Select.value || "";
    } catch (e) { console.error("Failed to load models:", e); }
  }

  function findCatKey(key) {
    return state.categories.find(c => c.key === key) ? key : null;
  }

  function getCatLabel(catKey) {
    const cat = state.categories.find(c => c.key === catKey);
    return cat ? cat.label : catKey;
  }

  function populateCatSelect(select) {
    select.innerHTML = "";
    state.categories.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat.key;
      opt.textContent = cat.label;
      select.appendChild(opt);
    });
  }

  function populateModelSelect(select, catKey, savedValue) {
    select.innerHTML = "";
    const cat = state.categories.find(c => c.key === catKey);
    if (!cat) return;
    cat.models.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m.value;
      opt.textContent = m.display;
      select.appendChild(opt);
    });
    // Restore saved value if it exists in this category
    if (savedValue && cat.models.some(m => m.value === savedValue)) {
      select.value = savedValue;
    }
  }

  // Collapse the internal method array into the single-select UI value.
  function methodMode() {
    const s = state.method.includes("semantic");
    const k = state.method.includes("keyword");
    return s && k ? "hybrid" : s ? "semantic" : "keyword";
  }

  function applyUIFromState() {
    if (dom.searchOptionsDetails) dom.searchOptionsDetails.open = state.searchOptionsOpen;
    const mode = methodMode();
    dom.methodToggle.querySelectorAll(".toggle-btn").forEach(b => b.classList.toggle("active", b.dataset.value === mode));
    // "Kata Kunci" (BM25) saling-eksklusif dengan mode tingkat lanjut (yang menata
    // model semantik). Soft-disable + tooltip biar jelas, bukan diam-diam turun ke simple.
    const kwBtn = dom.methodToggle.querySelector('.toggle-btn[data-value="keyword"]');
    if (kwBtn) {
      const kwBlocked = state.searchLevel === "advanced";
      kwBtn.classList.toggle("is-disabled", kwBlocked);
      kwBtn.setAttribute("aria-disabled", kwBlocked ? "true" : "false");
      const kwTitleKey = kwBlocked ? "tt_keyword_adv_disabled" : "tt_btn_keyword";
      kwBtn.setAttribute("data-i18n-title", kwTitleKey);
      kwBtn.title = t(kwTitleKey);
    }
    dom.compareToggle.querySelectorAll(".toggle-btn").forEach(b => b.classList.toggle("active", b.dataset.value === state.compareMode));
    // db is multi-select array
    dom.dbToggle.querySelectorAll(".toggle-btn").forEach(b => b.classList.toggle("active", state.db.includes(b.dataset.value)));
    if (dom.pitakaToggle) dom.pitakaToggle.querySelectorAll(".toggle-btn").forEach(b => b.classList.toggle("active", state.pitaka.includes(b.dataset.value)));
    dom.cbTitles.checked = state.includeTitles;
    if (dom.cbBlurbs) dom.cbBlurbs.checked = state.includeBlurbs;
    dom.cbGroup.checked = state.groupBySutta;
    dom.cbPreview.checked = state.showPreview;
    dom.searchControls.classList.toggle("simple-mode", state.searchLevel === "simple");
    if (dom.btnAdvancedToggle) {
      dom.btnAdvancedToggle.classList.toggle("active", state.searchLevel === "advanced");
      const disableAdv = !state.method.includes("semantic");
      dom.btnAdvancedToggle.disabled = disableAdv;
      dom.btnAdvancedToggle.style.opacity = disableAdv ? "0.35" : "1";
      dom.btnAdvancedToggle.style.cursor = disableAdv ? "not-allowed" : "pointer";
    }
    if (dom.btnEnsembleConfig) {
      const disableConf = state.searchLevel === "advanced" || !state.method.includes("semantic");
      dom.btnEnsembleConfig.disabled = disableConf;
      dom.btnEnsembleConfig.style.opacity = disableConf ? "0.35" : "1";
      dom.btnEnsembleConfig.style.cursor = disableConf ? "not-allowed" : "pointer";
    }
    updateModelRowVisibility();
  }

  function updateModelRowVisibility() {
    const isKw = !state.method.includes("semantic");
    dom.modelRow.classList.toggle("hidden", isKw);
    dom.modeGroup.classList.toggle("hidden", isKw);
    dom.model2Group.classList.toggle("hidden", state.compareMode !== "2");
    if (dom.advancedToggleGroup) {
      dom.advancedToggleGroup.classList.toggle("hidden", isKw);
    }
  }

  // ===== "Mungkin maksud Anda…" — query-language switch (Google-style) =====
  let lastLangBarData = null; // remember last search's lang info so the bar can
  // be re-rendered when the UI language changes
  function renderLangBar(sr) {
    const bar = dom.queryLangBar;
    if (!bar) return;
    lastLangBarData = sr || null;
    const lang = sr && sr.query_lang;
    if (lang !== "id" && lang !== "en") { bar.style.display = "none"; bar.innerHTML = ""; return; }
    const other = lang === "id" ? "en" : "id";
    const nameCur = t("lang_name_" + lang);
    const nameOther = t("lang_name_" + other);
    const leadKey = sr.query_lang_source === "manual" ? "lang_bar_manual" : "lang_bar_detected";
    const switchTxt = t("lang_bar_switch").replace("{x}", nameCur).replace("{y}", nameOther);
    bar.innerHTML =
      `<i data-lucide="languages" style="width:15px;height:15px;color:var(--text-muted);"></i>` +
      `<span>${t(leadKey)}: <strong>${nameCur}</strong></span>` +
      `<button type="button" id="btn-switch-lang" style="background:transparent;border:none;color:var(--accent);cursor:pointer;font-weight:600;font-size:0.85rem;text-decoration:underline;padding:0;">${switchTxt}</button>`;
    bar.style.display = "flex";
    bar.querySelector("#btn-switch-lang").addEventListener("click", () => {
      state.queryLangOverride = other;
      state.overrideForQuery = dom.searchInput.value.trim();
      doSearch(1);
    });
    refreshIcons();
  }

  // ========== Search ==========
  async function doSearch(page) {
    const query = dom.searchInput.value.trim();
    if (!query) return;
    // Reset language override whenever the query text changes (a fresh query
    // should be auto-detected again).
    if (state.overrideForQuery !== query) {
      state.queryLangOverride = null;
      state.overrideForQuery = query;
    }
    if (!page) { state.currentPage = 1; page = 1; }
    dom.resultsContainer.classList.add("hidden");
    if (dom.searchLegend) dom.searchLegend.classList.add("hidden");
    if (dom.queryLangBar) dom.queryLangBar.style.display = "none";
    dom.pagination.classList.add("hidden");
    dom.loadingState.classList.remove("hidden");
    try {
      const isSimple = state.searchLevel === "simple";
      const isDual = !isSimple && state.method.includes("semantic") && state.compareMode === "2";
      let searches;
      if (isSimple) {
        searches = [fetchSearch(query, !state.method.includes("semantic") ? state.allModels[0] : "ensemble", page)];
      } else {
        searches = [fetchSearch(query, !state.method.includes("semantic") ? state.allModels[0] : state.model1, page)];
        if (isDual) searches.push(fetchSearch(query, state.model2, page));
      }

      const results = await Promise.all(searches);
      renderResults(results, isDual);
      // "Mungkin maksud Anda…" bar — only present for the ensemble/semantic path
      renderLangBar(results[0]);
      // Pagination — tampilkan hanya kalau limit_top_k off dan ada banyak hasil
      const sr = results[0];
      const totalSutta = sr.total_sutta || 0;
      const totalHits = sr.total_hits || 0;
      if (!state.limitTopK && totalSutta > state.pageSize) {
        const totalPages = Math.ceil(totalSutta / state.pageSize);
        dom.pageInfo.textContent = `${state.currentPage} / ${totalPages}  ·  ${totalHits} hasil dalam ${totalSutta} sutta`;
        dom.btnPrevPage.disabled = state.currentPage <= 1;
        dom.btnNextPage.disabled = state.currentPage >= totalPages;
        dom.pagination.classList.remove("hidden");
      } else if (!state.limitTopK) {
        // tetap tampilkan info walau cuma 1 halaman
        dom.pageInfo.textContent = `${totalHits} hasil dalam ${totalSutta} sutta`;
        dom.pagination.classList.remove("hidden");
        dom.btnPrevPage.disabled = true;
        dom.btnNextPage.disabled = true;
      }
    } catch (e) {
      console.error("Search error:", e);
      if (e.message && e.message.includes("Tidak ada model ensemble")) {
        dom.resultsContainer.innerHTML = `<div class="empty-state">
          <p style="color:var(--danger); font-weight:600;"><i data-lucide="alert-triangle" style="width:24px;height:24px;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;"></i><span data-i18n="err_no_config">Konfigurasi model belum ada</span></p>
          <p>${e.message}</p>
          <button id="btn-open-ensemble-error" style="display:flex; align-items:center; gap:6px; margin:16px auto 0; padding:8px 16px; background:var(--bg-tertiary); border:1px solid var(--border-strong); border-radius:var(--radius-sm); color:var(--text-primary); cursor:pointer; font-size:0.9rem;">
            <i data-lucide="settings" style="width:16px; height:16px;"></i> <span data-i18n="config_search_engine">Konfigurasi Mesin Pencari</span>
          </button>
        </div>`;
        dom.resultsContainer.querySelector("#btn-open-ensemble-error").addEventListener("click", () => {
          if (dom.btnEnsembleConfig) dom.btnEnsembleConfig.click();
        });
      } else {
        dom.resultsContainer.innerHTML = `<div class="empty-state"><p>${t("error_prefix")}: ${e.message}<br>Pastikan sudah ada cache.<br>Periksa log di terminal.</p><button class="btn-retry">${t("btn_retry")}</button></div>`;
        dom.resultsContainer.querySelector(".btn-retry").addEventListener("click", () => doSearch());
      }
      dom.resultsContainer.classList.remove("hidden");
      if (dom.searchLegend) dom.searchLegend.classList.add("hidden");
      if (dom.queryLangBar) dom.queryLangBar.style.display = "none";
      refreshIcons();
    } finally {
      dom.loadingState.classList.add("hidden");
    }
  }
  async function fetchSearch(query, modelName, page) {
    const payload = {
      query, top_k: state.topK, model: modelName, db: state.db.join(","),
      method: state.method, include_titles: state.includeTitles,
      include_blurbs: state.includeBlurbs,
      show_preview: state.showPreview,
      pitaka: state.pitaka,
      limit_top_k: state.limitTopK, page: page || 1,
      page_size: state.pageSize,
    };
    // Manual query-language override ("did you mean …?"). When null, the
    // server auto-detects.
    if (state.queryLangOverride) payload.query_lang = state.queryLangOverride;
    if (modelName === "ensemble") {
      if (ensembleInitPromise) await ensembleInitPromise;
      loadEnsemblePrefs();
      payload.ensemble_config = ensembleCheckedModels;
    }
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.error) errMsg = errJson.error;
      } catch (err) { }
      throw new Error(errMsg);
    }
    return res.json();
  }

  // ========== Results ==========
  function buildHeaderHTML(slotIndex) {
    if (state.searchLevel === "simple" || !state.method.includes("semantic")) {
      const modeLabel = { hybrid: "Hybrid", semantic: "Makna", keyword: "Kata Kunci" }[methodMode()];
      return `<span class="cat-badge" style="background:var(--accent);color:#0f0f14">Mode Biasa</span><br>Pencarian ${modeLabel}`;
    }
    const catKey = slotIndex === 0 ? state.cat1 : state.cat2;
    const modelVal = slotIndex === 0 ? state.model1 : state.model2;
    const catLabel = getCatLabel(catKey);
    const modelDisplay = modelVal.split(/[/\\]/).pop()
      .replace(/^(contrast-tsdae-pli-|contrast-tsdae-|contrast-pli-|contrast-|tsdae-pli-|tsdae-)/, '');
    return `<span class="cat-badge ${catKey}">${catLabel}</span><br>${modelDisplay}`;
  }

  function renderResults(searchResults, isDual) {
    const container = dom.resultsContainer;
    container.innerHTML = "";
    container.classList.remove("hidden", "single-mode", "dual-mode");
    const renderCtx = { method: state.method, query: dom.searchInput.value.trim() };
    if (isDual) {
      container.classList.add("dual-mode");
      searchResults.forEach((sr, i) => {
        const col = document.createElement("div"); col.className = "results-column";
        const header = document.createElement("div"); header.className = "results-column-header";
        header.innerHTML = `Model ${i + 1}: ${buildHeaderHTML(i)}`;
        //header.innerHTML = `${buildHeaderHTML(i)}`;
        col.appendChild(header);
        renderSuttaCards(col, sr.results || [], state.groupBySutta, renderCtx);
        container.appendChild(col);
      });
    } else {
      container.classList.add("single-mode");
      const sr = searchResults[0];
      if (state.searchLevel === "advanced" && state.method.includes("semantic")) {
        const header = document.createElement("div"); header.className = "results-column-header";
        header.innerHTML = `Model: ${buildHeaderHTML(0)}`;
        container.appendChild(header);
      }
      renderSuttaCards(container, sr.results || [], state.groupBySutta, renderCtx);
    }
    if (container.children.length === 0) {
      container.innerHTML = `<div class="empty-state"><p>${t("no_results")}</p><button class="btn-retry">${t("btn_retry")}</button></div>`;
      container.querySelector(".btn-retry").addEventListener("click", () => doSearch());
      if (dom.searchLegend) dom.searchLegend.classList.add("hidden");
    } else {
      if (dom.searchLegend) {
        dom.searchLegend.classList.remove("hidden");
        const hasSemantic = state.method.includes("semantic");
        const hasKeyword = state.method.includes("keyword");
        const simEl = document.getElementById("legend-similarity");
        const cntEl = document.getElementById("legend-count");
        if (simEl) simEl.style.display = hasSemantic ? "" : "none";
        if (cntEl) cntEl.style.display = hasKeyword ? "" : "none";
      }
    }
    refreshIcons();
  }
  // Use shared rendering from DK (common.js), adding note button per fragment
  function renderSuttaCards(parent, results, grouped, renderCtx) {
    const ctx = Object.assign({ showPreview: state.showPreview }, renderCtx);
    DK.renderSuttaCardsTo(parent, results, grouped, ctx, (fragEl, frag, sutta) => {
      const addBtn = document.createElement("button");
      addBtn.className = "btn-add-note";
      addBtn.textContent = t("btn_add_note");
      addBtn.setAttribute("data-i18n", "btn_add_note");
      addBtn.addEventListener("click", (e) => addFragmentToNote(frag, sutta, e.currentTarget));
      fragEl.appendChild(addBtn);
    });
  }

  // ========== Add Fragment to Note ==========
  function addFragmentToNote(frag, sutta, anchorEl) {
    const pickedLang = [DK.state.lang, 'id', 'en', 'pli'].find(lang => frag.texts && frag.texts[lang]);
    const texts = pickedLang ? { [pickedLang]: frag.texts[pickedLang] } : (frag.texts || {});
    DK.showNotePicker({
      type: "sutta",
      data: {
        sutta_id: sutta.sutta_id,
        formatted_id: sutta.formatted_id,
        sutta_name: sutta.sutta_name || "",
        ref: frag.ref,
        ref_display: frag.author === "blurb" ? "sinopsis" : (frag.ref_display || frag.ref.join(", ")),
        author: frag.author || "",
        source: frag.source || "",
        texts,
        parts: frag.parts || null,
        parts_lang: (frag.parts && pickedLang) ? pickedLang : null,
        available_links: sutta.available_links || {},
      },
    }, anchorEl);
  }

  // ========== Init ==========
  function init() {
    loadPrefs();
    initLang();

    // Header kolom hasil (sticky) harus nempel TEPAT di bawah #search-bar yang juga
    // sticky di atasnya. Hitung offset dari tinggi search-bar aktual (tahan resize/wrap)
    // alih-alih angka ajaib yang bikin header ketutup ("numpuk").
    const _searchBarEl = document.getElementById("search-bar");
    const updateResultsStickyTop = () => {
      if (!_searchBarEl) return;
      const top = Math.max(0, _searchBarEl.offsetHeight - 10); // search-bar sticky di top:-10px
      document.documentElement.style.setProperty("--results-sticky-top", top + "px");
    };
    updateResultsStickyTop();
    requestAnimationFrame(updateResultsStickyTop);
    window.addEventListener("resize", updateResultsStickyTop);

    if (dom.methodToggle) {
      setupToggle(dom.methodToggle, async (v) => {
        const oldMethod = state.method, oldLevel = state.searchLevel;
        // UI is single-select (hybrid | semantic | keyword); state.method stays
        // an array so the backend + downstream .includes() checks are unchanged.
        state.method = v === "hybrid" ? ["semantic", "keyword"] : [v];
        if (v === "keyword") state.searchLevel = "simple";
        if (await clearResults() === false) {
          state.method = oldMethod; state.searchLevel = oldLevel;
          applyUIFromState(); return false;
        }
        applyUIFromState();
        updateSearchPlaceholder();
        savePrefs();
      });
      setupToggle(dom.dbToggle, async (v) => { if (await clearResults() === false) return false; state.db = Array.isArray(v) ? v : [v]; savePrefs(); });
      if (dom.pitakaToggle) setupToggle(dom.pitakaToggle, async (v) => { if (await clearResults() === false) return false; state.pitaka = Array.isArray(v) ? v : [v]; savePrefs(); });
      setupToggle(dom.compareToggle, async (v) => {
        const old = state.compareMode;
        state.compareMode = v;
        if (await clearResults() === false) {
          state.compareMode = old; return false;
        }
        updateModelRowVisibility(); savePrefs();
      });

      if (dom.btnResetOpts) {
        dom.btnResetOpts.addEventListener("click", async () => {
          if (await DK.confirm(t("confirm_reset_opts"))) {
            localStorage.removeItem(PREFS_KEY);
            window.location.reload();
          }
        });
      }

      dom.cat1Select.addEventListener("change", async (e) => {
        const oldCat = state.cat1, oldModel = state.model1;
        state.cat1 = e.target.value;
        populateModelSelect(dom.model1Select, state.cat1, "");
        state.model1 = dom.model1Select.value || "";
        if (await clearResults() === false) {
          state.cat1 = oldCat; state.model1 = oldModel;
          dom.cat1Select.value = oldCat;
          populateModelSelect(dom.model1Select, oldCat, oldModel);
          return;
        }
        savePrefs();
      });
      dom.cat2Select.addEventListener("change", async (e) => {
        const oldCat = state.cat2, oldModel = state.model2;
        state.cat2 = e.target.value;
        populateModelSelect(dom.model2Select, state.cat2, "");
        state.model2 = dom.model2Select.value || "";
        if (await clearResults() === false) {
          state.cat2 = oldCat; state.model2 = oldModel;
          dom.cat2Select.value = oldCat;
          populateModelSelect(dom.model2Select, oldCat, oldModel);
          return;
        }
        savePrefs();
      });
      dom.model1Select.addEventListener("change", async (e) => {
        const old = state.model1; state.model1 = e.target.value;
        if (await clearResults() === false) { state.model1 = old; dom.model1Select.value = old; return; }
        savePrefs();
      });
      dom.model2Select.addEventListener("change", async (e) => {
        const old = state.model2; state.model2 = e.target.value;
        if (await clearResults() === false) { state.model2 = old; dom.model2Select.value = old; return; }
        savePrefs();
      });
      dom.btnPrevPage.addEventListener("click", () => { if (state.currentPage > 1) { state.currentPage--; doSearch(state.currentPage); } });
      dom.btnNextPage.addEventListener("click", () => { state.currentPage++; doSearch(state.currentPage); });
      dom.cbTitles.addEventListener("change", async (e) => { if (await clearResults() === false) { e.target.checked = !e.target.checked; return; } state.includeTitles = e.target.checked; savePrefs(); });
      if (dom.cbBlurbs) dom.cbBlurbs.addEventListener("change", async (e) => { if (await clearResults() === false) { e.target.checked = !e.target.checked; return; } state.includeBlurbs = e.target.checked; savePrefs(); });
      dom.cbGroup.addEventListener("change", async (e) => { if (await clearResults() === false) { e.target.checked = !e.target.checked; return; } state.groupBySutta = e.target.checked; savePrefs(); });
      dom.cbPreview.addEventListener("change", async (e) => { if (await clearResults() === false) { e.target.checked = !e.target.checked; return; } state.showPreview = e.target.checked; savePrefs(); });
      dom.searchBtn.addEventListener("click", () => doSearch());
      dom.searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

      if (dom.btnAdvancedToggle) {
        dom.btnAdvancedToggle.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const oldLevel = state.searchLevel;
          state.searchLevel = state.searchLevel === "simple" ? "advanced" : "simple";
          if (await clearResults() === false) {
            state.searchLevel = oldLevel;
            return;
          }
          savePrefs();
          applyUIFromState();
        });
      }

      // Remember whether the "Opsi Pencarian" panel is expanded or collapsed.
      if (dom.searchOptionsDetails) {
        dom.searchOptionsDetails.addEventListener("toggle", () => {
          if (state.searchOptionsOpen === dom.searchOptionsDetails.open) return;
          state.searchOptionsOpen = dom.searchOptionsDetails.open;
          savePrefs();
        });
      }
      /* Info-tip toggle (for mobile — title attr doesn't work on touch) */
      let activePopup = null;
      document.querySelectorAll(".info-tip-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (activePopup) { activePopup.remove(); activePopup = null; }
          const popup = document.createElement("div");
          popup.className = "info-tip-popup";
          popup.textContent = btn.getAttribute("title");
          btn.closest(".control-group, .control-group-options").appendChild(popup);
          const rect = popup.getBoundingClientRect();
          if (rect.right > window.innerWidth - 8) {
            popup.style.left = "auto";
            popup.style.right = "0";
          }
          activePopup = popup;
        });
      });
      document.addEventListener("click", () => {
        if (activePopup) { activePopup.remove(); activePopup = null; }
      });

      if (dom.btnEnsembleConfig) {
        dom.btnEnsembleConfig.addEventListener("click", openEnsembleManager);
      }
      if (dom.btnCloseEnsemble) {
        dom.btnCloseEnsemble.addEventListener("click", () => {
          if (dom.ensembleManager.close) dom.ensembleManager.close();
          else dom.ensembleManager.classList.add("hidden");
        });
      }
      if (dom.btnSaveEnsemble) {
        dom.btnSaveEnsemble.addEventListener("click", saveEnsembleManager);
      }
      if (dom.btnResetEnsemble) {
        dom.btnResetEnsemble.addEventListener("click", async () => {
          if (!await DK.confirm(t("confirm_reset_ensemble"))) return;
          dom.btnResetEnsemble.disabled = true;
          localStorage.removeItem(ENSEMBLE_PREFS_KEY);
          dom.ensembleCheckboxes.innerHTML = `<div style="text-align:center; padding:10px;"><div class="spinner" style="margin:auto;"></div></div>`;
          const def = await loadDefaultEnsembleConfig();
          if (def) {
            ensembleCheckedModels = def;
            saveEnsemblePrefs();
          }
          ensembleActiveQueryLang = "id";
          ensembleActiveTab = "id";
          renderEnsembleCheckboxes();
          dom.btnResetEnsemble.disabled = false;
        });
      }
      if (dom.ensembleManager) {
        dom.ensembleManager.addEventListener("click", (e) => {
          if (e.target === dom.ensembleManager) {
            if (dom.ensembleManager.close) dom.ensembleManager.close();
            else dom.ensembleManager.classList.add("hidden");
          }
        });
      }

      applyUIFromState();
      loadModels();
    }

    ensembleInitPromise = initEnsemblePrefs();

    /* Scroll-to-top button */
    const btnScrollTop = document.getElementById("btn-scroll-top");
    const scrollContainer = document.getElementById("search-scroll");
    if (btnScrollTop && scrollContainer) {
      scrollContainer.addEventListener("scroll", () => {
        btnScrollTop.classList.toggle("hidden", scrollContainer.scrollTop < 300);
      });
      btnScrollTop.addEventListener("click", () => {
        scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  }

  // ========== Ensemble Manager Logic ==========
  // Config is the nested matrix: { qlang: { target: [models] } }
  //   outer key = query language (id/en), inner key = target corpus (id/en/pli)
  const ENSEMBLE_PREFS_KEY = "dk-ensemble-config";
  const emptyRow = () => ({ id: [], en: [], pli: [] });
  let ensembleCheckedModels = { id: emptyRow(), en: emptyRow() };
  let ensembleActiveQueryLang = "id"; // which query-language row is being edited
  let ensembleActiveTab = "id";       // which target corpus tab is active
  let modelLangs = {}; // model_name -> "multi" | "en" | "indo"
  let ensembleInitPromise = null;

  // A model's lang_mode declares which languages it can encode. A model is
  // valid in cell (queryLang, target) only if it covers BOTH.
  const LANG_COVERAGE = { indo: ["id"], en: ["en", "pli"], multi: ["id", "en", "pli"] };
  function resolveModelLang(value) {
    return modelLangs[value] ||
      (Object.entries(modelLangs).find(([k]) => value.endsWith("/" + k)) || [])[1] || "";
  }
  function isModelValidFor(value, qlang, target) {
    const lm = resolveModelLang(value);
    const cov = LANG_COVERAGE[lm];
    if (!cov) return true; // unknown lang_mode -> don't warn
    return cov.includes(qlang) && cov.includes(target);
  }

  // Coerce any stored/served shape into the nested matrix.
  function normalizeEnsembleConfig(data) {
    data = data || {};
    const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
    if (isObj(data.id) || isObj(data.en)) {
      return {
        id: Object.assign(emptyRow(), data.id || {}),
        en: Object.assign(emptyRow(), data.en || {}),
      };
    }
    if (Array.isArray(data.id) || Array.isArray(data.en) || Array.isArray(data.pli)) {
      const flat = { id: data.id || [], en: data.en || [], pli: data.pli || [] };
      return { id: Object.assign({}, flat), en: Object.assign({}, flat) };
    }
    if (Array.isArray(data.models)) {
      const m = data.models;
      const flat = { id: [...m], en: [...m], pli: [...m] };
      return { id: Object.assign({}, flat), en: Object.assign({}, flat) };
    }
    return { id: emptyRow(), en: emptyRow() };
  }
  // Old per-target localStorage ({id:[],en:[],pli:[]}) can't express query-lang
  // routing — treat it as stale and re-adopt the server default.
  function isLegacyFlat(data) {
    return !!data && (Array.isArray(data.id) || Array.isArray(data.en) ||
      Array.isArray(data.pli) || Array.isArray(data.models));
  }

  async function loadDefaultEnsembleConfig() {
    try {
      const res = await fetch("/api/config?t=" + Date.now());
      if (res.ok) return normalizeEnsembleConfig(await res.json());
    } catch (e) { }
    return null;
  }

  async function initEnsemblePrefs() {
    try {
      const raw = localStorage.getItem(ENSEMBLE_PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isLegacyFlat(parsed)) {
          // Schema migration: discard old per-target config, adopt new default.
          localStorage.removeItem(ENSEMBLE_PREFS_KEY);
          const def = await loadDefaultEnsembleConfig();
          if (def) { ensembleCheckedModels = def; saveEnsemblePrefs(); }
        } else {
          ensembleCheckedModels = normalizeEnsembleConfig(parsed);
        }
      } else {
        const def = await loadDefaultEnsembleConfig();
        if (def) { ensembleCheckedModels = def; saveEnsemblePrefs(); }
      }
    } catch (e) { /* ignore */ }
  }

  function loadEnsemblePrefs() {
    try {
      const raw = localStorage.getItem(ENSEMBLE_PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Ignore stale legacy shape; keep whatever init() already migrated.
        if (!isLegacyFlat(parsed)) ensembleCheckedModels = normalizeEnsembleConfig(parsed);
      }
    } catch (e) { /* ignore */ }
  }

  function saveEnsemblePrefs() {
    localStorage.setItem(ENSEMBLE_PREFS_KEY, JSON.stringify(ensembleCheckedModels));
  }

  async function openEnsembleManager() {
    if (dom.ensembleManager.showModal) dom.ensembleManager.showModal();
    else dom.ensembleManager.classList.remove("hidden");
    dom.ensembleCheckboxes.innerHTML = `<div style="text-align:center; padding:10px;"><div class="spinner" style="margin:auto;"></div></div>`;
    try {
      const langRes = await fetch("/api/model-langs");
      modelLangs = langRes.ok ? await langRes.json() : {};

      if (ensembleInitPromise) await ensembleInitPromise;
      loadEnsemblePrefs();
      ensembleActiveQueryLang = "id";
      ensembleActiveTab = "id";
      renderEnsembleCheckboxes();
    } catch (e) {
      dom.ensembleCheckboxes.innerHTML = `<div style="color:var(--danger);">Gagal memuat konfigurasi.</div>`;
    }
  }

  function renderEnsembleCheckboxes() {
    dom.ensembleCheckboxes.innerHTML = "";

    if (!state.categories || state.categories.length === 0) {
      dom.ensembleCheckboxes.innerHTML = `<div style="color:var(--text-muted); font-size:0.85rem;">Tidak ada model makna tersedia.</div>`;
      return;
    }

    const qlang = ensembleActiveQueryLang;
    const target = ensembleActiveTab;
    const corpusLabels = { id: "ID", en: "EN", pli: "PLI" };
    const qLabels = { id: t("lang_name_id"), en: t("lang_name_en") };

    // Quick fade-out/in so a tab switch is visible.
    function fadeRerender() {
      dom.ensembleCheckboxes.style.transition = "opacity 0.12s ease";
      dom.ensembleCheckboxes.style.opacity = "0";
      setTimeout(() => {
        renderEnsembleCheckboxes();
        requestAnimationFrame(() => { dom.ensembleCheckboxes.style.opacity = "1"; });
      }, 120);
    }

    // --- Outer dimension: query language ---
    const qHint = document.createElement("div");
    qHint.style.cssText = "font-size:0.72rem; color:var(--text-muted); margin-bottom:5px; text-transform:uppercase; letter-spacing:0.04em; font-weight:700;";
    qHint.textContent = t("ens_query_lang");
    dom.ensembleCheckboxes.appendChild(qHint);

    const qBar = document.createElement("div");
    qBar.style.cssText = "display:flex; gap:6px; margin-bottom:6px;";
    ["id", "en"].forEach(q => {
      const isActive = q === qlang;
      const cnt = ["id", "en", "pli"].reduce((s, c) => s + ((ensembleCheckedModels[q] || {})[c] || []).length, 0);
      const b = document.createElement("button");
      b.dataset.qlang = q;
      b.innerHTML = `${qLabels[q]}${cnt ? ` <span style="font-size:0.7rem; opacity:0.7;">(${cnt})</span>` : ""}`;
      b.style.cssText = `flex:1; padding:7px 0; border:1px solid ${isActive ? "var(--accent)" : "var(--border)"}; border-radius:6px; cursor:pointer; font-weight:700; font-size:0.85rem; background:${isActive ? "var(--accent)" : "transparent"}; color:${isActive ? "#0f0f14" : "var(--text-muted)"};`;
      b.addEventListener("click", () => {
        if (ensembleActiveQueryLang === q) return;
        saveCurrentTabChecks();
        ensembleActiveQueryLang = q;
        fadeRerender();
      });
      qBar.appendChild(b);
    });
    dom.ensembleCheckboxes.appendChild(qBar);

    const qDesc = document.createElement("div");
    qDesc.style.cssText = "font-size:0.72rem; color:var(--text-muted); margin-bottom:12px;";
    qDesc.textContent = t("ens_query_lang_hint");
    dom.ensembleCheckboxes.appendChild(qDesc);

    // --- Inner dimension: target corpus ---
    const tabBar = document.createElement("div");
    tabBar.style.cssText = "display:flex; border-bottom:2px solid var(--border); margin-bottom:10px; gap:0;";
    ["id", "en", "pli"].forEach(corpus => {
      const isActive = corpus === target;
      const count = ((ensembleCheckedModels[qlang] || {})[corpus] || []).length;
      const btn = document.createElement("button");
      btn.innerHTML = `${corpusLabels[corpus]}${count ? ` <span style="font-size:0.7rem; opacity:0.7;">(${count})</span>` : ""}`;
      btn.dataset.corpus = corpus;
      btn.style.cssText = `flex:1; padding:8px 0; border:none; cursor:pointer; font-weight:600; font-size:0.9rem; transition:all 0.15s; background:transparent; border-bottom:2px solid ${isActive ? "var(--primary)" : "transparent"}; margin-bottom:-2px; color:${isActive ? "var(--primary)" : "var(--text-muted)"};`;
      btn.addEventListener("click", () => {
        if (ensembleActiveTab === corpus) return;
        saveCurrentTabChecks();
        ensembleActiveTab = corpus;
        fadeRerender();
      });
      tabBar.appendChild(btn);
    });
    dom.ensembleCheckboxes.appendChild(tabBar);

    const cellHead = document.createElement("div");
    cellHead.style.cssText = "font-size:0.78rem; color:var(--text-secondary); margin-bottom:10px;";
    cellHead.innerHTML = `Kueri <strong>${qLabels[qlang]}</strong> → Target <strong>${corpusLabels[target]}</strong>`;
    dom.ensembleCheckboxes.appendChild(cellHead);

    // --- Model checkboxes for the active (qlang, target) cell ---
    const checkedList = (ensembleCheckedModels[qlang] || {})[target] || [];
    let anyIncompat = false;

    state.categories.forEach(cat => {
      const validModels = cat.models.filter(m => m.value !== "keyword");
      if (validModels.length === 0) return;

      const groupDiv = document.createElement("div");
      groupDiv.style.marginBottom = "12px";

      const header = document.createElement("div");
      header.style.fontWeight = "600";
      header.style.fontSize = "0.9rem";
      header.style.color = "var(--text-secondary)";
      header.style.marginBottom = "6px";
      header.style.borderBottom = "1px solid var(--border)";
      header.style.paddingBottom = "4px";
      header.textContent = cat.label;
      groupDiv.appendChild(header);

      validModels.forEach(m => {
        const isChecked = checkedList.includes(m.value) ? "checked" : "";
        const lm = resolveModelLang(m.value);
        const langLabels = { "multi": "MULTI", "en": "EN", "indo": "ID" };
        const langColors = { "multi": "var(--accent)", "en": "#5b9bd5", "indo": "#e8a838" };
        const badge = lm ? `<span style="margin-left:auto; font-size:0.7rem; font-weight:700; padding:1px 6px; border-radius:4px; background:${langColors[lm] || "var(--border)"}; color:#0f0f14; white-space:nowrap;">${langLabels[lm] || lm}</span>` : "";
        // Validity for the active cell: keep checkable but mark + dim if not suitable.
        const incompat = !isModelValidFor(m.value, qlang, target);
        if (incompat) anyIncompat = true;
        const warn = incompat ? `<i data-lucide="alert-triangle" style="width:14px; height:14px; color:var(--accent); flex:none;"></i>` : "";
        const itemDiv = document.createElement("div");
        itemDiv.style.background = "var(--surface-hover)";
        itemDiv.style.padding = "6px 10px";
        itemDiv.style.borderRadius = "6px";
        itemDiv.style.marginBottom = "4px";
        itemDiv.style.opacity = incompat ? "0.55" : "1";
        if (incompat) itemDiv.title = t("ens_incompat_legend");
        itemDiv.innerHTML = `
          <label style="display:flex; align-items:center; cursor:pointer; gap:8px; font-size:0.85rem; width:100%;">
            <input type="checkbox" data-corpus="${target}" value="${m.value}" ${isChecked}>
            ${warn}<span style="word-break:break-all;">${m.display}</span>${badge}
          </label>
        `;
        itemDiv.querySelector("input").addEventListener("change", updateTabCounts);
        groupDiv.appendChild(itemDiv);
      });

      dom.ensembleCheckboxes.appendChild(groupDiv);
    });

    // --- Legend (only when at least one model is flagged in this cell) ---
    if (anyIncompat) {
      const legend = document.createElement("div");
      legend.style.cssText = "display:flex; align-items:center; gap:6px; margin-top:4px; font-size:0.72rem; color:var(--text-muted);";
      legend.innerHTML = `<i data-lucide="alert-triangle" style="width:13px; height:13px; color:var(--accent); flex:none;"></i><span>${t("ens_incompat_legend")}</span>`;
      dom.ensembleCheckboxes.appendChild(legend);
    }

    if (window.refreshIcons) window.refreshIcons();
  }

  function updateTabCounts() {
    const q = ensembleActiveQueryLang, tg = ensembleActiveTab;
    if (!ensembleCheckedModels[q]) ensembleCheckedModels[q] = emptyRow();
    ensembleCheckedModels[q][tg] = Array.from(
      dom.ensembleCheckboxes.querySelectorAll("input[type='checkbox']:checked")
    ).map(i => i.value);
    // Refresh target-tab counts (for the active query language)
    const corpusLabels = { id: "ID", en: "EN", pli: "PLI" };
    dom.ensembleCheckboxes.querySelectorAll("button[data-corpus]").forEach(btn => {
      const corpus = btn.dataset.corpus;
      const count = ((ensembleCheckedModels[q] || {})[corpus] || []).length;
      btn.innerHTML = `${corpusLabels[corpus]}${count ? ` <span style="font-size:0.7rem; opacity:0.7;">(${count})</span>` : ""}`;
    });
    // Refresh query-language counts (sum across targets)
    const qLabels = { id: t("lang_name_id"), en: t("lang_name_en") };
    dom.ensembleCheckboxes.querySelectorAll("button[data-qlang]").forEach(btn => {
      const ql = btn.dataset.qlang;
      const cnt = ["id", "en", "pli"].reduce((s, c) => s + ((ensembleCheckedModels[ql] || {})[c] || []).length, 0);
      btn.innerHTML = `${qLabels[ql]}${cnt ? ` <span style="font-size:0.7rem; opacity:0.7;">(${cnt})</span>` : ""}`;
    });
  }

  function saveCurrentTabChecks() {
    const inputs = dom.ensembleCheckboxes.querySelectorAll("input[type='checkbox']");
    if (inputs.length === 0) return; // nothing rendered (e.g. spinner) — don't clobber
    const q = ensembleActiveQueryLang, tg = ensembleActiveTab;
    if (!ensembleCheckedModels[q]) ensembleCheckedModels[q] = emptyRow();
    ensembleCheckedModels[q][tg] = Array.from(inputs).filter(i => i.checked).map(i => i.value);
  }

  async function saveEnsembleManager() {
    // Save checks from the currently visible tab first
    saveCurrentTabChecks();
    saveEnsemblePrefs();

    if (dom.ensembleManager.close) dom.ensembleManager.close();
    else dom.ensembleManager.classList.add("hidden");

    if (state.method.includes("semantic") && state.searchLevel === "simple" && dom.searchInput.value.trim() && !dom.resultsContainer.classList.contains("hidden")) {
      doSearch(1);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    init();
    if (dom.searchInput) {
      if (window.innerWidth > 768) {
        // Real focus on desktop
        setTimeout(() => dom.searchInput.focus(), 100);
      } else {
        // Fake focus animation on mobile (doesn't trigger keyboard)
        setTimeout(() => {
          const bar = dom.searchInput.closest('.search-bar-inner');
          if (bar) {
            bar.classList.add('fake-focus-anim');
            setTimeout(() => bar.classList.remove('fake-focus-anim'), 2500);
          }
        }, 100);
      }
    }
  });
})();
