/* ============================================================
   myDhamma --- Sutta Reader
   ============================================================ */

(function () {
  "use strict";

  const state = {
    lang: "id",
    suttaLang: "",
    suttaId: "",
    displayMode: localStorage.getItem("dk-display-mode") || "single",
    suttaData: null,
  };

  // Bar nav (breadcrumbs + header TINGGI) auto-hide dikelola BARENG oleh listener scroll (init)
  // & scrollToSegment (paksa sembunyi saat loncat ke #segmen -> hanya sticky PENDEK/kontrol yg
  // nempel). Dihoist ke sini supaya scrollToSegment bisa panggil setNav tanpa desync state.
  let _navHidden = false, _navLockUntil = 0;
  const NAV_LOCK_MS = 340;
  function setNav(hidden) {
    if (hidden === _navHidden) return;
    _navHidden = hidden;
    document.body.classList.toggle("reader-nav-hidden", hidden);
    _navLockUntil = performance.now() + NAV_LOCK_MS;  // tahan deteksi-arah selama transisi settle
  }

  const $ = s => document.querySelector(s);
  const dom = {
    subtitle: () => $("#reader-subtitle"),
    langToggle: () => $("#reader-lang-toggle"),
    displayToggle: () => $("#reader-display-toggle"),
    suttaLoading: () => $("#sutta-loading"),
    suttaError: () => $("#sutta-error"),
    suttaErrorMsg: () => $("#sutta-error-msg"),
    suttaBody: () => $("#sutta-body"),
  };

  function t(key) { return DK.t(key); }

  function parseUrl() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      state.suttaId = parts[0];
      state.suttaLang = parts[1];
      state.suttaAuthor = parts[2] || "";
    }
  }

  // ── Lang toggle: Dropdown for navigation (ID/EN/PLI URLs) ──
  function buildLangToggle() {
    const container = dom.langToggle();
    if (!container || !state.suttaData) return;

    const avail = state.suttaData.available_paths || {};
    // Pali dulu, lalu bahasa web terpilih, lalu EN, lalu sisanya (via DK.orderLangs).
    let html = `<select class="sutta-lang-dropdown">`;

    DK.orderLangs(Object.keys(avail)).forEach(l => {
      if (!avail[l]) return;
      avail[l].forEach(entry => {
        const uid = entry.uid;
        const source = entry.source;
        const url = `/${state.suttaId}/${l}/${uid}`;
        const isSelected = (state.suttaLang === l && state.suttaData.author === uid && state.suttaData.source === source);
        const selected = isSelected ? 'selected' : '';
        html += `<option value="${url}" data-source="${source}" ${selected}>${DK.langName(l)} — ${DK.authorLongName(uid, source)}</option>`;
      });
    });

    html += `</select>`;
    container.innerHTML = html;
    const sel = container.querySelector("select");
    if (sel) sel.addEventListener("change", () => {
      let url = sel.value;
      const opt = sel.options[sel.selectedIndex];
      // Bawa highlight HANYA bilara->bilara (segmen mdX selaras antar-terjemahan bilara). Sumber
      // html beda potongan walau label "mdX" sama -> JANGAN bawa (segmen ga align).
      const curSource = (state.suttaData && state.suttaData.source) || "";
      if (state.activeTarget && curSource === "bilara" && opt && opt.dataset.source === "bilara") {
        url += "#" + state.activeTarget;
      }
      window.location.href = url;
    });
  }

  function refreshDisplayToggle() {
    const container = dom.displayToggle();
    if (!container) return;
    DK.buildDisplayToggle(container, state.suttaLang, state.displayMode, mode => {
      state.displayMode = mode;
      localStorage.setItem("dk-display-mode", mode);
      refreshDisplayToggle();
      renderSutta();
      if (typeof DK.showToast === "function") {
        DK.showToast(mode === "sidebyside" ? DK.t("toast_mode_sidebyside") : DK.t("toast_mode_single"), 3000);
      }
      // Highlight masih aktif (belum di-scroll lewat) -> autoscroll BALIK ke segmen itu. renderSutta
      // nge-rebuild DOM, jadi scrollToSegment re-find + re-highlight + re-observe elemen barunya.
      // Kalau udah di-dismiss (di-scroll lewat) -> activeTarget null -> diam (sesuai keinginan user).
      if (state.activeTarget) scrollToSegment(state.activeTarget);
    }, state.suttaData && state.suttaData.segmented);
  }

  async function buildBreadcrumbs(data) {
    const nav = document.getElementById("sutta-breadcrumbs");
    if (!nav) return;
    try {
      const res = await fetch(`/api/breadcrumbs/${state.suttaId}`);
      if (!res.ok) return;
      const crumbs = await res.json();
      if (!crumbs.length) return;

      const langLabel = DK.langName(state.suttaLang);
      const authorLabel = state.suttaAuthor ? ` — ${DK.authorLongName(state.suttaAuthor, (state.suttaData && state.suttaData.source) || "")}` : "";
      const currentLabel = langLabel + authorLabel;

      let html = "";
      for (const crumb of crumbs) {
        html += `<a href="/?browse=${crumb.id}" class="breadcrumb-link">${crumb.label}</a>
                 <span class="breadcrumb-sep"><i data-lucide="chevron-right"></i></span>`;
      }
      // Link to suttaplex
      const suttaLabel = data.formatted_id + (data.sutta_name ? ` — ${data.sutta_name}` : "");
      html += `<a href="/${state.suttaId}" class="breadcrumb-link">${suttaLabel}</a>
               <span class="breadcrumb-sep"><i data-lucide="chevron-right"></i></span>`;
      html += `<span class="breadcrumb-current">${currentLabel}</span>`;

      nav.innerHTML = html;
      nav.style.display = "";
      const outer = document.getElementById("sutta-breadcrumbs-outer");
      if (outer) outer.style.display = "";
      if (window.lucide) window.lucide.createIcons({ root: nav });

      // Auto-scroll ke paling kanan supaya breadcrumb aktif terlihat; ResizeObserver
      // menjaga pin saat lebar berubah (panel AI/Catatan toggle, resize jendela).
      const pinEnd = () => { nav.scrollLeft = nav.scrollWidth; };
      setTimeout(pinEnd, 10);
      if (!nav._pinObs && window.ResizeObserver) {
        nav._pinObs = new ResizeObserver(pinEnd);
        nav._pinObs.observe(nav);
      }
    } catch (_) { /* breadcrumbs are non-critical */ }
  }

  async function loadSutta() {
    document.body.classList.add("is-loading-sutta");
    dom.suttaLoading().classList.remove("hidden");
    dom.suttaError().classList.add("hidden");
    dom.suttaBody().classList.add("hidden");
    try {
      const url = state.suttaAuthor ? `/api/sutta/${state.suttaId}/${state.suttaLang}/${state.suttaAuthor}` : `/api/sutta/${state.suttaId}/${state.suttaLang}`;
      const res = await fetch(url);
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || `HTTP ${res.status}`); }
      state.suttaData = await res.json();
      // state.displayMode is maintained based on user preference or local storage
      // const data = state.suttaData;

      // const displayTitle = data.formatted_id + (data.sutta_name ? ": " + data.sutta_name : "");
      const data = state.suttaData;
      const displayTitle = data.formatted_id + (data.sutta_name ? ": " + data.sutta_name : "");
      const nameHtml = data.sutta_name ? `<div class="dlg-sutta-name">${data.sutta_name}</div>` : "";

      // Handle logic author biar aman kalau kosong dan konsisten pakai 'source'
      const authorLabel = data.author
        ? ` — ${DK.authorLongName(data.author, data.source || "")}`
        : "";

      dom.subtitle().innerHTML = `<div class="dlg-title-top"><i data-lucide="book-open"></i> <span class="dlg-formatted-id">${data.formatted_id}</span></div>${nameHtml}`;
      if (window.lucide) window.lucide.createIcons({ root: dom.subtitle() });
      if (window.DK && DK.attachSuttaNameTooltip) DK.attachSuttaNameTooltip(dom.subtitle().querySelector(".dlg-sutta-name"));

      // Tombol "Tanya AI" pindah ke header global; tetap auto-tag pakai formatted_id
      // ("MN 10") yg lebih rapi drpd fallback sutta_id Jinja.
      const chatLink = document.getElementById("header-chat-ai");
      if (chatLink && data.formatted_id)
        chatLink.href = "/chat?tag=" + encodeURIComponent(data.formatted_id);

      const pageChatBtn = document.getElementById("sutta-page-chat-btn");
      if (pageChatBtn && data.formatted_id) {
        pageChatBtn.setAttribute("data-chat-tag", data.formatted_id);
      }

      // Inject langsung dengan format: ID [lang]: Nama --- Author --- myDhamma
      document.title = `${data.formatted_id} [${state.suttaLang}]${data.sutta_name ? `: ${data.sutta_name}` : ""}${authorLabel} — myDhamma`;

      // Expose sutta yg lagi dibuka -> panel chat global bisa jangkar "sutta ini" (page-context).
      window.DK_PAGE_CTX = {
        suttaId: state.suttaId,
        formattedId: data.formatted_id || "",
        lang: state.suttaLang,
        author: data.author || "",
        name: data.sutta_name || "",
      };

      try {
        let history = JSON.parse(localStorage.getItem("dk-recent-suttas") || "[]");
        const newItem = {
          id: state.suttaId,
          lang: state.suttaLang,
          author: data.author || "",
          formatted_id: data.formatted_id,
          name: data.sutta_name || "",
          // Tanpa timestamp, sort riwayat gabungan di home menganggap 0
          // -> item selalu kalah & tak pernah tampil.
          timestamp: Date.now()
        };
        history = history.filter(item => !(item.id === newItem.id && item.lang === newItem.lang));
        history.unshift(newItem);
        if (history.length > 5) history = history.slice(0, 5);
        localStorage.setItem("dk-recent-suttas", JSON.stringify(history));
      } catch (e) { console.error(e); }

      buildLangToggle();
      refreshDisplayToggle();
      renderSutta();
      await buildBreadcrumbs(data);

      document.body.classList.remove("is-loading-sutta");
      dom.suttaLoading().classList.add("hidden");
      dom.suttaBody().classList.remove("hidden");

      setTimeout(() => handleHashChange(true), 100);
    } catch (e) {
      document.body.classList.remove("is-loading-sutta");
      dom.suttaLoading().classList.add("hidden");
      dom.suttaErrorMsg().textContent = e.message || t("sutta_not_found");
      dom.suttaError().classList.remove("hidden");
    }
  }

  let _targetObs = null, _targetSeen = false;

  // Hapus highlight ("nyala") + lupakan target + bersihkan hash (biar glow :target ikut mati,
  // TANPA nge-scroll). Dipakai saat user nge-scroll LEWAT segmen highlight (= gamau liat lagi).
  function clearTarget() {
    document.querySelectorAll(".sutta-segment.target, .dlg-target").forEach(el => el.classList.remove("target", "dlg-target"));
    state.activeTarget = null;
    if (_targetObs) { _targetObs.disconnect(); _targetObs = null; }
    if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  // Pantau segmen highlight: begitu UDAH pernah keliatan lalu di-scroll keluar viewport ->
  // user gamau liat nyala lagi -> dismiss. _targetSeen cegah dismiss prematur saat smooth-scroll
  // belum sampai. root = #search-scroll (scroller halaman baca).
  function watchTargetDismiss(el) {
    if (_targetObs) { _targetObs.disconnect(); _targetObs = null; }
    if (!("IntersectionObserver" in window)) return;
    _targetSeen = false;
    const root = document.getElementById("search-scroll") || null;
    _targetObs = new IntersectionObserver(entries => {
      const e = entries[entries.length - 1];
      if (!e) return;
      if (e.isIntersecting) _targetSeen = true;
      else if (_targetSeen) clearTarget();
    }, { root, threshold: 0 });
    _targetObs.observe(el);
  }

  function scrollToSegment(anchorId, isInitial) {
    document.querySelectorAll(".sutta-segment.target, .dlg-target").forEach(el => {
      el.classList.remove("target", "dlg-target");
    });
    let target = document.getElementById(anchorId);
    if (!target && !anchorId.includes(":") && state.suttaId) {
      target = document.getElementById(state.suttaId + ":" + anchorId);
    }
    if (target) {
      target.classList.add("target");
      // Loncat ke segmen (mis. dari link §N) -> pastikan nav tidak disembunyikan.
      // smooth-scroll akan memicu event scroll berkali-kali (yg bisa disalahartikan
      // sebagai scroll ke bawah dan menyembunyikan nav). Kita pasang setNav(false)
      // dan perpanjang lock jadi 1500ms agar aman dari transisi scroll.
      setNav(false);
      _navLockUntil = performance.now() + 1500;

      // block:"start" + scroll-margin-top (CSS) -> segmen mendarat di ujung atas, bukan tengah.
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      state.activeTarget = target.id;
      watchTargetDismiss(target);
    }
    history.replaceState(null, "", "#" + anchorId);
  }

  function handleHashChange(isInitial = false) {
    const raw = window.location.hash.replace("#", "");
    if (!raw) return;
    // Prefix "~" = scroll ke posisi aja tanpa nyalain highlight (dari dialog "Buka di sini"
    // pas ga ada highlight aktif --- biar ga loncat balik ke segmen nyala lama).
    if (raw.startsWith("~")) {
      const el = document.getElementById(raw.slice(1));
      if (el) el.scrollIntoView({ block: "start" });
      history.replaceState(null, "", window.location.pathname + window.location.search);
    } else {
      scrollToSegment(raw, isInitial === true);
    }
  }

  function renderSutta() {
    if (!state.suttaData) return;
    DK.renderSegments(dom.suttaBody(), state.suttaData, state.suttaLang, state.displayMode, { idPrefix: "" });
    buildToc();
    buildSegList();
  }

  function buildToc() {
    const fab = document.getElementById("toc-fab");
    const list = document.getElementById("toc-list");
    if (!fab || !list || !state.suttaData) return;

    const entries = [];
    state.suttaData.segments.forEach(s => {
      const anchorId = s.ids && s.ids.length ? s.ids[0] : "";
      const ref = anchorId.includes(":") ? anchorId.split(":").pop() : anchorId;
      if (ref.startsWith("0.")) return;
      // a) a standalone heading/title segment
      if (s.text && s.heading >= 1 && s.heading <= 5) {
        entries.push({ anchorId, text: s.text, level: s.heading });
        return;
      }
      // b) a body heading folded into this content segment as a ".0" lead part
      const hp = (s.parts || []).find(p => p.heading >= 1 && p.heading <= 5);
      if (hp) {
        const htxt = String(hp.text || "").replace(/<[^>]+>/g, "").trim();
        if (htxt) entries.push({ anchorId, text: htxt, level: hp.heading });
      }
    });
    list.innerHTML = "";
    if (entries.length === 0) { fab.classList.add("hidden"); return; }

    entries.forEach(entry => {
      const item = document.createElement("a");
      item.className = `toc-item toc-h${entry.level}`;
      item.textContent = entry.text;
      if (entry.anchorId) {
        item.href = `#${entry.anchorId}`;
        item.addEventListener("click", (e) => {
          e.preventDefault();
          document.getElementById("toc-panel").classList.add("hidden");
          scrollToSegment(entry.anchorId);
        });
      }
      list.appendChild(item);
    });

    fab.classList.remove("hidden");
    if (window.lucide) window.lucide.createIcons({ root: fab });
  }

  function buildSegList() {
    const fab = document.getElementById("seg-fab");
    const list = document.getElementById("seg-list");
    if (!fab || !list || !state.suttaData) return;

    // Segmen tanpa terjemahan tapi ADA Pāli tetap masuk daftar (viewer kini menampilkan
    // Pāli-nya sbg fallback --- daftar harus mencerminkan apa yg tampil di halaman).
    const segs = state.suttaData.segments.filter(s =>
      s.ids && s.ids.length && (String(s.text || "").trim() || String(s.pli || "").trim()));
    list.innerHTML = "";
    if (segs.length === 0) { fab.classList.add("hidden"); return; }

    const addItem = (refLabel, text, anchorId, kind) => {
      const txt = String(text || "").replace(/<[^>]+>/g, "").trim();
      if (!txt) return;
      const item = document.createElement("a");
      const cls = kind === "heading" ? " seg-list-heading" : (kind === "speaker" ? " seg-list-speaker" : "");
      item.className = "toc-item seg-list-item" + cls;
      const refSpan = document.createElement("span");
      refSpan.className = "seg-list-ref";
      refSpan.textContent = refLabel;
      const textSpan = document.createElement("span");
      textSpan.className = "seg-list-text";
      textSpan.textContent = txt;
      item.appendChild(refSpan);
      item.appendChild(textSpan);
      if (anchorId) {
        item.href = `#${anchorId}`;
        item.addEventListener("click", e => {
          e.preventDefault();
          document.getElementById("seg-panel").classList.add("hidden");
          scrollToSegment(anchorId);
        });
      }
      list.appendChild(item);
    };

    const isHeadingPart = p => p.heading >= 1;
    const isSpeakerPart = p => !isHeadingPart(p) && /class=['"][^'"]*speaker/i.test(String(p.text || ""));

    segs.forEach(seg => {
      const anchorId = seg.ids[0];
      // Fallback Pāli MIRROR viewer: HANYA header (heading .0 dst.) yg kosong pakai
      // Pāli; body untranslated tetap kosong (elisi/peyyāla, jangan salin Pāli).
      // A standalone heading chunk (seg.heading>=1) is itself the heading entry ("§"),
      // mirroring the reader. Body headings are no longer folded into a content segment.
      if (seg.heading >= 1 && seg.heading <= 5) {
        addItem("§", seg.text || seg.pli, anchorId, "heading");
        return;
      }
      const parts = seg.parts || [];
      // Lead parts get their own entries --- heading ("§") and speaker ("»") --- like the reader.
      const leadParts = parts.filter(p => isHeadingPart(p) || isSpeakerPart(p));
      leadParts.forEach(p =>
        isHeadingPart(p)
          ? addItem("§", p.text || p.pli, anchorId, "heading")
          : addItem("»", p.text, anchorId, "speaker")
      );
      // Content keeps the clean chunk ref (e.g. "s78"); lead parts are dropped from it.
      const contentText = leadParts.length
        ? parts.filter(p => !isHeadingPart(p) && !isSpeakerPart(p)).map(p => p.text || "").join(" ")
        : seg.text;
      addItem(DK.compactRef(seg.ids), contentText, anchorId, "");
    });

    fab.classList.remove("hidden");
    if (window.lucide) window.lucide.createIcons({ root: fab });
  }

  window.addEventListener("hashchange", () => handleHashChange(false));

  // Tangkap klik pada referensi ID/segmen agar tidak memicu native instant scroll
  // yang bisa mengacaukan nav header melalui event scroll
  document.addEventListener("click", e => {
    const a = e.target.closest("a.id-ref, a.seg-ref, a.para-ref, a.sutta-ref");
    if (!a) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey) return;

    // Layout sempit (<=900px, SAMA dgn breakpoint reader & bindPanel): klik ref = niat LIHAT
    // teksnya, sedangkan scroll-nya in-page (URL sudah di sutta ini) -> semua overlay yg nutup
    // teks harus minggir: panel Daftar Isi/Segmen + drawer chat/Catatan (via jalur resmi DK,
    // history/backdrop ikut sinkron). Desktop dibiarkan (panel di tepi, tak menghalangi).
    if (window.matchMedia && window.matchMedia("(max-width: 900px)").matches) {
      ["seg-panel", "toc-panel"].forEach(id => {
        const p = document.getElementById(id);
        if (p) p.classList.add("hidden");
      });
      if (window.DK && DK.closeSidePanels) DK.closeSidePanels();
    }

    // Jika path tujuan sama dengan halaman saat ini
    const currentPath = window.location.pathname.replace(/\/$/, "");
    const targetPath = a.pathname.replace(/\/$/, "");

    if (currentPath === targetPath || currentPath.startsWith(targetPath + "/")) {
      e.preventDefault();
      history.pushState(null, "", a.href);
      const hash = a.hash.replace("#", "");
      if (hash) scrollToSegment(hash, false);
    }
  });

  function init() {
    state.lang = localStorage.getItem("dk-lang") || "id";
    parseUrl();
    loadSutta();

    function bindPanel(fabId, panelId, closeBtnId) {
      const fab = document.getElementById(fabId);
      const panel = document.getElementById(panelId);
      const closeBtn = document.getElementById(closeBtnId);
      if (!fab || !panel) return;
      fab.addEventListener("click", () => { panel.classList.toggle("hidden"); if (window.lucide) window.lucide.createIcons({ root: panel }); });
      if (closeBtn) closeBtn.addEventListener("click", () => panel.classList.add("hidden"));
      document.addEventListener("click", e => {
        if (window.innerWidth <= 900) {
          if (!panel.classList.contains("hidden") && !panel.contains(e.target) && e.target !== fab && !fab.contains(e.target))
            panel.classList.add("hidden");
        }
      });
    }
    bindPanel("toc-fab", "toc-panel", "toc-close");
    bindPanel("seg-fab", "seg-panel", "seg-close");
    // Kontrol font sekarang ada di dialog "Setelan" global (lihat common.js initFontSettings).

    // Swipe kiri/kanan (touch) -> sutta prev/next, aksi PERSIS tombol .sp-nav (termasuk
    // fallback suttaplex + toast ?na=). Target dibaca live dari tombol nav di DOM (satu
    // sumber dgn template); sisi tanpa tombol = panah redup no-op.
    if (window.DK && DK.attachSwipeNav) {
      DK.attachSwipeNav(document.getElementById("search-scroll"), document.body, () => {
        const p = document.querySelector("a.sp-nav-prev");
        const n = document.querySelector("a.sp-nav-next");
        return { prev: p && { href: p.href }, next: n && { href: n.href } };
      }, (_dir, tgt) => { window.location.href = tgt.href; });
    }

    const scrollTopBtn = document.getElementById("sutta-scroll-top");
    const scrollEl = document.getElementById("search-scroll");
    if (scrollEl) {
      // Auto-hide bar nav (breadcrumbs + header) saat scroll TURUN, munculkan saat NAIK
      // -> tombol back gampang dijangkau tanpa balik ke pucuk. Dekat pucuk (<120px)
      // selalu tampil. Kontrol (dropdown+toggle) tetap sticky.
      //
      // ANTI-"GOYANG": collapse nav mengubah tinggi konten DI ATAS viewport -> browser
      // (scroll anchoring) menyesuaikan scrollTop -> kalau ga dijaga, itu ke-baca sbg
      // scroll balik & memicu toggle sebaliknya = osilasi. Solusi: kunci deteksi-arah
      // selama transisi settle (LOCK_MS) sambil tetap re-sync lastY, jadi arah diukur
      // ulang dari posisi yg sudah tenang, bukan dari lonjakan reflow.
      let lastY = scrollEl.scrollTop;
      const NAV_TOP_ZONE = 120, DELTA = 10;
      scrollEl.addEventListener("scroll", () => {
        const y = scrollEl.scrollTop;
        if (scrollTopBtn) scrollTopBtn.classList.toggle("hidden", y < 200);
        if (performance.now() < _navLockUntil) { lastY = y; return; }  // abaikan reflow toggle / lock loncat-segmen
        if (y < NAV_TOP_ZONE) setNav(false);
        else if (y > lastY + DELTA) setNav(true);
        else if (y < lastY - DELTA) setNav(false);
        lastY = y;
      }, { passive: true });
    }

    // ── Notes panel toggle (desktop only) ──
    const notesFab = document.getElementById("notes-fab");
    const notesPanel = document.getElementById("notes-panel");
    const resizeHandle = document.getElementById("resize-handle");
    if (notesFab && notesPanel) {
      function applyNotesCollapsed(collapsed) {
        notesPanel.classList.toggle("notes-collapsed", collapsed);
        if (resizeHandle) resizeHandle.classList.toggle("notes-collapsed", collapsed);
        const iconName = collapsed ? "panel-right-open" : "panel-right-close";
        notesFab.innerHTML = `<i data-lucide="${iconName}" id="notes-fab-icon"></i>`;
        if (window.lucide) window.lucide.createIcons({ root: notesFab });
        notesFab.title = collapsed ? t("show_notes") : t("hide_notes");
      }

      const initCollapsed = localStorage.getItem("dk-notes-collapsed") === "1";
      applyNotesCollapsed(initCollapsed);

      notesFab.addEventListener("click", () => {
        const nowCollapsed = !notesPanel.classList.contains("notes-collapsed");
        localStorage.setItem("dk-notes-collapsed", nowCollapsed ? "1" : "0");
        applyNotesCollapsed(nowCollapsed);
      });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
