/* ============================================================
   Dhammakathika — Sutta Reader
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
    // Pali always first, then id, en
    const order = ['pli', 'id', 'en'];
    let html = `<select class="sutta-lang-dropdown" onchange="window.location.href=this.value">`;

    order.forEach(l => {
      if (!avail[l]) return;
      avail[l].forEach(entry => {
        const uid = entry.uid;
        const source = entry.source;
        const url = `/${state.suttaId}/${l}/${uid}`;
        const isSelected = (state.suttaLang === l && state.suttaData.author === uid && state.suttaData.source === source);
        const selected = isSelected ? 'selected' : '';
        html += `<option value="${url}" ${selected}>${DK.langName(l)} — ${DK.authorLongName(uid, source)}</option>`;
      });
    });

    html += `</select>`;
    container.innerHTML = html;
  }

  function refreshDisplayToggle() {
    const container = dom.displayToggle();
    if (!container) return;
    DK.buildDisplayToggle(container, state.suttaLang, state.displayMode, mode => {
      state.displayMode = mode;
      localStorage.setItem("dk-display-mode", mode);
      refreshDisplayToggle();
      renderSutta();
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

      // Auto-scroll ke paling kanan supaya breadcrumb aktif terlihat
      setTimeout(() => { nav.scrollLeft = nav.scrollWidth; }, 10);
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
      if (!state.suttaData.segmented) state.displayMode = "single";

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

      // Tag chat pakai formatted_id ("MN 10") yg lebih rapi drpd fallback sutta_id Jinja
      const chatLink = document.getElementById("reader-chat-link");
      if (chatLink && data.formatted_id)
        chatLink.href = "/chat?tag=" + encodeURIComponent(data.formatted_id);

      // Inject langsung dengan format: ID [lang]: Nama — Author — myDhamma
      document.title = `${data.formatted_id} [${state.suttaLang}]${data.sutta_name ? `: ${data.sutta_name}` : ""}${authorLabel} — myDhamma`;

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

      setTimeout(handleHashChange, 100);
    } catch (e) {
      document.body.classList.remove("is-loading-sutta");
      dom.suttaLoading().classList.add("hidden");
      dom.suttaErrorMsg().textContent = e.message || t("sutta_not_found");
      dom.suttaError().classList.remove("hidden");
    }
  }

  function scrollToSegment(anchorId) {
    document.querySelectorAll(".sutta-segment.target, .dlg-target").forEach(el => {
      el.classList.remove("target", "dlg-target");
    });
    const target = document.getElementById(anchorId);
    if (target) {
      target.classList.add("target");
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    history.replaceState(null, "", "#" + anchorId);
  }

  function handleHashChange() {
    const hash = window.location.hash.replace("#", "");
    if (hash) scrollToSegment(hash);
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

    const segs = state.suttaData.segments.filter(s => s.ids && s.ids.length && s.text);
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
      // A standalone heading chunk (seg.heading>=1) is itself the heading entry ("§"),
      // mirroring the reader. Body headings are no longer folded into a content segment.
      if (seg.heading >= 1 && seg.heading <= 5) {
        addItem("§", seg.text, anchorId, "heading");
        return;
      }
      const parts = seg.parts || [];
      // Lead parts get their own entries — heading ("§") and speaker ("»") — like the reader.
      const leadParts = parts.filter(p => isHeadingPart(p) || isSpeakerPart(p));
      leadParts.forEach(p =>
        isHeadingPart(p)
          ? addItem("§", p.text, anchorId, "heading")
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

  window.addEventListener("hashchange", handleHashChange);

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
        if (!panel.classList.contains("hidden") && !panel.contains(e.target) && e.target !== fab && !fab.contains(e.target))
          panel.classList.add("hidden");
      });
    }
    bindPanel("toc-fab", "toc-panel", "toc-close");
    bindPanel("seg-fab", "seg-panel", "seg-close");
    // Kontrol font sekarang ada di dialog "Setelan" global (lihat common.js initFontSettings).

    const scrollTopBtn = document.getElementById("sutta-scroll-top");
    const scrollEl = document.getElementById("search-scroll");
    if (scrollTopBtn && scrollEl) {
      scrollEl.addEventListener("scroll", () => {
        scrollTopBtn.classList.toggle("hidden", scrollEl.scrollTop < 200);
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
        notesFab.title = collapsed ? "Tampilkan catatan" : "Sembunyikan catatan";
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
