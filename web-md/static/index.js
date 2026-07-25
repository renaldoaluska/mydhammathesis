/* ============================================================
   myDhamma --- Search Page (index)
   Shared logic (theme, source, notes, resize) lives in common.js
   ============================================================ */
(function () {
  "use strict";
  // ========== i18n ==========
  function t(key, vars) {
    // Delegasi ke dict bersama di i18n.js via DK.t
    return window.DK && window.DK.t ? window.DK.t(key, vars) : key;
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
    // Override with URL params if present (for shareable links)
    try {
      const u = new URLSearchParams(window.location.search);
      if (u.has("m")) {
        const m = u.get("m");
        state.method = m === "hybrid" ? ["semantic", "keyword"] : [m];
        if (m === "keyword") state.searchLevel = "simple";
      }
      if (u.has("t")) state.db = u.get("t").split(",");
      if (u.has("p")) state.pitaka = u.get("p").split(",");
    } catch (e) { }
  }
  // ========== DOM ==========
  const $ = (s) => document.querySelector(s);
  const dom = {
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
    btnClearSearch: $("#btn-clear-search"),
    btnSearchAi: $("#btn-search-ai"),
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
    searchContextInfo: $("#search-context-info"),
    queryLangBar: $("#query-lang-bar"),
    mainNav: $("#main-nav"),
    aiCta: $("#ai-cta-container"),
    // Ensemble Manager
    btnEnsembleConfig: $("#btn-ensemble-config"),
    ensembleManager: $("#ensemble-manager"),
    btnCloseEnsemble: $("#btn-close-ensemble"),
    btnSaveEnsemble: $("#btn-save-ensemble"),
    btnResetEnsemble: $("#btn-reset-ensemble"),
    ensembleCheckboxes: $("#ensemble-checkboxes"),
    chkEnableRerank: $("#chk-enable-rerank"),
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
    // Kontrol bahasa kini dropdown global (#lang-select, dikelola common.js) ---
    // di sini cukup sinkronkan konten halaman.
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
    // Chips rekomendasi dirender dinamis per bahasa UI (bukan data-i18n).
    renderRecommendedQueries();
    // Konten hasil dibangun dinamis (bukan data-i18n) -> re-render agar ikut ganti bahasa.
    reRenderResults();
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
    if (dom.searchLegend) {
      dom.searchLegend.classList.add("hidden");
      if (dom.aiCta) dom.aiCta.classList.add("hidden");
    }
    if (dom.searchContextInfo) dom.searchContextInfo.classList.add("hidden");
    if (dom.queryLangBar) dom.queryLangBar.classList.add("hidden");
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
    // Lokalisasi via DK.catLabel (id: "Penyempurna N", en: "Refinement N") --- label
    // backend cuma fallback.
    if (!cat) return catKey;
    return (window.DK && DK.catLabel) ? DK.catLabel(cat) : cat.label;
  }
  function populateCatSelect(select) {
    select.innerHTML = "";
    state.categories.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat.key;
      opt.textContent = (window.DK && DK.catLabel) ? DK.catLabel(cat) : cat.label;
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
  // ========== Search ==========
  function renderLangBar(sr, query) {
    const bar = dom.queryLangBar;
    if (!bar) return;
    const detectedLang = sr && sr.query_lang;
    if (!detectedLang) {
      bar.classList.add("hidden");
      bar.innerHTML = "";
      return;
    }
    const nameDetected = t(detectedLang === "id" ? "db_lbl_id" : (detectedLang === "pli" ? "db_lbl_pli" : "db_lbl_en"));
    // Kueri user mentah -> WAJIB di-escape (masuk innerHTML) + dipotong biar bar tak
    // melar kalau kuerinya panjang banget.
    const rawQ = String(query || "").trim();
    const truncQ = rawQ.length > 40 ? rawQ.slice(0, 40).trimEnd() + "…" : rawQ;
    const safeQ = (window.DK && DK.esc) ? DK.esc(truncQ) : truncQ;
    const btnAddTxt = t("langbar_add", { name: nameDetected });
    const btnSwitchTxt = t("langbar_switch", { name: nameDetected });
    // If it's the only language selected, we don't need to show the bar at all
    if (state.db.length === 1 && state.db[0] === detectedLang) {
      bar.classList.add("hidden");
      bar.innerHTML = "";
      return;
    }
    const showAddBtn = !state.db.includes(detectedLang);
    // Maksud bar ini: kalau hasil terasa meleset, boleh jadi bahasa target salah
    // setting -> bingkai sbg pertanyaan yg nyolek problem + tawarin koreksinya.
    // Deteksi cuma dugaan; sudah dibingkai lunak di wording ("sepertinya"), jadi
    // tak perlu disclaimer terpisah.
    let html = `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">` +
      `<span>${t("langbar_detected", { name: nameDetected, query: safeQ })}</span></div>`;
    if (showAddBtn) {
      html += `<button type="button" id="btn-add-lang" style="background:transparent;border:none;color:var(--accent);cursor:pointer;font-weight:600;font-size:0.85rem;text-decoration:underline;padding:0;margin-left:8px;">${btnAddTxt}</button>` +
        `<span style="color:var(--text-muted); margin-left:8px;">${t("langbar_or")}</span>`;
    }
    html += `<button type="button" id="btn-switch-lang" style="background:transparent;border:none;color:var(--accent);cursor:pointer;font-weight:600;font-size:0.85rem;text-decoration:underline;padding:0;margin-left:8px;">${btnSwitchTxt}</button>`;
    bar.innerHTML = html;
    bar.classList.remove("hidden");
    if (typeof lucide !== "undefined") lucide.createIcons({ root: bar });
    if (showAddBtn) {
      bar.querySelector("#btn-add-lang").addEventListener("click", () => {
        if (!state.db.includes(detectedLang)) {
          state.db.push(detectedLang);
          if (dom.dbToggle) {
            dom.dbToggle.querySelectorAll(".toggle-btn").forEach(cb => {
              if (cb.dataset.value === detectedLang) cb.classList.add("active");
            });
          }
          savePrefs();
          if (typeof applyUIFromState === "function") applyUIFromState();
          doSearch(1);
        }
      });
    }
    bar.querySelector("#btn-switch-lang").addEventListener("click", () => {
      state.db = [detectedLang];
      if (dom.dbToggle) {
        dom.dbToggle.querySelectorAll(".toggle-btn").forEach(cb => {
          cb.classList.toggle("active", cb.dataset.value === detectedLang);
        });
      }
      savePrefs();
      if (typeof applyUIFromState === "function") applyUIFromState();
      doSearch(1);
    });
    bar.classList.remove("hidden");
    if (typeof lucide !== "undefined") lucide.createIcons({ root: bar });
  }
  let _searchAutoClose = false;
  async function doSearch(page) {
    const query = dom.searchInput.value.trim();
    if (!query) return;
    // Tutup panel Opsi Pencarian saat cari, KECUALI user memang suka biarkan terbuka.
    const optionsDetails = document.getElementById("search-options-details");
    if (optionsDetails && optionsDetails.open && !state.searchOptionsOpen) {
      optionsDetails.removeAttribute("open");
    }
    // Sync state to URL for sharing
    try {
      const params = new URLSearchParams(window.location.search);
      params.set("q", query);
      params.delete("browse"); // Clear browse mode if they search
      if (state.method.length === 2) params.set("m", "hybrid");
      else params.set("m", state.method[0] || "semantic");
      if (state.db.join(",") === "id,en,pli") params.delete("t");
      else params.set("t", state.db.join(","));
      if (state.pitaka.length === 3) params.delete("p");
      else params.set("p", state.pitaka.join(","));
      const newUrl = window.location.pathname + "?" + params.toString();
      window.history.replaceState(null, "", newUrl);
    } catch (e) { }
    if (!page) { state.currentPage = 1; page = 1; }
    // Save to search history
    try {
      let sh = JSON.parse(localStorage.getItem("dk-recent-searches") || "[]");
      // Convert old strings to objects
      sh = sh.map(item => typeof item === "string" ? { query: item, timestamp: 0 } : item);
      sh = sh.filter(q => q.query.toLowerCase() !== query.toLowerCase());
      sh.unshift({ query: query, timestamp: Date.now() });
      if (sh.length > 5) sh = sh.slice(0, 5);
      localStorage.setItem("dk-recent-searches", JSON.stringify(sh));
      if (typeof renderCombinedHistory === "function") renderCombinedHistory();
    } catch (e) { console.error("Search history error:", e); }
    dom.resultsContainer.classList.add("hidden");
    if (dom.searchLegend) {
      dom.searchLegend.classList.add("hidden");
      if (dom.aiCta) dom.aiCta.classList.add("hidden");
    }
    if (dom.searchContextInfo) dom.searchContextInfo.classList.add("hidden");
    if (dom.queryLangBar) dom.queryLangBar.classList.add("hidden");
    dom.pagination.classList.add("hidden");
    dom.loadingState.classList.remove("hidden");
    const customSuggestions = document.getElementById("custom-title-suggestions");
    if (customSuggestions) customSuggestions.classList.add("hidden");
    // Bawa user ke area hasil --- kueri bisa dipicu dari chip riwayat/rekomendasi
    // yang letaknya jauh di atas, atau dari pagination di bawah.
    // Karena halaman menggunakan overflow: hidden pada body dan scrolling ada di dalam #search-scroll,
    // window.scrollTo() tidak berfungsi. Kita harus scroll elemen #search-scroll.
    const searchScrollEl = document.getElementById("search-scroll");
    const tabSearchEl = document.getElementById("tab-search");
    if (searchScrollEl && tabSearchEl) {
      const scrollRect = searchScrollEl.getBoundingClientRect();
      const tabRect = tabSearchEl.getBoundingClientRect();
      // Hitung posisi absolut di dalam kontainer scroll
      const relativeTop = tabRect.top - scrollRect.top + searchScrollEl.scrollTop;
      searchScrollEl.scrollTo({ top: relativeTop > 20 ? relativeTop - 20 : 0, behavior: "smooth" });
    } else {
      const searchBarEl = document.getElementById("search-bar");
      if (searchBarEl) searchBarEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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

      if (window.DK && window.DK.getSuttaIdsByExactTitle) {
        const exactMatches = await window.DK.getSuttaIdsByExactTitle(query);
        // Reverse array so when we unshift sequentially, the original order is preserved at the top
        for (const exactMatchInfo of exactMatches.reverse()) {
          let fetchedBlurbTexts = null;
          let fetchedPitaka = null;
          let fetchedCollName = null;
          let fetchedFormattedId = null;
          let hasFetched = false;

          for (let sr of results) {
            if (!sr.results) sr.results = [];
            const matchIndex = sr.results.findIndex(r => r.sutta_id === exactMatchInfo.id);
            if (matchIndex > 0) {
              const matchItem = sr.results.splice(matchIndex, 1)[0];
              sr.results.unshift(matchItem);
            } else if (matchIndex === -1) {
              if (!hasFetched) {
                try {
                  const infoRes = await fetch(`/api/sutta-translations/${exactMatchInfo.id}`);
                  if (infoRes.ok) {
                    const infoData = await infoRes.json();
                    fetchedPitaka = infoData.pitaka || "";
                    fetchedCollName = infoData.collection_name || "";
                    fetchedFormattedId = infoData.formatted_id || "";
                    
                    // Blurb dari /api/sutta-translations datang LENGKAP semua bahasa.
                    // Sinopsis cukup SATU bahasa (beda dgn terjemahan yg berguna
                    // disandingkan) — jadi ambil 1 saja, biar korpus multibahasa pun
                    // tak jadi dinding sinopsis. Pilih dari bahasa target terpilih
                    // (state.db); dahulukan bahasa web bila termasuk yg dipilih supaya
                    // tak pernah mismatch dgn bahasa yg sedang ditampilkan.
                    if (infoData.blurbs) {
                      const _order = state.db.includes(state.lang) ? [state.lang, ...state.db] : [...state.db];
                      if (!_order.includes("en")) _order.push("en");
                      const _pick = _order.find(l => infoData.blurbs[l]);
                      if (_pick) fetchedBlurbTexts = { [_pick]: infoData.blurbs[_pick] };
                    }
                  }
                } catch (e) { console.error(e); }
                hasFetched = true;
              }

              const fragments = [];
              if (fetchedBlurbTexts) {
                fragments.push({
                  author: "blurb",
                  texts: fetchedBlurbTexts,
                  score: 1.0,
                  ref: [exactMatchInfo.id]
                });
              } else {
                // Tak ada sinopsis utk bahasa terpilih -> tetap tampilkan kotak blurb +
                // tombol Buka, isinya placeholder miring "Tidak ada sinopsisnya"
                // (teks-nya dilokalkan di renderer via t("blurb_none")).
                fragments.push({
                  author: "blurb",
                  texts: {},
                  blurbNone: true,
                  blurbLang: state.lang,
                  score: 1.0,
                  ref: [exactMatchInfo.id]
                });
              }

              const displayNum = fetchedFormattedId || exactMatchInfo.id.toUpperCase();
              sr.results.unshift({
                sutta_id: exactMatchInfo.id,
                formatted_id: displayNum,
                sutta_name: exactMatchInfo.title,
                pitaka: fetchedPitaka,
                collection_name: fetchedCollName,
                fragments: fragments
              });
            }
          }
        }
      }

      lastRender = { results, isDual, query };   // simpan utk re-render saat ganti bahasa
      renderResults(results, isDual);
      renderLangBar(results[0], query);
      updatePageInfo(results, isDual);
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
        dom.resultsContainer.innerHTML = `<div class="empty-state"><p>${t("error_prefix")}: ${e.message}<br>${t("cache_hint")}</p><button class="btn-retry">${t("btn_retry")}</button></div>`;
        dom.resultsContainer.querySelector(".btn-retry").addEventListener("click", () => doSearch());
      }
      dom.resultsContainer.classList.remove("hidden");
      if (dom.searchLegend) {
        dom.searchLegend.classList.add("hidden");
        if (dom.aiCta) dom.aiCta.classList.add("hidden");
      }
      if (dom.searchContextInfo) dom.searchContextInfo.classList.add("hidden");
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
    if (modelName === "ensemble") {
      if (ensembleInitPromise) await ensembleInitPromise;
      loadEnsemblePrefs();
      payload.ensemble_config = ensembleCheckedModels;
      payload.use_reranker = ensembleRerank;
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
  // Nudge tooltip "Belum menemukan yang dicari?" --- kini nunjuk tab AI Chat di RAIL
  // tepi kanan (tombol header Tanya AI sudah tak ada). Tampil sekali per render saat
  // user scroll melewati kartu hasil ke-3, lalu hilang sendiri setelah beberapa detik.
  let headerNudgeShown = false;
  let headerNudgeEl = null;
  function showHeaderChatNudge() {
    if (localStorage.getItem("dk_nudge_dismissed") || localStorage.getItem("dhammachat_sessions")) return;
    const btn = document.getElementById("btn-chat-toggle");
    if (!btn || btn.offsetParent === null) return;   // tombol tak terlihat (mis. di-hide)
    if (!headerNudgeEl) {
      headerNudgeEl = document.createElement("div");
      headerNudgeEl.className = "header-chat-nudge";

      const txtSpan = document.createElement("span");
      txtSpan.className = "nudge-text";
      headerNudgeEl.appendChild(txtSpan);

      const closeBtn = document.createElement("button");
      closeBtn.className = "nudge-close";
      closeBtn.innerHTML = "&times;";
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        headerNudgeEl.classList.remove("show");
        const btn = document.getElementById("btn-chat-toggle");
        if (btn) btn.classList.remove("nudge-highlight");
        clearTimeout(headerNudgeEl._t);
        localStorage.setItem("dk_nudge_dismissed", "1");
      };
      headerNudgeEl.appendChild(closeBtn);

      document.body.appendChild(headerNudgeEl);
    }

    headerNudgeEl.querySelector(".nudge-text").textContent = state.lang === "en"
      ? "Still can't find what you need? Try to ask myDhamma AI here"
      : "Belum menemukan yang dicari? Coba tanya myDhamma AI di sini";

    const chatPanel = document.getElementById("chat-panel");
    const chatInput = document.querySelector(".chat-input");
    const isChatOpen = chatPanel && chatPanel.classList.contains("panel-open");
    const isInputEmpty = chatInput && chatInput.textContent.trim() === "";

    if (isChatOpen) {
      headerNudgeEl.classList.remove("arrow-right");
      headerNudgeEl.classList.add("arrow-down");
      const ir = chatInput.getBoundingClientRect();
      const boxWidth = 240;
      headerNudgeEl.style.left = Math.max(8, ir.left + (ir.width / 2) - (boxWidth / 2)) + "px";
      headerNudgeEl.style.right = "auto";
      headerNudgeEl.style.top = Math.max(8, ir.top - 65) + "px";

      if (dom.searchInput && dom.searchInput.value.trim() && isInputEmpty) {
        const textToType = dom.searchInput.value.trim();
        chatInput.textContent = "";
        chatInput.focus();

        let i = 0;
        if (chatInput._typeTimer) clearInterval(chatInput._typeTimer);

        chatInput._typeTimer = setInterval(() => {
          chatInput.textContent = textToType.slice(0, ++i);
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(chatInput);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
          chatInput.dispatchEvent(new Event("input", { bubbles: true }));

          if (i >= textToType.length) {
            clearInterval(chatInput._typeTimer);
          }
        }, 20); // 20ms per character
      }
    } else {
      headerNudgeEl.classList.remove("arrow-down");
      headerNudgeEl.classList.add("arrow-right");
      const r = btn.getBoundingClientRect();
      const boxWidth = 240;
      const boxLeft = Math.max(8, r.left - boxWidth - 12);
      headerNudgeEl.style.left = boxLeft + "px";
      headerNudgeEl.style.right = "auto";
      headerNudgeEl.style.top = Math.max(8, r.top + r.height / 2 - 24) + "px";
    }

    // paksa reflow biar transisi .show jalan walau dipanggil beruntun
    void headerNudgeEl.offsetWidth;
    headerNudgeEl.classList.add("show");
    if (!isChatOpen) {
      btn.classList.add("nudge-highlight");
    }
    clearTimeout(headerNudgeEl._t);
    headerNudgeEl._t = setTimeout(() => {
      headerNudgeEl.classList.remove("show");
      btn.classList.remove("nudge-highlight");
    }, 4500);
  }
  // Hasil terakhir yang dirender --- dipakai re-render saat bahasa UI diganti (live toggle).
  let lastRender = null;

  function updatePageInfo(searchResults, isDual) {
    const sr = searchResults[0];
    const sr2 = isDual ? searchResults[1] : null;
    const totalSutta = sr.total_sutta || 0;
    const totalHits = sr.total_hits || 0;
    const totalSutta2 = sr2 ? (sr2.total_sutta || 0) : 0;
    const totalHits2 = sr2 ? (sr2.total_hits || 0) : 0;
    // Dual: total halaman = MAX kedua model, biar kolom dgn hasil terbanyak tetap
    // bisa di-page sampai habis (kolom satunya kosong di halaman ekor = wajar).
    const maxSutta = Math.max(totalSutta, totalSutta2);
    if (state.limitTopK) return;
    if (maxSutta > state.pageSize) {
      const totalPages = Math.ceil(maxSutta / state.pageSize);
      dom.pageInfo.textContent = sr2
        ? t("results_page_dual", { page: state.currentPage, pages: totalPages, hits1: totalHits, sutta1: totalSutta, hits2: totalHits2, sutta2: totalSutta2 })
        : t("results_page", { page: state.currentPage, pages: totalPages, hits: totalHits, sutta: totalSutta });
      dom.btnPrevPage.disabled = state.currentPage <= 1;
      dom.btnNextPage.disabled = state.currentPage >= totalPages;
      dom.pagination.classList.remove("hidden");
    } else {
      // tetap tampilkan info walau cuma 1 halaman
      dom.pageInfo.textContent = sr2
        ? t("results_count_dual", { hits1: totalHits, sutta1: totalSutta, hits2: totalHits2, sutta2: totalSutta2 })
        : t("results_count", { hits: totalHits, sutta: totalSutta });
      dom.pagination.classList.remove("hidden");
      dom.btnPrevPage.disabled = true;
      dom.btnNextPage.disabled = true;
    }
  }

  // Re-render konten hasil yang dibangun dinamis (summary bar, header kolom, pageInfo,
  // lang-bar) memakai bahasa aktif. applyLang() hanya menyentuh elemen [data-i18n].
  function reRenderResults() {
    if (!lastRender || dom.resultsContainer.classList.contains("hidden")) return;
    renderResults(lastRender.results, lastRender.isDual);
    renderLangBar(lastRender.results[0], lastRender.query);
    updatePageInfo(lastRender.results, lastRender.isDual);
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
      container.innerHTML = `<div class="empty-state"><p>${t("no_results")}</p><p class="empty-state-hint">${t("no_results_hint")}</p><div class="empty-state-actions"><button class="btn-retry">${t("btn_retry")}</button><button class="btn-edit-options">${t("btn_edit_options")}</button></div></div>`;
      container.querySelector(".btn-retry").addEventListener("click", () => doSearch());
      container.querySelector(".btn-edit-options").addEventListener("click", openSearchOptions);
      if (dom.searchLegend) {
        dom.searchLegend.classList.add("hidden");
        if (dom.aiCta) dom.aiCta.classList.add("hidden");
      }
      // Bar "Opsi Pencarian" TETAP tampil saat hasil kosong --- justru di sinilah
      // user perlu lihat/ubah opsinya (metode, bahasa, pitaka).
      renderSearchSummary();
    } else {
      if (dom.searchLegend) {
        dom.searchLegend.classList.remove("hidden");
        // Header "Tanya AI" link bawa query aktif (?q=...) supaya chat lanjut dari pencarian ini.
        const q = dom.searchInput ? dom.searchInput.value.trim() : "";
        const headerChat = document.getElementById("header-chat-ai");
        if (headerChat) headerChat.href = q ? `/chat?q=${encodeURIComponent(q)}` : "/chat";
        // Single-mode: TANPA CTA inline --- nudge ke tombol header lewat tooltip saat scroll
        // (lihat scroll handler). Reset flag biar tooltip bisa muncul sekali per render.
        headerNudgeShown = false;
        // Dual-mode: CTA tetap di akhir container.
        if (dom.aiCta && isDual) {
          const aiBtn = dom.aiCta.querySelector(".btn-chat-ai-q");
          if (aiBtn) aiBtn.href = q ? `/chat?q=${encodeURIComponent(q)}` : "/chat";
          dom.aiCta.classList.remove("hidden");
          // Taruh CTA sebagai SIBLING setelah container (full-width), bukan child flex-row
          // (dulu jadi "kolom ke-3" yang gepeng di samping 2 kolom model).
          container.after(dom.aiCta);
        }
        const hasSemantic = state.method.includes("semantic");
        const hasKeyword = state.method.includes("keyword");
        const simEl = document.getElementById("legend-similarity");
        const cntEl = document.getElementById("legend-count");
        if (simEl) simEl.style.display = hasSemantic ? "" : "none";
        if (cntEl) cntEl.style.display = hasKeyword ? "" : "none";
        renderSearchSummary();
      }
    }
    refreshIcons();
  }

  // Buka panel "Opsi Pencarian", scroll ke sana, lalu highlight sekilas (biar user
  // langsung sadar di mana harus mengubah). Dipakai tombol di empty-state.
  function openSearchOptions() {
    const d = dom.searchOptionsDetails;
    if (!d) return;
    if (!d.open) { d.open = true; state.searchOptionsOpen = true; savePrefs(); }
    d.scrollIntoView({ behavior: "smooth", block: "center" });
    d.classList.remove("options-flash");
    void d.offsetWidth;                     // paksa reflow biar animasi bisa ulang
    d.classList.add("options-flash");
    setTimeout(() => d.classList.remove("options-flash"), 1600);
  }

  // Bar ringkas "Opsi Pencarian" di atas hasil (dipakai saat ada hasil MAUPUN kosong).
  function renderSearchSummary() {
    if (!dom.searchContextInfo) return;
    let methodText = t("btn_semantic");
    if (state.method.length === 2) {
      methodText = `${t("btn_hybrid")} (${t("btn_semantic")} & ${t("btn_keyword")})`;
    } else if (state.method.includes("keyword")) {
      methodText = t("btn_keyword");
    }
    const dbMap = { id: t("db_lbl_id"), en: t("db_lbl_en"), pli: t("db_lbl_pli") };
    let dbText = state.db.map(x => dbMap[x]).join(", ");
    let pitakaText = state.pitaka.map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(", ");
    let html = `<div style="display: flex; align-items: center; flex-wrap: wrap; line-height: 1.6;">
      <span style="font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-right: 14px;">${t("summary_title")}</span>
      <span style="margin-right: 14px;">${t("lbl_method")}: <strong>${methodText}</strong></span>
      <span style="margin-right: 14px;">${t("lbl_language")}: <strong>${dbText}</strong></span>
      <span>${t("lbl_pitaka")}: <strong>${pitakaText}</strong></span>
    </div>`;
    let checkIcon = `<i data-lucide="check" style="width:13px; height:13px; color: var(--accent);"></i>`;
    let xIcon = `<i data-lucide="x" style="width:13px; height:13px; color: var(--text-muted);"></i>`;
    let showTitles = state.includeTitles ? checkIcon : xIcon;
    let showBlurbs = state.includeBlurbs ? checkIcon : xIcon;
    let showGroup = state.groupBySutta ? checkIcon : xIcon;
    let showPreview = state.showPreview ? checkIcon : xIcon;
    html += `<div style="display: flex; align-items: center; flex-wrap: wrap; line-height: 1.6; opacity: 0.9;">`;
    html += `<span style="margin-right: 8px;">${t("lbl_options")}:</span>`;
    html += `<span style="display: inline-flex; align-items: center; gap: 3px; margin-right: 12px;">${showTitles} ${t("cb_titles")}</span>`;
    html += `<span style="display: inline-flex; align-items: center; gap: 3px; margin-right: 12px;">${showBlurbs} ${t("cb_blurbs")}</span>`;
    html += `<span style="display: inline-flex; align-items: center; gap: 3px; margin-right: 12px;">${showGroup} ${t("cb_group")}</span>`;
    html += `<span style="display: inline-flex; align-items: center; gap: 3px;">${showPreview} ${t("cb_preview")}</span>`;
    html += `</div>`;
    dom.searchContextInfo.innerHTML = html;
    if (typeof lucide !== "undefined") lucide.createIcons({ root: dom.searchContextInfo });
    if (!state.searchOptionsOpen) {
      dom.searchContextInfo.classList.remove("hidden");
    }
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
        ref_display: frag.author === "blurb" ? (window.DK && DK.t ? DK.t("legend_blurb") : "blurb") : (frag.ref_display || frag.ref.join(", ")),
        author: frag.author || "",
        source: frag.source || "",
        texts,
        parts: frag.parts || null,
        parts_lang: (frag.parts && pickedLang) ? pickedLang : null,
        available_links: sutta.available_links || {},
      },
    }, anchorEl);
  }
  // ========== Recommended Queries ==========
  // Pool kueri rekomendasi --- diuji ke /api/search (hybrid ensemble): top
  // hasilnya relevan secara tematik. Tampil 6 acak per muat halaman.
  // Per bahasa UI; index-paired (en[i] = padanan id[i]). Frasa EN mengikuti
  // idiom terjemahan korpus EN (mis. moralitas -> "virtue").
  // Sumber tunggal di common.js (DK), dipakai bersama halaman chat.
  const RECOMMENDED_QUERIES = (window.DK && window.DK.RECOMMENDED_QUERIES) || { id: [], en: [] };
  function renderRecommendedQueries() {
    const container = document.getElementById("recommended-queries");
    if (!container) return;
    const pool = [...(RECOMMENDED_QUERIES[state.lang] || RECOMMENDED_QUERIES.id)];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    container.innerHTML = "";
    pool.slice(0, 6).forEach((q, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      // chip-in + delay bertingkat: pop-in berurutan tiap render (termasuk tombol
      // "Saran Lain") --- animasinya `backwards` jadi chip tak kedip sebelum jatahnya.
      btn.className = "query-chip chip-in";
      btn.style.animationDelay = (i * 45) + "ms";
      btn.dataset.query = q;
      btn.textContent = q;
      btn.onclick = () => {
        dom.searchInput.value = q;
        dom.searchInput.dispatchEvent(new Event("input"));
        // Kueri rekomendasi didesain dan diuji menggunakan mode Hybrid.
        state.method = ["semantic", "keyword"];

        // Kueri rekomendasi: Nyalakan bahasa antarmuka saat ini saja sesuai permintaan pengguna.
        state.db = [state.lang];
        state.pitaka = ["sutta", "vinaya", "abhidhamma"];
        savePrefs();
        if (typeof applyUIFromState === "function") applyUIFromState();
        doSearch();
      };
      container.appendChild(btn);
    });
  }
  function renderCombinedHistory() {
    const container = document.getElementById("recent-sutta-container");
    if (!container) return;
    try {
      let combinedHistory = [];
      let suttas = JSON.parse(localStorage.getItem("dk-recent-suttas") || "[]");
      if (suttas.length === 0) {
        const oldVisitedStr = localStorage.getItem("dk-last-visited");
        if (oldVisitedStr) {
          try { suttas.push(JSON.parse(oldVisitedStr)); } catch (e) { }
        }
      }
      suttas.forEach(item => {
        if (!item.timestamp) item.timestamp = 0;
        item.type = "read";
        combinedHistory.push(item);
      });
      let searches = JSON.parse(localStorage.getItem("dk-recent-searches") || "[]");
      searches.forEach(item => {
        if (typeof item === "string") {
          combinedHistory.push({ type: "search", query: item, timestamp: 0 });
        } else {
          item.type = "search";
          if (!item.timestamp) item.timestamp = 0;
          combinedHistory.push(item);
        }
      });
      try {
        const cs = JSON.parse(localStorage.getItem("dhammachat_sessions"));
        if (cs && Array.isArray(cs.sessions)) {
          cs.sessions.forEach(s => {
            if (s.title && s.title !== "Obrolan Saya" && s.title !== "My Chat" && s.title !== "Obrolan Baru" && s.title !== "New Chat") {
              combinedHistory.push({
                type: "chat",
                id: s.id,
                title: s.title,
                timestamp: s.updatedAt || parseInt(s.id) || 0
              });
            }
          });
        }
      } catch (e) { }
      combinedHistory.sort((a, b) => b.timestamp - a.timestamp);
      combinedHistory = combinedHistory.slice(0, 8); // Take top 8 overall
      container.innerHTML = "";
      // Cap panjang KARAKTER label chip --- kueri pencarian / nama sutta / judul chat
      // bisa panjang banget, tanpa cap satu chip bisa makan hampir seluruh baris.
      const _trunc = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n).trimEnd() + "…" : s; };
      combinedHistory.forEach((item, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        // Pop-in berurutan (seragam sama chip rekomendasi): class chip-in + stagger
        // delay inline. animation `backwards` -> chip tak kedip sebelum jatahnya.
        btn.style.animationDelay = (i * 45) + "ms";
        if (item.type === "read") {
          if (!item.id) return;
          btn.className = "query-chip history-chip chip-in";
          let label = `${item.formatted_id}`;
          if (item.hash) {
            let hashStr = item.hash.replace(/^#/, '');
            const parts = hashStr.split(':');
            if (parts.length > 1) {
              const pfx = parts[0].toLowerCase();
              const idLow = item.id.toLowerCase();
              const pfxNorm = pfx.replace(/^pli-tv-/, '').replace(/^(bu|bi)-vb-/, '$1-');
              const idNorm = idLow.replace(/^pli-tv-/, '').replace(/^(bu|bi)-vb-/, '$1-');
              if (pfx === idLow || pfxNorm === idNorm) {
                parts.shift();
                hashStr = parts.join(':');
              }
            }
            label += `:${hashStr}`;
          }
          if (item.name) label += ` • ${_trunc(item.name, 32)}`;
          const meta = [];
          if (item.lang) meta.push(item.lang);
          if (item.author) meta.push(item.author);
          if (meta.length > 0) {
            label += ` <span style="opacity:0.65; font-size:0.85em; margin-left:2px;">(${meta.join("/")})</span>`;
          }
          btn.innerHTML = `<i data-lucide="book-open"></i> ${label}`;
          btn.onclick = () => {
            if (window.DK && window.DK.openSuttaDialog) {
              window.DK.openSuttaDialog(item.id, item.lang, item.author, item.hash);
            } else {
              window.location.href = "/" + item.id;
            }
          };
          container.appendChild(btn);
        } else if (item.type === "search") {
          if (!item.query) return;
          btn.className = "search-hist-chip history-chip chip-in";
          btn.setAttribute("data-query", item.query);
          btn.innerHTML = `<i data-lucide="search"></i> ${_trunc(item.query, 48)}`;
          btn.onclick = (e) => {
            e.preventDefault();
            dom.searchInput.value = item.query;
            dom.searchInput.dispatchEvent(new Event("input"));
            doSearch();
          };
          container.appendChild(btn);
        } else if (item.type === "chat") {
          if (!item.id || !item.title) return;
          btn.className = "query-chip history-chip ai-chat-hist-chip chip-in";
          btn.style.borderStyle = "dashed";
          btn.innerHTML = `<i data-lucide="sparkles"></i> ${_trunc(item.title, 40)}`;
          btn.onclick = (e) => {
            e.preventDefault();
            // Buka PANEL chat di room tsb tanpa pindah halaman. /chat?id= lama
            // 302 -> /?chat=1&id= (param diproses common.js) --- tetap jadi fallback.
            if (window.DK && window.DK.openChat) {
              window.DK.openChat({ session: item.id });
            } else {
              window.location.href = "/chat?id=" + item.id;
            }
          };
          container.appendChild(btn);
        }
      });
      if (combinedHistory.length > 0) {
        const wrapper = document.getElementById("recent-sutta-wrapper");
        if (wrapper) wrapper.classList.remove("hidden");
        else container.classList.remove("hidden");
        if (window.lucide) window.lucide.createIcons({ root: container });
      }
      // Chips berubah -> segarkan visibilitas/disabled chevron gulir riwayat.
      if (window.DK && window.DK._syncHistNav) window.DK._syncHistNav();
    } catch (e) { }
  }
  window.DK = window.DK || {};
  window.DK.renderCombinedHistory = renderCombinedHistory;

  // Chips Riwayat: scrollbar horizontal disembunyikan by-design & mouse tak punya roda
  // horizontal --- di desktop chips yang kepotong jadi TAK TERJANGKAU sama sekali
  // (mobile aman, bisa swipe). Kontrol VISIBLE = chevron kiri/kanan di section-divider
  // (tampil hanya saat overflow, disabled di ujung). Roda vertikal -> gulir horizontal
  // tetap dipasang sbg pelengkap; preventDefault HANYA saat benar-benar overflow &
  // gerakannya vertikal (trackpad horizontal asli & scroll halaman normal aman).
  function initHistoryScrollControls() {
    const el = document.getElementById("recent-sutta-container");
    if (!el) return;
    el.addEventListener("wheel", (e) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    }, { passive: false });

    const nav = document.getElementById("history-nav");
    const prev = document.getElementById("hist-prev");
    const next = document.getElementById("hist-next");
    if (!nav || !prev || !next) return;
    const page = () => Math.max(120, Math.round(el.clientWidth * 0.8));
    prev.addEventListener("click", () => el.scrollBy({ left: -page(), behavior: "smooth" }));
    next.addEventListener("click", () => el.scrollBy({ left: page(), behavior: "smooth" }));
    const sync = () => {
      const overflow = el.scrollWidth > el.clientWidth + 1;
      nav.style.display = overflow ? "" : "none";
      if (!overflow) return;
      prev.disabled = el.scrollLeft <= 0;
      next.disabled = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
    };
    el.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    // Chips dirender ulang oleh renderCombinedHistory (dipanggil juga dari luar via
    // DK.renderCombinedHistory) -> expose sync supaya state chevron ikut segar.
    window.DK._syncHistNav = sync;
    if (window.lucide) window.lucide.createIcons({ root: nav });
    sync();
  }

  // ========== Init ==========
  function init() {
    loadPrefs();
    initLang();
    renderCombinedHistory();
    initHistoryScrollControls();
    // Refresh chip rekomendasi: render ulang = sampel acak baru dari pool; ikon muter
    // sekali sbg feedback (class dicabut pas animasi kelar).
    const btnRefreshRecs = document.getElementById("btn-refresh-recs");
    if (btnRefreshRecs) {
      btnRefreshRecs.addEventListener("click", () => {
        renderRecommendedQueries();
        btnRefreshRecs.classList.remove("spinning");
        void btnRefreshRecs.offsetWidth;   // restart animasi walau diklik beruntun
        btnRefreshRecs.classList.add("spinning");
      });
      btnRefreshRecs.addEventListener("animationend", () => btnRefreshRecs.classList.remove("spinning"), true);
    }
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
      // Nudge tooltip ke tombol "Tanya AI" header: muncul sekali (per render) saat user scroll
      // melewati kartu hasil ke-3, lalu hilang sendiri. Kalau hasil < 3 kartu, pakai ambang scroll.
      const searchScrollEl = document.getElementById("search-scroll");
      if (searchScrollEl) {
        searchScrollEl.addEventListener("scroll", () => {
          if (headerNudgeShown) return;
          const third = dom.resultsContainer.querySelectorAll(".sutta-card")[2];
          const passed = third
            ? third.getBoundingClientRect().bottom < searchScrollEl.getBoundingClientRect().top
            : searchScrollEl.scrollTop > 400;
          if (passed) { headerNudgeShown = true; showHeaderChatNudge(); }
        }, { passive: true });
      }
      const updateClearBtn = () => {
        if (!dom.btnClearSearch) return;
        const val = dom.searchInput.value.trim();
        dom.btnClearSearch.classList.toggle("hidden", !val);
        if (dom.btnSearchAi) {
          dom.btnSearchAi.classList.toggle("hidden", !val);
          if (val) dom.btnSearchAi.setAttribute("data-chat-q", val);
          else dom.btnSearchAi.removeAttribute("data-chat-q");
        }
      };
      dom.searchInput.addEventListener("input", updateClearBtn);
      if (dom.btnClearSearch) {
        dom.btnClearSearch.addEventListener("click", () => {
          dom.searchInput.value = "";
          dom.searchInput.dispatchEvent(new Event("input"));
          dom.searchInput.focus();
          // Force clear search results (act as a "Reset" button for lay users)
          if (dom.resultsContainer) {
            dom.resultsContainer.innerHTML = "";
            dom.resultsContainer.classList.add("hidden");
          }
          if (dom.searchLegend) {
            dom.searchLegend.classList.add("hidden");
            if (dom.aiCta) dom.aiCta.classList.add("hidden");
          }
          if (dom.searchContextInfo) dom.searchContextInfo.classList.add("hidden");
          if (dom.queryLangBar) dom.queryLangBar.classList.add("hidden");
          if (dom.loadingState) dom.loadingState.classList.add("hidden");
          if (dom.pagination) dom.pagination.classList.add("hidden");
          // Clear URL query
          try {
            const u = new URLSearchParams(window.location.search);
            u.delete("q");
            const newUrl = window.location.pathname + (u.toString() ? "?" + u.toString() : "");
            window.history.replaceState(null, "", newUrl);
          } catch (e) { }
        });
        // Initial state check on load
        updateClearBtn();
      }
      dom.searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") doSearch();
      });
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
      // Penutupan otomatis oleh doSearch() TIDAK mengubah preferensi user;
      // hanya toggle manual (klik summary) yang disimpan ke prefs.
      if (dom.searchOptionsDetails) {
        dom.searchOptionsDetails.addEventListener("toggle", () => {
          const isOpen = dom.searchOptionsDetails.open;
          if (_searchAutoClose && !isOpen) {
            // doSearch() baru saja menutup panel — jangan timpa preferensi user.
            _searchAutoClose = false;
            return;
          }
          _searchAutoClose = false;
          if (state.searchOptionsOpen === isOpen) return;
          state.searchOptionsOpen = isOpen;
          savePrefs();
          if (dom.searchContextInfo && dom.resultsContainer && !dom.resultsContainer.classList.contains("hidden")) {
            if (state.searchOptionsOpen) {
              dom.searchContextInfo.classList.add("hidden");
            } else {
              dom.searchContextInfo.classList.remove("hidden");
            }
          }
        });
      }
      if (dom.searchContextInfo) {
        dom.searchContextInfo.addEventListener("click", () => {
          if (typeof DK !== "undefined" && DK.showToast) {
            DK.showToast(t("toast_options_hint"), 3500);
          }
        });
      }
      /* Info-tip toggle (for mobile --- title attr doesn't work on touch) */
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
  // Config FLAT: { target: [models] } (target = korpus id/en/pli).
  // Dimensi bahasa kueri dibuang --- semua model mydhamma multilingual
  // (warisan dhammakathika yang punya model spesifik bahasa).
  const ENSEMBLE_PREFS_KEY = "dk-ensemble-config";
  const ENSEMBLE_RERANK_KEY = "dk-ensemble-rerank";
  const emptyConfig = () => ({
    id: ["intfloat/multilingual-e5-base"],
    en: ["intfloat/multilingual-e5-base"],
    pli: ["intfloat/multilingual-e5-base"]
  });
  let ensembleCheckedModels = emptyConfig();
  let ensembleRerank = true;
  let ensembleActiveTab = "id";       // which target corpus tab is active
  let modelLangs = {}; // model_name -> "multi" | "en" | "indo"
  let ensembleInitPromise = null;
  // A model's lang_mode declares which languages it can encode.
  const LANG_COVERAGE = { indo: ["id"], en: ["en", "pli"], multi: ["id", "en", "pli"] };
  function resolveModelLang(value) {
    return modelLangs[value] ||
      (Object.entries(modelLangs).find(([k]) => value.endsWith("/" + k)) || [])[1] || "";
  }
  function isModelValidFor(value, target) {
    const lm = resolveModelLang(value);
    const cov = LANG_COVERAGE[lm];
    if (!cov) return true; // unknown lang_mode -> don't warn
    return cov.includes(target);
  }
  // Coerce any stored/served shape into the flat config.
  function normalizeEnsembleConfig(data) {
    data = data || {};
    const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
    // Bekas matrix {qlang:{target:[...]}} di localStorage lama --- ambil baris "id".
    if (isObj(data.id) || isObj(data.en)) {
      const row = isObj(data.id) ? data.id : data.en;
      return Object.assign(emptyConfig(), {
        id: row.id || [], en: row.en || [], pli: row.pli || [],
      });
    }
    if (Array.isArray(data.id) || Array.isArray(data.en) || Array.isArray(data.pli)) {
      return {
        id: (data.id && data.id.length > 0) ? data.id : ["intfloat/multilingual-e5-base"],
        en: (data.en && data.en.length > 0) ? data.en : ["intfloat/multilingual-e5-base"],
        pli: (data.pli && data.pli.length > 0) ? data.pli : ["intfloat/multilingual-e5-base"]
      };
    }
    if (Array.isArray(data.models) && data.models.length > 0) {
      return { id: [...data.models], en: [...data.models], pli: [...data.models] };
    }
    return emptyConfig();
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
        // normalizeEnsembleConfig sekalian migrasi format nested lama -> flat.
        ensembleCheckedModels = normalizeEnsembleConfig(JSON.parse(raw));
        saveEnsemblePrefs();
      } else {
        const def = await loadDefaultEnsembleConfig();
        if (def) { ensembleCheckedModels = def; saveEnsemblePrefs(); }
      }
    } catch (e) { /* ignore */ }
  }
  function loadEnsemblePrefs() {
    try {
      const raw = localStorage.getItem(ENSEMBLE_PREFS_KEY);
      if (raw) ensembleCheckedModels = normalizeEnsembleConfig(JSON.parse(raw));
      const rawRerank = localStorage.getItem(ENSEMBLE_RERANK_KEY);
      if (rawRerank !== null) ensembleRerank = rawRerank === "true";
    } catch (e) { /* ignore */ }
  }
  function saveEnsemblePrefs() {
    localStorage.setItem(ENSEMBLE_PREFS_KEY, JSON.stringify(ensembleCheckedModels));
    localStorage.setItem(ENSEMBLE_RERANK_KEY, ensembleRerank.toString());
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
      if (dom.chkEnableRerank) dom.chkEnableRerank.checked = ensembleRerank;
      ensembleActiveTab = "id";
      renderEnsembleCheckboxes();
    } catch (e) {
      dom.ensembleCheckboxes.innerHTML = `<div style="color:var(--danger);">${t("err_load_config")}</div>`;
    }
  }
  function renderEnsembleCheckboxes() {
    dom.ensembleCheckboxes.innerHTML = "";
    if (!state.categories || state.categories.length === 0) {
      dom.ensembleCheckboxes.innerHTML = `<div style="color:var(--text-muted); font-size:0.85rem;">${t("err_no_semantic_models")}</div>`;
      return;
    }
    const target = ensembleActiveTab;
    const corpusLabels = { id: "ID", en: "EN", pli: "PLI" };
    // Quick fade-out/in so a tab switch is visible.
    function fadeRerender() {
      dom.ensembleCheckboxes.style.transition = "opacity 0.12s ease";
      dom.ensembleCheckboxes.style.opacity = "0";
      setTimeout(() => {
        renderEnsembleCheckboxes();
        requestAnimationFrame(() => { dom.ensembleCheckboxes.style.opacity = "1"; });
      }, 120);
    }
    // --- Target corpus tabs ---
    const tabBar = document.createElement("div");
    tabBar.style.cssText = "position: sticky; top: -1px; background: var(--bg-primary); z-index: 10; display:flex; border-bottom:2px solid var(--border); margin-bottom:10px; gap:0;";
    ["id", "en", "pli"].forEach(corpus => {
      const isActive = corpus === target;
      const count = (ensembleCheckedModels[corpus] || []).length;
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
    // --- Model checkboxes for the active target corpus ---
    const checkedList = ensembleCheckedModels[target] || [];
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
      header.textContent = (window.DK && DK.catLabel) ? DK.catLabel(cat) : cat.label;
      groupDiv.appendChild(header);
      validModels.forEach(m => {
        const isChecked = checkedList.includes(m.value) ? "checked" : "";
        const lm = resolveModelLang(m.value);
        const langLabels = { "multi": "MULTI", "en": "EN", "indo": "ID" };
        const langColors = { "multi": "var(--accent)", "en": "#5b9bd5", "indo": "#e8a838" };
        const badge = lm ? `<span style="margin-left:auto; font-size:0.7rem; font-weight:700; padding:1px 6px; border-radius:4px; background:${langColors[lm] || "var(--border)"}; color:#0f0f14; white-space:nowrap;">${langLabels[lm] || lm}</span>` : "";
        // Validity for the active corpus: keep checkable but mark + dim if not suitable.
        const incompat = !isModelValidFor(m.value, target);
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
    ensembleCheckedModels[ensembleActiveTab] = Array.from(
      dom.ensembleCheckboxes.querySelectorAll("input[type='checkbox']:checked")
    ).map(i => i.value);
    // Refresh target-tab counts
    const corpusLabels = { id: "ID", en: "EN", pli: "PLI" };
    dom.ensembleCheckboxes.querySelectorAll("button[data-corpus]").forEach(btn => {
      const corpus = btn.dataset.corpus;
      const count = (ensembleCheckedModels[corpus] || []).length;
      btn.innerHTML = `${corpusLabels[corpus]}${count ? ` <span style="font-size:0.7rem; opacity:0.7;">(${count})</span>` : ""}`;
    });
  }
  function saveCurrentTabChecks() {
    const inputs = dom.ensembleCheckboxes.querySelectorAll("input[type='checkbox']");
    if (inputs.length === 0) return; // nothing rendered (e.g. spinner) --- don't clobber
    let list = Array.from(inputs).filter(i => i.checked).map(i => i.value);
    if (list.length === 0) {
      list = ["intfloat/multilingual-e5-base"];
      if (window.DK && DK.showToast) {
        DK.showToast(DK.getLang() === "en" ? "Cannot be empty, default model selected" : "Tidak boleh kosong, model utama otomatis dipilih");
      }
    }
    ensembleCheckedModels[ensembleActiveTab] = list;
  }
  async function saveEnsembleManager() {
    // Save checks from the currently visible tab first
    saveCurrentTabChecks();
    if (dom.chkEnableRerank) ensembleRerank = dom.chkEnableRerank.checked;
    saveEnsemblePrefs();
    if (dom.ensembleManager.close) dom.ensembleManager.close();
    else dom.ensembleManager.classList.add("hidden");
    if (state.method.includes("semantic") && state.searchLevel === "simple" && dom.searchInput.value.trim() && !dom.resultsContainer.classList.contains("hidden")) {
      doSearch(1);
    }
  }
  document.addEventListener("DOMContentLoaded", () => {
    init();
    const urlParams = new URLSearchParams(window.location.search);
    const isBrowsing = urlParams.has("browse");
    const initQuery = urlParams.get("q");
    if (initQuery) {
      if (dom.searchInput) {
        dom.searchInput.value = initQuery;
        dom.searchInput.dispatchEvent(new Event("input"));
      }
      doSearch(1);
    } else if (dom.searchInput && !isBrowsing) {
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