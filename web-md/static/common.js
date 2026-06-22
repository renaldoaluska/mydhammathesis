/* ============================================================
   Dhammakathika — Shared Logic (loaded via base.html)
   Handles: theme, source toggle, notes panel, resize handle
   ============================================================ */

(function () {
  "use strict";

  // ========== Shared i18n (notes panel strings) ==========
  const i18n = {
    id: {
      confirm_delete: "Hapus catatan ini?",
      confirm_delete_block: "Hapus blok catatan ini?",
      dlg_btn_ok: "OK",
      dlg_btn_cancel: "Batal",
      dlg_btn_continue: "Lanjutkan",
      dlg_btn_delete: "Hapus",
      btn_add_note: "+ Catatan",
      btn_add_note_short: "+",
      btn_open_sutta: "Halaman Teks",
      btn_open_here: "Buka di sini",
      btn_open_newtab: "Tab baru",
      btn_single: "Terjemahan Saja",
      btn_sidebyside: "Berdampingan Pāḷi",
      msg_copied: "Catatan telah disalin ke clipboard!",
      footer_student: "Penyusun:",
      footer_supervisor: "Pembimbing:",
      title_its: "Institut Teknologi Sepuluh Nopember",
      title_stab: "Sekolah Tinggi Agama Buddha Kertarajasa",
      title_styab: "Sekolah Tinggi Agama Buddha Syailendra",
      title_sc: "SuttaCentral",
      nav_search: "Mesin Pencari",
      nav_search_full: "Mesin Pencari",
      nav_search_short: "Mesin Cari",
      nav_browse: "Telusuri",
      cb_seg_ref: "Segmen",
      btn_reader_settings: "Setelan",
      rs_title: "Setelan",
      rs_section_display: "Tampilan Teks",
      rs_seg_desc: "Menampilkan kode rujukan tiap ruas teks beserta nomor barisnya. Berguna saat ingin mengutip atau menemukan baris tertentu secara tepat.",
      rs_preview_label: "Pratinjau",
      toc_title: "Daftar Isi",
      seg_list_title: "Daftar Segmen",
      btn_scroll_top: "Gulir ke Atas",
      font_panel_title: "Teks",
      font_panel_size: "Ukuran",
      font_panel_line_height: "Tinggi baris",
      font_panel_font: "Gaya",
      font_style_hint: "Sans: tanpa kait, bersih & modern. Serif: berkait kecil, terasa klasik seperti buku cetak.",
      btn_advanced: "Tingkat Lanjut",
      config_search_engine: "Konfigurasi Mesin Pencari",
      config_search_engine_desc: "Centang model yang ingin digabungkan pada pencarian biasa (bukan mode tingkat lanjut).",
      hint_click_info: "Klik ikon <i data-lucide=\"info\" style=\"width: 14px; height: 14px; display: inline-block; vertical-align: -2px;\"></i> untuk lihat fungsi dari masing-masing opsi.",
      err_no_config: "Konfigurasi model belum ada",
      btn_manage_notes: "Kelola",
      btn_config_short: "Konfig Mesin",
      btn_reset: "Reset",
      btn_open_link: "Buka",
      btn_open_blurb: "Buka",
      legend_title: '<span class="hide-mobile">Keterangan Simbol</span><span class="show-mobile">Ket. Simbol</span>',
      legend_segment: "Segmen Teks",
      legend_blurb: "Sinopsis",
      legend_lang: "Bahasa",
      legend_author: "Penerjemah",
      legend_similarity: "Kemiripan Makna",
      legend_count: "Kecocokan Kata Kunci",
      ensemble_config_title: "Konfigurasi Gabungan Model",
      hint_ensemble_warning: "Ubah konfigurasi ini hanya jika Anda paham, karena akan sangat memengaruhi hasil pencarian. Anda dapat mereset kapan saja, konfigurasi ini hanya tersimpan di perangkat Anda.",
      confirm_reset_ensemble: "Reset konfigurasi gabungan model ke setelan awal dari server?",
      btn_save: "Simpan",
      nm_title: "Kelola Catatan",
      nm_select_all: "Pilih Semua",
      nm_delete_selected: "Hapus",
      nm_download_selected: "Unduh PDF",
      nm_confirm_bulk: "Hapus catatan yang dipilih?",
      nm_blocks: "blok",
      nm_col_title: "Judul",
      nm_col_created: "Dibuat",
      nm_col_edited: "Disunting",
      footer_tentang: "Tentang myDhamma",
      notes_title: '<i data-lucide="pen-line"></i> Catatan',
      notes_title_mobile: 'Catatan',
      btn_new_note: "+ Baru",
      ph_note_title: "Judul catatan…",
      btn_add_text: "+ Tambah Catatan Bebas",
      note_add_sutta_hint: "Untuk menambahkan ayat Tipiṭaka ke Catatan, gunakan menu Telusuri/Pencarian/AI Chat di panel kiri, lalu klik tombol <b>+ Catatan</b> pada bagian ayat yang ingin ditambahkan.",
      btn_paste_block: "Tempel Blok",
      notes_empty: "Pilih atau buat catatan baru<br>untuk mulai menyusun pembabaran Dhamma.",
      btn_empty_new_note: "+ Buat Catatan Baru",
      btn_send: "Kirim",
      chat_subtitle: "Chat myDhamma AI",
      chat_disclaimer: "⚠ AI dapat membuat kesalahan; selalu periksa rujukannya.",
      sutta_not_found: "Sutta tidak ditemukan.",
      loading_sutta: "Memuat teks…",
      sp_not_found: "Sutta tidak tersedia dalam korpus.",
      research_banner: "TERBATAS UNTUK RISET — BELUM UNTUK PUBLIK",
      panel_sidebar: "Bilah Sisi",
      select_corpus: "— Pilih korpus —",
      btn_goto: "Lompat ke Teks",
      btn_chat_ai: "Tanya AI",
      goto_title: "Lompat ke Teks",
      goto_collection_ph: "mis. MN, DN",
      goto_number_ph: "mis. 22, 56.11",
      goto_or: "atau",
      goto_title_ph: "Cari berdasarkan judul...",
      goto_btn_open: "Buka",
      lbl_language: "Target Bahasa",
      lbl_pitaka: "Piṭaka",
      btn_send: "Kirim",
      history_divider: "Riwayat",
      btn_new_chat: "Obrolan Baru",
      note_poni_ai: "myDhamma AI",
      note_poni_free: "Catatan bebas",
      note_poni_quote: "Kutipan ayat",
      sutta_md_notice: "<b>Catatan ID Segmen:</b> Teks ini menggunakan sistem penomoran paragraf internal myDhamma (ID berawalan \"md\") dikarenakan naskah sumber belum memiliki format penomoran standar.",
    },
    en: {
      confirm_delete: "Delete this note?",
      confirm_delete_block: "Delete this note block?",
      dlg_btn_ok: "OK",
      dlg_btn_cancel: "Cancel",
      dlg_btn_continue: "Continue",
      dlg_btn_delete: "Delete",
      btn_add_note: "+ Notes",
      btn_add_note_short: "+ Note",
      btn_open_sutta: "Text Page",
      btn_open_here: "Open here",
      btn_open_newtab: "New tab",
      btn_single: "Translation Only",
      btn_sidebyside: "Side by Side with Pāḷi",
      msg_copied: "Note copied to clipboard!",
      footer_student: "Researcher:",
      footer_supervisor: "Supervisor:",
      title_its: "Sepuluh Nopember Institute of Technology",
      title_stab: "Kerataraja Buddhist College",
      title_styab: "Syailendra Buddhist College",
      title_sc: "SuttaCentral",
      nav_search: "Search Engine",
      nav_search_full: "Search Engine",
      nav_search_short: "Search",
      nav_browse: "Browse",
      panel_sidebar: "Sidebar",
      cb_seg_ref: "Segments",
      btn_reader_settings: "Settings",
      rs_title: "Settings",
      rs_section_display: "Text Display",
      rs_seg_desc: "Shows the reference code and line number of each text segment. Useful for quoting or pinpointing a specific line.",
      rs_preview_label: "Preview",
      toc_title: "Table of Contents",
      seg_list_title: "Segment List",
      font_panel_title: "Text",
      font_panel_size: "Size",
      font_panel_line_height: "Line height",
      font_panel_font: "Style",
      font_style_hint: "Sans: no serifs, clean & modern. Serif: small strokes, classic like printed books.",
      btn_scroll_top: "Scroll to Top",
      btn_advanced: "Advanced",
      config_search_engine: "Search Engine Configuration",
      config_search_engine_desc: "Check the models you want to combine for the simple search mode (not advanced mode).",
      hint_click_info: "Click the <i data-lucide=\"info\" style=\"width: 14px; height: 14px; display: inline-block; vertical-align: -2px;\"></i> icon to learn the function of each option.",
      err_no_config: "Model configuration missing",
      btn_manage_notes: "Manage",
      btn_config_short: "Machine Config",
      btn_reset: "Reset",
      btn_open_link: "Open",
      btn_open_blurb: "Open",
      legend_title: "Legend",
      legend_segment: "Text Segment",
      legend_blurb: "Summary",
      legend_lang: "Language",
      legend_author: "Translator",
      legend_similarity: "Semantic Match",
      legend_count: "Match Count",
      ensemble_config_title: "Model Ensemble Configuration",
      hint_ensemble_warning: "Change this configuration only if you understand it, as it will significantly affect search results. You can reset it anytime, this configuration is only saved on your device.",
      confirm_reset_ensemble: "Reset ensemble model configuration to server defaults?",
      btn_save: "Save",
      nm_title: "Manage Notes",
      nm_select_all: "Select All",
      nm_delete_selected: "Delete",
      nm_download_selected: "Download PDF",
      nm_confirm_bulk: "Delete selected notes?",
      nm_blocks: "blocks",
      nm_col_title: "Title",
      nm_col_created: "Created",
      nm_col_edited: "Edited",
      footer_tentang: "About myDhamma",
      notes_title: '<i data-lucide="pen-line"></i> Notes',
      notes_title_mobile: 'Notes',
      btn_new_note: "+ New",
      ph_note_title: "Note title…",
      btn_add_text: "+ Add Custom Note",
      note_add_sutta_hint: "To add a Tipiṭaka passage to your Notes, use the Browse/Search/AI Chat menu in the left panel, then click the <b>+ Notes</b> button on the desired passage.",
      btn_paste_block: "Paste Block",
      notes_empty: "Select or create a new note<br>to start composing your talk.",
      btn_empty_new_note: "+ Create New Note",
      btn_send: "Send",
      chat_subtitle: "Chat myDhamma AI",
      chat_disclaimer: "⚠ AI may make mistakes; always check the citations.",
      sutta_not_found: "Sutta not found.",
      loading_sutta: "Loading text…",
      sp_not_found: "Sutta not available in the corpus.",
      research_banner: "IN DEVELOPMENT — FOR RESEARCH PURPOSES ONLY ",
      select_corpus: "— Select corpus —",
      btn_goto: "Jump to Text",
      btn_chat_ai: "Ask AI",
      goto_title: "Go to Text",
      goto_collection_ph: "e.g. MN, DN",
      goto_number_ph: "e.g. 22, 56.11",
      goto_or: "or",
      goto_title_ph: "Search by title...",
      goto_btn_open: "Open",
      lbl_language: "Target Language",
      lbl_pitaka: "Piṭaka",
      btn_send: "Send",
      history_divider: "History",
      btn_new_chat: "New Chat",
      note_poni_ai: "myDhamma AI",
      note_poni_free: "Custom note",
      note_poni_quote: "Verse citation",
      sutta_md_notice: "<b>Segment ID Note:</b> This text uses myDhamma's internal paragraph numbering system (IDs starting with \"md\") because the source manuscript lacks a standard numbering format.",
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
  const state = {
    notes: [],
    activeNoteId: null,
    activeNote: null,
  };

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
  function formatRef(ref) {
    if (!ref) return ref;
    const colonIdx = ref.indexOf(":");
    if (colonIdx === -1) return toShortId(ref);
    return toShortId(ref.substring(0, colonIdx)) + ref.substring(colonIdx);
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
    const suttaPrefix = colonIdx === -1 ? "" : toShortId(ids[0].substring(0, colonIdx)) + ":";
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

  // ========== Notes — buildMiniTexts ==========
  function buildMiniTexts(data) {
    const texts = data.texts || {};
    const availLinks = data.available_links || {};
    // backward compat: old note blocks stored sc_link_* instead of available_links
    if (!Object.keys(availLinks).length) {
      if (data.sc_link_pli) availLinks.pli = data.sc_link_pli;
      if (data.sc_link_id) availLinks.id = data.sc_link_id;
      if (data.sc_link_en) availLinks.en = data.sc_link_en;
    }

    let firstRef = "";
    if (data.ref && data.ref.length > 0) firstRef = data.ref[0];
    else if (data.ref_display) firstRef = data.ref_display.split(",")[0].trim();

    const suttaId = data.sutta_id || "";
    const shortId = toShortId(suttaId);
    const isBlurb = data.author === "blurb";
    const eyeIcon = `<i data-lucide="${isBlurb ? 'book' : 'book-open'}"></i>`;

    // pli first, then id, en, then any other langs
    const order = ["pli", "id", "en"];
    const langs = [...order.filter(l => texts[l]), ...Object.keys(texts).filter(l => !order.includes(l) && texts[l])];

    let html = "";
    for (const l of langs) {
      const baseLink = availLinks[l] || "";
      let url;
      if (isBlurb) {
        url = `/${shortId}`;
      } else {
        // Pakai author yg DISIMPAN di blok (translator yg di-+Catatan), bukan author default
        // dari available_links -> klik buka dialog viewer versi terjemahan + segmen yg sesuai.
        const a = data.author && data.author !== "blurb" ? data.author : "";
        url = (shortId && a)
          ? `/${shortId}/${l}/${encodeURIComponent(a)}${firstRef ? "#" + firstRef : ""}`
          : (baseLink && firstRef ? `${baseLink}#${firstRef}` : baseLink);
      }
      const title = `Buka di Dhammakathika (${l.toUpperCase()})`;
      const key = isBlurb ? "btn_open_blurb" : "btn_open_link";
      const bodyHtml = (data.parts && data.parts_lang === l) ? renderPartsHtml(data.parts, l) : esc(texts[l]);
      html += `<div>${url
        ? `<a href="${url}" class="lang-tag ${l}${isBlurb ? ' dk-open-menu-link' : ''}" title="${title}" data-sutta-id="${suttaId}" data-first-ref="${firstRef}"${isBlurb ? ' data-is-blurb="1"' : ''}>${eyeIcon} <span style="margin-left:2px;" data-i18n="${key}">${t(key)}</span></a>`
        : `<span class="lang-tag ${l}">${eyeIcon} <span style="margin-left:2px;" data-i18n="${key}">${t(key)}</span></span>`} ${bodyHtml}</div>`;
    }
    return html;
  }

  // Linkify token rujukan ("MN 10:1.5", "Bu-Pj 1") di teks jawaban AI -> tombol "Buka" yg
  // membuka DIALOG sutta viewer (bukan navigasi halaman teks). Hanya base-id yg BENAR-BENAR
  // dikutip (ada di `refs`) jadi link; sisanya teks polos. `plain` di-esc dulu (aman HTML).
  // Klik di-handle di createNoteBlockEl (data-sid -> openSuttaDialog).
  function linkifyNoteRefs(plain, refs) {
    const safe = esc(plain || "");
    if (!refs || !refs.length) return safe;
    const byId = {};
    const byIdSeg = {};
    refs.forEach(r => { 
      if (r && r.id && r.sid) {
        const normId = r.id.replace(/\s+/g, "").toLowerCase();
        byId[normId] = r; 
        if (r.seg) {
          byIdSeg[normId + ":" + r.seg.replace(/[.,;]+$/, "")] = r;
        }
      } 
    });
    const re = /([A-Za-z]+(?:-[A-Za-z]+)?\s+\d+(?:\.\d+)*(?:-\d+)?)(?::([a-zA-Z0-9.\-]+))?/g;
    const openLabel = getLang() === "en" ? "Open" : "Buka";
    return safe.replace(re, (match, book, seg) => {
      const normId = book.replace(/\s+/g, "").toLowerCase();
      const cleanSeg = seg ? seg.replace(/[.,;]+$/, "") : "";
      
      let r = null;
      if (cleanSeg && byIdSeg[normId + ":" + cleanSeg]) {
        r = byIdSeg[normId + ":" + cleanSeg];
      } else {
        r = byId[normId];
      }
      
      if (!r) return match;
      // Segmen (mis. "1.5" / "md2") dipakai sbg hash -> dialog scroll ke segmennya.
      return `<a role="button" tabindex="0" class="note-cite" data-sid="${esc(r.sid)}" data-author="${esc(r.author || "")}" data-seg="${esc(cleanSeg)}" data-lang="${esc(r.lang || "")}" title="${openLabel}">${match}</a>`;
    });
  }

  const _MD_TABLE_SEP = l => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(l);
  const _MD_CELLS = r => r.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());

  // Render konten blok AI di Catatan: sama spt linkifyNoteRefs (esc + linkify rujukan; newline
  // diurus CSS pre-wrap), TAPI blok tabel GFM ('| a | b |' diikuti '|---|---|') dirender jadi
  // <table> beneran supaya tak tampil pipe mentah. Tiap sel tetap di-linkify rujukannya.
  //   opts.br    -> teks non-tabel pakai <br> (konteks tanpa pre-wrap, mis. cetak/print)
  //   opts.print -> tabel pakai inline-style (dokumen cetak tak memuat CSS situs)
  function renderAiNoteHtml(content, refs, opts) {
    opts = opts || {};
    const lines = (content || "").split("\n");
    const tOpen = opts.print
      ? "<table style=\"border-collapse:collapse;width:100%;margin:.6em 0;font-size:.92em\">"
      : "<table class='chat-table note-ai-table'>";
    const thS = opts.print ? " style=\"border:1px solid #c7b8ea;padding:.4em .65em;text-align:left;background:#f1ecfa;font-weight:700\"" : "";
    const tdS = opts.print ? " style=\"border:1px solid #c7b8ea;padding:.4em .65em;text-align:left;vertical-align:top\"" : "";
    let out = "", buf = [];
    const flush = () => {
      while (buf.length && buf[buf.length - 1].trim() === "") buf.pop();   // rapikan blank sblm tabel
      if (buf.length) {
        let h = linkifyNoteRefs(buf.join("\n"), refs);
        if (opts.br) h = h.replace(/\n/g, "<br>");
        out += h;
      }
      buf = [];
    };
    let i = 0;
    while (i < lines.length) {
      if (lines[i].includes("|") && i + 1 < lines.length && _MD_TABLE_SEP(lines[i + 1])) {
        flush();
        const head = _MD_CELLS(lines[i]); i += 2;                          // lewati header + pemisah
        const rows = [];
        while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
          rows.push(_MD_CELLS(lines[i])); i++;
        }
        let tb = tOpen + "<thead><tr>"
          + head.map(c => "<th" + thS + ">" + linkifyNoteRefs(c, refs) + "</th>").join("") + "</tr></thead><tbody>";
        for (const r of rows) {
          tb += "<tr>" + head.map((_, ci) => "<td" + tdS + ">" + linkifyNoteRefs(r[ci] || "", refs) + "</td>").join("") + "</tr>";
        }
        out += tb + "</tbody></table>";
        while (i < lines.length && lines[i].trim() === "") i++;            // buang blank setelah tabel
      } else {
        buf.push(lines[i]); i++;
      }
    }
    flush();
    return out;
  }

  // Ratakan kolom tabel GFM jadi teks rapi (utk tombol Salin/clipboard): lebar tiap kolom =
  // sel terpanjang, sel di-pad. Tetap markdown valid (pipa + pemisah) tapi enak dibaca di
  // editor/monospace alih-alih pipa berantakan. Baris non-tabel dibiarkan apa adanya. Idempoten.
  function mdAlignTables(text) {
    const lines = (text || "").split("\n");
    const out = [];
    let i = 0;
    while (i < lines.length) {
      if (lines[i].includes("|") && i + 1 < lines.length && _MD_TABLE_SEP(lines[i + 1])) {
        const head = _MD_CELLS(lines[i]);
        const body = [];
        let j = i + 2;
        while (j < lines.length && lines[j].includes("|") && lines[j].trim() !== "") { body.push(_MD_CELLS(lines[j])); j++; }
        const ncol = head.length;
        const w = [];
        for (let c = 0; c < ncol; c++) {
          w[c] = (head[c] || "").length;
          for (const r of body) w[c] = Math.max(w[c], (r[c] || "").length);
        }
        const fmt = row => "| " + Array.from({ length: ncol }, (_, c) => (row[c] || "").padEnd(w[c])).join(" | ") + " |";
        out.push(fmt(head));
        out.push("| " + w.map(x => "-".repeat(Math.max(3, x))).join(" | ") + " |");
        for (const r of body) out.push(fmt(r));
        i = j;
      } else { out.push(lines[i]); i++; }
    }
    return out.join("\n");
  }

  // ========== Notes — Block Clipboard ==========
  let _copiedBlock = null;

  function updatePasteBtn() {
    const container = $("#paste-block-container");
    if (container) container.style.display = _copiedBlock ? "flex" : "none";
  }

  // ========== Notes — Block Element ==========
  function createNoteBlockEl(block, idx) {
    const wrapper = document.createElement("div");
    wrapper.className = "note-block";
    wrapper.dataset.index = idx;
    wrapper._blockData = block;

    const noteBlocks = $("#note-blocks");

    const actions = document.createElement("div");
    actions.className = "note-block-actions";

    const upBtn = document.createElement("button");
    upBtn.className = "block-move-btn";
    upBtn.textContent = "↑";
    upBtn.title = "Geser ke atas";
    upBtn.addEventListener("click", () => {
      const prev = wrapper.previousElementSibling;
      if (prev) { noteBlocks.insertBefore(wrapper, prev); autoSave(); }
    });

    const downBtn = document.createElement("button");
    downBtn.className = "block-move-btn";
    downBtn.textContent = "↓";
    downBtn.title = "Geser ke bawah";
    downBtn.addEventListener("click", () => {
      const next = wrapper.nextElementSibling;
      if (next) { noteBlocks.insertBefore(next, wrapper); autoSave(); }
    });

    const delBtn = document.createElement("button");
    delBtn.className = "block-del-btn";
    delBtn.textContent = "✕";
    delBtn.title = "Hapus blok";
    delBtn.addEventListener("click", async () => {
      if (!await dkConfirm(t("confirm_delete_block"), { danger: true })) return;
      wrapper.remove();
      autoSave();
    });

    const copyBtn = document.createElement("button");
    copyBtn.className = "block-move-btn";
    copyBtn.title = "Salin blok";
    copyBtn.innerHTML = `<i data-lucide="copy"></i>`;
    copyBtn.addEventListener("click", () => {
      _copiedBlock = JSON.parse(JSON.stringify(block));
      updatePasteBtn();

      let clipText = "";
      if (block.type === "text") {
        clipText = mdAlignTables(block.content || "");   // tabel GFM -> kolom rata di clipboard
      } else if (block.type === "sutta") {
        const d = block.data || {};
        const texts = d.texts || {};
        clipText += `${d.formatted_id || d.sutta_id || ""}${d.sutta_name ? " — " + d.sutta_name : ""} — ${d.ref_display || ""}\n`;
        if (d.author && d.author !== "blurb") clipText += `Penerjemah: ${authorLongName(d.author, d.source)}\n`;
        if (texts.id) clipText += `ID: ${texts.id}\n`;
        if (texts.en) clipText += `EN: ${texts.en}\n`;
        if (texts.pli) clipText += `PLI: ${texts.pli}\n`;
      }

      if (clipText && navigator.clipboard) {
        navigator.clipboard.writeText(clipText.trim()).catch(() => { });
      }

      showToast(getLang() === "en" ? "Block copied to clipboard" : "Blok disalin ke clipboard");
    });

    // "Poni" (bar atas) kiri: badge AI utk blok jawaban AI, atau nama+id (2 baris) utk blok
    // sutta. Disisipkan sebelum tombol (margin-right:auto di CSS mendorong tombol ke kanan).
    // Label poni pakai data-i18n -> ikut ke-update live saat ganti bahasa (applyCommonI18n).
    let poniLabel = null;
    if (block.type === "text" && block.source === "ai") {
      wrapper.classList.add("note-block-ai");
      poniLabel = document.createElement("div");
      poniLabel.className = "note-poni-label note-poni-ai";
      poniLabel.innerHTML = `<i data-lucide="sparkles"></i><span data-i18n="note_poni_ai">${t("note_poni_ai")}</span>`;
    } else if (block.type === "text") {
      poniLabel = document.createElement("div");
      poniLabel.className = "note-poni-label note-poni-free";
      poniLabel.innerHTML = `<i data-lucide="sticky-note"></i><span data-i18n="note_poni_free">${t("note_poni_free")}</span>`;
    } else if (block.type === "sutta") {
      // Kepala blok cukup label "Kutipan ayat"; id+nama sutta tampil di dalam (mini-header).
      poniLabel = document.createElement("div");
      poniLabel.className = "note-poni-label note-poni-quote";
      poniLabel.innerHTML = `<i data-lucide="quote"></i><span data-i18n="note_poni_quote">${t("note_poni_quote")}</span>`;
    }
    if (poniLabel) actions.appendChild(poniLabel);
    actions.append(copyBtn, upBtn, downBtn, delBtn);
    wrapper.appendChild(actions);

    if (block.type === "text" && block.source === "ai") {
      // Jawaban AI = read-only, dirender rapi (pre-wrap) + token rujukan jadi link "Buka".
      const textEl = document.createElement("div");
      textEl.className = "note-block-text note-block-ai-text";
      textEl.contentEditable = "false";
      textEl.innerHTML = renderAiNoteHtml(block.content || "", block.refs || []);
      // Klik token rujukan -> buka DIALOG sutta viewer ("Buka"), bukan halaman teks.
      textEl.querySelectorAll(".note-cite").forEach(a => {
        const open = (e) => {
          e.preventDefault();
          const sid = a.dataset.sid;
          const targetLang = a.dataset.lang || getLang();
          if (sid) openSuttaDialog(sid, targetLang, a.dataset.author || "", a.dataset.seg || "");
        };
        a.addEventListener("click", open);
        a.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") open(e); });
      });
      wrapper.appendChild(textEl);
    } else if (block.type === "text") {
      const textEl = document.createElement("div");
      textEl.className = "note-block-text";
      textEl.contentEditable = "true";
      textEl.textContent = block.content || "";
      textEl.addEventListener("blur", autoSave);
      wrapper.appendChild(textEl);
    } else if (block.type === "sutta") {
      const d = block.data || {};
      const isBlurb = d.author === "blurb";
      const suttaEl = document.createElement("div");
      suttaEl.className = "note-block-sutta" + (isBlurb ? " note-block-blurb" : "");
      const noteName = d.sutta_name ? ` — ${esc(d.sutta_name)}` : "";
      const langs = Object.keys(d.texts || {}).map(k => langName(k)).join(", ");
      const langHtml = langs ? `<span><i data-lucide="languages"></i> ${langs}</span>` : "";
      const authorHtml = (d.author && d.author !== "blurb") ? `<span><i data-lucide="user"></i> ${esc(authorLongName(d.author, d.source))}</span>` : "";
      suttaEl.innerHTML = `
        <div class="mini-header">
          <strong>${esc(d.formatted_id || d.sutta_id || "")}${noteName}</strong>
          <span><i data-lucide="map-pin"></i> ${esc(d.ref_display || "")}</span>
          ${authorHtml}${langHtml}
        </div>
        <div class="mini-texts">${buildMiniTexts(d)}</div>
      `;
      wrapper.appendChild(suttaEl);
    }
    return wrapper;
  }

  function collectBlocksFromDOM() {
    const blocks = [];
    document.querySelectorAll("#note-blocks .note-block").forEach(el => {
      const bd = el._blockData;
      // Blok jawaban AI: read-only, simpan apa adanya (content+refs+source) dari _blockData
      // supaya metadata tak hilang (DOM-nya HTML link, bukan teks editable).
      if (bd && bd.type === "text" && bd.source === "ai") { blocks.push(bd); return; }
      const textEl = el.querySelector(".note-block-text");
      if (textEl) { blocks.push({ type: "text", content: textEl.textContent || "" }); return; }
      if (bd && bd.type === "sutta") blocks.push(bd);
    });
    return blocks;
  }

  // ========== Notes — localStorage backend ==========
  const LS_NOTES_KEY = "dk-notes-store";

  function _lsStore() {
    try { return JSON.parse(localStorage.getItem(LS_NOTES_KEY)) || {}; }
    catch { return {}; }
  }
  function _lsSave(store) { localStorage.setItem(LS_NOTES_KEY, JSON.stringify(store)); }

  function lsNotesGetAll() {
    const store = _lsStore();
    const notes = Object.values(store).map(({ id, title, created_at, updated_at }) => ({ id, title, created_at, updated_at }));
    return { notes };
  }
  function lsNotesGet(id) { return _lsStore()[id] || null; }
  function lsNotesCreate(data) {
    const store = _lsStore();
    const id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
    const now = new Date().toISOString();
    const note = { id, title: data.title || "", blocks: data.blocks || [], created_at: now, updated_at: now };
    store[id] = note;
    _lsSave(store);
    return note;
  }
  function lsNotesUpdate(id, data) {
    const store = _lsStore();
    if (!store[id]) return null;
    const now = new Date().toISOString();
    store[id] = { ...store[id], ...data, id, updated_at: now };
    _lsSave(store);
    return store[id];
  }
  function lsNotesDelete(id) { const store = _lsStore(); delete store[id]; _lsSave(store); }

  // ========== Notes — CRUD ==========
  async function loadNotesList(openSaved = true) {
    try {
      const data = lsNotesGetAll();
      state.notes = data.notes || [];
      renderNotesList();
      const btnManage = document.getElementById("btn-manage-notes");
      if (btnManage) btnManage.disabled = false;
      if (openSaved) {
        const savedId = localStorage.getItem("dk-active-note");
        if (savedId && state.notes.some(n => n.id === savedId)) openNote(savedId);
      }
    } catch (e) { console.error("Load notes error:", e); }
  }

  function renderNotesList() {
    const notesList = $("#notes-list");
    if (!notesList) return;
    notesList.innerHTML = "";
    const locale = getLang() === "id" ? "id-ID" : "en-GB";
    const fmtShort = { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" };
    const sorted = [...state.notes].sort((a, b) => {
      const ta = a.updated_at || a.created_at || "";
      const tb = b.updated_at || b.created_at || "";
      return tb.localeCompare(ta);
    });
    sorted.forEach(n => {
      const tab = document.createElement("button");
      tab.className = "note-tab" + (n.id === state.activeNoteId ? " active" : "");
      tab.addEventListener("click", () => openNote(n.id));

      const titleEl = document.createElement("span");
      titleEl.className = "note-tab-title";
      titleEl.textContent = n.title || "Untitled";

      const dateEl = document.createElement("span");
      dateEl.className = "note-tab-date";
      const updatedStr = n.updated_at ? new Date(n.updated_at).toLocaleString(locale, fmtShort) : "";
      const createdStr = n.created_at ? new Date(n.created_at).toLocaleString(locale, fmtShort) : "";
      dateEl.textContent = updatedStr || createdStr;
      dateEl.title = [createdStr ? `Dibuat: ${createdStr}` : "", updatedStr && updatedStr !== createdStr ? `Disunting: ${updatedStr}` : ""].filter(Boolean).join("\n");

      tab.append(titleEl, dateEl);
      notesList.appendChild(tab);
    });
  }

  async function openNote(id) {
    try {
      state.activeNote = lsNotesGet(id);
      state.activeNoteId = id;
      localStorage.setItem("dk-active-note", id);
      renderNoteEditor();
      renderNotesList();
    } catch (e) { console.error("Open note error:", e); }
  }

  function renderNoteEditor() {
    const noteEditor = $("#note-editor");
    const notesEmpty = $("#notes-empty-state");
    const noteTitleInput = $("#note-title-input");
    const noteBlocks = $("#note-blocks");
    if (!state.activeNote) {
      noteEditor.classList.add("hidden");
      notesEmpty.classList.remove("hidden");
      return;
    }
    notesEmpty.classList.add("hidden");
    noteEditor.classList.remove("hidden");
    noteTitleInput.value = state.activeNote.title || "";

    refreshMetaDates();

    noteBlocks.innerHTML = "";
    (state.activeNote.blocks || []).forEach((block, idx) =>
      noteBlocks.appendChild(createNoteBlockEl(block, idx))
    );
    refreshIcons();
  }

  function uniqueNewNoteTitle() {
    const base = getLang() === "en" ? "My Note" : "Catatan Saya";
    const existing = new Set(state.notes.map(n => n.title || ""));
    if (!existing.has(base)) return base;
    let i = 2;
    while (existing.has(`${base} (${i})`)) i++;
    return `${base} (${i})`;
  }

  async function createNote(focusTitle = true) {
    try {
      const note = lsNotesCreate({ title: uniqueNewNoteTitle(), blocks: [] });
      state.activeNoteId = note.id;
      state.activeNote = note;
      localStorage.setItem("dk-active-note", note.id);
      await loadNotesList(false);  // don't call openNote — we already have state.activeNote
      renderNoteEditor();
      if (focusTitle) {
        const titleInput = $("#note-title-input");
        if (titleInput) { titleInput.focus(); titleInput.select(); }
      }
    } catch (e) { console.error("Create note error:", e); }
  }

  async function saveCurrentNote() {
    if (!state.activeNote) return;
    const titleInput = $("#note-title-input");
    state.activeNote.title = (titleInput ? titleInput.value.trim() : "") || state.activeNote.title;
    state.activeNote.blocks = collectBlocksFromDOM();
    try {
      const updated = lsNotesUpdate(state.activeNote.id, state.activeNote);
      if (updated && updated.updated_at) {
        state.activeNote.updated_at = updated.updated_at;
        const idx = state.notes.findIndex(n => n.id === state.activeNote.id);
        if (idx !== -1) {
          state.notes[idx].updated_at = updated.updated_at;
          state.notes[idx].title = state.activeNote.title;
        }
        renderNotesList();
        refreshMetaDates();
      }
    } catch (e) { console.error("Save note error:", e); }
  }

  function refreshMetaDates() {
    const metaDates = $("#note-meta-dates");
    if (!metaDates || !state.activeNote) return;
    const locale = getLang() === "id" ? "id-ID" : "en-GB";
    const fmtOpts = { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" };
    const createdStr = state.activeNote.created_at ? new Date(state.activeNote.created_at).toLocaleString(locale, fmtOpts) : "";
    const updatedStr = state.activeNote.updated_at ? new Date(state.activeNote.updated_at).toLocaleString(locale, fmtOpts) : "";
    metaDates.innerHTML = [
      createdStr ? `<span class="nm-date-entry"><i data-lucide="calendar"></i> ${createdStr}</span>` : "",
      updatedStr && updatedStr !== createdStr ? `<span class="nm-date-entry"><i data-lucide="pencil"></i> ${updatedStr}</span>` : "",
    ].filter(Boolean).join('<span class="nm-date-sep">·</span>');
    refreshIcons();
  }

  async function deleteCurrentNote() {
    if (!state.activeNote) return;
    if (!await dkConfirm(t("confirm_delete"), { danger: true })) return;
    try {
      lsNotesDelete(state.activeNote.id);
      state.activeNoteId = null;
      state.activeNote = null;
      localStorage.removeItem("dk-active-note");
      $("#note-editor").classList.add("hidden");
      $("#notes-empty-state").classList.remove("hidden");
      await loadNotesList();
    } catch (e) { console.error("Delete note error:", e); }
  }

  function addTextBlock() {
    if (!state.activeNote) return;
    const block = { type: "text", content: "" };
    state.activeNote.blocks.push(block);
    const noteBlocks = $("#note-blocks");
    noteBlocks.appendChild(createNoteBlockEl(block, state.activeNote.blocks.length - 1));
    refreshIcons();
    const newEl = noteBlocks.lastElementChild.querySelector(".note-block-text");
    if (newEl) newEl.focus();
  }

  function addBlockToNote(block) {
    if (!state.activeNote) return false;
    if (!Array.isArray(state.activeNote.blocks)) state.activeNote.blocks = [];
    state.activeNote.blocks.push(block);
    const noteEditor = $("#note-editor");
    const noteBlocks = $("#note-blocks");
    if (!noteBlocks) return false;

    // Kalau editor hidden, renderNoteEditor() sudah append semua block (termasuk yg baru)
    // jadi tidak perlu appendChild manual lagi untuk menghindari duplikat.
    if (noteEditor && noteEditor.classList.contains("hidden")) {
      renderNoteEditor(); // render semua blok, termasuk blok baru
    } else {
      // Editor sudah terbuka → append saja blok baru
      noteBlocks.appendChild(createNoteBlockEl(block, state.activeNote.blocks.length - 1));
    }

    // Buka panel notes kalau masih tertutup (mobile/tablet: panel-open class)
    const notesPanel = $("#notes-panel");
    if (notesPanel && !notesPanel.classList.contains("panel-open")) {
      notesPanel.classList.add("panel-open");
      const toggleBtn = $("#btn-panel-toggle");
      if (toggleBtn) toggleBtn.classList.add("panel-btn-open");
      const backdrop = $("#panel-backdrop");
      if (backdrop) backdrop.classList.add("visible");
    }

    refreshIcons();
    autoSave();
    const lastBlock = noteBlocks.lastElementChild;
    if (lastBlock) {
      lastBlock.style.boxShadow = "0 0 0 2px var(--success)";
      setTimeout(() => (lastBlock.style.boxShadow = ""), 1200);
      lastBlock.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    const label = getLang() === "id" ? "Ditambahkan ke catatan" : "Added to note";
    showToast(label);
    return true;
  }

  function showNotePicker(block, anchorEl) {
    const existing = document.getElementById("dk-note-picker");
    if (existing) { existing.remove(); return; }

    const isId = getLang() === "id";
    const popup = document.createElement("div");
    popup.id = "dk-note-picker";
    popup.className = "dk-note-picker";

    const hdr = document.createElement("div");
    hdr.className = "dk-note-picker-header";

    // Buat tombol silang dengan class yang baru kita buat di CSS
    const closeBtn = document.createElement("button");
    closeBtn.className = "dk-note-picker-close";
    closeBtn.innerHTML = '<i data-lucide="x" style="width: 16px; height: 16px;"></i>';
    closeBtn.title = isId ? "Tutup" : "Close";

    closeBtn.addEventListener("click", () => {
      popup.remove();
    });

    const titleSpan = document.createElement("span");
    titleSpan.textContent = isId ? "Tambah ke catatan:" : "Add to note:";

    hdr.appendChild(closeBtn);
    hdr.appendChild(titleSpan);
    popup.appendChild(hdr);

    // Render ikon Lucide di dalam header yang baru dibuat
    if (window.lucide) window.lucide.createIcons({ root: hdr });

    const sorted = [...state.notes].sort((a, b) =>
      (b.updated_at || b.created_at || "").localeCompare(a.updated_at || a.created_at || "")
    );

    const list = document.createElement("div");
    list.className = "dk-note-picker-list";

    if (sorted.length === 0) {
      const empty = document.createElement("p");
      empty.className = "dk-note-picker-empty";
      empty.textContent = isId ? "Belum ada catatan." : "No notes yet.";
      list.appendChild(empty);
    } else {
      sorted.forEach(n => {
        const item = document.createElement("button");
        item.className = "dk-note-picker-item" + (n.id === state.activeNoteId ? " active" : "");
        item.textContent = n.title || (isId ? "Tanpa judul" : "Untitled");
        item.addEventListener("click", async () => {
          popup.remove();
          await openNote(n.id);
          addBlockToNote(block);
        });
        list.appendChild(item);
      });
    }
    popup.appendChild(list);

    const divider = document.createElement("hr");
    divider.className = "dk-note-picker-divider";
    popup.appendChild(divider);

    const newBtn = document.createElement("button");
    newBtn.className = "dk-note-picker-new";
    newBtn.textContent = isId ? "+ Buat catatan baru" : "+ New note";
    newBtn.addEventListener("click", async () => {
      popup.remove();
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      await createNote(!isMobile);
      addBlockToNote(block);
    });
    popup.appendChild(newBtn);

    // Mengecek apakah ada dialog yang terbuka (sama seperti logika showToast)
    const openDialog = document.querySelector("dialog[open]");
    const container = openDialog || document.body;
    container.appendChild(popup);

    requestAnimationFrame(() => {
      const rect = anchorEl.getBoundingClientRect();
      const ph = popup.offsetHeight;
      const pw = popup.offsetWidth;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow >= ph + 6 ? rect.bottom + 4 : rect.top - ph - 4;
      const left = Math.max(4, Math.min(rect.left, window.innerWidth - pw - 4));
      popup.style.top = top + "px";
      popup.style.left = left + "px";
    });

    const closeOnOutside = (e) => {
      if (!popup.contains(e.target) && e.target !== anchorEl) {
        popup.remove();
        document.removeEventListener("click", closeOnOutside, true);
      }
    };
    setTimeout(() => document.addEventListener("click", closeOnOutside, true), 0);

    const closeOnEsc = (e) => {
      if (e.key === "Escape") { popup.remove(); document.removeEventListener("keydown", closeOnEsc); }
    };
    document.addEventListener("keydown", closeOnEsc);
  }

  let saveTimeout = null;
  function autoSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveCurrentNote, 800);
  }

  // ========== Copy Note ==========
  function copyNote() {
    if (!state.activeNote) return;
    const blocks = collectBlocksFromDOM();
    let text = (state.activeNote.title || "Catatan") + "\n" + "=".repeat(40) + "\n\n";
    blocks.forEach(block => {
      if (block.type === "text") {
        text += mdAlignTables(block.content || "") + "\n\n";   // tabel GFM -> kolom rata
      } else if (block.type === "sutta") {
        const d = block.data || {};
        const texts = d.texts || {};
        text += `[${d.formatted_id || d.sutta_id || ""}${d.sutta_name ? " — " + d.sutta_name : ""}] ${d.ref_display || ""}\n`;
        if (texts.id) text += `ID: ${texts.id}\n`;
        if (texts.en) text += `EN: ${texts.en}\n`;
        if (texts.pli) text += `PLI: ${texts.pli}\n`;
        text += "\n";
      }
    });
    navigator.clipboard.writeText(text.trim()).then(() => {
      showToast(t("msg_copied"));
    }).catch(() => {
      const ta = Object.assign(document.createElement("textarea"), { value: text });
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand("copy");
        showToast(t("msg_copied"));
      } catch (_) { /* silent */ }
      ta.remove();
    });
  }

  // ========== Download as PDF ==========
  // Satu blok Catatan -> HTML cetak. Dipakai SEMUA jalur PDF (note aktif, single, bulk)
  // biar konsisten; blok jawaban AI dapat label sumber spt di layar.
  function noteBlockToPrintHtml(block) {
    if (block.type === "text" && block.source === "ai") {
      // Print: tabel GFM -> <table> inline-style (dok cetak tanpa CSS situs); teks pakai <br>.
      return `<div class="ai-block"><div class="block-label">✦ myDhamma AI</div><div class="text-block">${renderAiNoteHtml(block.content || "", block.refs || [], { br: true, print: true })}</div></div>`;
    } else if (block.type === "text") {
      return `<div class="text-block">${esc(block.content || "").replace(/\n/g, "<br>")}</div>`;
    } else if (block.type === "sutta") {
      const d = block.data || {};
      const texts = d.texts || {};
      // Baris 1: id + nama sutta (judul kuning). Baris 2 (baru): ref + penerjemah + bahasa.
      // Teks per-bahasa TANPA label "ID:/EN:".
      const langs = Object.keys(texts).map(l => langName(l)).join(", ");
      const meta = [
        d.ref_display || "",
        d.author && d.author !== "blurb" ? authorLongName(d.author, d.source) : "",
        langs
      ].filter(Boolean).map(esc).join(" — ");
      return `<div class="sutta-block">
          <div class="sutta-ref"><strong>${esc(d.formatted_id || d.sutta_id || "")}${d.sutta_name ? " — " + esc(d.sutta_name) : ""}</strong></div>
          ${meta ? `<div class="sutta-meta">${meta}</div>` : ""}
          ${texts.id ? `<p>${esc(texts.id)}</p>` : ""}
          ${texts.en ? `<p>${esc(texts.en)}</p>` : ""}
          ${texts.pli ? `<p>${esc(texts.pli)}</p>` : ""}
        </div>`;
    }
    return "";
  }

  // Baris tanggal dibuat/diedit utk header PDF (lokal sesuai bahasa aktif).
  function noteDatesPrintHtml(note) {
    const isEn = getLang() === "en";
    const locale = isEn ? "en-GB" : "id-ID";
    const fmt = { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" };
    const c = note && note.created_at ? new Date(note.created_at).toLocaleString(locale, fmt) : "";
    const u = note && note.updated_at ? new Date(note.updated_at).toLocaleString(locale, fmt) : "";
    const parts = [];
    if (c) parts.push(`${isEn ? "Created" : "Dibuat"}: ${esc(c)}`);
    if (u && u !== c) parts.push(`${isEn ? "Edited" : "Diedit"}: ${esc(u)}`);
    return parts.length ? `<div class="note-dates">${parts.join(" · ")}</div>` : "";
  }

  // CSS bersama buat semua HTML cetak Catatan (blok AI = ungu branding, ayat = oren accent).
  const NOTE_PRINT_CSS = `
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @page{margin:1.6cm}
  body{font-family:serif;max-width:700px;margin:40px auto;color:#222;line-height:1.6}
  h1{font-size:1.4em;border-bottom:1px solid #ccc;padding-bottom:8px;margin-bottom:6px}
  .note-dates{font-size:.78em;color:#888;margin-bottom:24px}
  .text-block{margin:12px 0}
  .ai-block{margin:16px 0;border-left:3px solid #7c3aed;padding-left:12px}
  .ai-block .block-label{font-size:.72em;color:#7c3aed;font-weight:700;margin-bottom:4px}
  .ai-block .text-block{margin:0}
  .sutta-block{background:#f9f6ef;padding:12px 16px;margin:16px 0;border-left:3px solid #e8a838}
  .sutta-ref{font-size:.85em;color:#555;margin-bottom:2px}
  .sutta-ref strong{color:#cf9412}
  .sutta-meta{font-size:.78em;color:#777;margin-bottom:6px}
  p{margin:4px 0}`;

  function downloadNotePdf() {
    if (!state.activeNote) return;
    const blocks = collectBlocksFromDOM();
    const title = esc(state.activeNote.title || "Catatan");
    const body = blocks.map(noteBlockToPrintHtml).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
<style>${NOTE_PRINT_CSS}
</style></head><body><h1>${title}</h1>${noteDatesPrintHtml(state.activeNote)}${body}</body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) win.addEventListener("load", () => { win.print(); URL.revokeObjectURL(url); });
  }

  // ========== Resize ==========
  function setupResize() {
    const resizeHandle = $("#resize-handle");
    const searchPanel = $("#search-panel");
    const notesPanel = $("#notes-panel");
    if (!resizeHandle) return;

    // Restore saved width (desktop only)
    const savedWidth = localStorage.getItem("dk-notes-width");
    if (savedWidth && window.innerWidth >= 769) {
      const w = parseInt(savedWidth);
      if (w >= 280 && w <= 600) {
        notesPanel.style.flex = `0 0 ${w}px`;
      }
    }

    let isResizing = false;
    let lastNotesWidth = null;
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
      const newNotesWidth = mainRect.right - e.clientX;
      if (newSearchWidth > 350 && newNotesWidth > 280 && newNotesWidth < 600) {
        notesPanel.style.flex = `0 0 ${newNotesWidth}px`;
        lastNotesWidth = newNotesWidth;
      }
    });
    document.addEventListener("mouseup", () => {
      if (isResizing) {
        isResizing = false;
        resizeHandle.classList.remove("active");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (lastNotesWidth !== null) {
          localStorage.setItem("dk-notes-width", String(Math.round(lastNotesWidth)));
          lastNotesWidth = null;
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
    const isBlurb = frag.author === "blurb";

    const availLinks = sutta ? (sutta.available_links || {}) : {};
    function renderMain(text) {
      return isKeyword && query ? highlightKeywords(esc(text), query) : `<span class="main-text">${esc(text)}</span>`;
    }
    const tgt = isBlurb ? ' target="_blank"' : "";
    const icon = isBlurb ? "book" : "book-open";

    const order = ["pli", "id", "en"];
    const langs = [...order.filter(l => texts[l]), ...Object.keys(texts).filter(l => !order.includes(l) && texts[l])];
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
      const key = isBlurb ? "btn_open_blurb" : "btn_open_link";
      const tag = url
        ? `<a href="${url}"${tgt} class="lang-tag ${l}${isBlurb ? ' dk-open-menu-link' : ''}" title="DK (${l.toUpperCase()})" data-sutta-id="${suttaId}" data-first-ref="${firstRef}"${isBlurb ? ' data-is-blurb="1"' : ''}><i data-lucide="${icon}"></i> <span style="margin-left:2px;" data-i18n="${key}">${t(key)}</span></a>`
        : `<span class="lang-tag ${l}"><i data-lucide="${icon}"></i> <span style="margin-left:2px;" data-i18n="${key}">${t(key)}</span></span>`;
      let line = `${tag} `;
      const MAX_CTX_LEN = 200;
      if (preview && cb[l] && !(dedup && dedup.has(normCtx(cb[l])))) {
        if (dedup) dedup.add(normCtx(cb[l]));
        let html;
        if (cb[l].length > MAX_CTX_LEN) {
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
        if (ca[l].length > MAX_CTX_LEN) {
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
    const el = document.createElement("div");
    el.className = frag.author === "blurb" ? "fragment fragment-blurb" : "fragment";
    const targetId = (frag.ref && frag.ref[0]) || frag.ref_display || frag.id || "";
    if (targetId) el.dataset.segmentId = targetId;
    const meta = document.createElement("div"); meta.className = "fragment-meta";
    const isKw = ctx && ctx.method && ctx.method.includes("keyword");
    const cleanRefDisplay = frag.ref_display ? frag.ref_display.split(", ").map(formatRef).join(", ") : null;
    const refDisplay = frag.author === "blurb" ? "sinopsis" : (cleanRefDisplay || frag.ref.map(formatRef).join(", "));
    const refTitle = `${t("legend_segment")}: ${frag.ref.map(formatRef).join(", ")}`;

    // Build the text lines first so the keyword badge can mirror what is
    // actually highlighted in the shown text.
    const lines = buildFragTextLines(frag, sutta, ctx);
    const kwHighlightCount = isKw ? (lines.join(" ").match(/class="kw-match"/g) || []).length : 0;

    let scoreHtml = "";
    let scoreTitle = "";
    const isExact = frag.score_type === "exact";
    const hasSemantic = (frag.score_type || "cosine") !== "bm25" && !isExact;
    const hasKwData = frag.kw_count !== undefined;

    if (hasSemantic) {
      scoreHtml += `<span style="display:inline-flex;align-items:center;gap:3px;"><i data-lucide="target"></i> ${(frag.score * 100).toFixed(1)}%</span>`;
      scoreTitle += `${t("legend_similarity")}: ${(frag.score * 100).toFixed(1)}%`;
    }

    // Keyword count: pakai kw_count asli dari backend (jumlah kata-query distinct
    // yang hadir). Fallback hanya untuk fragmen sumber-semantik di mode hybrid
    // (tak punya data keyword) → hitung dari highlight yang benar-benar tampil.
    // CATATAN: fallback skor-BM25-dibulatkan dibuang — itu BUKAN hitungan kata.
    let kwCount = null;
    if (hasKwData) kwCount = frag.kw_count;
    else if (isKw && kwHighlightCount > 0) kwCount = kwHighlightCount;

    if (kwCount !== null) {
      const phCount = frag.phrase_count || 0;
      const kwFull = phCount ? `${phCount} frasa, ${kwCount} kata` : `${kwCount} kata`;
      const kwShort = phCount ? `${kwCount}kt, ${phCount}fr` : `${kwCount}kt`;
      const kwDisplay = `<span class="kw-full">${kwFull}</span><span class="kw-short">${kwShort}</span>`;

      if (hasSemantic) {
        scoreHtml += `<span style="margin: 0 6px; opacity: 0.5;">|</span>`;
        scoreTitle += ` | `;
      }
      scoreHtml += `<span style="display:inline-flex;align-items:center;gap:3px;"><i data-lucide="bar-chart-3"></i> ${kwDisplay}</span>`;
      scoreTitle += `${t("legend_count")}: ${kwFull}`;
    }

    // Inside a grouped (per-text) card the author lives in a sub-header, so the
    // per-segment author is suppressed via ctx.hideAuthor to avoid redundancy.
    const dbSrc = (frag.db_source || "").toUpperCase();
    const authorHtml = (!(ctx && ctx.hideAuthor) && frag.author && frag.author !== "blurb") ? `<span class="fragment-author" title="${t("legend_lang")}: ${dbSrc} | ${t("legend_author")}: ${esc(authorLongName(frag.author, frag.source))}"><i data-lucide="languages"></i> ${dbSrc} &bull; <i data-lucide="user"></i> ${esc(authorLongName(frag.author, frag.source))}</span>` : "";
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
    const collName = sutta.collection_name || "";
    let metaBadge = "";
    if (pitaka && collName) {
      metaBadge = `<span class="sutta-meta-pill"><span class="sutta-collection-badge">${esc(collName)}</span><span class="sutta-pitaka-badge ${pitaka}">${pitaka.charAt(0).toUpperCase() + pitaka.slice(1)}</span></span>`;
    } else if (pitaka) {
      metaBadge = `<span class="sutta-pitaka-badge ${pitaka}">${pitaka.charAt(0).toUpperCase() + pitaka.slice(1)}</span>`;
    } else if (collName) {
      metaBadge = `<span class="sutta-collection-badge">${esc(collName)}</span>`;
    }
    // Kiri: nomor + nama sutta. Kanan: nama kitab + badge piṭaka (sinkron web-eval).
    header.innerHTML = `
      <span class="sutta-card-title">
        <a href="${titleHref}"${titleTarget}${titleClick} class="dk-open-menu-link sutta-card-link" style="color:inherit;text-decoration:none;">
          ${sutta.formatted_id}<i data-lucide="external-link" style="width:12px;height:12px;opacity:0.6;vertical-align:-1px;margin-left:4px;"></i>${nameSpan}
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
    const authorKey = (f) => `${f.db_source || ""}::${f.source || ""}::${f.author}`;
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
      const dbSrc = (head.db_source || "").toUpperCase();
      label.title = `${t("legend_lang")}: ${dbSrc} | ${t("legend_author")}: ${esc(authorLongName(head.author, head.source))}`;
      label.innerHTML = `<i data-lucide="languages"></i> ${dbSrc} &bull; <i data-lucide="user"></i> ${esc(authorLongName(head.author, head.source))}`;
      block.appendChild(label);



      const fragsContainer = document.createElement("div");
      fragsContainer.className = "author-frags-container";

      const limit = (fctx && fctx.showAllFragments) ? Infinity : 3;
      blockFrags.forEach((f, idx) => {
        const fragEl = createFragmentEl(f, sutta, fctx);
        if (onFragment) onFragment(fragEl, f, sutta);
        if (idx >= limit) fragEl.classList.add("hidden-frag");
        fragsContainer.appendChild(fragEl);
      });

      if (blockFrags.length > limit) {
        const fadeOverlay = document.createElement("div");
        fadeOverlay.className = "frags-fade-overlay";
        fragsContainer.appendChild(fadeOverlay);

        // Buka bertahap STEP fragment per klik. Label eksplisit: berapa yg dibuka
        // klik ini vs total sisa, biar tak terbaca "loncat" (mis. 7 -> 4).
        const STEP = 3;
        const moreLabel = (remaining) =>
          `Tampilkan ${Math.min(STEP, remaining)} lagi (${remaining} tersisa) <i data-lucide="chevron-down"></i>`;
        const toggleBtn = document.createElement("button");
        toggleBtn.className = "btn-show-more";
        toggleBtn.innerHTML = moreLabel(blockFrags.length - 3);
        toggleBtn.onclick = () => {
          const hidden = fragsContainer.querySelectorAll(".hidden-frag");
          for (let i = 0; i < STEP && i < hidden.length; i++) {
            const el = hidden[i];
            el.classList.remove("hidden-frag");
            
            el.style.opacity = "0";
            el.style.transform = "translateY(-10px)";
            el.style.display = "block";
            
            const h = el.scrollHeight;
            el.style.maxHeight = "0px";
            el.style.overflow = "hidden";
            el.style.transition = "max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease, transform 0.4s ease";
            
            void el.offsetHeight;

            el.style.maxHeight = h + 80 + "px";
            el.style.opacity = "1";
            el.style.transform = "translateY(0)";
            
            setTimeout(() => {
              el.style.maxHeight = "none";
              el.style.overflow = "";
              el.style.transition = "";
              el.style.transform = "";
            }, 400);
          }
          const left = hidden.length - Math.min(STEP, hidden.length);
          if (left > 0) {
            toggleBtn.innerHTML = moreLabel(left);
            if (window.lucide) window.lucide.createIcons({ root: toggleBtn });
          } else {
            // Fade out the overlay smoothly
            fadeOverlay.style.transition = "opacity 0.3s ease";
            fadeOverlay.style.opacity = "0";
            setTimeout(() => fadeOverlay.remove(), 300);
            toggleBtn.remove();
          }
        };
        block.appendChild(fragsContainer);
        block.appendChild(toggleBtn);
      } else {
        block.appendChild(fragsContainer);
      }

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

  // ========== Sutta Dialog ==========
  const dlg = {
    el: null,
    title: null,
    langToggle: null,
    closeBtn: null,
    loading: null,
    error: null,
    errorMsg: null,
    content: null,
  };
  const dlgState = { suttaId: "", lang: "", author: "", authorSource: "", data: null, displayMode: localStorage.getItem("dk-display-mode") || "single" };
  const nmSort = { col: null, dir: null }; // col: "created_at"|"updated_at", dir: "asc"|"desc"

  function initDialog() {
    dlg.el = $("#sutta-dialog");
    if (!dlg.el) return;
    dlg.title = $("#sutta-dialog-title");
    dlg.langToggle = $("#sutta-dialog-lang-toggle");
    dlg.scLinks = $("#sutta-dialog-sc-links");
    dlg.closeBtn = $("#sutta-dialog-close");
    dlg.openLink = $("#sutta-dialog-open-link");
    dlg.displayToggle = $("#sutta-dialog-display-toggle");
    dlg.loading = $("#sutta-dialog-loading");
    dlg.error = $("#sutta-dialog-error");
    dlg.errorMsg = $("#sutta-dialog-error-msg");
    dlg.content = $("#sutta-dialog-content");

    dlg.closeBtn.addEventListener("click", () => dlg.el.close());
    dlg.el.addEventListener("click", e => { if (e.target === dlg.el) dlg.el.close(); });
    dlg.el.addEventListener("keydown", e => { if (e.key === "Escape") dlg.el.close(); });

    if (dlg.openLink) {
      dlg.openLink.addEventListener("click", function (e) {
        e.preventDefault();
        const href = this.href;
        if (!href) return;

        // Remove any existing popover
        const existing = document.getElementById("dlg-open-popover");
        if (existing) { existing.remove(); return; }

        const pop = document.createElement("div");
        pop.id = "dlg-open-popover";
        pop.className = "dlg-open-popover";

        const btnHere = document.createElement("button");
        btnHere.className = "btn-ghost";
        btnHere.innerHTML = `<i data-lucide="monitor"></i> <span data-i18n="btn_open_here">${t("btn_open_here")}</span>`;
        btnHere.onclick = () => {
          pop.remove();
          dlg.el.close();
          document.querySelectorAll(".panel-open").forEach(el => el.classList.remove("panel-open"));
          document.querySelectorAll(".panel-btn-open").forEach(el => el.classList.remove("panel-btn-open"));
          const bd = document.getElementById("panel-backdrop");
          if (bd) bd.classList.remove("visible");
          window.location.href = href;
        };

        const btnNew = document.createElement("button");
        btnNew.className = "btn-ghost";
        btnNew.innerHTML = `<i data-lucide="external-link"></i> <span data-i18n="btn_open_newtab">${t("btn_open_newtab")}</span>`;
        btnNew.onclick = () => { pop.remove(); window.open(href, "_blank"); };

        pop.appendChild(btnHere);
        pop.appendChild(btnNew);
        this.appendChild(pop);

        const dismissPop = (ev) => {
          if (!pop.contains(ev.target) && ev.target !== dlg.openLink) {
            pop.remove();
            document.removeEventListener("click", dismissPop, true);
          }
        };
        setTimeout(() => document.addEventListener("click", dismissPop, true), 0);

        if (window.lucide) window.lucide.createIcons({ root: pop });
      });
    }

    function bindDialogPanel(fabId, panelId, closeBtnId) {
      const fab = document.getElementById(fabId);
      const panel = document.getElementById(panelId);
      const closeBtn = document.getElementById(closeBtnId);
      if (!fab || !panel) return;
      fab.addEventListener("click", () => {
        panel.classList.toggle("hidden");
        if (window.lucide) window.lucide.createIcons({ root: panel });
      });
      if (closeBtn) closeBtn.addEventListener("click", () => panel.classList.add("hidden"));
      document.addEventListener("click", e => {
        if (!panel.classList.contains("hidden") && !panel.contains(e.target) && e.target !== fab && !fab.contains(e.target))
          panel.classList.add("hidden");
      });
    }
    bindDialogPanel("dlg-toc-fab", "dlg-toc-panel", "dlg-toc-close");
    bindDialogPanel("dlg-seg-fab", "dlg-seg-panel", "dlg-seg-close");

    const dlgScrollTopBtn = document.getElementById("dlg-sutta-scroll-top");
    const dlgScrollBody = document.querySelector("#sutta-dialog .sutta-dialog-body");
    if (dlgScrollTopBtn && dlgScrollBody) {
      dlgScrollBody.addEventListener("scroll", () => {
        dlgScrollTopBtn.classList.toggle("hidden", dlgScrollBody.scrollTop < 200);
      }, { passive: true });
    }
  }

  function openSuttaDialog(suttaId, lang, author, hash) {
    if (!dlg.el) return;
    dlgState.suttaId = suttaId;
    dlgState.lang = lang;
    dlgState.author = author || "";
    dlgState.authorSource = "";
    dlgState.hash = hash || "";
    dlgState.data = null;
    dlg.title.innerHTML = `<i data-lucide="book-open"></i> ${suttaId}`;
    refreshIcons();
    document.body.classList.add("is-loading-dialog");
    dlg.loading.classList.remove("hidden");
    dlg.error.classList.add("hidden");
    dlg.content.classList.add("hidden");
    dlg.content.innerHTML = "";
    dlg.el.showModal();
    loadDialogSutta(hash);
  }

  async function loadDialogSutta(hash) {
    document.body.classList.add("is-loading-dialog");
    dlg.loading.classList.remove("hidden");
    dlg.error.classList.add("hidden");
    dlg.content.classList.add("hidden");
    dlg.content.innerHTML = "";
    try {
      const _apiUrl = dlgState.author
        ? `/api/sutta/${dlgState.suttaId}/${dlgState.lang}/${dlgState.author}`
        : `/api/sutta/${dlgState.suttaId}/${dlgState.lang}`;
      const res = await fetch(_apiUrl);
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || `HTTP ${res.status}`); }
      dlgState.data = await res.json();
      dlgState.lang = dlgState.data.lang || dlgState.lang;
      dlgState.author = dlgState.data.author || "";
      dlgState.authorSource = dlgState.data.source || "";
      if (!dlgState.data.segmented) dlgState.displayMode = "single";
      const nameHtml = dlgState.data.sutta_name ? `<div class="dlg-sutta-name">${dlgState.data.sutta_name}</div>` : "";
      dlg.title.innerHTML = `<div class="dlg-title-top"><i data-lucide="book-open"></i> <span class="dlg-formatted-id">${dlgState.data.formatted_id}</span></div>${nameHtml}`;
      const _chatLink = document.getElementById("sutta-dialog-chat-link");
      if (_chatLink && dlgState.data.formatted_id)
        _chatLink.href = "/chat?tag=" + encodeURIComponent(dlgState.data.formatted_id);
      refreshIcons();

      try {
        let history = JSON.parse(localStorage.getItem("dk-recent-suttas") || "[]");
        const newItem = {
          id: dlgState.suttaId,
          lang: dlgState.lang,
          author: dlgState.author || "",
          formatted_id: dlgState.data.formatted_id,
          name: dlgState.data.sutta_name || "",
          hash: dlgState.hash || "",
          timestamp: Date.now()
        };
        let oldHash = "";
        history = history.filter(item => {
          if (item.id === newItem.id && item.lang === newItem.lang) {
            if (item.hash) oldHash = item.hash;
            return false;
          }
          return true;
        });
        if (!newItem.hash && oldHash) {
          newItem.hash = oldHash;
        }

        history.unshift(newItem);
        if (history.length > 5) history = history.slice(0, 5);
        localStorage.setItem("dk-recent-suttas", JSON.stringify(history));
        if (window.DK && window.DK.renderCombinedHistory) window.DK.renderCombinedHistory();
      } catch (e) { console.error(e); }

      // Update tombol "Buka Sutta" ke URL halaman reader standalone
      if (dlg.openLink) {
        const author = dlgState.author || dlgState.data.author || "";
        const readerUrl = author
          ? `/${dlgState.suttaId}/${dlgState.lang}/${author}`
          : `/${dlgState.suttaId}/${dlgState.lang}`;
        const fragment = dlgState.hash ? `#${dlgState.hash}` : "";
        dlg.openLink.href = readerUrl + fragment;
      }

      renderDialogLangToggle();
      renderDialogScLinks();
      renderDialogSegments(hash);
      document.body.classList.remove("is-loading-dialog");
      dlg.loading.classList.add("hidden");
      dlg.content.classList.remove("hidden");
    } catch (e) {
      document.body.classList.remove("is-loading-dialog");
      dlg.loading.classList.add("hidden");
      dlg.errorMsg.textContent = e.message || "Sutta tidak ditemukan.";
      dlg.error.classList.remove("hidden");
    }
  }

  // ── Shared sutta control builders (used by dialog AND sutta reader page) ──
  function buildDisplayToggle(container, lang, displayMode, onChange, segmented) {
    // Dua tombol selalu tampil; di-disable kalau mode tak relevan (teks Pāḷi / non-segmented).
    const dis = (lang === "pli" || segmented === false) ? " disabled" : "";
    container.innerHTML = `
      <button class="toggle-btn${displayMode === "single" ? " active" : ""}"${dis} data-mode="single" data-i18n-title="btn_single" title="${t("btn_single")}"><i data-lucide="align-justify"></i><span class="nav-full" style="margin-left:4px;" data-i18n="btn_single">${t("btn_single")}</span></button>
      <button class="toggle-btn${displayMode === "sidebyside" ? " active" : ""}"${dis} data-mode="sidebyside" data-i18n-title="btn_sidebyside" title="${t("btn_sidebyside")}"><i data-lucide="columns-2"></i><span class="nav-full" style="margin-left:4px;" data-i18n="btn_sidebyside">${t("btn_sidebyside")}</span></button>`;
    if (window.lucide) window.lucide.createIcons({ root: container });
    container.querySelectorAll(".toggle-btn").forEach(btn => {
      btn.addEventListener("click", () => { if (!btn.disabled) onChange(btn.dataset.mode); });
    });
  }

  function buildScLinks(container, data) {
    if (!data || !data.sutta_id) { container.innerHTML = ""; return; }
    const scBase = `https://suttacentral.net/${esc(data.sutta_id)}`;
    container.innerHTML = `<a href="${scBase}" target="_blank" class="sc-link-suttaplex" title="Buka di SuttaCentral"><i data-lucide="external-link"></i></a>`;
    if (window.lucide) window.lucide.createIcons({ root: container });
  }

  function renderDialogLangToggle() {
    const avail = (dlgState.data && dlgState.data.available_paths) || {};
    let html = `<select class="sutta-lang-dropdown">`;
    ["pli", "id", "en"].forEach(l => {
      if (!avail[l]) return;
      (avail[l] || []).forEach(entry => {
        const uid = entry.uid;
        const source = entry.source;
        const selected = (dlgState.lang === l && dlgState.author === uid && dlgState.authorSource === source) ? "selected" : "";
        html += `<option value="${l}:${source}:${uid}" ${selected}>${langName(l)} — ${authorLongName(uid, source)}</option>`;
      });
    });
    html += `</select>`;
    dlg.langToggle.innerHTML = html;

    dlg.langToggle.querySelector("select").addEventListener("change", function () {
      const [lang, source, author] = this.value.split(":");
      dlgState.lang = lang;
      dlgState.author = author || "";
      dlgState.authorSource = source || "";
      if (lang !== "en") dlgState.displayMode = "single";
      loadDialogSutta();
    });
    refreshDialogDisplayToggle();
  }

  function refreshDialogDisplayToggle() {
    buildDisplayToggle(dlg.displayToggle, dlgState.lang, dlgState.displayMode, mode => {
      dlgState.displayMode = mode;
      localStorage.setItem("dk-display-mode", mode);
      refreshDialogDisplayToggle();
      renderDialogSegments();
      dlg.content.classList.remove("hidden");
    }, dlgState.data && dlgState.data.segmented);
  }

  function renderDialogScLinks() {
  }

  function renderSegments(targetEl, data, lang, displayMode, opts) {
    opts = opts || {};
    const idPrefix = opts.idPrefix !== undefined ? opts.idPrefix : "dlg-";
    const hash = opts.hash || null;
    const isSideBySide = displayMode === "sidebyside" && lang !== "pli";
    targetEl.innerHTML = "";

    let hasMdSegment = false;
    data.segments.forEach(seg => {
      const anchorId = seg.ids && seg.ids.length > 0 ? seg.ids[0] : "";
      const refSuffix = anchorId.includes(":") ? anchorId.split(":").pop() : anchorId;
      if (refSuffix.startsWith("md")) hasMdSegment = true;
    });

    if (hasMdSegment) {
      const notice = document.createElement("div");
      notice.className = "md-segment-notice";
      notice.innerHTML = `<i data-lucide="info"></i> <span data-i18n-html="sutta_md_notice">${t("sutta_md_notice")}</span>`;
      targetEl.appendChild(notice);
      if (window.lucide) window.lucide.createIcons({ root: notice });
    }

    const container = document.createElement("div");
    container.className = isSideBySide ? "sutta-segments side-by-side" : "sutta-segments";
    data.segments.forEach(seg => {
      const segText = seg.text || seg.pli || seg.en || "";
      if (!segText) return;
      const anchorId = seg.ids && seg.ids.length > 0 ? seg.ids[0] : "";
      const refSuffix = anchorId.includes(":") ? anchorId.split(":").pop() : anchorId;
      const isPreamble = refSuffix.startsWith("0.");
      const segEl = document.createElement("div");
      segEl.className = "sutta-segment" +
        (isPreamble ? " sutta-preamble" : "") +
        (seg.heading >= 1 && !isPreamble ? ` sutta-heading-${seg.heading}` : "");
      if (anchorId) segEl.id = idPrefix + anchorId;

      const parts = (seg.parts && seg.parts.length > 0) ? seg.parts : null;
      const secondaryKey = lang !== "pli" ? "pli" : "en";
      const partsOpts = { headingAware: true, isHeading: seg.heading >= 1 };
      const renderParts = (key) => renderPartsHtml(parts, key, partsOpts);

      if (isSideBySide) {
        const colLeft = document.createElement("div");
        colLeft.className = "seg-col seg-primary";
        colLeft.innerHTML = parts ? renderParts("text") : segText;
        const colRight = document.createElement("div");
        colRight.className = "seg-col seg-secondary";
        colRight.innerHTML = parts ? renderParts(secondaryKey) : ((lang !== "pli" ? seg.pli : seg.en) || "");
        segEl.appendChild(colLeft);
        segEl.appendChild(colRight);
      } else {
        const textEl = document.createElement("div");
        textEl.className = "seg-text";
        textEl.innerHTML = parts ? renderParts("text") : segText;
        segEl.appendChild(textEl);
      }

      if (anchorId) {
        const ref = document.createElement("a");
        ref.className = "seg-ref";
        const path = `/${data.sutta_id}/${lang}${data.author ? '/' + data.author : ''}`;
        ref.href = `${path}#${anchorId}`;
        ref.style.textDecoration = "none";
        ref.textContent = compactRef(seg.ids);
        ref.title = seg.ids.join(", ");
        segEl.appendChild(ref);
      }

      const addBtn = document.createElement("button");
      addBtn.className = "seg-add-btn";
      addBtn.innerHTML = `<span class="full" data-i18n="btn_add_note">${t("btn_add_note")}</span><span class="short" data-i18n="btn_add_note_short">${t("btn_add_note_short")}</span>`;
      addBtn.addEventListener("click", (e) => {
        const block = {
          type: "sutta",
          data: {
            sutta_id: data.sutta_id,
            formatted_id: data.formatted_id,
            sutta_name: data.sutta_name || "",
            author: data.author || "",
            source: data.source || "",
            ref: seg.ids,
            ref_display: compactRef(seg.ids),
            texts: { [lang]: segText },
            parts: parts,
            parts_lang: parts ? lang : null,
            available_links: data.available_links || {},
          },
        };
        showNotePicker(block, e.currentTarget);
      });
      segEl.appendChild(addBtn);
      container.appendChild(segEl);
    });
    targetEl.appendChild(container);

    if (hash) {
      let target = targetEl.querySelector(`#${CSS.escape(idPrefix + hash)}`);
      if (!target && !hash.includes(":") && data && data.sutta_id) {
        target = targetEl.querySelector(`#${CSS.escape(idPrefix + data.sutta_id + ":" + hash)}`);
      }
      if (target) {
        target.classList.add("dlg-target");
        setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
      }
    }
    refreshIcons();
  }

  function renderDialogSegments(targetHash) {
    if (!dlgState.data) return;
    renderSegments(dlg.content, dlgState.data, dlgState.lang, dlgState.displayMode, { idPrefix: "dlg-", hash: targetHash });
    buildDialogToc();
    buildDialogSegList();
  }

  function scrollToDialogSegment(anchorId) {
    const dialogBody = document.querySelector("#sutta-dialog .sutta-dialog-body");
    document.querySelectorAll("#sutta-dialog .sutta-segment.dlg-target").forEach(el => {
      el.classList.remove("dlg-target");
    });
    const target = document.getElementById(anchorId);
    if (target) {
      target.classList.add("dlg-target");
      if (dialogBody) {
        const targetPos = target.offsetTop - dialogBody.offsetTop;
        dialogBody.scrollTo({ top: targetPos - 20, behavior: "smooth" });
      } else {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }

  function buildDialogToc() {
    const fab = document.getElementById("dlg-toc-fab");
    const list = document.getElementById("dlg-toc-list");
    if (!fab || !list || !dlgState.data) return;

    const entries = [];
    dlgState.data.segments.forEach(s => {
      const anchorId = s.ids && s.ids.length ? "dlg-" + s.ids[0] : "";
      const ref = anchorId.includes(":") ? anchorId.split(":").pop() : anchorId;
      if (ref.startsWith("0.")) return;
      if (s.text && s.heading >= 1 && s.heading <= 5) {
        entries.push({ anchorId, text: s.text, level: s.heading });
        return;
      }
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
          document.getElementById("dlg-toc-panel").classList.add("hidden");
          scrollToDialogSegment(entry.anchorId);
        });
      }
      list.appendChild(item);
    });

    fab.classList.remove("hidden");
    if (window.lucide) window.lucide.createIcons({ root: fab });
  }

  function buildDialogSegList() {
    const fab = document.getElementById("dlg-seg-fab");
    const list = document.getElementById("dlg-seg-list");
    if (!fab || !list || !dlgState.data) return;

    const segs = dlgState.data.segments.filter(s => s.ids && s.ids.length && s.text);
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
          document.getElementById("dlg-seg-panel").classList.add("hidden");
          scrollToDialogSegment(anchorId);
        });
      }
      list.appendChild(item);
    };

    const isHeadingPart = p => p.heading >= 1;
    const isSpeakerPart = p => !isHeadingPart(p) && /class=['"][^'"]*speaker/i.test(String(p.text || ""));

    segs.forEach(seg => {
      const anchorId = "dlg-" + seg.ids[0];
      if (seg.heading >= 1 && seg.heading <= 5) {
        addItem("§", seg.text, anchorId, "heading");
        return;
      }
      const parts = seg.parts || [];
      const leadParts = parts.filter(p => isHeadingPart(p) || isSpeakerPart(p));
      leadParts.forEach(p =>
        isHeadingPart(p)
          ? addItem("§", p.text, anchorId, "heading")
          : addItem("»", p.text, anchorId, "speaker")
      );
      const contentText = leadParts.length
        ? parts.filter(p => !isHeadingPart(p) && !isSpeakerPart(p)).map(p => p.text || "").join(" ")
        : seg.text;
      addItem(compactRef(seg.ids), contentText, anchorId, "");
    });

    fab.classList.remove("hidden");
    if (window.lucide) window.lucide.createIcons({ root: fab });
  }

  function interceptDkLinks() {
    document.addEventListener("click", e => {
      const link = e.target.closest("a.sc-link, a.lang-tag");
      if (!link) return;
      if (link.dataset.isBlurb) return;
      const href = link.getAttribute("href");
      if (!href || !href.startsWith("/")) return;
      e.preventDefault();
      const match = href.match(/^\/([^/]+)\/([^/#]+)(?:\/([^#]+))?(?:#(.+))?$/);
      if (match) openSuttaDialog(match[1], match[2], match[3] || "", match[4] || "");
      else window.location.href = href;
    });
  }

  // ========== Custom Dialog (replaces native alert / confirm) ==========
  let _dkDialog = null;
  function _ensureDialog() {
    if (_dkDialog) return _dkDialog;
    _dkDialog = document.createElement("dialog");
    _dkDialog.id = "dk-dialog";
    document.body.appendChild(_dkDialog);
    _dkDialog.addEventListener("click", e => { if (e.target === _dkDialog) _dkDialog.close(); });
    // Guard: showModal() pada <dialog> yg SUDAH terbuka melempar InvalidStateError dan
    // bikin dialog nyangkut (semua dialog berikutnya mati). Tutup dulu kalau terbuka.
    const _origShowModal = _dkDialog.showModal.bind(_dkDialog);
    _dkDialog.showModal = function () {
      if (this.open) { try { this.close(); } catch (e) { /* abaikan */ } }
      return _origShowModal();
    };
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
        <button class="dk-dlg-btn primary" id="dk-dlg-ok">${t("dlg_btn_ok")}</button>
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
    const confirmLabel = opts.confirmLabel || (isDanger ? t("dlg_btn_delete") : t("dlg_btn_continue"));
    const cancelLabel = opts.cancelLabel || t("dlg_btn_cancel");
    const iconName = isDanger ? "triangle-alert" : "help-circle";
    const iconClass = isDanger ? "warn" : "info";
    dlg.innerHTML = `
      <div class="dk-dlg-body">
        <div class="dk-dlg-icon ${iconClass}"><i data-lucide="${iconName}" style="width: 24px; height: 24px;"></i></div>
        <div class="dk-dlg-msg">${esc(message)}</div>
      </div>
      <div class="dk-dlg-footer">
        <button class="dk-dlg-btn cancel" id="dk-dlg-cancel">${cancelLabel}<span class="dk-dlg-kbd">Esc</span></button>
        <button class="dk-dlg-btn ${isDanger ? "danger" : "primary"}" id="dk-dlg-confirm">${confirmLabel}<span class="dk-dlg-kbd">↵</span></button>
      </div>`;
    if (window.lucide) window.lucide.createIcons({ root: dlg });
    dlg.showModal();
    return new Promise(resolve => {
      let resolved = false;
      const doResolve = (val) => { if (!resolved) { resolved = true; dlg.close(); resolve(val); } };
      dlg.onclose = () => { if (!resolved) { resolved = true; resolve(false); } };
      // Fokus ke tombol konfirmasi -> Enter langsung mengiyakan (sesuai hint ↵ di tombol).
      dlg.querySelector("#dk-dlg-confirm").focus();
      dlg.querySelector("#dk-dlg-cancel").onclick = () => doResolve(false);
      dlg.querySelector("#dk-dlg-confirm").onclick = () => doResolve(true);
      // Enter = konfirmasi (Hapus/Lanjut), Escape = batal.
      dlg._enterHandler = (e) => {
        if (e.key === "Enter") { e.preventDefault(); doResolve(true); }
        else if (e.key === "Escape") { e.preventDefault(); doResolve(false); }
      };
      dlg.addEventListener("keydown", dlg._enterHandler);
    });
  }

  function dkPrompt(message, opts) {
    opts = opts || {};
    const dlg = _ensureDialog();
    const confirmLabel = opts.confirmLabel || t("dlg_btn_continue");
    const cancelLabel = opts.cancelLabel || t("dlg_btn_cancel");
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
        <button class="dk-dlg-btn cancel" id="dk-dlg-cancel">${cancelLabel}<span class="dk-dlg-kbd">Esc</span></button>
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

  // Topik/kueri rekomendasi — SATU sumber, dipakai home (chip rekomendasi) & chat
  // (empty-state contoh prompting). common.js ke-load di semua halaman.
  const RECOMMENDED_QUERIES = {
    id: [
      "yang tidak dilahirkan", "bakti kepada orangtua", "bahaya kemarahan", "perenungan kematian",
      "kebahagiaan adalah", "hukum kamma", "empat jenis manusia", "jenis jenis perasaan",
      "empat unsur", "cinta kasih", "kemelekatan adalah", "jenis penderitaan", "jenis belenggu",
      "manfaat meditasi", "perhatian pada napas", "lima rintangan batin", "pentingnya kesabaran",
      "moralitas adalah", "mengatasi kesedihan", "ucapan benar", "godaan mara", "tanpa diri",
      "berkah utama", "empat kebenaran mulia", "tujuh faktor pencerahan", "pengendalian indria",
      "bahaya minuman keras", "kekayaan sejati", "mengatasi kemalasan", "kasih sayang ibu",
      "perumpamaan rakit", "keinginan indriawi", "ketenangan pikiran", "perumpamaan gergaji",
      "kisah angulimala", "nasihat kepada rahula", "kebijaksanaan adalah", "pentingnya keyakinan",
      "hidup menyendiri", "suami istri", "memilih teman", "delapan kondisi duniawi", "iri hati",
      "kemurahan hati", "bahaya kesombongan", "usia tua", "surga dan neraka", "puasa uposatha",
      "pertengkaran dan perselisihan", "tidur nyenyak", "rasa malu berbuat jahat",
      "perumpamaan anak panah", "kemelekatan pada pandangan", "kisah visakha", "bhikkhu menerima uang",
      "makan setelah tengah hari", "aturan jubah", "mengaku pencapaian palsu", "menggali tanah",
      "berbohong", "penahbisan bhikkhu", "aturan makan bhikkhu", "kriteria pembabar",
      "mengusir bhikkhu", "membunuh makhluk hidup", "aturan mandi",
    ],
    en: [
      "freedom from rebirth", "gratitude to parents", "danger of anger", "mindfulness of death",
      "happiness is", "the law of kamma", "four kinds of persons", "kinds of feelings",
      "four elements", "loving kindness", "clinging is", "kinds of suffering", "kinds of fetters",
      "benefits of meditation", "mindfulness of breathing", "five hindrances", "importance of patience",
      "virtue is", "overcoming grief", "right speech", "temptations of mara", "not self",
      "highest blessings", "four noble truths", "seven factors of awakening", "sense restraint",
      "danger of alcohol", "true wealth", "overcoming laziness", "a mother's love",
      "simile of the raft", "sensual desire", "serenity of mind", "simile of the saw",
      "story of angulimala", "advice to rahula", "wisdom is", "importance of faith",
      "living in solitude", "husband and wife", "choosing friends", "eight worldly conditions",
      "envy", "generosity", "danger of conceit", "old age", "heaven and hell", "uposatha observance",
      "quarrels and disputes", "sleeping well", "moral shame", "the dart of grief",
      "clinging to views", "story of visakha", "monks accepting money", "eating after noon",
      "robe rules", "false claims of attainment", "digging the earth", "lying", "ordination of monks",
      "rules on eating", "qualities of a dhamma speaker", "expulsion from the sangha",
      "killing living beings", "bathing rules",
    ],
  };

  // ========== Public API ==========
  window.DK = {
    state, esc, buildMiniTexts, addBlockToNote, showNotePicker, updateAllLinksInDOM, copyNote, downloadNotePdf, t, getLang,
    highlightKeywords, buildFragTextLines, createFragmentEl, createSuttaCardEl, renderSuttaCardsTo, openSuttaDialog,
    compactRef, showToast, renderSegments, buildDisplayToggle, buildScLinks, langName, authorLongName,
    alert: dkAlert, confirm: dkConfirm, prompt: dkPrompt, RECOMMENDED_QUERIES, mdAlignTables,
  };

  // ========== Reader display settings (Segmen) ==========
  // Centangan opsional di dialog "Atur" (base.html), berlaku global.
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

  // ========== Reader settings dialog ("Atur") ==========
  function initReaderSettings() {
    const dlg = document.getElementById("reader-settings-dialog");
    if (!dlg) return;
    const open = () => { dlg.showModal(); refreshIcons(); };
    const close = () => dlg.close();
    document.getElementById("sutta-dialog-settings-btn")?.addEventListener("click", open);
    document.getElementById("reader-page-settings-btn")?.addEventListener("click", open);
    document.getElementById("reader-settings-close")?.addEventListener("click", close);
    // klik backdrop (luar konten) untuk menutup
    dlg.addEventListener("click", e => { if (e.target === dlg) close(); });
  }

  // ========== "Go to Sutta" dialog (Lompat ke Teks) ==========
  function initGotoSutta() {
    const gotoDlg = document.getElementById("goto-dialog");
    const btnOpen = document.getElementById("btn-goto-sutta");
    const btnClose = document.getElementById("btn-close-goto");
    const inpCol = document.getElementById("goto-collection");
    const inpNum = document.getElementById("goto-number");
    const inpTitle = document.getElementById("goto-title");
    const preview = document.getElementById("goto-preview");
    const btnGo = document.getElementById("btn-goto-go");
    if (!gotoDlg || !btnOpen) return;

    let collections = [];   // [{uid, display}, …]
    let loaded = false;
    let browseData = null;
    let suttaNames = null;
    let lastColUid = "";    // resolved collection uid for number suggestions
    let validNumsMap = new Map(); // maps '22' -> 'mn22' (full leaf id)
    let validTitlesMap = new Map(); // maps 'Alagaddūpamasutta' -> 'mn22'
    let leafIdsCache = null;        // hasil collectLeafIds (di-cache; pohon tak berubah)
    let titlesBuilt = false;        // datalist judul (~8rb opsi) dibangun SEKALI, lazy

    // Create datalists
    const dlCol = document.createElement("datalist");
    dlCol.id = "goto-col-suggestions";
    gotoDlg.appendChild(dlCol);
    if (inpCol) inpCol.setAttribute("list", "goto-col-suggestions");

    const dlNum = document.createElement("datalist");
    dlNum.id = "goto-num-suggestions";
    gotoDlg.appendChild(dlNum);
    if (inpNum) inpNum.setAttribute("list", "goto-num-suggestions");

    const dlTitle = document.createElement("datalist");
    dlTitle.id = "goto-title-suggestions";
    gotoDlg.appendChild(dlTitle);
    if (inpTitle) inpTitle.setAttribute("list", "goto-title-suggestions");

    // Walk browse tree and collect all leaf sutta IDs
    function collectLeafIds(node) {
      const ids = [];
      if (typeof node === "string") { ids.push(node); return ids; }
      if (Array.isArray(node)) { node.forEach(n => ids.push(...collectLeafIds(n))); return ids; }
      if (typeof node === "object" && node !== null) {
        Object.values(node).forEach(v => ids.push(...collectLeafIds(v)));
      }
      return ids;
    }

    // Walk pohon mahal (~8rb leaf) — cache sekali; browseData tidak berubah selama sesi.
    function getLeafIds() {
      if (!leafIdsCache) leafIdsCache = browseData ? collectLeafIds(browseData) : [];
      return leafIdsCache;
    }

    function extractNumber(id, prefix) {
      let short = id.toLowerCase().replace(/^pli-tv-/, "").replace(/^(bu|bi)-vb-/, "$1-");
      const match = short.match(/^([a-z\-]+?)([0-9].*)$/);
      if (match && match[1] === prefix) return match[2];
      return null;
    }

    // Resolve user input to a valid collection uid (case-insensitive)
    function resolveCollection(input) {
      if (!input) return null;
      const v = input.trim().toLowerCase().replace(/[\s\-]+/g, "-");
      // Try exact uid match, then display match
      return collections.find(c => c.uid === v)
        || collections.find(c => c.display.toLowerCase() === v)
        || collections.find(c => c.display.toLowerCase().replace(/[\s\-]+/g, "-") === v)
        || null;
    }

    function populateCollectionSuggestions() {
      dlCol.innerHTML = "";
      collections.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.display;   // show "MN", "DN", etc. as suggestion text
        dlCol.appendChild(opt);
      });
    }

    function populateNumberSuggestions() {
      dlNum.innerHTML = "";
      validNumsMap.clear();
      if (!inpCol) return;
      const col = resolveCollection(inpCol.value);
      if (!col || !browseData) return;
      const prefix = col.uid;
      lastColUid = prefix;

      const allIds = getLeafIds();
      allIds.forEach(id => {
        const n = extractNumber(id, prefix);
        if (n && !validNumsMap.has(n)) {
          validNumsMap.set(n, id);
          const opt = document.createElement("option");
          opt.value = n;
          dlNum.appendChild(opt);
        }
      });
    }

    function removeDiacritics(str) {
      return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    function populateTitleSuggestions() {
      // Build SEKALI saja (lazy): ~8rb <option> mahal; pohon & nama tak berubah selama sesi.
      if (titlesBuilt) return;
      if (!browseData || !suttaNames) return;
      dlTitle.innerHTML = "";
      validTitlesMap.clear();

      const allIds = getLeafIds();
      const frag = document.createDocumentFragment();
      allIds.forEach(id => {
        if (suttaNames[id]) {
          const title = suttaNames[id];
          const normalized = removeDiacritics(title).toLowerCase();

          if (!validTitlesMap.has(normalized)) {
            validTitlesMap.set(normalized, id);
            // Also map the exact lowercase version in case it differs
            validTitlesMap.set(title.toLowerCase(), id);

            const opt = document.createElement("option");
            opt.value = title;
            // Provide the ASCII string as textContent so the native datalist filters it
            if (normalized !== title.toLowerCase()) {
              opt.textContent = normalized;
            }
            frag.appendChild(opt);
          }
        }
      });
      dlTitle.appendChild(frag);   // satu kali append (bukan 8rb reflow)
      titlesBuilt = true;
    }

    async function ensureBrowseData() {
      if (browseData) return;
      try {
        const res = await fetch("/api/browse");
        if (res.ok) browseData = await res.json();
      } catch (_) { /* ignore */ }
    }

    async function ensureSuttaNames() {
      if (suttaNames) return;
      try {
        const res = await fetch("/api/sutta-names");
        if (res.ok) suttaNames = await res.json();
      } catch (_) { /* ignore */ }
    }

    async function ensureCollections() {
      if (loaded) return;
      try {
        const res = await fetch("/api/collections");
        if (res.ok) collections = await res.json();
      } catch (_) { /* ignore */ }
      loaded = true;
    }

    function buildId() {
      if (inpTitle && inpTitle.value.trim()) {
        const normTitle = removeDiacritics(inpTitle.value.trim()).toLowerCase();
        if (validTitlesMap.has(normTitle)) return validTitlesMap.get(normTitle);
      }
      if (inpCol && inpNum) {
        const col = resolveCollection(inpCol.value);
        const num = inpNum.value.trim();
        if (col && num && validNumsMap.has(num)) return validNumsMap.get(num);
      }
      return "";
    }

    function extractDisplayPrefixAndNum(fullId) {
      let short = fullId.toLowerCase().replace(/^pli-tv-/, "").replace(/^(bu|bi)-vb-/, "$1-");
      const match = short.match(/^([a-z\-]+?)([0-9].*)$/);
      if (match) {
        const c = collections.find(x => x.uid === match[1]);
        if (c) return { displayCol: c.display, displayNum: match[2] };
      }
      return { displayCol: fullId, displayNum: "" };
    }

    function updatePreview() {
      btnGo.disabled = true;
      btnGo.style.opacity = "0.5";
      btnGo.style.cursor = "not-allowed";

      const titleVal = inpTitle ? inpTitle.value.trim() : "";

      // If title input is active and filled
      if (titleVal) {
        const normTitle = removeDiacritics(titleVal).toLowerCase();
        if (validTitlesMap.has(normTitle)) {
          const fullId = validTitlesMap.get(normTitle);
          const { displayCol, displayNum } = extractDisplayPrefixAndNum(fullId);
          preview.innerHTML = `<span style="color: var(--accent); font-weight: bold;">&rarr; ${esc(displayCol)} ${esc(displayNum)}</span> &mdash; ${esc(suttaNames[fullId] || titleVal)}`;
          btnGo.disabled = false;
          btnGo.style.opacity = "1";
          btnGo.style.cursor = "pointer";
        } else {
          const label = getLang() === "en" ? "Title not found" : "Judul tidak ditemukan";
          preview.innerHTML = `<span style="color: var(--accent); font-weight: bold;">&rarr;</span> <span style="color: #ef4444;">${label}</span>`;
        }
        return;
      }

      // Otherwise fall back to Collection + Number logic
      if (!inpCol || !inpNum) return;
      const col = resolveCollection(inpCol.value);
      const num = inpNum.value.trim();

      if (!col) {
        if (inpCol.value.trim()) {
          preview.innerHTML = `<span style="color: #ef4444;">Koleksi tidak valid</span>`;
        } else {
          preview.textContent = "";
        }
        return;
      }

      // Refresh number suggestions if collection changed
      if (col.uid !== lastColUid) populateNumberSuggestions();

      if (!num) {
        preview.textContent = "";
        return;
      }

      if (validNumsMap.has(num)) {
        const fullId = validNumsMap.get(num);
        const name = (suttaNames && suttaNames[fullId]) ? ` &mdash; ${esc(suttaNames[fullId])}` : "";
        preview.innerHTML = `<span style="color: var(--accent); font-weight: bold;">&rarr; ${esc(col.display)} ${esc(num)}</span>${name}`;
        btnGo.disabled = false;
        btnGo.style.opacity = "1";
        btnGo.style.cursor = "pointer";
      } else {
        const label = getLang() === "en" ? "Not available" : "Tidak tersedia";
        preview.innerHTML = `<span style="color: var(--accent); font-weight: bold;">&rarr; ${esc(col.display)} ${esc(num)}</span> <span style="color: #ef4444; margin-left: 4px;">(${label})</span>`;
      }
    }

    function doGoto() {
      const id = buildId();
      if (!id) return;
      gotoDlg.close();
      window.location.href = "/" + encodeURIComponent(id);
    }

    btnOpen.addEventListener("click", async () => {
      if (inpCol) inpCol.value = "";
      if (inpNum) inpNum.value = "";
      if (inpTitle) inpTitle.value = "";
      if (preview) preview.innerHTML = "";
      if (btnGo) {
        btnGo.disabled = true;
        btnGo.style.opacity = "0.5";
        btnGo.style.cursor = "not-allowed";
      }

      // Tampilkan dialog DULU (instan) — jangan tunggu fetch. Data diisi di latar belakang.
      gotoDlg.showModal();
      refreshIcons();
      setTimeout(() => {
        // Hanya auto-focus di desktop/layar besar. Di mobile, auto-focus bikin keyboard naik dan menutupi layar.
        if (inpCol && window.innerWidth > 768) {
          inpCol.focus();
        }
      }, 50);

      // Lalu muat data & isi saran di latar belakang (fetch paralel; di-cache utk buka berikutnya).
      await Promise.all([ensureCollections(), ensureBrowseData(), ensureSuttaNames()]);
      if (!gotoDlg.open) return;   // user keburu nutup -> jangan kerja sia-sia
      populateCollectionSuggestions();   // ringan (~20 koleksi)
      // Saran ANGKA sengaja TIDAK dibangun di sini — lazy, baru jalan setelah user
      // memilih koleksi (DN/MN/AN/...) lewat listener input inpCol -> populateNumberSuggestions().
      // Saran JUDUL juga lazy (saat fokus field judul). Dua-duanya mahal kalau eager.
      updatePreview();
    });

    if (btnClose) btnClose.addEventListener("click", () => gotoDlg.close());
    // Tutup HANYA kalau klik benar-benar di luar kotak dialog (backdrop). Cek e.target===dialog
    // saja keliru: klik di area PADDING dialog juga lolos -> dialog "ilang" pas klik-klik di dalam.
    // Pakai bounding-rect: tutup cuma kalau koordinat klik di luar kotak konten.
    gotoDlg.addEventListener("click", e => {
      if (e.target !== gotoDlg) return;            // klik anak (input/tombol) -> jangan tutup
      const r = gotoDlg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right &&
        e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) gotoDlg.close();                // hanya backdrop sejati yang menutup
    });

    if (inpCol) {
      inpCol.addEventListener("input", () => {
        if (inpTitle) inpTitle.value = ""; // clear title
        populateNumberSuggestions();
        updatePreview();
      });
      inpCol.addEventListener("change", () => {
        if (inpCol.value.trim() && resolveCollection(inpCol.value)) {
          if (inpNum) inpNum.focus();
        }
      });
      inpCol.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); inpNum.focus(); }
      });
    }
    if (inpNum) {
      inpNum.addEventListener("input", () => {
        if (inpTitle) inpTitle.value = ""; // clear title
        updatePreview();
      });
      inpNum.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); doGoto(); }
      });
    }
    if (inpTitle) {
      // Lazy: bangun datalist judul (~8rb opsi) saat user pertama fokus ke field ini,
      // bukan saat dialog dibuka. Banyak user pakai Koleksi+Nomor, tak perlu bayar ongkos ini.
      inpTitle.addEventListener("focus", populateTitleSuggestions);
      inpTitle.addEventListener("input", () => {
        populateTitleSuggestions();    // guard titlesBuilt -> murah setelah build pertama
        if (inpCol) inpCol.value = ""; // clear col
        if (inpNum) inpNum.value = ""; // clear num
        updatePreview();
      });
      inpTitle.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); doGoto(); }
      });
    }
    if (btnGo) btnGo.addEventListener("click", doGoto);
  }

  // ========== Font settings (di dalam dialog "Setelan", global) ==========
  // Berlaku ke #sutta-body (halaman reader) & #sutta-dialog-content (popup).
  function initFontSettings() {
    const FONT_SIZES = [90, 100, 110, 125, 140];
    const LINE_HEIGHTS = [1.1, 1.25, 1.4, 1.55, 1.7, 1.85, 2.0];
    const fontState = {
      sizeIdx: parseInt(localStorage.getItem("dk-font-size-idx") ?? "1"),
      lineIdx: parseInt(localStorage.getItem("dk-line-height-idx") ?? "3"),
      family: localStorage.getItem("dk-font-family") || "sans",
    };

    function apply() {
      const pct = FONT_SIZES[fontState.sizeIdx];
      const lh = LINE_HEIGHTS[fontState.lineIdx];
      [document.getElementById("sutta-body"), document.getElementById("sutta-dialog-content")].forEach(el => {
        if (!el) return;
        el.style.zoom = pct + "%";
        el.style.setProperty("--reader-line-height", lh);
        el.classList.toggle("reader-serif", fontState.family === "serif");
      });
      const slider = document.getElementById("font-size-slider");
      if (slider) slider.value = fontState.sizeIdx;
      const lhSlider = document.getElementById("line-height-slider");
      if (lhSlider) lhSlider.value = fontState.lineIdx;
      ["font-family-sans", "font-family-serif"].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.toggle("active", id.endsWith(fontState.family));
      });
      // Pratinjau ikut semua setelan: gaya (sans/serif), ukuran (zoom), & tinggi baris
      const preview = document.getElementById("rs-preview");
      if (preview) {
        preview.classList.toggle("reader-serif", fontState.family === "serif");
        preview.style.setProperty("--reader-line-height", lh);
        const previewText = preview.querySelector(".rs-preview-text");
        if (previewText) previewText.style.zoom = pct + "%";
      }
    }

    function save() {
      localStorage.setItem("dk-font-size-idx", fontState.sizeIdx);
      localStorage.setItem("dk-line-height-idx", fontState.lineIdx);
      localStorage.setItem("dk-font-family", fontState.family);
    }

    document.getElementById("font-size-slider")?.addEventListener("input", function () {
      fontState.sizeIdx = parseInt(this.value); apply(); save();
    });
    document.getElementById("line-height-slider")?.addEventListener("input", function () {
      fontState.lineIdx = parseInt(this.value); apply(); save();
    });
    document.getElementById("font-family-sans")?.addEventListener("click", () => {
      fontState.family = "sans"; apply(); save();
    });
    document.getElementById("font-family-serif")?.addEventListener("click", () => {
      fontState.family = "serif"; apply(); save();
    });
    document.getElementById("font-size-reset")?.addEventListener("click", () => {
      fontState.sizeIdx = 1; apply(); save();
    });
    document.getElementById("line-height-reset")?.addEventListener("click", () => {
      fontState.lineIdx = 3; apply(); save();
    });

    apply();
  }

  // ========== Notes Manager ==========
  function openNotesManager() {
    const dlg = document.getElementById("notes-manager");
    if (!dlg) return;
    renderNotesManager();
    dlg.showModal();
  }

  function renderNotesManager() {
    const list = document.getElementById("nm-list");
    if (!list) return;
    list.innerHTML = "";

    const locale = getLang() === "id" ? "id-ID" : "en-GB";
    const fmtOpts = { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" };

    if (!state.notes.length) {
      const empty = document.createElement("p");
      empty.className = "nm-empty";
      empty.textContent = getLang() === "id" ? "Belum ada catatan." : "No notes yet.";
      list.appendChild(empty);
      updateNmToolbar();
      return;
    }

    // sort
    const sorted = [...state.notes];
    if (nmSort.col) {
      sorted.sort((a, b) => {
        const va = a[nmSort.col] || "";
        const vb = b[nmSort.col] || "";
        return nmSort.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }

    function sortIndicator(col) {
      if (nmSort.col !== col) return " ↕";
      return nmSort.dir === "asc" ? " ↑" : " ↓";
    }

    function makeSortHeader(label, col) {
      const btn = document.createElement("button");
      btn.className = "nm-sort-btn" + (nmSort.col === col ? " active" : "");
      btn.textContent = label + sortIndicator(col);
      btn.addEventListener("click", () => {
        if (nmSort.col !== col) { nmSort.col = col; nmSort.dir = "asc"; }
        else if (nmSort.dir === "asc") { nmSort.dir = "desc"; }
        else { nmSort.col = null; nmSort.dir = null; }
        renderNotesManager();
      });
      return btn;
    }

    // header row
    const header = document.createElement("div");
    header.className = "nm-list-header";
    const hEmpty1 = document.createElement("span");
    const hTitle = document.createElement("span");
    hTitle.textContent = t("nm_col_title");
    const hCreated = makeSortHeader(t("nm_col_created"), "created_at");
    const hEdited = makeSortHeader(t("nm_col_edited"), "updated_at");
    header.append(hEmpty1, hTitle, hCreated, hEdited, document.createElement("span"), document.createElement("span"), document.createElement("span"));
    list.appendChild(header);

    sorted.forEach(n => {
      const item = document.createElement("div");
      item.className = "nm-item";
      item.dataset.id = n.id;

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "nm-cb";
      cb.addEventListener("change", updateNmToolbar);

      const titleBtn = document.createElement("button");
      titleBtn.className = "nm-title-btn";
      titleBtn.textContent = n.title || "Untitled";
      titleBtn.title = n.title || "";
      titleBtn.addEventListener("click", () => {
        openNote(n.id);
        document.getElementById("notes-manager").close();
      });

      const createdStr = n.created_at ? new Date(n.created_at).toLocaleString(locale, fmtOpts) : "—";
      const updatedStr = n.updated_at ? new Date(n.updated_at).toLocaleString(locale, fmtOpts) : "—";

      const createdCell = document.createElement("span");
      createdCell.className = "nm-date-cell";
      createdCell.textContent = createdStr;

      const updatedCell = document.createElement("span");
      updatedCell.className = "nm-date-cell";
      updatedCell.textContent = updatedStr;

      const editBtn = document.createElement("button");
      editBtn.className = "nm-action-btn";
      editBtn.innerHTML = '<i data-lucide="pencil"></i>';
      editBtn.title = getLang() === "id" ? "Ubah nama" : "Rename";
      editBtn.addEventListener("click", () => startInlineRename(n.id, item));

      const dlBtn = document.createElement("button");
      dlBtn.className = "nm-action-btn";
      dlBtn.innerHTML = '<i data-lucide="download"></i>';
      dlBtn.title = getLang() === "id" ? "Unduh PDF" : "Download PDF";
      dlBtn.addEventListener("click", () => downloadSingleNotePdf(n.id));

      const delBtn = document.createElement("button");
      delBtn.className = "nm-action-btn danger";
      delBtn.innerHTML = '<i data-lucide="trash-2"></i>';
      delBtn.title = getLang() === "id" ? "Hapus" : "Delete";
      delBtn.addEventListener("click", () => deleteNoteFromManager(n.id));

      item.append(cb, titleBtn, createdCell, updatedCell, editBtn, dlBtn, delBtn);
      list.appendChild(item);
    });
    updateNmToolbar();
    refreshIcons();
  }

  function updateNmToolbar() {
    const btnDel = document.getElementById("btn-nm-bulk-delete");
    const btnDl = document.getElementById("btn-nm-bulk-download");
    const cbAll = document.getElementById("nm-select-all");
    const cbs = [...document.querySelectorAll("#nm-list .nm-cb")];
    const checked = cbs.filter(c => c.checked);
    if (btnDel) btnDel.disabled = checked.length === 0;
    if (btnDl) btnDl.disabled = checked.length === 0;
    if (cbAll) {
      cbAll.checked = cbs.length > 0 && checked.length === cbs.length;
      cbAll.indeterminate = checked.length > 0 && checked.length < cbs.length;
    }
  }

  async function deleteNoteFromManager(id) {
    if (!await dkConfirm(t("confirm_delete"), { danger: true })) return;
    lsNotesDelete(id);
    if (state.activeNoteId === id) {
      state.activeNoteId = null;
      state.activeNote = null;
      localStorage.removeItem("dk-active-note");
      const editor = $("#note-editor");
      const empty = $("#notes-empty-state");
      if (editor) editor.classList.add("hidden");
      if (empty) empty.classList.remove("hidden");
    }
    await loadNotesList();
    renderNotesManager();
  }

  async function bulkDeleteNotes() {
    const checked = [...document.querySelectorAll("#nm-list .nm-cb:checked")];
    if (!checked.length) return;
    if (!await dkConfirm(t("nm_confirm_bulk"), { danger: true })) return;
    const ids = checked.map(c => c.closest(".nm-item").dataset.id);
    ids.forEach(id => lsNotesDelete(id));
    if (ids.includes(state.activeNoteId)) {
      state.activeNoteId = null;
      state.activeNote = null;
      localStorage.removeItem("dk-active-note");
      const editor = $("#note-editor");
      const empty = $("#notes-empty-state");
      if (editor) editor.classList.add("hidden");
      if (empty) empty.classList.remove("hidden");
    }
    await loadNotesList();
    renderNotesManager();
  }

  async function downloadSingleNotePdf(id) {
    const note = lsNotesGet(id);
    const title = esc(note.title || "Catatan");
    const body = (note.blocks || []).map(noteBlockToPrintHtml).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
<style>${NOTE_PRINT_CSS}
</style></head><body><h1>${title}</h1>${noteDatesPrintHtml(note)}${body}</body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) win.addEventListener("load", () => { win.print(); URL.revokeObjectURL(url); });
  }

  async function bulkDownloadPdf() {
    const checked = [...document.querySelectorAll("#nm-list .nm-cb:checked")];
    if (!checked.length) return;
    const ids = checked.map(c => c.closest(".nm-item").dataset.id);
    const notes = ids.map(id => lsNotesGet(id)).filter(Boolean);

    function buildNoteHtml(note) {
      const title = esc(note.title || "Catatan");
      const body = (note.blocks || []).map(noteBlockToPrintHtml).join("");
      return `<section class="note-section"><h1>${title}</h1>${noteDatesPrintHtml(note)}${body}</section>`;
    }

    const combinedBody = notes.map(buildNoteHtml).join('<div class="page-break"></div>');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Catatan</title>
<style>${NOTE_PRINT_CSS}
  .note-section{margin-bottom:40px}
  .page-break{page-break-after:always}
</style></head><body>${combinedBody}</body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) win.addEventListener("load", () => { win.print(); URL.revokeObjectURL(url); });
  }

  function startInlineRename(id, itemEl) {
    if (itemEl.classList.contains("nm-editing")) return;
    const titleBtn = itemEl.querySelector(".nm-title-btn");
    if (!titleBtn) return;
    const currentTitle = titleBtn.textContent;
    itemEl.classList.add("nm-editing");

    const input = document.createElement("input");
    input.type = "text";
    input.className = "nm-rename-input";
    input.value = currentTitle;
    titleBtn.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    async function confirmRename() {
      if (done) return;
      done = true;
      const newTitle = input.value.trim() || currentTitle;
      if (newTitle !== currentTitle) {
        lsNotesUpdate(id, { title: newTitle });
        await loadNotesList(false);  // don't re-render editor, just refresh sidebar
        if (state.activeNoteId === id && state.activeNote) {
          state.activeNote.title = newTitle;
          const titleInput = $("#note-title-input");
          if (titleInput) titleInput.value = newTitle;
        }
      }
      renderNotesManager();
    }

    function cancelRename() {
      if (done) return;
      done = true;
      renderNotesManager();
    }

    input.addEventListener("blur", confirmRename);
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); input.blur(); }
      if (e.key === "Escape") { input.removeEventListener("blur", confirmRename); cancelRename(); }
    });
  }

  // ========== Init ==========
  // Small popover offering "open here" / "open in new tab" for an in-page link,
  // anchored to the clicked element. Used by the blurb "Hlm. Teks" links in
  // notes and search results (mirrors the sutta-dialog open button).
  function showOpenMenu(anchorEl, href, opts) {
    opts = opts || {};
    if (!href) return;
    const existing = document.getElementById("dk-open-menu");
    if (existing) {
      const sameAnchor = existing._anchor === anchorEl;
      existing.remove();
      if (sameAnchor) return; // toggle off when clicking the same trigger
    }

    const pop = document.createElement("div");
    pop.id = "dk-open-menu";
    pop.className = "dk-open-menu";
    pop._anchor = anchorEl;

    function addItem(icon, key, onClick) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dk-open-menu-item";
      b.innerHTML = `<i data-lucide="${icon}"></i> <span data-i18n="${key}">${t(key)}</span>`;
      b.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); pop.remove(); onClick(); });
      pop.appendChild(b);
    }

    addItem("monitor", "btn_open_here", () => { if (opts.onHere) opts.onHere(); else window.location.href = href; });
    addItem("external-link", "btn_open_newtab", () => window.open(href, "_blank"));

    const openDialog = document.querySelector("dialog[open]");
    (openDialog || document.body).appendChild(pop);

    requestAnimationFrame(() => {
      const rect = anchorEl.getBoundingClientRect();
      const ph = pop.offsetHeight, pw = pop.offsetWidth;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow >= ph + 6 ? rect.bottom + 4 : Math.max(4, rect.top - ph - 4);
      const left = Math.max(4, Math.min(rect.left, window.innerWidth - pw - 4));
      pop.style.top = top + "px";
      pop.style.left = left + "px";
    });

    function cleanup() {
      pop.remove();
      document.removeEventListener("click", dismiss, true);
      document.removeEventListener("keydown", onEsc, true);
    }
    const dismiss = (ev) => { if (!pop.contains(ev.target)) cleanup(); };
    const onEsc = (ev) => { if (ev.key === "Escape") cleanup(); };
    setTimeout(() => {
      document.addEventListener("click", dismiss, true);
      document.addEventListener("keydown", onEsc, true);
    }, 0);

    if (window.lucide) window.lucide.createIcons({ root: pop });
  }

  async function showTranslationMenu(anchorEl, suttaId, firstRef, fallbackHref) {
    const existing = document.getElementById("dk-open-menu");
    if (existing) {
      const sameAnchor = existing._anchor === anchorEl;
      existing.remove();
      if (sameAnchor) return;
    }

    const pop = document.createElement("div");
    pop.id = "dk-open-menu";
    pop.className = "dk-open-menu";
    pop._anchor = anchorEl;

    pop.innerHTML = `<div style="padding: 8px 12px; font-size: 0.85rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px;"><i data-lucide="loader-2" class="spin" style="width:14px;height:14px;"></i> ${getLang() === "en" ? "Loading..." : "Memuat..."}</div>`;

    const openDialog = document.querySelector("dialog[open]");
    (openDialog || document.body).appendChild(pop);

    function positionPop() {
      const rect = anchorEl.getBoundingClientRect();
      const ph = pop.offsetHeight, pw = pop.offsetWidth;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow >= ph + 6 ? rect.bottom + 4 : Math.max(4, rect.top - ph - 4);
      const left = Math.max(4, Math.min(rect.left, window.innerWidth - pw - 4));
      pop.style.top = top + "px";
      pop.style.left = left + "px";
    }
    positionPop();

    function cleanup() {
      pop.remove();
      document.removeEventListener("click", dismiss, true);
      document.removeEventListener("keydown", onEsc, true);
    }
    const dismiss = (ev) => { if (!pop.contains(ev.target)) cleanup(); };
    const onEsc = (ev) => { if (ev.key === "Escape") cleanup(); };
    setTimeout(() => {
      document.addEventListener("click", dismiss, true);
      document.addEventListener("keydown", onEsc, true);
    }, 0);

    if (window.lucide) window.lucide.createIcons({ root: pop });

    try {
      const res = await fetch(`/api/sutta-translations/${encodeURIComponent(suttaId)}`);
      if (!res.ok) throw new Error("Failed to fetch translations");
      const data = await res.json();
      
      if (data.is_collection || !data.translations || data.translations.length === 0) {
        cleanup();
        showOpenMenu(anchorEl, fallbackHref);
        return;
      }

      pop.innerHTML = "";
      
      const head = document.createElement("div");
      head.style.padding = "6px 12px 4px";
      head.style.fontSize = "0.75rem";
      head.style.fontWeight = "600";
      head.style.textTransform = "uppercase";
      head.style.letterSpacing = "0.05em";
      head.style.color = "var(--text-muted)";
      head.style.borderBottom = "1px solid var(--border-strong)";
      head.style.marginBottom = "4px";
      head.textContent = getLang() === "en" ? "Select Translation:" : "Pilih Terjemahan:";
      pop.appendChild(head);

      data.translations.forEach(tr => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "dk-open-menu-item";
        b.style.display = "flex";
        b.style.alignItems = "center";
        b.style.justifyContent = "flex-start";
        b.style.gap = "12px";
        b.style.padding = "10px 16px";
        b.style.width = "100%";
        
        const langSpan = document.createElement("span");
        langSpan.className = `lang-tag ${tr.lang}`;
        langSpan.style.margin = "0";
        langSpan.style.fontSize = "0.7rem";
        langSpan.style.padding = "3px 8px";
        langSpan.style.flexShrink = "0";
        langSpan.textContent = tr.lang.toUpperCase();
        
        const textSpan = document.createElement("span");
        textSpan.style.fontSize = "0.9rem";
        textSpan.style.fontWeight = "500";
        textSpan.style.flex = "1";
        textSpan.style.textAlign = "left";
        textSpan.textContent = tr.author_name || tr.author || tr.lang;
        
        b.appendChild(langSpan);
        b.appendChild(textSpan);
        
        b.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          cleanup();
          openSuttaDialog(suttaId, tr.lang, tr.author || "", firstRef || "");
        });
        pop.appendChild(b);
      });

      if (window.lucide) window.lucide.createIcons({ root: pop });
      positionPop();
    } catch (err) {
      cleanup();
      showOpenMenu(anchorEl, fallbackHref);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTheme();

    // Blurb "Buka" links open a translation chooser instead of navigating directly.
    document.addEventListener("click", (e) => {
      const link = e.target.closest && e.target.closest("a.dk-open-menu-link");
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      
      const suttaId = link.getAttribute("data-sutta-id");
      const firstRef = link.getAttribute("data-first-ref");
      
      if (suttaId) {
        showTranslationMenu(link, suttaId, firstRef, link.href);
      } else {
        showOpenMenu(link, link.href);
      }
    }, true);
    initDialog();
    interceptDkLinks();
    initSegRef();
    initReaderSettings();
    initGotoSutta();
    initFontSettings();
    setupResize();
    applyCommonI18n();
    loadNotesList();

    const langBtn = document.getElementById("btn-lang-toggle");
    if (langBtn) {
      langBtn.addEventListener("click", () => {
        const next = getLang() === "id" ? "en" : "id";
        localStorage.setItem("dk-lang", next);
        window.dispatchEvent(new CustomEvent("dk-lang-change", { detail: { lang: next } }));
        applyCommonI18n();
        renderNotesList();
        refreshMetaDates();
        const nmDlg = document.getElementById("notes-manager-dialog");
        if (nmDlg && !nmDlg.classList.contains("hidden")) renderNotesManager();
      });
    }

    // ── Panel toggle (mobile only) ──
    const panelToggleBtn = $("#btn-panel-toggle");
    const panelBackdrop = $("#panel-backdrop");
    if (panelToggleBtn) {
      const panel = $("#notes-panel");
      if (panel) {
        const closePanel = () => {
          panel.classList.remove("panel-open");
          panelToggleBtn.classList.remove("panel-btn-open");
          if (panelBackdrop) panelBackdrop.classList.remove("visible");
          panelToggleBtn.title = "Tampilkan panel";
        };
        const openPanel = () => {
          panel.classList.add("panel-open");
          panelToggleBtn.classList.add("panel-btn-open");
          if (panelBackdrop) panelBackdrop.classList.add("visible");
          panelToggleBtn.title = "Sembunyikan panel";
        };
        panelToggleBtn.addEventListener("click", () => {
          panel.classList.contains("panel-open") ? closePanel() : openPanel();
        });
        if (panelBackdrop) panelBackdrop.addEventListener("click", closePanel);
      } else {
        panelToggleBtn.style.display = "none";
      }
    }

    const themeBtn = $("#btn-theme-toggle");
    const btnNewNote = $("#btn-new-note");
    const btnEmptyNewNote = $("#btn-empty-new-note");
    const btnDeleteNote = $("#btn-delete-note");
    const btnAddTextBlock = $("#btn-add-text-block");
    const btnPasteBlock = $("#btn-paste-block");
    const noteTitleInput = $("#note-title-input");

    const btnCopyNote = $("#btn-copy-note");
    const btnDownloadNote = $("#btn-download-note");
    const btnFullscreenNotes = $("#btn-fullscreen-notes");

    const btnManageNotes = $("#btn-manage-notes");
    const btnNmClose = document.getElementById("btn-nm-close");
    const btnNmBulkDelete = document.getElementById("btn-nm-bulk-delete");
    const btnNmBulkDownload = document.getElementById("btn-nm-bulk-download");
    const cbNmSelectAll = document.getElementById("nm-select-all");
    const notesMgrDlg = document.getElementById("notes-manager");

    if (themeBtn) themeBtn.addEventListener("click", toggleTheme);
    if (btnNewNote) btnNewNote.addEventListener("click", createNote);
    if (btnEmptyNewNote) btnEmptyNewNote.addEventListener("click", createNote);
    if (btnManageNotes) btnManageNotes.addEventListener("click", openNotesManager);
    if (btnFullscreenNotes) {
      btnFullscreenNotes.addEventListener("click", () => {
        const panel = $("#notes-panel");
        const isFs = panel.classList.toggle("fullscreen");
        btnFullscreenNotes.classList.toggle("active", isFs);
        btnFullscreenNotes.title = isFs ? "Perkecil" : "Layar Penuh";
        // btnFullscreenNotes.querySelector(".icon-expand").style.display = isFs ? "none" : "";
        //btnFullscreenNotes.querySelector(".icon-collapse").style.display = isFs ? "" : "none";
      });
    }
    if (btnNmClose) btnNmClose.addEventListener("click", () => notesMgrDlg.close());
    if (btnNmBulkDelete) btnNmBulkDelete.addEventListener("click", bulkDeleteNotes);
    if (btnNmBulkDownload) btnNmBulkDownload.addEventListener("click", bulkDownloadPdf);
    if (cbNmSelectAll) cbNmSelectAll.addEventListener("change", e => {
      document.querySelectorAll("#nm-list .nm-cb").forEach(c => c.checked = e.target.checked);
      updateNmToolbar();
    });
    if (notesMgrDlg) notesMgrDlg.addEventListener("click", e => { if (e.target === notesMgrDlg) notesMgrDlg.close(); });
    if (btnDeleteNote) btnDeleteNote.addEventListener("click", deleteCurrentNote);
    if (btnCopyNote) btnCopyNote.addEventListener("click", copyNote);
    if (btnDownloadNote) btnDownloadNote.addEventListener("click", downloadNotePdf);
    if (btnAddTextBlock) btnAddTextBlock.addEventListener("click", addTextBlock);

    if (btnPasteBlock) {
      btnPasteBlock.addEventListener("click", () => {
        if (!_copiedBlock || !state.activeNote) return;
        const noteBlocks = $("#note-blocks");
        state.activeNote.blocks.push(JSON.parse(JSON.stringify(_copiedBlock)));
        noteBlocks.appendChild(createNoteBlockEl(state.activeNote.blocks[state.activeNote.blocks.length - 1], state.activeNote.blocks.length - 1));
        refreshIcons();
        autoSave();
      });
    }

    const btnClearPaste = $("#btn-clear-paste");
    if (btnClearPaste) {
      btnClearPaste.addEventListener("click", () => {
        _copiedBlock = null;
        updatePasteBtn();
        showToast(getLang() === "en" ? "Copied block cleared" : "Salinan dihapus");
      });
    }

    if (noteTitleInput) noteTitleInput.addEventListener("blur", autoSave);
    if (noteTitleInput) noteTitleInput.addEventListener("input", () => {
      const activeTab = document.querySelector(`.note-tab.active .note-tab-title`);
      if (activeTab) activeTab.textContent = noteTitleInput.value || "Untitled";
    });
  });
})();
