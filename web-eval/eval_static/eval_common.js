/* ============================================================
   Dhammakathika — Eval Shared Logic (loaded via eval_base.html)
   Handles: theme, source toggle
   ============================================================ */

(function () {
  "use strict";

  // ========== Shared i18n ==========
  const i18n = {
    id: {
      dlg_btn_ok: "OK",
      dlg_btn_cancel: "Batal",
      dlg_btn_continue: "Lanjutkan",
      dlg_btn_delete: "Hapus",
      btn_open_sutta: "Halaman Teks",
      footer_student: "Penyusun:",
      footer_supervisor: "Pembimbing:",
      title_its: "Institut Teknologi Sepuluh Nopember",
      title_stab: "Sekolah Tinggi Agama Buddha Kertarajasa",
      title_styab: "Sekolah Tinggi Agama Buddha Syailendra",
      nav_eval_full: "Asesmen",
      cb_seg_ref: "Segmen",
      btn_open_link: "Buka",
      btn_open_blurb: "Hlm. Teks",
      legend_segment: "Segmen Teks",
      legend_author: "Penerjemah",
      legend_similarity: "Kemiripan Makna",
      legend_count: "Kecocokan Kata Kunci",

      footer_tentang: "Tentang myDhamma",
      panel_sidebar: "Bilah Sisi",
      select_corpus: "— Pilih korpus —",
      hdr_app_title: "Evaluasi Relevansi",
      hdr_subtitle_gra: "Asesmen Pakar",
      hdr_subtitle_output: "Output Asesmen",
      set_fontsize: "Ukuran Teks",
    },
    en: {
      btn_open_sutta: "Text Page",
      footer_student: "Researcher:",
      footer_supervisor: "Supervisor:",
      title_its: "Sepuluh Nopember Institute of Technology",
      title_stab: "Kerataraja Buddhist College",
      title_styab: "Syailendra Buddhist College",
      nav_eval_full: "Assessment",
      panel_sidebar: "Sidebar",
      cb_seg_ref: "Segments",

      btn_open_link: "Open",
      btn_open_blurb: "View Text",
      legend_segment: "Text Segment",
      legend_author: "Translator",
      legend_similarity: "Semantic Match",
      legend_count: "Match Count",

      footer_tentang: "About myDhamma",
      select_corpus: "— Select corpus —",
      hdr_app_title: "Relevance Evaluation",
      hdr_subtitle_gra: "Expert Assessment",
      hdr_subtitle_output: "Assessment Output",
      set_fontsize: "Text Size",
    },
  };

  function getLang() { return localStorage.getItem("dk-lang") || "id"; }
  function t(key) { return (i18n[getLang()] || i18n.id)[key] || key; }

  window.refreshIcons = function () { if (window.lucide) lucide.createIcons(); };

  function applyCommonI18n() {
    const lang = getLang();
    const pill = document.getElementById("btn-lang-toggle");
    if (pill) {
      pill.setAttribute("data-active", lang);
      pill.querySelectorAll(".lang-pill-opt").forEach(o =>
        o.classList.toggle("active", o.dataset.lang === lang)
      );
    }
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const v = t(el.getAttribute("data-i18n"));
      if (v !== el.getAttribute("data-i18n")) el.textContent = v;
    });
    document.querySelectorAll("[data-i18n-html]").forEach(el => {
      const v = t(el.getAttribute("data-i18n-html"));
      if (v !== el.getAttribute("data-i18n-html")) el.innerHTML = v;
    });
    document.querySelectorAll("[data-i18n-tooltip]").forEach(el => {
      const v = t(el.getAttribute("data-i18n-tooltip"));
      if (v !== el.getAttribute("data-i18n-tooltip")) {
        el.setAttribute("data-tooltip", v);
      }
    });
    document.querySelectorAll("[data-i18n-title]").forEach(el => {
      const v = t(el.getAttribute("data-i18n-title"));
      if (v !== el.getAttribute("data-i18n-title")) el.setAttribute("title", v);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
      const v = t(el.getAttribute("data-i18n-placeholder"));
      if (v !== el.getAttribute("data-i18n-placeholder")) {
        el.setAttribute("placeholder", v);
      }
    });
    refreshIcons();
  }

  // ========== Shared State ==========
  const state = {};

  const $ = s => document.querySelector(s);

  // ========== Theme ==========
  function initTheme() {
    applyTheme(localStorage.getItem("dk-theme") || "light");
  }
  function toggleTheme() {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    localStorage.setItem("dk-theme", next);
    applyTheme(next);
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const pill = $("#btn-theme-toggle");
    if (!pill) return;
    pill.setAttribute("data-active", theme);
    pill.querySelectorAll(".theme-pill-opt").forEach(opt =>
      opt.classList.toggle("active", opt.dataset.theme === theme)
    );
  }


  function toShortId(id) {
    if (!id) return id;
    let s = String(id).trim().toLowerCase().replace(/^pli-tv-/, "").replace(/^(bu|bi)-vb-/, "$1-");
    return s;
  }
  function authorLongName(uid, source) {
    if (!uid || uid === "blurb") return uid;
    const map = source === "bilara"
      ? window.DK_BILARA_AUTHOR_NAMES
      : window.DK_EDITION_AUTHOR_NAMES;
    return (map && map[uid]) || uid;
  }
  function langName(uid) {
    if (!uid) return uid;
    return (window.DK_LANG_NAMES && window.DK_LANG_NAMES[uid]) || uid.toUpperCase();
  }

  function updateAllLinksInDOM() {
    document.querySelectorAll(".lang-tag").forEach(tag => {
      if (tag.tagName !== "A") return;
      const suttaId = tag.dataset.suttaId;
      const shortId = toShortId(suttaId);
      const firstRef = tag.dataset.firstRef || "";
      tag.target = "_self";
      if (tag.dataset.isBlurb) {
        tag.target = "_blank";
        tag.href = shortId ? `/${shortId}` : "";
        return;
      }
      if (tag.classList.contains("id")) {
        tag.href = shortId ? `/${shortId}/id${firstRef ? "#" + firstRef : ""}` : "";
        tag.title = `DK (ID)`;
      } else if (tag.classList.contains("en")) {
        tag.href = shortId ? `/${shortId}/en${firstRef ? "#" + firstRef : ""}` : "";
        tag.title = `DK (EN)`;
      } else if (tag.classList.contains("pli")) {
        tag.href = shortId ? `/${shortId}/pli${firstRef ? "#" + firstRef : ""}` : "";
        tag.title = `DK (PLI)`;
      }
    });
  }

  // ========== Utilities ==========
  function esc(s) {
    // Strip stray HTML tags (e.g. <j> from SuttaCentral), replace with space
    s = s.replace(/<[^>]*>/g, " ").replace(/\s{2,}/g, " ").trim();
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  // Compact ref IDs: ["mn1.1:1.2","mn1.1:1.3","mn1.1:1.4"] → "mn1.1:1.2-4"
  function compactRef(ids) {
    if (!ids || ids.length === 0) return "";
    const colonIdx = ids[0].indexOf(":");
    const suttaPrefix = colonIdx === -1 ? "" : ids[0].substring(0, colonIdx + 1);
    const anchors = ids.map(id => id.split(":").pop());
    if (anchors.length === 1) return suttaPrefix + anchors[0];

    const first = anchors[0];
    const last = anchors[anchors.length - 1];

    const firstDotIdx = first.lastIndexOf(".");
    const lastDotIdx = last.lastIndexOf(".");

    if (firstDotIdx !== -1 && lastDotIdx !== -1) {
      const firstPrefix = first.substring(0, firstDotIdx + 1);
      const lastPrefix = last.substring(0, lastDotIdx + 1);
      if (firstPrefix === lastPrefix) {
        return `${suttaPrefix}${first}-${last.substring(lastDotIdx + 1)}`;
      }
    }

    return `${suttaPrefix}${first}-${last}`;
  }

  // Toast notification — moves inside open <dialog> so it's above the top layer
  function showToast(msg, duration) {
    duration = duration || 2200;
    const openDialog = document.querySelector("dialog[open]");
    const container = openDialog || document.body;
    const existing = document.getElementById("dk-toast");
    if (existing && existing.parentElement !== container) existing.remove();
    let toast = document.getElementById("dk-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "dk-toast";
      container.appendChild(toast);
    }
    toast.textContent = msg;
    clearTimeout(toast._timer);
    toast.classList.remove("visible");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      toast.classList.add("visible");
      toast._timer = setTimeout(() => toast.classList.remove("visible"), duration);
    }));
  }

  function renderPartsHtml(parts, key, opts) {
    key = key || "text";
    opts = opts || {};
    const headingAware = !!opts.headingAware;
    const isHeading = !!opts.isHeading;
    // Bilara: tiap part adalah baris bait asli → pakai <br>, tanpa ‖ dan tanpa nomor
    const isBilara = parts.length > 0 && !!parts[0].bilara;
    return parts.map((p, i) => {
      // Folded body heading (".0" lead part): render as a block heading, no verse number.
      if (p.heading) {
        const lvl = Math.min(Math.max(p.heading, 1), 6);
        const htxt = String(p.text || "").replace(/<[^>]+>/g, "").trim();
        return `<div class="seg-heading seg-heading-${lvl}">${esc(htxt)}</div>`;
      }
      const verseNum = p.num !== undefined ? p.num : (p.id && p.id.includes(":") ? p.id.split(":").pop() : "");
      const primary = key === "id" ? (p.text || "") : (p[key] || "");
      let content;
      if (headingAware && key !== "pli") {
        const raw = primary.trim();
        const pli = (p.pli || "").trim();
        const isUntranslated = !raw || (pli && raw === pli);
        if (isUntranslated) {
          content = isHeading && pli
            ? `<em class="seg-untranslated">${pli}</em>`
            : `<em class="seg-untranslated">…</em>`;
        } else {
          content = primary;
        }
      } else {
        content = primary || p.text || p.pli || p.en || "";
      }

      if (typeof content === 'string' && content.includes('speaker')) {
        content = content.replace(/(<span[^>]*class=['"][^'"]*speaker[^'"]*['"][^>]*>)([^<]*)(<\/span>)/ig, (match, open, text, close) => {
          let t = text.trim();
          if (t && !t.endsWith(':')) t += ':';
          return `${open}${t}${close}`;
        });
      }

      if (isBilara) {
        // Bilara: tanpa pembatas apapun, TAPI nomor subsegmen tetap ditampilkan
        const hideSuperscript = parts.length === 1 && !String(verseNum).includes('.');
        const supHtml = hideSuperscript ? "" : `<sup class="verse-num">${verseNum}</sup>`;
        return `${supHtml}${content}`;
      } else {
        // HTML (dari br): render keduanya (‖ dan nomor). CSS akan mengatur mana yang tampil (berdasarkan opsi show-seg-ref)
        const sep = i > 0 ? `<span class="verse-sep">‖</span>` : "";
        const hideSuperscript = parts.length === 1 && !String(verseNum).includes('.');
        const supHtml = hideSuperscript ? "" : `<sup class="verse-num">${verseNum}</sup>`;
        return `${sep}${supHtml}${content}`;
      }
    }).join(isBilara ? " " : " ");
  }

  // ========== Resize ==========
  function setupResize() {
    const resizeHandle = $("#resize-handle");
    const searchPanel = $("#search-panel");
    const evalSidebar = $("#eval-sidebar");
    if (!resizeHandle) return;

    // Restore saved width (desktop only)
    const savedWidth = localStorage.getItem("dk-sidebar-width");
    if (savedWidth && window.innerWidth >= 769) {
      const w = parseInt(savedWidth);
      if (w >= 280 && w <= 600) {
        evalSidebar.style.flex = `0 0 ${w}px`;
      }
    }

    let isResizing = false;
    let lastSidebarWidth = null;
    resizeHandle.addEventListener("mousedown", (e) => {
      isResizing = true;
      resizeHandle.classList.add("active");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!isResizing) return;
      const mainRect = searchPanel.parentElement.getBoundingClientRect();
      const newSearchWidth = e.clientX - mainRect.left;
      const newSidebarWidth = mainRect.right - e.clientX;
      if (newSearchWidth > 350 && newSidebarWidth > 280 && newSidebarWidth < 600) {
        searchPanel.style.flex = `0 0 ${newSearchWidth}px`;
        evalSidebar.style.flex = `0 0 ${newSidebarWidth}px`;
        lastSidebarWidth = newSidebarWidth;
      }
    });
    document.addEventListener("mouseup", () => {
      if (isResizing) {
        isResizing = false;
        resizeHandle.classList.remove("active");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (lastSidebarWidth !== null) {
          localStorage.setItem("dk-sidebar-width", String(Math.round(lastSidebarWidth)));
          lastSidebarWidth = null;
        }
      }
    });
  }

  // ========== Shared Card Rendering ==========
  function _buildKwRegex(query) {
    const keywords = query.split(/\s+/).filter(Boolean);
    if (!keywords.length) return null;
    const patterns = [...keywords];
    if (keywords.length > 1) patterns.push(query.trim());
    patterns.sort((a, b) => b.length - a.length);
    const unique = [...new Set(patterns.map(p => p.toLowerCase()))];
    const escaped = unique.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp(`(^|\\s|[.,!?;:"'\\(\\[\\-])(${escaped.join("|")})(?=\\s|$|[.,!?;:"'\\)\\]\\-])`, "gi");
  }

  function highlightKeywords(escapedText, query) {
    const re = _buildKwRegex(query);
    if (!re) return escapedText;
    return escapedText.replace(re, `$1<span class="kw-match">$2</span>`);
  }

  function highlightKeywordsInHtml(html, query) {
    const re = _buildKwRegex(query);
    if (!re) return html;
    return html.replace(/(<[^>]*>)|([^<]+)/g, (_, tag, text) =>
      tag ? tag : text.replace(re, `$1<span class="kw-match">$2</span>`)
    );
  }

  // Normalize text for context-dedup comparison (trim + collapse whitespace).
  function normCtx(s) { return (s || "").trim().replace(/\s+/g, " "); }

  function buildFragTextLines(frag, sutta, ctx) {
    const lines = [];
    const texts = frag.texts || {};
    const cb = frag.context_before || {};
    const ca = frag.context_after || {};
    const dedup = ctx && ctx.dedupTexts; // Set of matched-segment texts shown in this group
    const isKeyword = ctx && ctx.method && ctx.method.includes("keyword");
    const query = (ctx && ctx.query) || "";
    const firstRef = (frag.ref && frag.ref.length > 0) ? frag.ref[0] : "";

    const suttaId = sutta ? sutta.sutta_id : "";
    const shortId = toShortId(suttaId);
    const preview = ctx.showPreview !== false;
    // Eval/asesmen pakar: tampilkan teks apa adanya — TANPA truncation konteks ("...")
    // dan TANPA tombol "Buka", supaya semua pakar melihat materi yang identik.
    const evalMode = !!(ctx && ctx.evalMode);
    const isBlurb = frag.author === "blurb";

    const availLinks = sutta ? (sutta.available_links || {}) : {};
    function renderMain(text) {
      return isKeyword && query ? highlightKeywords(esc(text), query) : `<span class="main-text">${esc(text)}</span>`;
    }
    const tgt = isBlurb ? ' target="_blank"' : "";
    const icon = isBlurb ? "maximize-2" : "book-open";

    const order = ["pli", "id", "en"];
    let langs = [...order.filter(l => texts[l]), ...Object.keys(texts).filter(l => !order.includes(l) && texts[l])];
    // Eval: batasi ke bahasa korpus yang DI-SEARCH (ctx.onlyLangs). Teks lintas-bahasa
    // di-join via chunk_id, tapi untuk teks sumber-HTML chunk_id = "stem:mdN" = nomor
    // urut paragraf PER-FILE (1-chunk.py) — split paragraf id vs en beda, jadi mdN tidak
    // align antar bahasa. Menampilkan pasangannya = terjemahan nyasar. Tampilkan fokus saja.
    if (ctx && Array.isArray(ctx.onlyLangs)) langs = langs.filter(l => ctx.onlyLangs.includes(l));
    for (const l of langs) {
      let baseLink = availLinks[l] || "";
      if (baseLink && frag.author && frag.author !== "blurb" && frag.db_source === l) {
        const parts = baseLink.split("/");
        if (parts.length === 4) {
          parts[3] = frag.author;
          baseLink = parts.join("/");
        }
      }
      let url;
      if (isBlurb) {
        url = `/${shortId}`;
      } else {
        url = baseLink && firstRef ? `${baseLink}#${firstRef}` : baseLink;
      }
      const textBtn = isBlurb ? "Hlm. Teks" : "Buka";
      const tag = evalMode
        ? `<span class="lang-tag ${l}">${l.toUpperCase()}</span>`
        : (url
          ? `<a href="${url}"${tgt} class="lang-tag ${l}${isBlurb ? ' dk-open-menu-link' : ''}" title="DK (${l.toUpperCase()})" data-sutta-id="${suttaId}" data-first-ref="${firstRef}"${isBlurb ? ' data-is-blurb="1"' : ''}><i data-lucide="${icon}"></i> <span style="margin-left:2px;">${textBtn}</span></a>`
          : `<span class="lang-tag ${l}"><i data-lucide="${icon}"></i> <span style="margin-left:2px;">${textBtn}</span></span>`);
      let line = `${tag} `;
      const MAX_CTX_LEN = 200;
      if (preview && cb[l] && !(dedup && dedup.has(normCtx(cb[l])))) {
        if (dedup) dedup.add(normCtx(cb[l]));
        let html;
        if (!evalMode && cb[l].length > MAX_CTX_LEN) {
          let trunc = cb[l].substring(cb[l].length - MAX_CTX_LEN);
          const spaceIdx = trunc.indexOf(" ");
          if (spaceIdx !== -1 && spaceIdx < 20) trunc = trunc.substring(spaceIdx + 1);
          html = `...${esc(trunc)}`;
        } else {
          const cbParts = frag.context_before_parts && frag.context_before_parts.length > 0 ? frag.context_before_parts : null;
          html = cbParts ? renderPartsHtml(cbParts, l) : esc(cb[l]);
        }
        line += `<span class="ctx">${html}</span> `;
      }
      const useParts = frag.parts && frag.parts.length > 0;
      if (useParts) {
        const partsHtml = renderPartsHtml(frag.parts, l);
        const body = isKeyword && query ? highlightKeywordsInHtml(partsHtml, query) : partsHtml;
        line += `<span class="main-text">${body}</span>`;
      } else {
        line += renderMain(texts[l]);
      }
      if (preview && ca[l] && !(dedup && dedup.has(normCtx(ca[l])))) {
        if (dedup) dedup.add(normCtx(ca[l]));
        let html;
        if (!evalMode && ca[l].length > MAX_CTX_LEN) {
          let trunc = ca[l].substring(0, MAX_CTX_LEN);
          const spaceIdx = trunc.lastIndexOf(" ");
          if (spaceIdx !== -1 && spaceIdx > trunc.length - 20) trunc = trunc.substring(0, spaceIdx);
          html = `${esc(trunc)}...`;
        } else {
          const caParts = frag.context_after_parts && frag.context_after_parts.length > 0 ? frag.context_after_parts : null;
          html = caParts ? renderPartsHtml(caParts, l) : esc(ca[l]);
        }
        line += ` <span class="ctx">${html}</span>`;
      }
      lines.push(line);
    }
    return lines;
  }

  function createFragmentEl(frag, sutta, ctx) {
    const el = document.createElement("div"); el.className = frag.author === "blurb" ? "fragment fragment-blurb" : "fragment";
    const meta = document.createElement("div"); meta.className = "fragment-meta";
    const isKw = ctx && ctx.method && ctx.method.includes("keyword");
    const evalMode = !!(ctx && ctx.evalMode);
    const refDisplay = frag.author === "blurb" ? "sinopsis" : (frag.ref_display || frag.ref.join(", "));
    const refTitle = `Segmen Teks: ${frag.ref.join(", ")}`;

    // Build the text lines first so the keyword badge can mirror what is
    // actually highlighted in the shown text.
    const lines = buildFragTextLines(frag, sutta, ctx);
    const kwHighlightCount = isKw ? (lines.join(" ").match(/class="kw-match"/g) || []).length : 0;

    let scoreHtml = "";
    let scoreTitle = "";
    const hasSemantic = frag.score <= 1.0;
    const hasKwData = frag.kw_count !== undefined;
    // Eval: SEMBUNYIKAN % cosine — bisa bias pakar (anchoring) & skornya per-model
    // tunggal padahal pasase ditampilkan SUDAH di-merge/dedup lintas model.
    const showScore = hasSemantic && !evalMode;

    if (showScore) {
      scoreHtml += `<span style="display:inline-flex;align-items:center;gap:3px;"><i data-lucide="target"></i> ${(frag.score * 100).toFixed(1)}%</span>`;
      scoreTitle += `Kemiripan Makna: ${(frag.score * 100).toFixed(1)}%`;
    }

    // Keyword count: prefer the backend kw_count; otherwise fall back to the
    // matches actually highlighted in the shown text, so a highlighted hit
    // always gets a badge — even on semantic-sourced fragments in hybrid mode.
    let kwCount = null;
    if (hasKwData) kwCount = frag.kw_count;
    else if (!hasSemantic && isKw) kwCount = Math.round(frag.score);
    else if (isKw && kwHighlightCount > 0) kwCount = kwHighlightCount;

    if (kwCount !== null) {
      const phCount = frag.phrase_count || 0;
      const kwFull = phCount ? `${phCount} frasa, ${kwCount} kata` : `${kwCount} kata`;
      const kwShort = phCount ? `${kwCount}kt, ${phCount}fr` : `${kwCount}kt`;
      const kwDisplay = `<span class="kw-full">${kwFull}</span><span class="kw-short">${kwShort}</span>`;

      if (showScore) {
        scoreHtml += `<span style="margin: 0 6px; opacity: 0.5;">|</span>`;
        scoreTitle += ` | `;
      }
      scoreHtml += `<span style="display:inline-flex;align-items:center;gap:3px;"><i data-lucide="bar-chart-3"></i> ${kwDisplay}</span>`;
      scoreTitle += `Kecocokan Kata Kunci: ${kwFull}`;
    }

    // Inside a grouped (per-text) card the author lives in a sub-header, so the
    // per-segment author is suppressed via ctx.hideAuthor to avoid redundancy.
    const authorHtml = (!(ctx && ctx.hideAuthor) && frag.author && frag.author !== "blurb") ? `<span class="fragment-author" title="Penerjemah: ${esc(authorLongName(frag.author, frag.source))}"><i data-lucide="user"></i> ${esc(authorLongName(frag.author, frag.source))}</span>` : "";
    meta.innerHTML = `
      <span class="fragment-ref" title="${refTitle}"><i data-lucide="map-pin"></i> ${refDisplay}</span>
      ${authorHtml}
      <span class="fragment-score" title="${scoreTitle}" style="display:inline-flex;align-items:center;">${scoreHtml}</span>`;
    el.appendChild(meta);
    const textsDiv = document.createElement("div"); textsDiv.className = "fragment-texts";
    lines.forEach(line => {
      const p = document.createElement("div"); p.className = "fragment-text-line"; p.innerHTML = line;
      textsDiv.appendChild(p);
    });
    el.appendChild(textsDiv);
    return el;
  }

  function createSuttaCardEl(sutta, fragmentsOverride, ctx, onFragment) {
    const card = document.createElement("div"); card.className = "sutta-card";
    const header = document.createElement("div"); header.className = "sutta-card-header";
    const nameSpan = sutta.sutta_name ? ` <span class="sutta-card-name">${sutta.sutta_name}</span>` : "";
    const frags = fragmentsOverride || sutta.fragments || [];
    const isBlurbCard = frags.length > 0 && frags.every(f => f.author === "blurb");
    //const titleHref = isBlurbCard ? `/${toShortId(sutta.sutta_id)}` : "#";
    const titleHref = `/${toShortId(sutta.sutta_id)}`;
    //const titleTarget = isBlurbCard ? ' target="_blank"' : "";
    const titleTarget = ' target="_blank"';
    //const titleClick = isBlurbCard ? "" : ` onclick="event.preventDefault(); window.DK && window.DK.openSuttaDialog('${sutta.sutta_id}', 'id');"`;
    const titleClick = "";
    const pitaka = sutta.pitaka || "";
    // Tint the whole card outline by piṭaka (colors come from style.css,
    // matching the .sutta-pitaka-badge palette).
    if (pitaka) card.classList.add("pitaka-" + pitaka);
    const pitakaBadge = pitaka ? `<span class="sutta-pitaka-badge ${pitaka}">${pitaka.charAt(0).toUpperCase() + pitaka.slice(1)}</span>` : "";
    const collName = sutta.collection_name || "";
    const collBadge = collName ? `<span class="sutta-collection-badge">${esc(collName)}</span>` : "";
    let metaBadge = "";
    if (pitaka && collName) {
      metaBadge = `<span class="sutta-meta-pill">${collBadge}${pitakaBadge}</span>`;
    } else {
      metaBadge = `${pitakaBadge}${collBadge}`;
    }
    header.innerHTML = `
      <span class="sutta-card-title">
        <a href="${titleHref}"${titleTarget}${titleClick} style="color:inherit;text-decoration:none;">
          ${sutta.formatted_id}${nameSpan}
        </a>
      </span>
      <span class="sutta-card-meta">${metaBadge}</span>`;
    card.appendChild(header);
    // Dedup overlapping context within this card: collect every matched-segment
    // text shown here, so a fragment's before/after context can be hidden when
    // that exact text already appears as another fragment's result.
    const dedupTexts = new Set();
    frags.forEach(f => {
      const tx = f.texts || {};
      Object.keys(tx).forEach(l => { const v = normCtx(tx[l]); if (v) dedupTexts.add(v); });
    });
    const cardCtx = Object.assign({}, ctx, { dedupTexts });

    // Sub-grouping by translator inside a grouped (per-text) card. Without it,
    // fragments from the same text but different authors repeat the segment
    // sequence once per author. Each translator's segments are wrapped in a
    // labelled block (left border + chip header) so the grouping is obvious,
    // and the author name moves into that header instead of repeating on every
    // segment. Blurb (sinopsis) fragments have no author and render flat.
    // Only grouped cards (fragmentsOverride == null) get this; single-fragment
    // cards in ungrouped mode keep the per-segment author.
    const isGroupedCard = fragmentsOverride == null;
    const authorKey = (f) => `${f.source || ""}::${f.author}`;
    const hasAuthor = frags.some(f => f.author && f.author !== "blurb");

    const appendFrag = (parentEl, frag, fctx) => {
      const fragEl = createFragmentEl(frag, sutta, fctx);
      if (onFragment) onFragment(fragEl, frag, sutta);
      parentEl.appendChild(fragEl);
    };
    const appendAuthorBlock = (blockFrags, fctx) => {
      const head = blockFrags[0];
      const block = document.createElement("div");
      block.className = "sutta-author-group";
      const label = document.createElement("div");
      label.className = "sutta-author-group-label";
      label.title = `Penerjemah: ${esc(authorLongName(head.author, head.source))}`;
      label.innerHTML = `<i data-lucide="user"></i> ${esc(authorLongName(head.author, head.source))}`;
      block.appendChild(label);
      blockFrags.forEach(f => appendFrag(block, f, fctx));
      card.appendChild(block);
    };

    if (isGroupedCard && hasAuthor) {
      // One labelled block per translator (≥1 author). Author order follows
      // first appearance; segment order within each author is preserved.
      const groupCtx = Object.assign({}, cardCtx, { hideAuthor: true });
      const byAuthor = new Map();
      frags.forEach(f => {
        const k = (f.author && f.author !== "blurb") ? authorKey(f) : "__blurb__";
        if (!byAuthor.has(k)) byAuthor.set(k, []);
        byAuthor.get(k).push(f);
      });
      byAuthor.forEach((groupFrags, k) => {
        if (k === "__blurb__") groupFrags.forEach(f => appendFrag(card, f, groupCtx));
        else appendAuthorBlock(groupFrags, groupCtx);
      });
    } else {
      frags.forEach(f => appendFrag(card, f, cardCtx));
    }
    if (window.lucide) window.lucide.createIcons({ root: card });
    return card;
  }

  function renderSuttaCardsTo(parent, results, grouped, ctx, onFragment) {
    if (grouped) {
      results.forEach(sutta => parent.appendChild(createSuttaCardEl(sutta, null, ctx, onFragment)));
    } else {
      const allFrags = [];
      results.forEach(sutta => (sutta.fragments || []).forEach(frag => allFrags.push({ sutta, frag })));
      allFrags.sort((a, b) => b.frag.score - a.frag.score);
      allFrags.forEach(({ sutta, frag }) => parent.appendChild(createSuttaCardEl(sutta, [frag], ctx, onFragment)));
    }
  }

  // ========== Custom Dialog (replaces native alert / confirm) ==========
  let _dkDialog = null;
  function _ensureDialog() {
    if (_dkDialog) return _dkDialog;
    _dkDialog = document.createElement("dialog");
    _dkDialog.id = "dk-dialog";
    document.body.appendChild(_dkDialog);
    _dkDialog.addEventListener("click", e => { if (e.target === _dkDialog) _dkDialog.close(); });
    return _dkDialog;
  }

  function dkAlert(message, opts) {
    opts = opts || {};
    const dlg = _ensureDialog();
    const icon = opts.icon || "info";
    const iconName = icon === "warn" ? "triangle-alert" : "info";
    dlg.innerHTML = `
      <div class="dk-dlg-body">
        <div class="dk-dlg-icon ${icon}"><i data-lucide="${iconName}" style="width: 24px; height: 24px;"></i></div>
        <div class="dk-dlg-msg">${esc(message)}</div>
      </div>
      <div class="dk-dlg-footer">
        <button class="dk-dlg-btn primary" id="dk-dlg-ok">OK</button>
      </div>`;
    if (window.lucide) window.lucide.createIcons({ root: dlg });
    dlg.showModal();
    return new Promise(resolve => {
      const okBtn = dlg.querySelector("#dk-dlg-ok");
      okBtn.focus();
      okBtn.onclick = () => { dlg.close(); resolve(); };
      dlg.onclose = () => resolve();
    });
  }

  function dkConfirm(message, opts) {
    opts = opts || {};
    const dlg = _ensureDialog();
    const isDanger = opts.danger || false;
    const confirmLabel = opts.confirmLabel || (isDanger ? "Hapus" : "Lanjutkan");
    const cancelLabel = opts.cancelLabel || "Batal";
    const iconName = isDanger ? "triangle-alert" : "help-circle";
    const iconClass = isDanger ? "warn" : "info";
    dlg.innerHTML = `
      <div class="dk-dlg-body">
        <div class="dk-dlg-icon ${iconClass}"><i data-lucide="${iconName}" style="width: 24px; height: 24px;"></i></div>
        <div class="dk-dlg-msg">${esc(message)}</div>
      </div>
      <div class="dk-dlg-footer">
        <button class="dk-dlg-btn cancel" id="dk-dlg-cancel">${cancelLabel}</button>
        <button class="dk-dlg-btn ${isDanger ? "danger" : "primary"}" id="dk-dlg-confirm">${confirmLabel}</button>
      </div>`;
    if (window.lucide) window.lucide.createIcons({ root: dlg });
    dlg.showModal();
    return new Promise(resolve => {
      let resolved = false;
      dlg.onclose = () => { if (!resolved) { resolved = true; resolve(false); } };
      dlg.querySelector("#dk-dlg-cancel").onclick = () => { resolved = true; dlg.close(); resolve(false); };
      dlg.querySelector("#dk-dlg-confirm").onclick = () => { resolved = true; dlg.close(); resolve(true); };
    });
  }

  function dkPrompt(message, opts) {
    opts = opts || {};
    const dlg = _ensureDialog();
    const confirmLabel = opts.confirmLabel || "Lanjutkan";
    const cancelLabel = opts.cancelLabel || "Batal";
    const iconChar = "✏";
    const iconClass = "info";
    const defaultValue = opts.defaultValue || "";
    dlg.innerHTML = `
      <div class="dk-dlg-body" style="flex-direction: column; gap: 8px;">
        <div style="display: flex; gap: 14px; align-items: flex-start;">
          <div class="dk-dlg-icon ${iconClass}">${iconChar}</div>
          <div class="dk-dlg-msg" style="padding-top: 6px;">${esc(message)}</div>
        </div>
        <input type="${opts.type || "text"}" id="dk-dlg-input" class="nm-rename-input" style="width: 100%; margin-top: 10px; box-sizing: border-box; padding: 8px 12px; font-size: 0.95rem;" value="${esc(defaultValue)}">
      </div>
      <div class="dk-dlg-footer">
        <button class="dk-dlg-btn cancel" id="dk-dlg-cancel">${cancelLabel}</button>
        <button class="dk-dlg-btn primary" id="dk-dlg-confirm">${confirmLabel}</button>
      </div>`;
    dlg.showModal();
    return new Promise(resolve => {
      const input = dlg.querySelector("#dk-dlg-input");
      input.focus();
      if (defaultValue) input.select();

      let resolved = false;
      dlg.onclose = () => { if (!resolved) { resolved = true; resolve(null); } };
      dlg.querySelector("#dk-dlg-cancel").onclick = () => { resolved = true; dlg.close(); resolve(null); };
      dlg.querySelector("#dk-dlg-confirm").onclick = () => { resolved = true; dlg.close(); resolve(input.value); };
      input.onkeydown = (e) => {
        if (e.key === "Enter") { resolved = true; dlg.close(); resolve(input.value); }
      };
    });
  }

  // ========== Public API ==========
  window.DK = {
    state, esc, updateAllLinksInDOM,
    highlightKeywords, buildFragTextLines, createFragmentEl, createSuttaCardEl, renderSuttaCardsTo,
    compactRef, showToast, langName, authorLongName,
    alert: dkAlert, confirm: dkConfirm, prompt: dkPrompt,
  };

  // ========== Reader display settings (Segmen) ==========
  // Centangan opsional di dialog "Atur" (eval_base.html), berlaku global.
  // Pemisah bait (‖) selalu tampil — bukan opsi, lihat .verse-sep di CSS.
  function initSegRef() {
    const segVal = localStorage.getItem("dk-show-segref") !== "0";
    document.documentElement.classList.toggle("show-seg-ref", segVal);
    const cbSeg = document.getElementById("cb-seg-ref");
    if (cbSeg) {
      cbSeg.checked = segVal;
      cbSeg.addEventListener("change", () => {
        localStorage.setItem("dk-show-segref", cbSeg.checked ? "1" : "0");
        document.documentElement.classList.toggle("show-seg-ref", cbSeg.checked);
      });
    }
  }

  // ========== Settings: ukuran font (skala root, BUKAN zoom) ==========
  // Skala root font-size (html{font-size:15px}); semua satuan rem ikut membesar,
  // sedangkan border/spacing px tetap -> teks gede se-layar tanpa zoom. Disimpan
  // di localStorage "dk-fontscale" & diterapkan dini di <head> (anti flash).
  const FONT_BASE = 15; // sinkron dgn html { font-size } di style.css
  const FONT_LEVELS = [
    { scale: 1.0, pct: 100 },
    { scale: 1.15, pct: 115 },
    { scale: 1.3, pct: 130 },
    { scale: 1.5, pct: 150 },
    { scale: 1.7, pct: 170 },
  ];
  function getFontIdx() {
    const saved = parseFloat(localStorage.getItem("dk-fontscale"));
    const idx = FONT_LEVELS.findIndex(l => Math.abs(l.scale - saved) < 1e-3);
    return idx < 0 ? 0 : idx;
  }
  function applyFont(idx) {
    idx = Math.max(0, Math.min(FONT_LEVELS.length - 1, idx));
    const lvl = FONT_LEVELS[idx];
    document.documentElement.style.fontSize = (FONT_BASE * lvl.scale) + "px";
    localStorage.setItem("dk-fontscale", String(lvl.scale));
    const pctEl = document.getElementById("dk-font-pct");
    if (pctEl) pctEl.textContent = lvl.pct + "%";
    const dec = document.getElementById("dk-font-dec");
    const inc = document.getElementById("dk-font-inc");
    if (dec) dec.disabled = idx === 0;
    if (inc) inc.disabled = idx === FONT_LEVELS.length - 1;
  }
  function initFontStepper() {
    applyFont(getFontIdx()); // sinkron label (font sudah diterapkan dini di <head>)
    const dec = document.getElementById("dk-font-dec");
    const inc = document.getElementById("dk-font-inc");
    if (dec) dec.addEventListener("click", () => applyFont(getFontIdx() - 1));
    if (inc) inc.addEventListener("click", () => applyFont(getFontIdx() + 1));
  }

  // ========== Init ==========
  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initSegRef();
    initFontStepper();
    setupResize();
    applyCommonI18n();

    const langBtn = document.getElementById("btn-lang-toggle");
    if (langBtn) {
      langBtn.addEventListener("click", () => {
        const current = localStorage.getItem("dk-lang") || "id";
        const next = current === "id" ? "en" : "id";
        localStorage.setItem("dk-lang", next);
        window.dispatchEvent(new CustomEvent("dk-lang-change", { detail: { lang: next } }));
        applyCommonI18n();
      });
    }

    const panelToggleBtn = $("#btn-panel-toggle");
    const panelBackdrop = $("#panel-backdrop");
    if (panelToggleBtn) {
      const panel = $("#notes-panel") || $("#eval-sidebar");
      if (panel) {
        const closePanel = () => { panel.classList.remove("panel-open"); panelToggleBtn.classList.remove("panel-btn-open"); if (panelBackdrop) panelBackdrop.classList.remove("visible"); };
        const openPanel = () => { panel.classList.add("panel-open"); panelToggleBtn.classList.add("panel-btn-open"); if (panelBackdrop) panelBackdrop.classList.add("visible"); };
        panelToggleBtn.addEventListener("click", () => panel.classList.contains("panel-open") ? closePanel() : openPanel());
        if (panelBackdrop) panelBackdrop.addEventListener("click", closePanel);
      } else {
        panelToggleBtn.style.display = "none";
      }
    }

    const themeBtn = $("#btn-theme-toggle");
    if (themeBtn) themeBtn.addEventListener("click", toggleTheme);
  });
})();
