/* ============================================================
   Dhammakathika --- Shared Logic (loaded via base.html)
   Handles: theme, source toggle, notes panel, resize handle
   ============================================================ */

(function () {
  "use strict";

  // ========== Global Fetch Interceptor for Access Gate ==========
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await originalFetch.apply(this, args);
    if (res.status === 401) {
      window.location.reload();
      return res;
    }
    return res;
  };

  // ========== Shared i18n ==========
  // Kamus dipindah ke static/i18n.js (window.DK_I18N) supaya nambah bahasa UI
  // tak perlu nyentuh logic. Fallback {} kalau i18n.js gagal dimuat -> t() balikin key.
  const i18n = window.DK_I18N || { id: {}, en: {} };

  function getLang() { return localStorage.getItem("dk-lang") || "id"; }
  // t(key, vars): dict bersama + interpolasi {name}. vars opsional -> string ber-angka
  // (mis. "{n} hasil dalam {s} sutta") tetap di dict, tak perlu hardcode inline.
  function t(key, vars) {
    let s = (i18n[getLang()] || i18n.id)[key] || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return s;
  }

  // Urutan bahasa utk DAFTAR terjemahan (picker "Pilih Terjemahan" & dropdown
  // suttaplex): Pali dulu, lalu bahasa web terpilih, lalu EN, lalu sisanya (alfabet).
  // Satu sumber biar semua daftar konsisten — dan tak lagi hardcode ["pli","id","en"]
  // yg diam-diam MEMBUANG bahasa lain kalau korpus punya lebih banyak bahasa.
  function langRank(l) {
    const sel = getLang();
    return l === "pli" ? 0 : l === sel ? 1 : l === "en" ? 2 : 3;
  }
  function orderLangs(langs) {
    return [...langs].sort((a, b) => langRank(a) - langRank(b) || a.localeCompare(b));
  }

  // ── ?chat=1 (redirect dari /chat lama): stash q/tag & BERSIHKAN URL sekarang,
  // di parse-time --- common.js dieksekusi sebelum index.js, jadi index.js tidak
  // keburu membaca ?q= sebagai kueri pencarian. Panel dibuka saat init DOM siap.
  let _pendingChatOpen = null;
  try {
    const _cp = new URLSearchParams(window.location.search);
    if (_cp.get("chat") === "1") {
      // `id` (sesi chat dari link /chat?id= lama & chip riwayat) ikut distash ---
      // dulu cuma dihapus dari URL tanpa dipakai -> chip "Riwayat Anda" buka room salah.
      _pendingChatOpen = { q: _cp.get("q") || null, tag: _cp.get("tag") || null, session: _cp.get("id") || null };
      ["chat", "q", "tag", "id"].forEach(k => _cp.delete(k));
      const _qs = _cp.toString();
      window.history.replaceState({}, document.title,
        window.location.pathname + (_qs ? "?" + _qs : "") + window.location.hash);
    }
  } catch (_e) { }

  // ── Chat panel (kanan): lazy-mount mesin chat (chat.js) sekali, saat pertama dibuka.
  let _chatInstance = null;
  function mountChat(prefill) {
    const root = document.getElementById("chat-root");
    if (!root || !window.DhammaChat) return null;
    if (!_chatInstance) {
      _chatInstance = window.DhammaChat.mount(root, {
        embedded: true,
        prefillQ: prefill && prefill.q ? prefill.q : null,
        prefillTag: prefill && prefill.tag ? prefill.tag : null,
      });
    } else if (prefill && (prefill.q || prefill.tag)) {
      _chatInstance.prefill(prefill.q || null, prefill.tag || null);
    }
    // Buka room spesifik (chip riwayat chat di home / redirect /chat?id=). Setelah
    // mount/prefill: pada mount pertama instance restore room aktif terakhir dulu,
    // lalu openSession memindahkannya ke sesi yang diminta (async, ada guard generate).
    if (_chatInstance && prefill && prefill.session && _chatInstance.openSession) {
      _chatInstance.openSession(prefill.session);
    }
    return _chatInstance;
  }

  window.refreshIcons = function () { if (window.lucide) lucide.createIcons(); };

  function applyCommonI18n() {
    const lang = getLang();
    const langDd = document.getElementById("lang-select");
    if (langDd) {
      const lbl = langDd.querySelector("#lang-dd-label");
      if (lbl) lbl.textContent = lang.toUpperCase();
      langDd.querySelectorAll(".lang-dd-item").forEach(it =>
        it.classList.toggle("active", it.dataset.lang === lang));
    }
    document.documentElement.lang = lang;
    // Semua tipe attr i18n mendukung data-i18n-vars (JSON) utk interpolasi {var} ---
    // dipakai label dinamis (mis. trace chat "Menemukan {count} teks: {ids}"), jadi
    // elemen cukup nyimpen key+vars & sweep ini me-render ulang di bahasa aktif.
    const sweep = (attr, apply) => document.querySelectorAll(`[${attr}]`).forEach(el => {
      const key = el.getAttribute(attr);
      let vars;
      const raw = el.getAttribute("data-i18n-vars");
      if (raw) { try { vars = JSON.parse(raw); } catch (_e) { /* vars rusak -> render tanpa interpolasi */ } }
      const v = t(key, vars);
      if (v !== key) apply(el, v);
    });
    sweep("data-i18n", (el, v) => { el.textContent = v; });
    sweep("data-i18n-html", (el, v) => { el.innerHTML = v; });
    sweep("data-i18n-tooltip", (el, v) => el.setAttribute("data-tooltip", v));
    sweep("data-i18n-title", (el, v) => el.setAttribute("title", v));
    sweep("data-i18n-placeholder", (el, v) => el.setAttribute("placeholder", v));
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

  // Toast notification --- moves inside open <dialog> so it's above the top layer
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

  function getParentId(id) {
    if (!id || !id.includes(":")) return id || "";
    const p = id.split(":");
    const prefix = p[0];
    const ref = p[1];
    const refParts = ref.split(".");
    if (refParts.length <= 1) return prefix;
    return prefix + ":" + refParts.slice(0, -1).join(".");
  }

  function renderPartsHtml(parts, key, opts) {
    key = key || "text";
    opts = opts || {};
    const headingAware = !!opts.headingAware;
    const isHeading = !!opts.isHeading;
    // pliFallback (opt-in, HANYA dari renderSegments = viewer/dialog): KHUSUS bagian
    // HEADER (part/segmen heading, id akhiran .0 dst.) yg tak diterjemahkan -> diisi
    // teks Pāli-nya. BODY untranslated TETAP "…" apa pun kondisinya --- termasuk segmen
    // utuh peyyāla (mis. mn134:5.3-16): itu elisi, nyalin Pāli malah menyesatkan.
    // Kartu pencarian/chat & catatan TIDAK menyalakan flag ini (perilaku lama utuh).
    const pliFallback = !!opts.pliFallback;
    // Bilara: tiap part adalah baris bait asli → pakai <br>, tanpa ‖ dan tanpa nomor
    const isBilara = parts.length > 0 && !!parts[0].bilara;
    let hasValidPart = false;
    return parts.map((p, i) => {
      // Folded body heading (".0" lead part): render as a block heading, no verse number.
      if (p.heading) {
        const lvl = Math.min(Math.max(p.heading, 1), 6);
        // Hormati key: kolom Pāli (side-by-side) render p.pli --- dulu selalu p.text
        // (terjemahan), jadi heading di kolom Pāli malah kosong saat terjemahannya kosong.
        let htxt = String((key === "pli" ? p.pli : p.text) || "").replace(/<[^>]+>/g, "").trim();
        // Heading tak-terterjemah (mis. vatthu Dhp) -> fallback Pāli-nya di viewer/dialog.
        if (!htxt && pliFallback && key !== "pli") {
          htxt = String(p.pli || "").replace(/<[^>]+>/g, "").trim();
        }
        hasValidPart = false; // Reset valid part after heading so we don't get a separator
        return `<div class="seg-heading seg-heading-${lvl}">${esc(htxt)}</div>`;
      }
      const verseNum = p.num ? p.num : (p.id && p.id.includes(":") ? p.id.split(":").pop() : "");
      let primary;
      if (key === "id") primary = p.text || "";
      else primary = key === "pli" ? (p.pli || "") : (p[key] || p.text || "");
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
        if (key === "pli") content = primary;
        else content = primary || p.text || p.pli || p.en || "";
      }

      if (typeof content === 'string' && content.includes('speaker')) {
        content = content.replace(/(<span[^>]*class=['"][^'"]*speaker[^'"]*['"][^>]*>)([^<]*)(<\/span>)/ig, (match, open, text, close) => {
          let t = text.trim();
          if (t && !t.endsWith(':')) t += ':';
          return `${open}${t}${close}`;
        });
      }

      if (!String(content).trim()) return "";

      let sep = "";
      if (isBilara) {
        // Bilara: tampilkan ‖ hanya jika paragraf/bait berubah
        const prevId = i > 0 ? parts[i - 1].id : null;
        const currentId = p.id;
        const parentChanged = prevId && currentId && (getParentId(prevId) !== getParentId(currentId));
        sep = (hasValidPart && parentChanged) ? `<span class="verse-sep">‖</span>` : "";
        const hideSuperscript = !opts.showVerseNum && parts.length === 1 && !String(verseNum).includes('.');
        const supHtml = hideSuperscript ? "" : `<sup class="verse-num">${verseNum}</sup>`;
        hasValidPart = true;
        return `${sep}${supHtml}${content}`;
      } else {
        // HTML (dari br): render ‖ + nomor (CSS pilih mana tampil via show-seg-ref). Tapi ‖ itu
        // device kolom TERJEMAHAN (pemisah baris puisi id/non-bilara biar tanda baca tak nyatu);
        // kolom Pāli punya tanda bacanya sendiri -> JANGAN kasih ‖ di sana.
        sep = (hasValidPart && key !== "pli") ? `<span class="verse-sep">‖</span>` : "";
        // Subfragmen TUNGGAL (potongan md yg tak terbagi) = tak ada subdivisi nyata, nomor
        // superscript cuma nyampah -> sembunyikan DI MANA PUN (reader + kartu search/chat),
        // walau showVerseNum. Multi-part: perilaku lama (tampil kecuali disembunyikan & bukan
        // nomor hierarki ber-titik).
        const hideSuperscript = parts.length === 1
          ? true
          : (!opts.showVerseNum && !String(verseNum).includes('.'));
        const supHtml = hideSuperscript ? "" : `<sup class="verse-num">${verseNum}</sup>`;
        hasValidPart = true;
        return `${sep}${supHtml}${content}`;
      }
    }).join(isBilara ? " " : " ");
  }

  // ========== Notes --- buildMiniTexts ==========
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
      const title = `${t("open_in_reader")} (${l.toUpperCase()})`;
      const key = isBlurb ? "btn_open_blurb" : "btn_open_link";
      // Pure-Pāli (lang=pli): part menaruh teks Pāli di p.text, BUKAN p.pli, jadi
      // renderPartsHtml(key="pli") baca p.pli -> kosong (catatan jadi hampa). Fallback ke
      // texts[l] (segText = teks Pāli utuh) kalau render part-nya kosong.
      let bodyHtml = (data.parts && data.parts_lang === l) ? renderPartsHtml(data.parts, l, { headingAware: true }) : esc(texts[l]);
      if (!bodyHtml || !bodyHtml.replace(/<[^>]+>/g, "").trim()) bodyHtml = esc(texts[l] || "");
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

  // Render konten blok AI di Catatan jadi blok HTML rapi (cermin mdLite di bubble chat). Teks
  // sudah di-mdToPlain (bold/heading dilucuti; bullet -> "• " dgn indentasi dipertahankan;
  // tabel GFM diratakan). Di sini direkonstruksi: tabel -> <table>, list (•/-/* & 1. ber-indentasi)
  // -> <ul>/<ol> nested rekursif, sisanya -> <p> (dipisah baris kosong). Tiap teks di-linkify
  // rujukannya. opts.print -> dok cetak tanpa CSS situs, jadi tabel/list/paragraf pakai inline-style.
  function renderAiNoteHtml(content, refs, opts) {
    opts = opts || {};
    const lines = mathLite((content || "").normalize("NFC")).replace(/\r/g, "").split("\n");
    const tOpen = opts.print
      ? "<table style=\"border-collapse:collapse;width:100%;margin:.6em 0;font-size:.92em\">"
      : "<table class='chat-table note-ai-table'>";
    const thS = opts.print ? " style=\"border:1px solid #c7b8ea;padding:.4em .65em;text-align:left;background:#f1ecfa;font-weight:700\"" : "";
    const tdS = opts.print ? " style=\"border:1px solid #c7b8ea;padding:.4em .65em;text-align:left;vertical-align:top\"" : "";
    const ulS = opts.print ? " style=\"margin:.3em 0 .55em;padding-left:1.4em\"" : "";
    const liS = opts.print ? " style=\"margin:.15em 0\"" : "";
    const pS = opts.print ? " style=\"margin:0 0 .55em\"" : "";

    const lk = s => linkifyNoteRefs(s, refs);
    const isBullet = l => /^[ \t]*[•\-*][ \t]+/.test(l);
    const isOrdered = l => /^[ \t]*\d+[.)][ \t]+/.test(l);
    const isItem = l => isBullet(l) || isOrdered(l);
    const isBlank = l => /^[ \t]*$/.test(l);
    const indentOf = l => l.match(/^[ \t]*/)[0].replace(/\t/g, "  ").length;
    const isTable = j => lines[j].includes("|") && j + 1 < lines.length && _MD_TABLE_SEP(lines[j + 1]);

    let i = 0, out = "";

    // Satu level list mulai di lines[i] (base = indentasinya). Item ber-indentasi lebih dalam
    // -> sublist (rekursif); lebih dangkal -> milik list induk (berhenti). Baris kosong di
    // antara item ditoleransi selama item berikut masih bagian list ini.
    // depth = level nesting saat ini (1 = terluar). MAKSIMAL 3 level --- selaras dgn render chat
    // (renderNestedList di chat.js). Di level 3, item ber-indentasi lebih dalam TAK nyarang lagi:
    // diperlakukan sbg sibling di level 3 supaya tampilan catatan = tampilan jawaban.
    const MAX_DEPTH = 3;
    function renderList(base, depth) {
      depth = depth || 1;
      const ordered = isOrdered(lines[i]) && !isBullet(lines[i]);
      const tag = ordered ? "ol" : "ul";
      let html = "<" + tag + ulS + ">";
      while (i < lines.length) {
        if (isBlank(lines[i])) {
          let j = i + 1; while (j < lines.length && isBlank(lines[j])) j++;
          if (j < lines.length && isItem(lines[j]) && indentOf(lines[j]) >= base) { i = j; continue; }
          break;
        }
        if (!isItem(lines[i]) || indentOf(lines[i]) < base) break;
        // Lebih dalam dari base -> sublist, TAPI cuma kalau belum mentok level 3. Mentok ->
        // jatuh ke bawah, diproses sbg item biasa di level ini (sibling, bukan sarang baru).
        if (indentOf(lines[i]) > base && depth < MAX_DEPTH) { html += renderList(indentOf(lines[i]), depth + 1); continue; }
        const m = lines[i].match(/^[ \t]*(?:[•\-*]|(\d+)[.)])[ \t]+(.*)$/);
        const val = (ordered && m && m[1]) ? " value=\"" + m[1] + "\"" : "";
        let li = "<li" + val + liS + ">" + lk(((m && m[2]) || "").trim());
        i++;
        while (i < lines.length && !isBlank(lines[i]) && indentOf(lines[i]) > base) {
          if (isItem(lines[i])) {
            if (depth < MAX_DEPTH) li += renderList(indentOf(lines[i]), depth + 1);   // sublist
            else break;                                                  // level 3 -> biar jadi sibling di luar
          }
          else { li += "<br>" + lk(lines[i].trim()); i++; }             // lanjutan teks item
        }
        html += li + "</li>";
      }
      return html + "</" + tag + ">";
    }

    while (i < lines.length) {
      if (isBlank(lines[i])) { i++; continue; }
      if (isTable(i)) {
        const head = _MD_CELLS(lines[i]); i += 2;                        // lewati header + pemisah
        const rows = [];
        while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
          rows.push(_MD_CELLS(lines[i])); i++;
        }
        let tb = tOpen + "<thead><tr>"
          + head.map(c => "<th" + thS + ">" + lk(c) + "</th>").join("") + "</tr></thead><tbody>";
        for (const r of rows) {
          tb += "<tr>" + head.map((_, ci) => "<td" + tdS + ">" + lk(r[ci] || "") + "</td>").join("") + "</tr>";
        }
        out += tb + "</tbody></table>";
      } else if (isItem(lines[i])) {
        out += renderList(indentOf(lines[i]));
      } else {
        const para = [];
        while (i < lines.length && !isBlank(lines[i]) && !isItem(lines[i]) && !isTable(i)) {
          para.push(lines[i].trim()); i++;
        }
        out += "<p" + pS + ">" + para.map(lk).join("<br>") + "</p>";
      }
    }
    return out;
  }

  // LaTeX-lite -> teks kebaca. Model kadang emit notasi math ("$\rightarrow$",
  // "$6 \text{ jalur kontak}\times 3 = 18$") yg tanpa renderer math tampil MENTAH.
  // Konversi konservatif ke unicode/teks polos, SATU sumber utk chat (mdLite render +
  // mdToPlain salin/simpan) & catatan (renderAiNoteHtml) biar sinkron.
  // Anti-nyasar: span $...$ hanya dikonversi bila memuat \perintah (mata uang "$5 dan
  // $10" tak kena); delimiter \( \) / \[ \] selalu dikonversi (tak ambigu). Idempoten.
  const _MATH_MAP = {
    rightarrow: "→", to: "→", longrightarrow: "→", Rightarrow: "⇒", implies: "⇒",
    leftarrow: "←", Leftarrow: "⇐", leftrightarrow: "↔", uparrow: "↑", downarrow: "↓",
    times: "×", cdot: "·", div: "÷", pm: "±", mp: "∓", approx: "≈", sim: "~",
    neq: "≠", ne: "≠", equiv: "≡", leq: "≤", le: "≤", geq: "≥", ge: "≥",
    ldots: "…", dots: "…", cdots: "…", infty: "∞", therefore: "∴", because: "∵",
    Delta: "Δ", delta: "δ", alpha: "α", beta: "β", gamma: "γ", lambda: "λ",
    mu: "μ", pi: "π", sigma: "σ", Sigma: "Σ", sum: "Σ", theta: "θ", omega: "ω",
    quad: " ", qquad: "  ", "": " ",
  };
  const _MATH_OPS = "×·÷±∓≈≠≡≤≥→⇒←⇐↔";   // simbol biner: beri spasi kiri-kanan biar kebaca
  function _mathBody(body) {
    let t = body;
    t = t.replace(/\\(?:text|textrm|textbf|textit|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g, "$1");
    t = t.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$1/$2");
    t = t.replace(/\\([A-Za-z]+|\s)/g, (m, w) => {
      const rep = _MATH_MAP[w.trim()];
      if (rep === undefined) return m;
      return _MATH_OPS.includes(rep) ? ` ${rep} ` : rep;
    });
    t = t.replace(/[{}]/g, "");
    return t.replace(/\s+/g, " ").trim();
  }
  function mathLite(src) {
    if (!src || (src.indexOf("$") === -1 && src.indexOf("\\(") === -1 && src.indexOf("\\[") === -1)) return src;
    return src
      .replace(/\\\[([\s\S]+?)\\\]/g, (_m, b) => _mathBody(b))
      .replace(/\\\((.+?)\\\)/g, (_m, b) => _mathBody(b))
      .replace(/\$\$([\s\S]+?)\$\$/g, (m, b) => (/\\/.test(b) ? _mathBody(b) : m))
      .replace(/\$([^$\n]+)\$/g, (m, b) => (/\\/.test(b) ? _mathBody(b) : m));
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

  // ========== Notes --- Block Clipboard ==========
  let _copiedBlock = null;

  function updatePasteBtn() {
    const container = $("#paste-block-container");
    if (container) container.style.display = _copiedBlock ? "flex" : "none";
  }

  function animateSwap(el1, el2, swapFn) {
    const rect1 = el1.getBoundingClientRect();
    const rect2 = el2.getBoundingClientRect();
    swapFn();
    const newRect1 = el1.getBoundingClientRect();
    const newRect2 = el2.getBoundingClientRect();
    const deltaY1 = rect1.top - newRect1.top;
    const deltaY2 = rect2.top - newRect2.top;
    el1.style.transform = `translateY(${deltaY1}px)`;
    el2.style.transform = `translateY(${deltaY2}px)`;
    el1.style.transition = "none";
    el2.style.transition = "none";
    void el1.offsetWidth;
    el1.style.transition = "transform 0.3s ease-in-out";
    el2.style.transition = "transform 0.3s ease-in-out";
    el1.style.transform = "";
    el2.style.transform = "";
    setTimeout(() => {
      el1.style.transition = "";
      el2.style.transition = "";
    }, 300);
  }

  // ========== Notes --- Block Element ==========
  function createNoteBlockEl(block, idx) {
    const wrapper = document.createElement("div");
    wrapper.className = "note-block";
    wrapper.dataset.index = idx;
    wrapper._blockData = block;

    const noteBlocks = $("#note-blocks");

    const actions = document.createElement("div");
    actions.className = "note-block-actions";

    const upBtn = document.createElement("button");
    upBtn.className = "block-move-btn btn-move-up";
    upBtn.innerHTML = `<i data-lucide="chevron-up"></i>`;
    upBtn.title = "Geser ke atas";
    upBtn.addEventListener("click", () => {
      const prev = wrapper.previousElementSibling;
      if (prev) {
        animateSwap(wrapper, prev, () => {
          noteBlocks.insertBefore(wrapper, prev);
        });
        autoSave();
        setTimeout(() => {
          wrapper.scrollIntoView({ behavior: "smooth", block: "nearest" });
          document.querySelectorAll('.highlight-green-pulse').forEach(el => el.classList.remove('highlight-green-pulse'));
          void wrapper.offsetWidth;
          wrapper.classList.add("highlight-green-pulse");
        }, 300);
      }
    });

    const downBtn = document.createElement("button");
    downBtn.className = "block-move-btn btn-move-down";
    downBtn.innerHTML = `<i data-lucide="chevron-down"></i>`;
    downBtn.title = "Geser ke bawah";
    downBtn.addEventListener("click", () => {
      const next = wrapper.nextElementSibling;
      if (next) {
        animateSwap(wrapper, next, () => {
          noteBlocks.insertBefore(next, wrapper);
        });
        autoSave();
        setTimeout(() => {
          wrapper.scrollIntoView({ behavior: "smooth", block: "nearest" });
          document.querySelectorAll('.highlight-green-pulse').forEach(el => el.classList.remove('highlight-green-pulse'));
          void wrapper.offsetWidth;
          wrapper.classList.add("highlight-green-pulse");
        }, 300);
      }
    });

    const delBtn = document.createElement("button");
    delBtn.className = "block-del-btn";
    delBtn.textContent = "✕";
    delBtn.title = t("del_block");
    delBtn.addEventListener("click", async () => {
      if (!await dkConfirm(t("confirm_delete_block"), { danger: true })) return;
      wrapper.classList.add("swipe-out-anim");
      setTimeout(() => {
        wrapper.remove();
        autoSave();
      }, 500);
    });

    const copyBtn = document.createElement("button");
    copyBtn.className = "block-move-btn";
    copyBtn.title = "Salin blok";
    copyBtn.innerHTML = `<i data-lucide="copy"></i>`;
    copyBtn.addEventListener("click", () => {
      document.querySelectorAll('.highlight-green-pulse').forEach(el => el.classList.remove('highlight-green-pulse'));
      void wrapper.offsetWidth;
      wrapper.classList.add("highlight-green-pulse");
      _copiedBlock = JSON.parse(JSON.stringify(block));
      updatePasteBtn();

      let clipText = "";
      if (block.type === "text") {
        clipText = mdAlignTables(block.content || "");   // tabel GFM -> kolom rata di clipboard
      } else if (block.type === "sutta") {
        const d = block.data || {};
        const texts = d.texts || {};
        clipText += `${d.formatted_id || d.sutta_id || ""}${d.sutta_name ? " — " + d.sutta_name : ""} — ${d.ref_display || ""}\n`;
        if (d.author && d.author !== "blurb") clipText += `${t("legend_author")}: ${authorLongName(d.author, d.source)}\n`;
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

  // ========== Notes --- localStorage backend ==========
  const LS_NOTES_KEY = "dk-notes-store";

  let _notesMigrated = false;
  // Migrasi 1x: catatan lama menyimpan id alias jangkar (mis. "nya6", tanpa ":") di blok.data.ref
  // -> ref_display jadi "mn52:md12-nya6". Buang id tanpa ":" (alias, bukan ref sutta) lalu
  // recompute ref_display. Aturan seragam (ref sutta selalu berprefiks ":"), idempoten: sekali
  // bersih, real.length == ref.length -> no-op. Klik target tetap pakai ref[0] (tak berubah).
  function _lsMigrateAliasRefs(store) {
    let changed = false;
    for (const note of Object.values(store)) {
      for (const block of (note.blocks || [])) {
        const d = block && block.data;
        if (!d || !Array.isArray(d.ref)) continue;
        const real = d.ref.filter(id => typeof id === "string" && id.includes(":"));
        if (real.length && real.length !== d.ref.length) {
          d.ref = real;
          d.ref_display = compactRef(real);
          changed = true;
        }
      }
    }
    if (changed) _lsSave(store);
  }

  function _lsStore() {
    try {
      const store = JSON.parse(localStorage.getItem(LS_NOTES_KEY)) || {};
      if (!_notesMigrated) { _notesMigrated = true; _lsMigrateAliasRefs(store); }
      return store;
    }
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

  // ========== Notes --- CRUD ==========
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
      titleEl.textContent = n.title || t("note_untitled");

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
    if (typeof updateBlockMoveButtons === "function") updateBlockMoveButtons();
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
      await loadNotesList(false);  // don't call openNote --- we already have state.activeNote
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
    // Judul KOSONG itu sah (tampil sbg "Tanpa judul" via t()); dulu "" || lama -> judul
    // lama balik sendiri padahal user sengaja ngosongin.
    if (titleInput) state.activeNote.title = titleInput.value.trim();
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
    if (typeof updateBlockMoveButtons === "function") updateBlockMoveButtons();
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

    // Buka panel Catatan via jalur RESMI (DK.openNotes: sinkron tombol rail,
    // backdrop, handle, eksklusivitas) --- jalur manual lama bikin state kacau.
    // KECUALI panel AI Chat sedang terbuka: jangan buka (numpuk/nutup chat yang
    // sedang dipakai); blok tetap tersimpan & toast tetap muncul.
    const chatPanelOpen = (() => {
      const cp = $("#chat-panel");
      return cp && cp.classList.contains("panel-open");
    })();
    if (!chatPanelOpen && window.DK && DK.openNotes) DK.openNotes();

    refreshIcons();
    autoSave();
    const lastBlock = noteBlocks.lastElementChild;
    if (lastBlock) {
      lastBlock.style.boxShadow = "0 0 0 2px var(--success)";
      setTimeout(() => (lastBlock.style.boxShadow = ""), 1200);
      lastBlock.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    // Toast pakai NAMA catatan tujuan (lebih informatif drpd "catatan" generik).
    const noteName = (state.activeNote && (state.activeNote.title || "").trim())
      || t("note_untitled");
    const label = getLang() === "id" ? `Ditambahkan ke "${noteName}"` : `Added to "${noteName}"`;
    showToast(label);
    // Kedipkan tab Catatan (rail) sebagai feedback visual --- biar user sadar item
    // masuk ke panel Catatan (apalagi kalau panelnya lagi ketutup/di belakang chat).
    pulseNotesTab();
    return true;
  }

  // Kedip singkat tombol/tab Catatan di rail (dipakai tiap + Catatan berhasil).
  function pulseNotesTab() {
    const tab = document.getElementById("btn-panel-toggle");
    if (!tab) return;
    tab.classList.remove("rail-pulse");
    void tab.offsetWidth;                 // reflow -> animasi bisa retrigger beruntun
    tab.classList.add("rail-pulse");
    setTimeout(() => tab.classList.remove("rail-pulse"), 3000);   // 1.5s x 2
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
        item.textContent = n.title || t("note_untitled");
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
  function updateBlockMoveButtons() {
    const blocks = document.querySelectorAll("#note-blocks .note-block");
    if (!blocks.length) return;
    blocks.forEach((block, index) => {
      const upBtn = block.querySelector(".btn-move-up");
      const downBtn = block.querySelector(".btn-move-down");
      if (upBtn) {
        upBtn.disabled = (index === 0);
        upBtn.style.opacity = (index === 0) ? "0.3" : "1";
        upBtn.style.cursor = (index === 0) ? "not-allowed" : "pointer";
      }
      if (downBtn) {
        downBtn.disabled = (index === blocks.length - 1);
        downBtn.style.opacity = (index === blocks.length - 1) ? "0.3" : "1";
        downBtn.style.cursor = (index === blocks.length - 1) ? "not-allowed" : "pointer";
      }
    });
  }

  function autoSave() {
    updateBlockMoveButtons();
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
      // Print: tabel/list/paragraf -> HTML inline-style (dok cetak tanpa CSS situs).
      return `<div class="ai-block"><div class="block-label">✦ myDhamma AI</div><div class="text-block">${renderAiNoteHtml(block.content || "", block.refs || [], { print: true })}</div></div>`;
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

  // ========== Resize panel samping (Catatan/AI Chat --- SATU aturan lebar) ==========
  // Kedua panel dock kanan & saling eksklusif -> berbagi SATU lebar (--side-panel-w,
  // tersimpan di dk-side-width). Drag di panel mana pun mengubah lebar keduanya;
  // offset tab toggle (nempel di kiri panel) ikut bergeser live.
  // min 370: cukup utk disclaimer AI satu baris (font .72rem) --- jangan diturunkan
  const SIDE_W = { varName: "--side-panel-w", store: "dk-side-width", min: 330, max: 560 };
  function setupResize() {
    const resizeHandle = $("#resize-handle");
    const searchPanel = $("#search-panel");
    const notesPanel = $("#notes-panel");
    const chatPanel = $("#chat-panel");
    if (!resizeHandle || !searchPanel) return;

    // Restore lebar tersimpan (desktop only)
    if (window.innerWidth >= 769) {
      const w = parseInt(localStorage.getItem(SIDE_W.store) || "");
      if (w >= SIDE_W.min && w <= SIDE_W.max) {
        document.documentElement.style.setProperty(SIDE_W.varName, w + "px");
      }
    }

    const anyPanelOpen = () =>
      (chatPanel && chatPanel.classList.contains("panel-open")) ||
      (notesPanel && notesPanel.classList.contains("panel-open"));

    let isResizing = false;
    let lastW = null;
    resizeHandle.addEventListener("mousedown", (e) => {
      if (!anyPanelOpen()) return;
      isResizing = true;
      resizeHandle.classList.add("active");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!isResizing) return;
      const mainRect = searchPanel.parentElement.getBoundingClientRect();
      const newW = mainRect.right - e.clientX;          // panel dock kanan
      const newSearchWidth = e.clientX - mainRect.left;
      if (newSearchWidth > 350 && newW >= SIDE_W.min && newW <= SIDE_W.max) {
        document.documentElement.style.setProperty(SIDE_W.varName, newW + "px");
        lastW = newW;
      }
    });
    document.addEventListener("mouseup", () => {
      if (isResizing) {
        isResizing = false;
        resizeHandle.classList.remove("active");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (lastW !== null) {
          localStorage.setItem(SIDE_W.store, String(Math.round(lastW)));
          lastW = null;
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
    function renderMain(text, lang) {
      const uiLang = getLang();
      const isEnFallback = isBlurb && lang === "en" && uiLang !== "en";
      const style = isEnFallback ? ` style="font-style: italic;"` : ``;
      const body = isKeyword && query ? highlightKeywords(esc(text), query) : esc(text);
      return `<span class="main-text"${style}>${body}</span>`;
    }
    const tgt = isBlurb ? ' target="_blank"' : "";
    const icon = isBlurb ? "book" : "book-open";

    const order = ["pli", "id", "en"];
    let langs = [...order.filter(l => texts[l]), ...Object.keys(texts).filter(l => !order.includes(l) && texts[l])];

    // Blurb tanpa sinopsis (kartu judul-eksak di home): tak ada teks -> paksa 1 tag
    // bahasa (UI) supaya kotak + tombol Buka tetap tampil, isinya placeholder miring.
    if (isBlurb && frag.blurbNone) langs = [frag.blurbLang || "id"];

    const transLangs = langs.filter(l => l !== "pli");
    if (langs.includes("pli") && transLangs.length > 0) {
      const mainTransLang = transLangs[0];
      let mainText = "";
      if (frag.parts && frag.parts.length > 0) {
        mainText = frag.parts.map(p => p[mainTransLang] || "").join(" ");
      } else {
        mainText = texts[mainTransLang] || "";
      }
      const cleanText = mainText.replace(/<[^>]+>/g, "").replace(/[\s\.…pe…]+/ig, "");
      if (cleanText.length === 0) {
        langs = langs.filter(l => l !== "pli");
      }
    }

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
      const cbRefs = (frag.context_before_refs && frag.context_before_refs[l]) || [];
      const hasCbDedup = cbRefs.length > 0
        ? cbRefs.every(r => dedup && dedup.has(`${l}::${r}`))
        : (dedup && dedup.has(normCtx(cb[l])));
      if (preview && cb[l] && !hasCbDedup) {
        if (dedup) {
          if (cbRefs.length > 0) cbRefs.forEach(r => dedup.add(`${l}::${r}`));
          else dedup.add(normCtx(cb[l]));
        }
        let html;
        if (cb[l].length > MAX_CTX_LEN) {
          let trunc = cb[l].substring(cb[l].length - MAX_CTX_LEN);
          const spaceIdx = trunc.indexOf(" ");
          if (spaceIdx !== -1 && spaceIdx < 20) trunc = trunc.substring(spaceIdx + 1);
          html = `...${esc(trunc)}`;
        } else {
          const cbParts = (l === "pli" || l === frag.db_source) && frag.context_before_parts && frag.context_before_parts.length > 0 ? frag.context_before_parts : null;
          if (cbParts) {
            html = renderPartsHtml(cbParts, l, { showVerseNum: true, headingAware: true });
          } else {
            html = esc(cb[l]);
          }
        }
        line += `<span class="ctx">${html}</span> `;
      }
      const useParts = frag.parts && frag.parts.length > 0 && (l === "pli" || l === frag.db_source);
      if (useParts) {
        const partsHtml = renderPartsHtml(frag.parts, l, { showVerseNum: true, headingAware: true });
        const body = isKeyword && query ? highlightKeywordsInHtml(partsHtml, query) : partsHtml;
        line += `<span class="main-text">${body}</span>`;
      } else if (isBlurb && frag.blurbNone) {
        line += `<span class="main-text blurb-none">${esc(t("blurb_none"))}</span>`;
      } else {
        const verseNum = firstRef.includes(":") ? firstRef.split(":").pop() : "";
        const supHtml = verseNum ? `<sup class="verse-num">${verseNum}</sup>` : "";
        line += supHtml + renderMain(texts[l], l);
      }
      const caRefs = (frag.context_after_refs && frag.context_after_refs[l]) || [];
      const hasCaDedup = caRefs.length > 0
        ? caRefs.every(r => dedup && dedup.has(`${l}::${r}`))
        : (dedup && dedup.has(normCtx(ca[l])));
      if (preview && ca[l] && !hasCaDedup) {
        if (dedup) {
          if (caRefs.length > 0) caRefs.forEach(r => dedup.add(`${l}::${r}`));
          else dedup.add(normCtx(ca[l]));
        }
        let html;
        if (ca[l].length > MAX_CTX_LEN) {
          let trunc = ca[l].substring(0, MAX_CTX_LEN);
          const spaceIdx = trunc.lastIndexOf(" ");
          if (spaceIdx !== -1 && spaceIdx > trunc.length - 20) trunc = trunc.substring(0, spaceIdx);
          html = `${esc(trunc)}...`;
        } else {
          const caParts = (l === "pli" || l === frag.db_source) && frag.context_after_parts && frag.context_after_parts.length > 0 ? frag.context_after_parts : null;
          if (caParts) {
            html = renderPartsHtml(caParts, l, { showVerseNum: true, headingAware: true });
          } else {
            html = esc(ca[l]);
          }
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

    let allRefs = [];
    if (frag.context_before_refs) {
      Object.values(frag.context_before_refs).forEach(arr => { if (arr) allRefs.push(...arr); });
    }
    if (frag.ref) allRefs.push(...frag.ref);
    if (frag.context_after_refs) {
      Object.values(frag.context_after_refs).forEach(arr => { if (arr) allRefs.push(...arr); });
    }
    // Hapus duplikat dan kosong
    allRefs = [...new Set(allRefs)].filter(Boolean);
    if (allRefs.length > 0) {
      el.dataset.allSegmentIds = allRefs.join(",");
    }

    const meta = document.createElement("div"); meta.className = "fragment-meta";
    const isKw = ctx && ctx.method && ctx.method.includes("keyword");

    // Legend/ref: HANYA segmen inti (frag.ref), BUKAN termasuk context n-1/n+1.
    // allRefs (incl. konteks) tetap di dataset buat navigasi, tapi BUKAN buat label.
    const coreRefs = [...(frag.ref || [])];
    let displayRefs = coreRefs;
    if (coreRefs.length > 1) {
      const first = coreRefs[0];
      const last = coreRefs[coreRefs.length - 1];
      const firstBase = first.split(":")[0];
      const lastBase = last.split(":")[0];
      if (firstBase === lastBase && first !== last) {
        const firstSeg = first.split(":")[1] || "";
        const lastSeg = last.split(":")[1] || "";
        displayRefs = (firstSeg && lastSeg)
          ? [`${firstBase}:${firstSeg}–${lastSeg}`]
          : [`${first} – ${last}`];
      }
    }
    const cleanRefDisplay = frag.ref_display ? frag.ref_display.split(", ").map(formatRef).join(", ") : null;
    const refDisplay = frag.author === "blurb" ? t("legend_blurb") : (cleanRefDisplay || displayRefs.map(formatRef).join(", "));
    const refTitle = frag.author === "blurb" ? t("legend_blurb") : `${t("legend_segment")}: ${coreRefs.map(formatRef).join(", ")}`;

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
    // CATATAN: fallback skor-BM25-dibulatkan dibuang --- itu BUKAN hitungan kata.
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
    let rawFrags = fragmentsOverride || sutta.fragments || [];
    // Ekspansi konteks n±1 jadi baris/kartu TETANGGA terpisah hanya utk UI chat
    // (ctx.expandContext). Di hasil pencarian flag ini mati -> frag dibiarkan utuh
    // shg buildFragTextLines render konteks INLINE (...n-1 HIT n+1...) sesuai checkbox "Konteks".
    const expandCtx = !!(ctx && ctx.expandContext);
    let frags = !expandCtx ? rawFrags : rawFrags.flatMap(frag => {
      const result = [];
      const db = frag.db_source;

      if (frag.context_before && frag.context_before[db]) {
        const text = frag.context_before[db];
        const refs = (frag.context_before_refs && frag.context_before_refs[db]) || [];
        if (text && refs.length > 0) {
          const cbFrag = Object.assign({}, frag);
          cbFrag.texts = {};
          Object.keys(frag.context_before).forEach(k => {
            if (frag.context_before[k]) cbFrag.texts[k] = frag.context_before[k];
          });
          cbFrag.ref = refs;
          cbFrag.ref_display = refs[0];
          cbFrag.context_before = null;
          cbFrag.context_after = null;
          cbFrag.context_before_refs = null;
          cbFrag.context_after_refs = null;
          cbFrag.parts = null;
          cbFrag.hit_idx = (frag.hit_idx || 0) - 0.1;
          cbFrag._ctx = true;                                // tetangga n-1 (konteks, bukan inti hit)
          result.push(cbFrag);
        }
      }

      const mainFrag = Object.assign({}, frag);
      mainFrag.context_before = null;
      mainFrag.context_after = null;
      mainFrag.context_before_refs = null;
      mainFrag.context_after_refs = null;
      result.push(mainFrag);

      if (frag.context_after && frag.context_after[db]) {
        const text = frag.context_after[db];
        const refs = (frag.context_after_refs && frag.context_after_refs[db]) || [];
        if (text && refs.length > 0) {
          const caFrag = Object.assign({}, frag);
          caFrag.texts = {};
          Object.keys(frag.context_after).forEach(k => {
            if (frag.context_after[k]) caFrag.texts[k] = frag.context_after[k];
          });
          caFrag.ref = refs;
          caFrag.ref_display = refs[0];
          caFrag.context_before = null;
          caFrag.context_after = null;
          caFrag.context_before_refs = null;
          caFrag.context_after_refs = null;
          caFrag.parts = null;
          caFrag.hit_idx = (frag.hit_idx || 0) + 0.1;
          caFrag._ctx = true;                                // tetangga n+1 (konteks, bukan inti hit)
          result.push(caFrag);
        }
      }

      return result;
    });

    // Dedup segmen kembar dalam SATU kartu. Ekspansi n±1 (context_before/after) bikin segmen yg
    // sama hadir sbg konteks satu fragmen DAN inti fragmen tetangga -> baris duplikat di kartu
    // rujukan. Dedup per (penerjemah, ref): SENGAJA per-penerjemah krn md1 Anggara ≠ md1 Kurniawan
    // (potongan/teks beda, jangan digabung). Versi INTI (hit) diutamakan atas versi konteks.
    {
      const _akey = f => `${f.db_source || ""}::${f.source || ""}::${f.author}`;
      const _rsig = f => (f.ref && f.ref.length) ? f.ref.join(",") : (f.ref_display || "");
      // Kartu chat mengirim ctx.citedSegs = segmen yg BENAR-BENAR dikutip di jawaban. Baris
      // konteks n±1 yg TAK dikutip cuma ditambah paksa buat keterbacaan -> noise, dibuang.
      // Home-search (tanpa jawaban) tak punya citedSegs -> konteks tetap tampil seperti biasa.
      const citedSegs = ctx && ctx.citedSegs;
      const _ctxCited = f => !citedSegs || (f.ref || []).some(r => citedSegs.has(String(r).replace(/\s+/g, "").toLowerCase()));
      const mainKeys = new Set();
      frags.forEach(f => { const r = _rsig(f); if (r && !f._ctx) mainKeys.add(_akey(f) + "|" + r); });
      const seenSeg = new Set();
      frags = frags.filter(f => {
        if (f._ctx && !_ctxCited(f)) return false;        // konteks n±1 tak-dikutip -> jangan dipaksa tampil
        const r = _rsig(f);
        if (!r) return true;                              // tanpa ref (mis. blurb) -> biarkan
        const k = _akey(f) + "|" + r;
        if (f._ctx && mainKeys.has(k)) return false;      // konteks yg juga jadi inti -> pakai inti
        if (seenSeg.has(k)) return false;                 // kembar persis -> buang
        seenSeg.add(k);
        return true;
      });
    }

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
    // Dedup overlapping CONTEXT within this card based on segment IDs.
    // Pre-populate with all main segment refs to prevent context from overlapping
    // with any main segments in the card.
    const dedupTexts = new Set();
    frags.forEach(f => {
      const refs = f.ref || [];
      const order = ["pli", "id", "en"];
      const texts = f.texts || {};
      const langs = [...order.filter(l => texts[l]), ...Object.keys(texts).filter(l => !order.includes(l) && texts[l])];
      langs.forEach(l => {
        refs.forEach(r => {
          dedupTexts.add(`${l}::${r}`);
        });
      });
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
          `${t("show_more_frags", { n: Math.min(STEP, remaining), remaining })} <i data-lucide="chevron-down"></i>`;
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
      // Sort key: parse segment ref "base:N.N.N" → array of numbers for natural order.
      // e.g. "mn10:2.3" → [2, 3]; "mn10:12.1" → [12, 1]. Blurbs/missing → [-1].
      const _refKey = f => {
        const r = (f.ref && f.ref[0]) || "";
        const seg = r.includes(":") ? r.split(":").pop() : "";
        if (!seg) return [-1];
        const res = [];
        seg.split(".").forEach(part => {
          const digits = part.replace(/\D/g, "");
          const v = parseInt(digits, 10);
          if (isNaN(v)) {
            res.push(0, 0);
          } else {
            const leadingZeros = digits.length - digits.replace(/^0+/, "").length;
            res.push(-leadingZeros, v);
          }
        });
        return res;
      };
      const _cmpRef = (a, b) => {
        const ka = _refKey(a), kb = _refKey(b);
        for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
          const va = ka[i] ?? -1, vb = kb[i] ?? -1;
          if (va !== vb) return va - vb;
        }
        const ra = (a.ref && a.ref[0]) || "";
        const rb = (b.ref && b.ref[0]) || "";
        return ra.localeCompare(rb, undefined, { numeric: true, sensitivity: 'base' });
      };
      // One labelled block per translator (≥1 author). Segments sorted by ref
      // (position in text) so they appear in reading order, not relevance order.
      const groupCtx = Object.assign({}, cardCtx, { hideAuthor: true });
      const byAuthor = new Map();
      frags.forEach(f => {
        const k = (f.author && f.author !== "blurb") ? authorKey(f) : "__blurb__";
        if (!byAuthor.has(k)) byAuthor.set(k, []);
        byAuthor.get(k).push(f);
      });
      byAuthor.forEach((groupFrags, k) => {
        if (k === "__blurb__") groupFrags.forEach(f => appendFrag(card, f, groupCtx));
        else { groupFrags.sort(_cmpRef); appendAuthorBlock(groupFrags, groupCtx); }
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
        // Href dihitung SAAT KLIK (bukan statis di load): highlight masih nyala -> ke segmen itu;
        // udah di-dismiss (di-scroll lewat) -> JANGAN loncat ke segmen nyala lama, buka di posisi
        // baca sekarang (segmen teratas yg keliatan); ga pernah nyala -> buka dari atas (spt dulu).
        const _base = (this.href || "").split("#")[0];
        if (!_base) return;
        let _frag = "";
        if (dlgState.activeTarget) _frag = "#" + dlgState.activeTarget.replace(/^dlg-/, "");
        else { const _t = currentDlgTopSegment(); if (_t) _frag = "#~" + _t; }
        const href = _base + _frag;

        // Pilihan "Buka di sini / Tab baru" pakai KOMPONEN MENU BERSAMA (.dk-open-menu)
        // --- UI-nya jadi SAMA dgn menu tombol "Buka" blurb/judul kartu (konsistensi,
        // 2026-07-11). Popover kustom .dlg-open-popover lama dihapus. showOpenMenu sudah
        // menangani posisi (nempel anchor, append ke dialog yg kebuka), toggle-off saat
        // anchor diklik lagi, dismiss klik-luar, dan Esc.
        showOpenMenu(this, href, {
          onHere: () => {
            dlg.el.close();
            document.querySelectorAll(".panel-open").forEach(el => el.classList.remove("panel-open"));
            document.querySelectorAll(".panel-btn-open").forEach(el => el.classList.remove("panel-btn-open"));
            const bd = document.getElementById("panel-backdrop");
            if (bd) bd.classList.remove("visible");
            window.location.href = href;
          }
        });
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
    // showModal() lempar InvalidStateError kalau dialog sudah terbuka -> guard supaya
    // navigasi prev/next bisa muat-ulang sutta di dialog yg sama tanpa nutup-buka.
    if (!dlg.el.open) dlg.el.showModal();
    loadDialogSutta(hash);
  }

  async function loadDialogSutta(hash, scrollPos) {
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
      // Mode tampilan SATU pintu: re-baca localStorage tiap load -> selalu sinkron dgn
      // halaman reader (key sama: dk-display-mode) & antar-buka dialog. Dulu: dibaca
      // sekali saat script load (basi habis set mode di halaman reader) + dimutasi
      // permanen ke "single" utk sutta non-segmented (padahal Berdampingan html
      // non-bilara didukung "apa adanya", dan renderSegments sendiri yg menonaktifkan
      // sidebyside utk pli). Toggle in-dialog tetap nulis localStorage, jadi tak stomp.
      dlgState.displayMode = localStorage.getItem("dk-display-mode") || "single";
      const nameHtml = dlgState.data.sutta_name ? `<div class="dlg-sutta-name">${dlgState.data.sutta_name}</div>` : "";
      dlg.title.innerHTML = `<div class="dlg-title-top"><i data-lucide="book-open"></i> <span class="dlg-formatted-id">${dlgState.data.formatted_id}</span></div>${nameHtml}`;
      attachSuttaNameTooltip(dlg.title.querySelector(".dlg-sutta-name"));
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
      // Sutta baru tanpa target segmen (mis. navigasi prev/next) -> mulai dari atas; body
      // scroller tak dibuat ulang jadi scrollTop lama nyangkut kalau tak direset.
      if (!hash && scrollPos) {
        // Bilara→bilara switch tanpa highlight aktif: scroll ke posisi yg sama, tanpa nyalain.
        const _seg = document.getElementById("dlg-" + scrollPos);
        const _body = document.querySelector("#sutta-dialog .sutta-dialog-body");
        if (_seg && _body) {
          const _top = _seg.getBoundingClientRect().top - _body.getBoundingClientRect().top + _body.scrollTop;
          _body.scrollTo({ top: Math.max(0, _top - 16) });
        }
      } else if (!hash) {
        const _body = document.querySelector("#sutta-dialog .sutta-dialog-body");
        if (_body) _body.scrollTop = 0;
      }
      document.body.classList.remove("is-loading-dialog");
      dlg.loading.classList.add("hidden");
      dlg.content.classList.remove("hidden");
    } catch (e) {
      document.body.classList.remove("is-loading-dialog");
      dlg.loading.classList.add("hidden");
      dlg.errorMsg.textContent = e.message || t("sutta_not_found");
      dlg.error.classList.remove("hidden");
    }
  }

  // ── Shared sutta control builders (used by dialog AND sutta reader page) ──
  function buildDisplayToggle(container, lang, displayMode, onChange, segmented) {
    // Dua tombol selalu tampil; di-disable kalau mode tak relevan (teks Pāḷi).
    const dis = (lang === "pli") ? " disabled" : "";
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
    container.innerHTML = `<a href="${scBase}" target="_blank" class="sc-link-suttaplex" title="${t("open_in_sc")}"><i data-lucide="external-link"></i></a>`;
    if (window.lucide) window.lucide.createIcons({ root: container });
  }

  function renderDialogLangToggle() {
    const avail = (dlgState.data && dlgState.data.available_paths) || {};
    let html = `<select class="sutta-lang-dropdown">`;
    orderLangs(Object.keys(avail)).forEach(l => {
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
      // Bawa highlight HANYA bilara->bilara (segmen mdX selaras antar-terjemahan bilara). Sumber
      // html beda potongan walau label "mdX" sama -> JANGAN bawa. Cek authorSource SEKARANG (lama).
      const isBilara2Bilara = dlgState.authorSource === "bilara" && source === "bilara";
      const carry = (dlgState.activeTarget && isBilara2Bilara)
        ? dlgState.activeTarget.replace(/^dlg-/, "") : "";
      // Bilara→bilara tanpa highlight aktif: bawa posisi scroll biar ga loncat ke atas.
      const scrollPos = (!carry && isBilara2Bilara) ? currentDlgTopSegment() : "";
      dlgState.lang = lang;
      dlgState.author = author || "";
      dlgState.authorSource = source || "";
      // (dulu: non-EN dipaksa "single" --- legacy dari era sidebyside cuma EN bilara;
      // kini loadDialogSutta re-baca preferensi dari localStorage, pli di-guard di
      // renderSegments, jadi tak perlu paksaan per-bahasa.)
      loadDialogSutta(carry, scrollPos);
    });
    refreshDialogDisplayToggle();
  }

  function refreshDialogDisplayToggle() {
    buildDisplayToggle(dlg.displayToggle, dlgState.lang, dlgState.displayMode, mode => {
      dlgState.displayMode = mode;
      localStorage.setItem("dk-display-mode", mode);
      refreshDialogDisplayToggle();
      renderDialogSegments();
      if (typeof showToast === "function") {
        showToast(mode === "sidebyside" ? t("toast_mode_sidebyside") : t("toast_mode_single"), 3000);
      }
      // Highlight masih aktif (belum di-scroll lewat) -> autoscroll balik ke segmennya.
      if (dlgState.activeTarget) scrollToDialogSegment(dlgState.activeTarget);
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

    const isSplitMode = isSideBySide && !data.segmented;
    const isInterleavedMode = isSideBySide && data.segmented;

    const container = document.createElement("div");
    let colPrimary = null;
    let colSecondary = null;

    if (isSplitMode) {
      container.className = "sutta-segments side-by-side-split";
      colPrimary = document.createElement("div");
      colPrimary.className = "split-pane pane-primary";
      colSecondary = document.createElement("div");
      colSecondary.className = "split-pane pane-secondary";
      container.appendChild(colPrimary);
      container.appendChild(colSecondary);
    } else {
      container.className = isInterleavedMode ? "sutta-segments side-by-side" : "sutta-segments";
    }
    // Konten "nyata" = ada teks setelah strip tag HTML & whitespace (nbsp/zwsp termasuk).
    const _plainTxt = s => String(s || "").replace(/<[^>]+>/g, "").replace(/[\u00A0\u200B]/g, " ").trim();
    data.segments.forEach(seg => {
      // Segmen yg Pāli DAN terjemahannya sama-sama kosong di-skip SEPAKET satu kotak ---
      // tanpa ini dia render kotak berisi cuma nomor segmen + "…" (jalur seg-untranslated
      // menganggap terjemahan-kosong = untranslated, padahal Pāli-nya pun tak ada).
      // Segmen untranslated yg MASIH punya Pāli tetap tampil (kontennya ada).
      const parts = (seg.parts && seg.parts.length > 0) ? seg.parts : null;
      const hasContent = parts
        ? parts.some(p => _plainTxt(p.text) || _plainTxt(p.pli) || _plainTxt(p.en))
        : !!(_plainTxt(seg.text) || _plainTxt(seg.pli) || _plainTxt(seg.en));
      if (!hasContent) return;
      const segText = seg.text || seg.pli || seg.en || "";
      const anchorId = seg.ids && seg.ids.length > 0 ? seg.ids[0] : "";
      const refSuffix = anchorId.includes(":") ? anchorId.split(":").pop() : anchorId;
      const isPreamble = refSuffix.startsWith("0.");
      let segEl = document.createElement("div");
      segEl.className = "sutta-segment" +
        (isPreamble ? " sutta-preamble" : "") +
        (seg.heading >= 1 && !isPreamble ? ` sutta-heading-${seg.heading}` : "");
      if (anchorId) segEl.id = idPrefix + anchorId;
      if (seg.ids && seg.ids.length > 1) {
        for (let i = 1; i < seg.ids.length; i++) {
          const hidA = document.createElement("a");
          hidA.id = idPrefix + seg.ids[i];
          hidA.className = "hidden-frag";
          segEl.appendChild(hidA);
        }
      }

      const secondaryKey = lang !== "pli" ? "pli" : "en";
      const partsOpts = { headingAware: true, isHeading: seg.heading >= 1, pliFallback: true };
      const renderParts = (key) => renderPartsHtml(parts, key, partsOpts);

      if (isSplitMode) {
        // Non-bilara: dua kolom INDEPENDEN (scroll sendiri) -> tiap kolom butuh elemen segmen
        // sendiri (beda dr interleaved yg satu baris dua sub-kolom). id vs pli beda chunking ->
        // TAK bisa dialign per-segmen -> Pāli tampil apa adanya. seg-ref + addBtn ditangani jalur
        // bersama di bawah (via segEl=segEl1) -> JANGAN dobel di sini.
        const segEl1 = document.createElement("div");
        segEl1.className = segEl.className;
        if (anchorId) segEl1.id = idPrefix + anchorId;
        const textEl1 = document.createElement("div");
        textEl1.className = "seg-col seg-primary";
        const leftHtml = parts ? renderParts("text") : (seg.text || "");
        textEl1.innerHTML = leftHtml;
        segEl1.appendChild(textEl1);
        if (!_plainTxt(leftHtml)) segEl1.style.display = "none";
        colPrimary.appendChild(segEl1);

        // Kolom Pāli: apa adanya, TANPA kelas sutta-heading-N (dulu bikin prosa yg ke-lump akibat
        // alignment rasio ter-render sbg judul raksasa). Heading Pāli asli tetap tampil sbg
        // seg-heading inline dari renderPartsHtml. Pāli bukan target scroll -> tanpa id anchor.
        const segEl2 = document.createElement("div");
        segEl2.className = "sutta-segment" + (isPreamble ? " sutta-preamble" : "");
        const textEl2 = document.createElement("div");
        textEl2.className = "seg-col seg-secondary";
        let secondaryHtml = seg.pli_parts ? renderPartsHtml(seg.pli_parts, "pli", partsOpts)
                                          : (parts ? renderParts(secondaryKey) : "");
        if (!_plainTxt(secondaryHtml)) secondaryHtml = ((lang !== "pli" ? seg.pli : seg.en) || "");
        textEl2.innerHTML = secondaryHtml;
        segEl2.appendChild(textEl2);
        if (!_plainTxt(secondaryHtml)) segEl2.style.display = "none";
        colSecondary.appendChild(segEl2);

        segEl = segEl1;   // seg-ref + addBtn (jalur bersama) nempel ke kolom terjemahan
      } else if (isInterleavedMode) {
        const colLeft = document.createElement("div");
        colLeft.className = "seg-col seg-primary";
        colLeft.innerHTML = parts ? renderParts("text") : segText;
        const colRight = document.createElement("div");
        colRight.className = "seg-col seg-secondary";
        let secondaryHtml = parts ? renderParts(secondaryKey) : "";
        if (!secondaryHtml.replace(/<[^>]+>/g, '').trim()) secondaryHtml = ((lang !== "pli" ? seg.pli : seg.en) || "");
        colRight.innerHTML = secondaryHtml;
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

        if (opts.idPrefix === "dlg-") {
          ref.addEventListener("click", () => {
            const currentPath = window.location.pathname.replace(/\/$/, "");
            const targetPath = path.replace(/\/$/, "");
            // Close dialog if we are currently on the exact same sutta's page
            if (currentPath === targetPath || currentPath.startsWith(targetPath + "/")) {
              const suttaDialog = document.getElementById("sutta-dialog");
              if (suttaDialog && suttaDialog.open) suttaDialog.close();
            }
          });
        }

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
      
      // Jika isSplitMode, segEl = segEl1, sudah di-append ke colPrimary.
      // Jika tidak, kita append ke container.
      if (!isSplitMode) {
        container.appendChild(segEl);
      }
    });
    targetEl.appendChild(container);

    // Notice peyyāla-total (body kosong: SN 12.5-9 dst) -> link ke teks lengkap terdekat. Ditaruh
    // di BAWAH konten (sebelum nav prev/next) biar tak numpuk di atas. Link .sutta-ref = wiki-preview.
    if (data.elision_ref) {
      const er = data.elision_ref;
      const erAuthor = data.author && data.author !== "blurb" ? `/${encodeURIComponent(data.author)}` : "";
      const erHref = `/${er.id}/${lang}${erAuthor}`;
      const erText = esc(er.label) + (er.name ? " — " + esc(er.name) : "");
      const link = `<a href="${erHref}" class="sutta-ref" data-lang="${lang}">${erText}</a>`;
      const notice = document.createElement("div");
      notice.className = "md-segment-notice elision-ref-notice";
      notice.innerHTML = `<i data-lucide="corner-down-right"></i> <span>${t("elision_ref_notice", { ref: link })}</span>`;
      targetEl.appendChild(notice);
      if (window.lucide) window.lucide.createIcons({ root: notice });
    }

    if (hash) {
      let target = targetEl.querySelector(`#${CSS.escape(idPrefix + hash)}`);
      if (!target && !hash.includes(":") && data && data.sutta_id) {
        target = targetEl.querySelector(`#${CSS.escape(idPrefix + data.sutta_id + ":" + hash)}`);
      }
      if (target) {
        target.classList.add("dlg-target");
        // block:"start" + scroll-margin-top (CSS) -> mendarat di ujung atas segmen, bukan tengah.
        setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
      }
    }
    refreshIcons();
  }

  function renderDialogSegments(targetHash) {
    if (!dlgState.data) return;
    renderSegments(dlg.content, dlgState.data, dlgState.lang, dlgState.displayMode, { idPrefix: "dlg-", hash: targetHash });
    buildDialogToc();
    buildDialogSegList();
    renderDialogNav();
    // renderSegments nambah .dlg-target ke segmen hash -> pantau buat dismiss-on-scroll (paritas reader).
    if (targetHash) {
      const tgt = dlg.content.querySelector(".sutta-segment.dlg-target");
      if (tgt) { dlgState.activeTarget = tgt.id; watchDlgTargetDismiss(tgt); }
    }
  }

  // Navigasi sutta sebelum/sesudah di dalam dialog (paritas dgn halaman reader). Klik kiri
  // muat-ulang sutta tetangga DI dialog yg sama; href tetap nunjuk halaman teks penuh biar
  // klik-tengah/kanan tetap bisa buka tab baru. renderSegments meng-clear dlg.content tiap
  // render, jadi nav ini sengaja dibangun ulang di sini (bukan di loadDialogSutta).
  // ── Swipe kiri/kanan -> sutta prev/next (touch) ──────────────────────────────
  // Geser horizontal di area baca: panah "ketarik" muncul di tepi, lepas melewati ambang ->
  // navigasi dgn aksi PERSIS tombol prev/next (termasuk fallback suttaplex + toast ?na=).
  // Sisi tanpa tetangga sama sekali -> panah redup, tak memicu apa pun. Sekali pasang per
  // elemen (guard _dkSwipeNav). host = elemen tempat panah menempel (dialog / body=fixed).
  function attachSwipeNav(scrollEl, host, getTargets, go) {
    if (!scrollEl || !host || scrollEl._dkSwipeNav) return;
    scrollEl._dkSwipeNav = true;
    const mk = dir => {
      const el = document.createElement("div");
      el.className = "swipe-nav-arrow swipe-" + dir + (host === document.body ? " swipe-fixed" : "");
      el.innerHTML = dir === "prev" ? "&#8249;" : "&#8250;";
      host.appendChild(el);
      return el;
    };
    const arrows = { prev: mk("prev"), next: mk("next") };
    const TH = 80, MAXPULL = 110;
    let active = false, horiz = false, x0 = 0, y0 = 0, dx = 0;
    let startTarget = null;
    const reset = () => {
      active = false; horiz = false; dx = 0;
      ["prev", "next"].forEach(k => {
        arrows[k].classList.remove("show", "armed", "disabled");
        arrows[k].style.transform = "";
      });
    };
    scrollEl.addEventListener("touchstart", e => {
      if (e.touches.length !== 1) return;
      // Jangan blokir table, pre, side-by-side di sini agar kita bisa cek edge-nya di touchmove
      if (e.target.closest && e.target.closest("input, textarea, .sp-nav, .swipe-nav-arrow")) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
      startTarget = e.target;
      active = true; horiz = false; dx = 0;
    }, { passive: true });
    scrollEl.addEventListener("touchmove", e => {
      if (!active) return;
      dx = e.touches[0].clientX - x0;
      const dy = e.touches[0].clientY - y0;
      if (!horiz) {
        // Dominan vertikal = niat scroll biasa -> mundur diam-diam.
        if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { active = false; return; }
        if (Math.abs(dx) < 26) return;               // belum jelas horizontal
        
        // Pengecekan elemen berscroll horizontal (tabel, kode, side-by-side)
        const hzContainer = startTarget && startTarget.closest ? startTarget.closest("table, pre, .side-by-side, .side-by-side-split") : null;
        if (hzContainer && hzContainer.scrollWidth > hzContainer.clientWidth) {
            const isSwipeRight = dx > 0;
            if (isSwipeRight && hzContainer.scrollLeft > 2) {
                active = false; return; // Masih bisa gulung konten ke kiri, jangan swipe sutta
            }
            if (!isSwipeRight && Math.ceil(hzContainer.scrollLeft + hzContainer.clientWidth) < hzContainer.scrollWidth - 2) {
                active = false; return; // Masih bisa gulung konten ke kanan, jangan swipe sutta
            }
        }
        
        horiz = true;
      }
      const dir = dx > 0 ? "prev" : "next";
      const other = dx > 0 ? "next" : "prev";
      arrows[other].classList.remove("show", "armed");
      const target = (getTargets() || {})[dir];
      const pull = Math.min(Math.abs(dx), MAXPULL);
      const ar = arrows[dir];
      ar.classList.add("show");
      ar.classList.toggle("disabled", !target);
      ar.classList.toggle("armed", !!target && Math.abs(dx) >= TH);
      // Geser dari balik tepi (offset 32px keluar) menuju posisi inset-nya; makin ditarik
      // makin masuk, mentok pas di inset (offset 0) -> tak pernah bikin overflow.
      const _off = Math.max(0, 32 - pull * 0.45);
      ar.style.transform = `translateY(-50%) translateX(${(dir === "prev" ? -_off : _off)}px)`;
    }, { passive: true });
    const end = () => {
      if (active && horiz && Math.abs(dx) >= TH) {
        const dir = dx > 0 ? "prev" : "next";
        const target = (getTargets() || {})[dir];
        if (target) go(dir, target);
      }
      reset();
    };
    scrollEl.addEventListener("touchend", end, { passive: true });
    scrollEl.addEventListener("touchcancel", reset, { passive: true });
  }

  // Pasang swipe di dialog viewer (sekali; target dibaca live dari dlgState tiap gesture).
  function attachDialogSwipe() {
    const body = document.querySelector("#sutta-dialog .sutta-dialog-body");
    const host = document.getElementById("sutta-dialog");
    attachSwipeNav(body, host,
      () => ({ prev: dlgState.data && dlgState.data.prev_sutta, next: dlgState.data && dlgState.data.next_sutta }),
      (_dir, entry) => {
        if (entry.author) { openSuttaDialog(entry.id, entry.lang, entry.author); return; }
        // Edisi tak tersedia -> suttaplex + toast (paritas tombol nav dialog).
        const _cur = (dlgState.data && dlgState.data.author) || "";
        window.location.href = `/${entry.id}?na=${encodeURIComponent(entry.lang + "_" + _cur)}`;
      });
  }

  function renderDialogNav() {
    const d = dlgState.data;
    attachDialogSwipe();               // idempoten (guard _dkSwipeNav); target dibaca live
    if (!d || (!d.prev_sutta && !d.next_sutta)) return;
    const nav = document.createElement("div");
    nav.className = "sp-nav sutta-sp-nav dlg-sp-nav";

    const mkBtn = (entry, dir) => {
      if (!entry) {
        // Spacer biar tombol yg ada tetap di sisi yg benar (prev kiri / next kanan).
        const sp = document.createElement("span");
        sp.className = "sp-nav-spacer";
        return sp;
      }
      const a = document.createElement("a");
      a.className = "sp-nav-btn sp-nav-" + dir;
      // Edisi (lang,author) tak ada di tetangga -> ke SUTTAPLEX + ?na= (toast "terjemahan X
      // tak tersedia" di halaman tujuan) — SAMA dgn perilaku tombol nav halaman reader.
      // Dulu dialog diam-diam ganti author default (membingungkan).
      const _curAuthor = (dlgState.data && dlgState.data.author) || "";
      const href = entry.author
        ? `/${entry.id}/${entry.lang}/${entry.author}`
        : `/${entry.id}?na=${encodeURIComponent(entry.lang + "_" + _curAuthor)}`;
      a.href = href;
      a.title = entry.label + (entry.name ? " — " + entry.name : "");
      const chev = dir === "prev" ? "chevron-left" : "chevron-right";
      const label =
        `<span class="sp-nav-label"><span class="sp-nav-id">${esc(entry.label)}</span>` +
        (entry.name ? `<span class="sp-nav-name">${esc(entry.name)}</span>` : "") + `</span>`;
      a.innerHTML = dir === "prev"
        ? `<i data-lucide="${chev}"></i>${label}`
        : `${label}<i data-lucide="${chev}"></i>`;
      a.addEventListener("click", (e) => {
        // Hormati klik-tengah / modifier (buka tab baru); selain itu muat di dialog.
        // Tanpa author (edisi tak tersedia): BIARKAN default -> navigasi suttaplex + toast.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        if (!entry.author) return;
        e.preventDefault();
        openSuttaDialog(entry.id, entry.lang, entry.author);
      });
      return a;
    };

    nav.appendChild(mkBtn(d.prev_sutta, "prev"));
    nav.appendChild(mkBtn(d.next_sutta, "next"));
    dlg.content.appendChild(nav);
    if (window.lucide) window.lucide.createIcons({ root: nav });
  }

  let _dlgTargetObs = null, _dlgTargetSeen = false;

  // Hapus highlight dialog ("nyala") + lupakan target. Dipakai saat user nge-scroll LEWAT segmen
  // highlight di dalam .sutta-dialog-body (= gamau liat lagi). Dialog tak pakai URL hash.
  function clearDlgTarget() {
    document.querySelectorAll("#sutta-dialog .sutta-segment.dlg-target").forEach(el => el.classList.remove("dlg-target"));
    dlgState.activeTarget = null;
    if (_dlgTargetObs) { _dlgTargetObs.disconnect(); _dlgTargetObs = null; }
  }

  // Pantau target dialog: udah pernah keliatan lalu di-scroll keluar -> dismiss. root = scroller dialog.
  function watchDlgTargetDismiss(el) {
    if (_dlgTargetObs) { _dlgTargetObs.disconnect(); _dlgTargetObs = null; }
    if (!el || !("IntersectionObserver" in window)) return;
    _dlgTargetSeen = false;
    const root = document.querySelector("#sutta-dialog .sutta-dialog-body") || null;
    _dlgTargetObs = new IntersectionObserver(entries => {
      const e = entries[entries.length - 1];
      if (!e) return;
      if (e.isIntersecting) _dlgTargetSeen = true;
      else if (_dlgTargetSeen) clearDlgTarget();
    }, { root, threshold: 0 });
    _dlgTargetObs.observe(el);
  }

  // Segmen TERATAS yang lagi keliatan di scroller dialog -> buat "buka di reader di posisi sama"
  // pas highlight udah di-dismiss (biar ga loncat balik ke segmen nyala lama).
  function currentDlgTopSegment() {
    const body = document.querySelector("#sutta-dialog .sutta-dialog-body");
    if (!body) return "";
    const top = body.getBoundingClientRect().top;
    for (const seg of body.querySelectorAll(".sutta-segment[id]")) {
      const r = seg.getBoundingClientRect();
      if (r.bottom > top + 8) return seg.id.replace(/^dlg-/, "");
    }
    return "";
  }

  function scrollToDialogSegment(anchorId) {
    const dialogBody = document.querySelector("#sutta-dialog .sutta-dialog-body");
    document.querySelectorAll("#sutta-dialog .sutta-segment.dlg-target").forEach(el => {
      el.classList.remove("dlg-target");
    });
    const target = document.getElementById(anchorId);
    if (target) {
      target.classList.add("dlg-target");
      dlgState.activeTarget = anchorId;
      watchDlgTargetDismiss(target);
      if (dialogBody) {
        // getBoundingClientRect delta + scrollTop = posisi target relatif isi scroller.
        // Tahan thd offsetParent bersarang (offsetTop lama bisa salah parent -> scroll ngaco).
        // -16px = gap kecil biar segmen nempel di ujung ATAS viewport, bukan tengah.
        const top = dialogBody.scrollTop + target.getBoundingClientRect().top - dialogBody.getBoundingClientRect().top;
        dialogBody.scrollTo({ top: Math.max(0, top - 16), behavior: "smooth" });
      } else {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  // ── Link "§N" (a.para-ref / a.sutta-ref dari reader.py) — perilaku per-konteks ─────────
  // reader.py memancarkan href NETRAL: "#chunkid" (segmen intra-doc) & "/{sibling}" (sutta grup).
  // Satu delegasi klik = satu sumber; cabang per LOKASI klik:
  //  • KARTU (.sutta-card: hasil pencarian / rujukan chat) -> inert (jangan navigasi/scroll).
  //  • DIALOG viewer (dlg.el terbuka & memuat anchor) -> IN-PLACE: segmen dipindai lewat
  //    scrollToDialogSegment("dlg-"+cid) (id di dialog ber-prefix "dlg-"); sibling GANTI isi
  //    dialog yg SAMA via openSuttaDialog (bukan buka page / duplikat dialog).
  //  • HALAMAN reader / lainnya -> biarkan default: "#chunkid" jalan via hashchange
  //    (handleHashChange -> scrollToSegment), "/{sibling}" navigasi halaman penuh.
  // Klik ref (desktop & mobile) = buka wiki preview/tooltip DULU, bukan langsung buka teks —
  // mayoritas cuma mau ngintip; buka beneran lewat link "Buka bagian ini" di tooltip, yang
  // pakai .bypass utk menembus intersepsi ini. State di window._dkRefPreview KARENA blok
  // tooltip hidup di IIFE KEDUA file ini — variabel lokal IIFE ini tak terlihat dari sana
  // (dulu bikin ReferenceError diam-diam: hover mati & intercept tak pernah aktif).
  // stopImmediatePropagation: cegah listener document lain (sutta.js) ikut scroll.
  window._dkRefPreview = { show: null, bypass: false };

  document.addEventListener("click", function (e) {
    const a = e.target && e.target.closest && e.target.closest("a.para-ref, a.sutta-ref");
    if (!a) return;
    const _rp = window._dkRefPreview;
    if (!_rp.bypass && _rp.show) {
      e.preventDefault();
      e.stopImmediatePropagation();
      _rp.show(a, true);
      return;
    }
    const isPara = a.classList.contains("para-ref");
    const inSeg = a.closest(".sutta-segment");                 // konten reader asli (page/dialog)
    const inDlg = dlg.el && dlg.el.open && dlg.el.contains(a);

    // (1) HALAMAN reader (.sutta-segment, BUKAN dialog) -> biarkan DEFAULT: "#chunkid" jalan via
    //     hashchange (scrollToSegment), "/{id}/{lang}" navigasi halaman penuh. Tak diintervensi.
    if (inSeg && !inDlg) return;

    // Sisanya ditangani sendiri; capture + stopPropagation supaya handler lain (mis. klik kartu
    // yang membuka sutta) TAK ikut jalan -> tak dobel-aksi.

    // Hancurkan wiki tooltip bila ada yang terbuka agar tidak nyangkut (karena stopPropagation
    // mencegah listener klik biasa jalan).
    document.querySelectorAll(".ref-tooltip:not(.hidden)").forEach(el => {
      el.classList.add("hidden");
      el.style.transform = "translateY(4px)";
    });

    e.preventDefault();
    e.stopPropagation();

    if (inSeg && inDlg) {
      // (2) DALAM dialog viewer -> IN-PLACE (jangan buka dialog baru / duplikat).
      if (isPara) {
        const cid = (a.getAttribute("href") || "").replace(/^#/, "");
        if (cid) scrollToDialogSegment("dlg-" + cid);          // id segmen dialog ber-prefix "dlg-"
      } else {
        const href = a.getAttribute("href") || "";
        const hashIdx = href.indexOf("#");
        const path = hashIdx >= 0 ? href.substring(0, hashIdx) : href;
        const hash = hashIdx >= 0 ? href.substring(hashIdx + 1) : "";
        const s = path.replace(/^\//, "").split("/");   // [id, lang, author?]
        if (s[0]) openSuttaDialog(s[0], s[1] || dlgState.lang, s[2] || "", hash);
      }
      return;
    }

    // (3) DI LUAR viewer (kartu hasil pencarian / rujukan chat / blok catatan / fragment lain)
    //     -> BUKA sutta-viewer dialog di segmen/sutta itu. data-lang (dari reader.py) memastikan
    //     dialog kebuka di terjemahan yg SAMA -> nomor segmen md cocok. author dari path bila ada.
    if (isPara) {
      const cid = (a.getAttribute("href") || "").replace(/^#/, "");   // "mn21:md7"
      const sid = cid.split(":")[0];
      if (sid) openSuttaDialog(sid, a.dataset.lang || getLang(), "", cid);
    } else {
      const href = a.getAttribute("href") || "";
      const hashIdx = href.indexOf("#");
      const path = hashIdx >= 0 ? href.substring(0, hashIdx) : href;
      const hash = hashIdx >= 0 ? href.substring(hashIdx + 1) : "";
      const s = path.replace(/^\//, "").split("/");  // [id, lang, author?]
      if (s[0]) openSuttaDialog(s[0], s[1] || a.dataset.lang || getLang(), s[2] || "", hash);
    }
  }, true);

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

    // Segmen tanpa terjemahan tapi ADA Pāli tetap masuk daftar (mirror buildSegList
    // sutta.js --- daftar harus mencerminkan apa yg tampil di dialog).
    const segs = dlgState.data.segments.filter(s =>
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
      // Fallback Pāli mirror buildSegList sutta.js: HANYA header, body tetap kosong.
      if (seg.heading >= 1 && seg.heading <= 5) {
        addItem("§", seg.text || seg.pli, anchorId, "heading");
        return;
      }
      const parts = seg.parts || [];
      const leadParts = parts.filter(p => isHeadingPart(p) || isSpeakerPart(p));
      leadParts.forEach(p =>
        isHeadingPart(p)
          ? addItem("§", p.text || p.pli, anchorId, "heading")
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

  // Topik/kueri rekomendasi --- SATU sumber, dipakai home (chip rekomendasi) & chat
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

  // Label kategori model (Konfig Mesin & dropdown mode lanjut) DILOKALKAN di FE ---
  // backend (/api/models) kirim label Inggris statis ("Refinement N (expN)") sbg data,
  // jadi tak pernah lewat dict i18n. Kunci lokalisasi = cat.key; label backend = fallback.
  function catLabel(cat) {
    if (!cat) return "";
    const m = /^exp(\d+)$/.exec(cat.key || "");
    if (m) return t("cat_refinement", { n: m[1] });
    if (cat.key === "base") return t("cat_base");
    if (cat.key === "gpl") return t("cat_gpl");
    return cat.label || cat.key || "";
  }

  // Tooltip klik utk nama sutta yg ke-clamp (.dlg-sutta-name, line-clamp:2 di header
  // dialog/reader) -> munculin nama penuh. Reuse .cite-tooltip (position:fixed, udah
  // ada style-nya, sebelumnya nganggur). Dipakai di sini (dialog) & sutta.js (reader)
  // via DK.attachSuttaNameTooltip.
  function showSuttaNameTooltip(anchorEl, text) {
    let tip = document.getElementById("dlg-sutta-name-tip");
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "dlg-sutta-name-tip";
      document.body.appendChild(tip);
    }
    tip.textContent = text;
    tip.style.display = "block";
    const rect = anchorEl.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom > 90;
    tip.className = `cite-tooltip ${below ? "cite-tooltip-bottom" : "cite-tooltip-top"}`;
    tip.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - 340 - 12))}px`;
    if (below) { tip.style.top = `${rect.bottom + 10}px`; tip.style.bottom = ""; }
    else { tip.style.bottom = `${window.innerHeight - rect.top + 10}px`; tip.style.top = ""; }
    requestAnimationFrame(() => { tip.style.opacity = "1"; });
    const hide = (ev) => {
      if (ev && ev.type === "click" && (tip.contains(ev.target) || anchorEl.contains(ev.target))) return;
      tip.style.opacity = "0";
      setTimeout(() => { tip.style.display = "none"; }, 200);
      document.removeEventListener("click", hide, true);
      window.removeEventListener("scroll", hide, true);
    };
    setTimeout(() => {
      document.addEventListener("click", hide, true);
      window.addEventListener("scroll", hide, true);
    }, 0);
  }

  function attachSuttaNameTooltip(el) {
    if (!el || el._nameTipBound) return;
    el._nameTipBound = true;
    el.addEventListener("click", (e) => {
      if (el.scrollHeight <= el.clientHeight + 1) return; // ga ke-clamp -> nama udah full, no-op
      e.stopPropagation();
      showSuttaNameTooltip(el, el.textContent);
    });
  }

  function formatSuttaId(fullId) {
    if (!fullId) return "";
    let sid = fullId.toLowerCase().replace(/^pli-tv-/, "");
    const match = sid.match(/^([a-z\-]+)(\d.*)?$/);
    if (!match) return fullId;

    let prefix = match[1];
    let number = match[2] || "";

    let formattedPrefix;
    if (["mn", "dn", "sn", "an"].includes(prefix)) {
      formattedPrefix = prefix.toUpperCase();
    } else {
      const parts = prefix.split("-");
      if (parts.length === 1) {
        formattedPrefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);
      } else if (prefix.startsWith("bu-vb") || prefix.startsWith("bi-vb")) {
        formattedPrefix = parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + "-" + parts.slice(1).join("-");
      } else {
        formattedPrefix = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join("-");
      }
    }

    if (number) return `${formattedPrefix} ${number}`;
    return formattedPrefix;
  }

  // ========== Public API ==========
  window.DK = {
    state, esc, buildMiniTexts, addBlockToNote, showNotePicker, updateAllLinksInDOM, copyNote, downloadNotePdf, t, getLang, applyCommonI18n,
    highlightKeywords, buildFragTextLines, createFragmentEl, createSuttaCardEl, renderSuttaCardsTo, openSuttaDialog, formatSuttaId,
    compactRef, showToast, renderSegments, buildDisplayToggle, buildScLinks, langName, authorLongName, catLabel, orderLangs, langRank,
    alert: dkAlert, confirm: dkConfirm, prompt: dkPrompt, RECOMMENDED_QUERIES, mdAlignTables, mathLite, attachSwipeNav, attachSuttaNameTooltip,
    // Kunci fuzzy nama sutta: buang diakritik + spasi, lowercase, lipat huruf-kembar-berurutan
    // (Cakk->Cak) -> toleran typo konsonan-ganda Pāḷi. SATU sumber: kotak pencarian home DAN
    // @mention chat pakai ini (makeFuzzyStr + build o.fuzzy delegasi ke sini). Cocokkan via
    // fuzzyKey(nama).includes(fuzzyKey(query)).
    fuzzyKey: (str) => (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, "").toLowerCase().replace(/(.)\1+/g, "$1"),
  };

  // ========== Reader display settings (Segmen) ==========
  // Centangan opsional di dialog "Atur" (base.html), berlaku global.
  // Pemisah bait (‖) selalu tampil --- bukan opsi, lihat .verse-sep di CSS.
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
    const searchInput = document.getElementById("search-input");
    const preview = document.getElementById("goto-preview");
    const btnGo = document.getElementById("btn-goto-go");
    if (!gotoDlg || !btnOpen) return;

    let collections = [];   // [{uid, display}, …]
    let loaded = false;
    let browseData = null;
    let suttaNames = null;
    let unavailableSuttas = null;
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
    document.body.appendChild(dlTitle);
    if (searchInput) searchInput.setAttribute("list", "goto-title-suggestions");

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

    // Walk pohon mahal (~8rb leaf) --- cache sekali; browseData tidak berubah selama sesi.
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
        if (unavailableSuttas && unavailableSuttas.has(id)) return;
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

    const customSuggestions = document.getElementById("custom-title-suggestions");
    let titleOptions = [];

    function populateTitleSuggestions() {
      // Build SEKALI saja (lazy)
      if (titlesBuilt) return;
      if (!browseData || !suttaNames) return;

      const dlTitle = document.getElementById("goto-title-suggestions");
      if (dlTitle) dlTitle.innerHTML = ""; // bersihkan jika ada sisa
      validTitlesMap.clear();
      titleOptions = [];

      const allIds = getLeafIds();
      allIds.forEach(id => {
        if (unavailableSuttas && unavailableSuttas.has(id)) return;
        if (suttaNames[id]) {
          const title = suttaNames[id];
          const normalized = removeDiacritics(title).toLowerCase();

          titleOptions.push({
            title: title,
            id: id,
            // Kunci fuzzy (Cakk -> Cak) via DK.fuzzyKey -- SATU sumber dgn @mention chat.
            fuzzy: window.DK.fuzzyKey(title)
          });

          if (!validTitlesMap.has(normalized)) validTitlesMap.set(normalized, []);
          validTitlesMap.get(normalized).push(id);

          const rawLower = title.toLowerCase();
          if (!validTitlesMap.has(rawLower)) validTitlesMap.set(rawLower, []);
          if (!validTitlesMap.get(rawLower).includes(id)) validTitlesMap.get(rawLower).push(id);
        }
      });
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

    async function ensureUnavailable() {
      if (unavailableSuttas) return;
      try {
        const res = await fetch("/api/browse-unavailable");
        if (res.ok) unavailableSuttas = new Set(((await res.json()) || {}).unavailable || []);
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

      if (!inpCol || !inpNum) return;
      const col = resolveCollection(inpCol.value);
      const num = inpNum.value.trim();

      if (!col) {
        if (inpCol.value.trim()) {
          preview.innerHTML = `<span style="color: #ef4444;">${t("invalid_collection")}</span>`;
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
      if (preview) preview.innerHTML = "";
      if (btnGo) {
        btnGo.disabled = true;
        btnGo.style.opacity = "0.5";
        btnGo.style.cursor = "not-allowed";
      }

      // Tampilkan dialog DULU (instan) --- jangan tunggu fetch. Data diisi di latar belakang.
      gotoDlg.showModal();
      refreshIcons();
      setTimeout(() => {
        // Hanya auto-focus di desktop/layar besar. Di mobile, auto-focus bikin keyboard naik dan menutupi layar.
        if (inpCol && window.innerWidth > 768) {
          inpCol.focus();
        }
      }, 50);

      // Lalu muat data & isi saran di latar belakang (fetch paralel; di-cache utk buka berikutnya).
      await Promise.all([ensureCollections(), ensureBrowseData(), ensureSuttaNames(), ensureUnavailable()]);
      if (!gotoDlg.open) return;   // user keburu nutup -> jangan kerja sia-sia
      populateCollectionSuggestions();   // ringan (~20 koleksi)
      // Saran JUDUL dipindah ke search-input utama.
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
      inpNum.addEventListener("input", updatePreview);
      inpNum.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); doGoto(); }
      });
    }
    if (searchInput) {
      let titleEnsureBusy = false;
      async function ensureTitleSuggestions() {
        if (titlesBuilt || titleEnsureBusy) return;
        titleEnsureBusy = true;
        try {
          await Promise.all([ensureCollections(), ensureBrowseData(), ensureSuttaNames(), ensureUnavailable()]);
          populateTitleSuggestions();
        } finally {
          titleEnsureBusy = false;
        }
      }
      function makeFuzzyStr(str) {
        return window.DK.fuzzyKey(str);   // SATU sumber (lihat DK.fuzzyKey); dipakai @mention chat juga.
      }



      let acSelectedIndex = -1;

      function updateAcSelection(items) {
        items.forEach((item, index) => {
          if (index === acSelectedIndex) {
            item.classList.add("selected");
            item.scrollIntoView({ block: "nearest" });
          } else {
            item.classList.remove("selected");
          }
        });
      }

      searchInput.addEventListener("keydown", (e) => {
        if (!customSuggestions || customSuggestions.classList.contains("hidden")) return;
        const items = customSuggestions.querySelectorAll("li");
        if (items.length === 0) return;

        if (e.key === "ArrowDown") {
          e.preventDefault();
          acSelectedIndex = (acSelectedIndex + 1) % items.length;
          updateAcSelection(items);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          acSelectedIndex = (acSelectedIndex - 1 + items.length) % items.length;
          updateAcSelection(items);
        } else if (e.key === "Enter") {
          if (acSelectedIndex >= 0 && acSelectedIndex < items.length) {
            e.preventDefault();
            items[acSelectedIndex].dispatchEvent(new MouseEvent("mousedown"));
          }
        } else if (e.key === "Escape") {
          customSuggestions.classList.add("hidden");
          acSelectedIndex = -1;
        }
      });

      function updateCustomAutocomplete() {
        acSelectedIndex = -1;
        if (!customSuggestions) return;

        // Cek apakah input benar-benar sedang difokuskan oleh user.
        // Jika event "input" dipicu via JS (misal saat klik history chip), jangan munculkan popup.
        if (document.activeElement !== searchInput) {
          customSuggestions.classList.add("hidden");
          return;
        }

        const val = searchInput.value.trim();
        if (val.length < 2) {
          customSuggestions.classList.add("hidden");
          return;
        }
        const fuzzyQuery = makeFuzzyStr(val);
        const matches = titleOptions.filter(o => o.fuzzy.includes(fuzzyQuery));

        // Group matches by exact title to avoid duplicates taking up space
        const grouped = {};
        const orderedTitles = [];
        matches.forEach(m => {
          if (!grouped[m.title]) {
            grouped[m.title] = [];
            orderedTitles.push(m.title);
          }
          grouped[m.title].push(m.id);
        });

        // Limit to 10 unique titles
        const topTitles = orderedTitles.slice(0, 10);

        if (topTitles.length === 0) {
          customSuggestions.classList.add("hidden");
          return;
        }

        customSuggestions.innerHTML = "";
        topTitles.forEach(title => {
          const ids = grouped[title];
          const formattedIds = ids.map(id => formatSuttaId(id)).join("; ");
          const li = document.createElement("li");
          li.innerHTML = `<span class="ac-title">${esc(title)}</span><span class="ac-id">${esc(formattedIds)}</span>`;
          li.addEventListener("mousedown", (e) => {
            e.preventDefault(); // cegah input blur
            searchInput.value = title;
            // Paksa lepas fokus biar keyboard nutup & autocomplete batal jalan lagi
            searchInput.blur();

            // Trigger update tombol AI
            searchInput.dispatchEvent(new Event("input", { bubbles: true }));
            // ---------------------
            customSuggestions.classList.add("hidden");
            const btnSearch = document.getElementById("btn-search");
            if (btnSearch) btnSearch.click(); // langsung cari!
          });
          customSuggestions.appendChild(li);
        });
        customSuggestions.classList.remove("hidden");
      }

      searchInput.addEventListener("focus", async () => {
        await ensureTitleSuggestions();
        updateCustomAutocomplete();
      });
      searchInput.addEventListener("input", async () => {
        await ensureTitleSuggestions();
        updateCustomAutocomplete();
      });
      searchInput.addEventListener("blur", () => {
        if (customSuggestions) customSuggestions.classList.add("hidden");
      });

      window.DK = window.DK || {};
      window.DK.getSuttaIdByExactTitle = async function (title) {
        const matches = await window.DK.getSuttaIdsByExactTitle(title);
        return matches.length > 0 ? matches[0] : null;
      };

      window.DK.getSuttaIdsByExactTitle = async function (title) {
        if (!title) return [];
        await ensureTitleSuggestions();
        const norm = removeDiacritics(title.trim()).toLowerCase();
        const ids = validTitlesMap.get(norm) || validTitlesMap.get(title.trim().toLowerCase()) || [];
        return ids.map(id => ({ id, title: suttaNames[id] }));
      };
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
      titleBtn.textContent = n.title || t("note_untitled");
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
      document.removeEventListener("scroll", onScroll, true);
    }
    const dismiss = (ev) => { if (!pop.contains(ev.target)) cleanup(); };
    const onEsc = (ev) => { if (ev.key === "Escape") cleanup(); };
    // Menu position:fixed --- kalau halaman/kontainer di-scroll, anchor jalan tapi menu
    // diam ("terbang"). Tutup saat scroll DI LUAR menu; scroll di dalam menu dibiarkan.
    const onScroll = (ev) => { if (!pop.contains(ev.target)) cleanup(); };
    setTimeout(() => {
      document.addEventListener("click", dismiss, true);
      document.addEventListener("keydown", onEsc, true);
      document.addEventListener("scroll", onScroll, true);
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
      document.removeEventListener("scroll", onScroll, true);
    }
    const dismiss = (ev) => { if (!pop.contains(ev.target)) cleanup(); };
    const onEsc = (ev) => { if (ev.key === "Escape") cleanup(); };
    // Sama spt showOpenMenu: fixed-menu "terbang" saat scroll -> tutup (scroll di
    // dalam menu dibiarkan --- daftar terjemahan bisa panjang & scrollable).
    const onScroll = (ev) => { if (!pop.contains(ev.target)) cleanup(); };
    setTimeout(() => {
      document.addEventListener("click", dismiss, true);
      document.addEventListener("keydown", onEsc, true);
      document.addEventListener("scroll", onScroll, true);
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

      // Pali dulu, lalu bahasa web terpilih, lalu EN, lalu sisanya. Dalam satu
      // bahasa: yg sudah bilara (segmented) didahulukan (API urut by author, bukan
      // source). Sort stabil -> sisanya tetap seperti urutan API.
      const _bilaraFirst = e => (e.source === "bilara" ? 0 : 1);
      data.translations.sort((a, b) =>
        (langRank(a.lang) - langRank(b.lang)) || (_bilaraFirst(a) - _bilaraFirst(b)));
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

    // Mendarat dari nav prev/next yg edisinya tak tersedia (?na={lang}_{author}, dipasang
    // _nav reader & nav dialog): kasih TOAST penjelasan kenapa nyasar ke suttaplex, lalu
    // bersihkan URL. Nama author dari peta global (fallback uid).
    try {
      const _naParams = new URLSearchParams(window.location.search);
      const _na = _naParams.get("na");
      if (_na && _na.includes("_")) {
        const _naAuthor = _na.slice(_na.indexOf("_") + 1);
        const _authName = (window.DK_BILARA_AUTHOR_NAMES && window.DK_BILARA_AUTHOR_NAMES[_naAuthor])
          || (window.DK_EDITION_AUTHOR_NAMES && window.DK_EDITION_AUTHOR_NAMES[_naAuthor]) || _naAuthor;
        const _naSid = formatSuttaId((window.location.pathname.split("/").filter(Boolean)[0] || ""));
        setTimeout(() => showToast(t("nav_na_toast", { sid: _naSid, author: _authName }), 4200), 350);
        _naParams.delete("na");
        const _q = _naParams.toString();
        history.replaceState(null, "", window.location.pathname + (_q ? "?" + _q : "") + window.location.hash);
      }
    } catch (_e) { /* toast nav non-kritis */ }

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

    // Dropdown bahasa KUSTOM --- item dibangun otomatis dari Object.keys(DK_I18N),
    // jadi nambah bahasa UI = tambah sub-dict di i18n.js; file ini & HTML aman.
    const langDd = document.getElementById("lang-select");
    if (langDd) {
      const ddBtn = langDd.querySelector("#lang-dd-btn");
      const ddMenu = langDd.querySelector("#lang-dd-menu");

      // Bangun item sekali dari dict ---
      // Label native: baca key `lang_name_<code>` dari sub-dict bahasa itu sendiri
      // (misal DK_I18N.id.lang_name_id = "Indonesia"), jadi nama tampil native.
      const langs = Object.keys(i18n);
      if (ddMenu) {
        ddMenu.innerHTML = "";
        langs.forEach(code => {
          const nativeName = (i18n[code] && i18n[code]["lang_name_" + code]) || code;
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "lang-dd-item";
          btn.setAttribute("role", "option");
          btn.dataset.lang = code;
          btn.innerHTML = `<span class="lang-dd-code">${code.toUpperCase()}</span> ${nativeName}`;
          ddMenu.appendChild(btn);
        });
      }

      const setLang = (next) => {
        localStorage.setItem("dk-lang", next);
        window.dispatchEvent(new CustomEvent("dk-lang-change", { detail: { lang: next } }));
        applyCommonI18n();
        renderNotesList();
        refreshMetaDates();
        const nmDlg = document.getElementById("notes-manager-dialog");
        if (nmDlg && !nmDlg.classList.contains("hidden")) renderNotesManager();
      };
      if (ddBtn) ddBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = langDd.classList.toggle("open");
        ddBtn.setAttribute("aria-expanded", open ? "true" : "false");
      });
      document.addEventListener("click", (e) => {
        if (!langDd.contains(e.target)) {
          langDd.classList.remove("open");
          if (ddBtn) ddBtn.setAttribute("aria-expanded", "false");
        }
      });
      langDd.querySelectorAll(".lang-dd-item").forEach(it =>
        it.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          setLang(it.dataset.lang);
          setTimeout(() => {
            langDd.classList.remove("open");
            if (ddBtn) ddBtn.setAttribute("aria-expanded", "false");
          }, 150);
        }));
      applyCommonI18n(); // sinkronkan label & item aktif saat init
    }

    // ── Panel toggles: Catatan + AI Chat --- dua-duanya dock KANAN & SALING EKSKLUSIF
    // (buka satu = tutup yang lain, semua lebar layar). Tab numpuk vertikal di tepi
    // kanan; tab panel yang terbuka "nempel" di tepi kiri panelnya (offset via CSS
    // var lebar panel --- ikut bergeser saat panel di-resize). Backdrop = mobile saja.
    const panelToggleBtn = $("#btn-panel-toggle");
    const panelBackdrop = $("#panel-backdrop");
    const notesPanelEl = $("#notes-panel");
    const chatToggleBtn = $("#btn-chat-toggle");
    const chatPanelEl = $("#chat-panel");
    const resizeHandleEl = $("#resize-handle");

    const anyPanelOpenNow = () =>
      (notesPanelEl && notesPanelEl.classList.contains("panel-open")) ||
      (chatPanelEl && chatPanelEl.classList.contains("panel-open"));

    const syncBackdrop = () => {
      if (!panelBackdrop) return;
      const notesOpen = notesPanelEl && notesPanelEl.classList.contains("panel-open");
      const chatOpen = chatPanelEl && chatPanelEl.classList.contains("panel-open");
      const needsBackdrop = (notesOpen || chatOpen) && window.innerWidth <= 900;
      panelBackdrop.classList.toggle("visible", needsBackdrop);
    };
    // Handle resize hanya relevan utk panel IN-FLOW (notes >900px; chat >900px ---
    // di bawah itu mereka drawer overlay, lebar fixed).
    const syncHandle = () => {
      if (!resizeHandleEl) return;
      const notesOpen = notesPanelEl && notesPanelEl.classList.contains("panel-open");
      const chatOpen = chatPanelEl && chatPanelEl.classList.contains("panel-open");
      const on = (notesOpen || chatOpen) && window.innerWidth > 900;
      resizeHandleEl.classList.toggle("rh-off", !on);
    };
    const setPanelState = (panelName) => {
      if (window.innerWidth > 900) return;
      if (!panelName) {
        if (history.state && history.state.dkPanel) {
          try { history.back(); } catch (e) { console.warn("history.back failed", e); }
        }
      } else {
        if (!history.state || !history.state.dkPanel) {
          try {
            history.pushState({ ...(history.state || {}), dkPanel: panelName }, "");
          } catch (e) { console.warn("history.pushState failed", e); }
        } else if (history.state.dkPanel !== panelName) {
          try {
            history.replaceState({ ...(history.state || {}), dkPanel: panelName }, "");
          } catch (e) { console.warn("history.replaceState failed", e); }
        }
      }
    };

    const closeNotesPanel = (persist, skipHistory) => {
      if (!notesPanelEl) return;
      if (!notesPanelEl.classList.contains("panel-open")) return;
      if (skipHistory !== true) setPanelState(null);
      notesPanelEl.classList.remove("panel-open");
      if (panelToggleBtn) {
        panelToggleBtn.classList.remove("panel-btn-open");
        panelToggleBtn.title = t("show_panel");
      }
      if (persist) { try { localStorage.setItem("dk-notes-open", "0"); } catch (_e) { } }
      syncBackdrop(); syncHandle();
    };
    const openNotesPanel = (skipHistory) => {
      if (!notesPanelEl) return;
      closeChatPanel(true, true);                            // eksklusif
      if (skipHistory !== true) setPanelState("notes");
      notesPanelEl.classList.add("panel-open");
      if (panelToggleBtn) {
        panelToggleBtn.classList.add("panel-btn-open");
        panelToggleBtn.title = t("hide_panel");
      }
      try { localStorage.setItem("dk-notes-open", "1"); } catch (_e) { }
      syncBackdrop(); syncHandle();
    };
    const closeChatPanel = (persist, skipHistory) => {
      if (!chatPanelEl) return;
      if (!chatPanelEl.classList.contains("panel-open")) return;
      if (skipHistory !== true) setPanelState(null);
      chatPanelEl.classList.remove("panel-open");
      chatPanelEl.classList.remove("fullscreen");       // keluar fullscreen saat ditutup
      if (chatToggleBtn) {
        chatToggleBtn.classList.remove("panel-btn-open");
        chatToggleBtn.classList.remove("nudge-highlight");
        chatToggleBtn.title = t("show_chat");
      }
      const nudge = document.querySelector(".header-chat-nudge");
      if (nudge) nudge.classList.remove("show");
      if (persist) { try { localStorage.setItem("dk-chat-open", "0"); } catch (_e) { } }
      syncBackdrop(); syncHandle();
    };
    const openChatPanel = (prefill, skipHistory) => {
      if (!chatPanelEl) return;
      mountChat(prefill);
      closeNotesPanel(true, true);                           // eksklusif
      if (skipHistory !== true) setPanelState("chat");
      chatPanelEl.classList.add("panel-open");
      if (chatToggleBtn) {
        chatToggleBtn.classList.add("panel-btn-open");
        chatToggleBtn.title = t("hide_chat");
      }
      try { localStorage.setItem("dk-chat-open", "1"); } catch (_e) { }
      syncBackdrop(); syncHandle();
    };
    window.addEventListener("resize", () => { syncBackdrop(); syncHandle(); });
    window.addEventListener("popstate", (e) => {
      const state = e.state || {};
      const notesOpen = notesPanelEl && notesPanelEl.classList.contains("panel-open");
      const chatOpen = chatPanelEl && chatPanelEl.classList.contains("panel-open");
      if (state.dkPanel === "notes") {
        if (!notesOpen) openNotesPanel(true);
      } else if (state.dkPanel === "chat") {
        if (!chatOpen) openChatPanel(null, true);
      } else {
        if (notesOpen) closeNotesPanel(true, true);
        if (chatOpen) closeChatPanel(true, true);
      }
    });

    if (panelToggleBtn) {
      if (notesPanelEl) {
        panelToggleBtn.addEventListener("click", () => {
          notesPanelEl.classList.contains("panel-open") ? closeNotesPanel(true) : openNotesPanel();
        });
      } else {
        panelToggleBtn.style.display = "none";
      }
    }
    if (chatToggleBtn) {
      if (chatPanelEl) {
        chatToggleBtn.title = t("show_chat");
        chatToggleBtn.addEventListener("click", () => {
          if (chatPanelEl.classList.contains("panel-open")) {
            closeChatPanel(true);
          } else {
            let prefill = null;
            const hasNudge = chatToggleBtn.classList.contains("nudge-highlight");
            const searchInput = document.getElementById("search-input");
            // Kalau lewat CTA nudge (hasNudge), selalu prefill. Kalau cuma buka sidebar, biarkan kosong.
            if (searchInput && searchInput.value.trim() && hasNudge) {
              prefill = { q: searchInput.value.trim() };
            }
            if (hasNudge) {
              chatToggleBtn.classList.remove("nudge-highlight");
              const nudge = document.querySelector(".header-chat-nudge");
              if (nudge) nudge.classList.remove("show");
            }
            openChatPanel(prefill);
          }
        });
      } else {
        chatToggleBtn.style.display = "none";
      }
    }
    if (panelBackdrop) panelBackdrop.addEventListener("click", () => { closeNotesPanel(true); closeChatPanel(true); });

    // API publik: buka panel chat (+prefill q/tag) --- dipakai tombol "Tanya AI" di
    // hasil pencarian, dialog sutta, header halaman sutta, dan param ?chat=1.
    DK.openChat = (o) => openChatPanel(o || null);
    // API publik: buka panel Catatan via jalur resmi (dipakai addBlockToNote dll).
    DK.openNotes = () => openNotesPanel();
    // API publik: tutup kedua panel dock (chat + Catatan) via jalur resmi (history/backdrop
    // ikut sinkron). Dipakai sutta.js saat klik ref di layout sempit: scroll in-page ke
    // segmen tak berguna kalau targetnya ketutupan drawer.
    DK.closeSidePanels = () => { closeNotesPanel(true); closeChatPanel(true); };

    // Semua tombol "Tanya AI" (dulu link ke /chat) -> buka PANEL chat, tanpa pindah
    // halaman: header sutta/suttaplex (?tag=), CTA hasil pencarian (?q=), link di
    // dialog sutta. href lama dibiarkan sebagai fallback no-JS (redirect /chat).
    document.addEventListener("click", (e) => {
      const el = e.target.closest("#header-chat-ai, #sutta-dialog-chat-link, .btn-chat-ai-q, [data-chat-tag], [data-chat-q]");
      if (!el) return;
      e.preventDefault();
      let tag = el.getAttribute("data-chat-tag") || null;
      let q = el.getAttribute("data-chat-q") || null;
      if (!q && !tag) {
        try {
          const u = new URL(el.getAttribute("href") || "", window.location.origin);
          q = u.searchParams.get("q");
          tag = u.searchParams.get("tag");
        } catch (_err) { }
      }
      const dlg = document.getElementById("sutta-dialog");
      if (dlg && dlg.open) dlg.close();   // tutup dialog biar panel chat terlihat
      openChatPanel({ q, tag });
    }, true);

    // Param ?chat=1 (redirect dari /chat lama) --- nilai q/tag DISTASH & URL dibersihkan
    // sinkron di parse-time (lihat _pendingChatOpen di atas) supaya index.js tak salah
    // baca ?q= sebagai kueri pencarian.
    if (_pendingChatOpen) {
      openChatPanel(_pendingChatOpen);
    } else if (localStorage.getItem("dk-chat-open") === "1" && window.innerWidth > 1200) {
      // Inget state terakhir lintas refresh/halaman. Di layar sempit (panel =
      // drawer overlay yang NUTUPIN konten) jangan auto-buka --- ganggu.
      openChatPanel();
    } else if (notesPanelEl && window.innerWidth > 900 && localStorage.getItem("dk-notes-open") !== "0") {
      // Desktop: Catatan default TERBUKA (kompatibel perilaku lama "selalu tampil"),
      // kecuali user terakhir menutupnya.
      openNotesPanel();
    } else {
      syncHandle();   // tak ada panel terbuka -> handle resize disembunyikan
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
        btnFullscreenNotes.title = isFs ? t("title_fs_exit") : t("title_fullscreen");
        // Swap icon maximize<->minimize --- paritas tombol fullscreen panel AI Chat.
        btnFullscreenNotes.innerHTML = `<i data-lucide="${isFs ? "minimize" : "maximize"}" class="icon-expand"></i>`;
        if (window.lucide) window.lucide.createIcons({ root: btnFullscreenNotes });
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
        const newEl = noteBlocks.lastElementChild;
        if (newEl) {
          newEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
          document.querySelectorAll('.highlight-green-pulse').forEach(el => el.classList.remove('highlight-green-pulse'));
          void newEl.offsetWidth;
          newEl.classList.add("highlight-green-pulse");
        }
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
      if (activeTab) activeTab.textContent = noteTitleInput.value || (window.DK && DK.t ? DK.t("note_untitled") : "Untitled");
    });
  });
})();

/* ================================================================
 *  Ensemble Config Manager (shared / fallback for non-index pages)
 *  Provides engine config dialog on Chat and other pages via
 *  the header button #btn-engine-config.
 *  On index.html, index.js binds its own richer version to
 *  #btn-ensemble-config; index.js also calls DK.openEnsembleManager
 *  from there, so this code stays compatible.
 * ================================================================ */
(function () {
  const $ = (s) => document.querySelector(s);
  const t = (k) => (window.DK && DK.t) ? DK.t(k) : k;
  const PREFS_KEY = "dk-ensemble-config";
  const RERANK_KEY = "dk-ensemble-rerank";
  const VALID_DB = ["id", "en", "pli"];
  const LANG_COVERAGE = { indo: ["id"], en: ["en", "pli"], multi: ["id", "en", "pli"] };

  let _categories = null;
  let _modelLangs = {};
  let _checkedModels = { id: [], en: [], pli: [] };
  let _activeTab = "id";
  let _rerank = true;
  let _initialized = false;

  function resolveModelLang(v) {
    return _modelLangs[v] ||
      (Object.entries(_modelLangs).find(([k]) => v.endsWith("/" + k)) || [])[1] || "";
  }
  function isModelValidFor(v, target) {
    const lm = resolveModelLang(v);
    const cov = LANG_COVERAGE[lm];
    if (!cov) return true;
    return cov.includes(target);
  }

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) _checkedModels = JSON.parse(raw);
    } catch (e) { /* ignore */ }

    ["id", "en", "pli"].forEach(k => {
      if (!_checkedModels[k] || _checkedModels[k].length === 0) {
        _checkedModels[k] = ["intfloat/multilingual-e5-base"];
      }
    });

    _rerank = localStorage.getItem(RERANK_KEY) !== "false";
  }
  function savePrefs() {
    localStorage.setItem(PREFS_KEY, JSON.stringify(_checkedModels));
    localStorage.setItem(RERANK_KEY, String(_rerank));
  }

  function saveCurrentTabChecks() {
    const cbs = document.querySelectorAll("#ensemble-checkboxes input[type=checkbox][data-corpus]");
    const list = [];
    cbs.forEach(cb => { if (cb.checked) list.push(cb.value); });
    if (list.length === 0) {
      list.push("intfloat/multilingual-e5-base");
      if (window.DK && DK.showToast) {
        DK.showToast(DK.getLang() === "en" ? "Cannot be empty, default model selected" : "Tidak boleh kosong, model utama otomatis dipilih");
      }
    }
    _checkedModels[_activeTab] = list;
  }

  function renderCheckboxes() {
    const box = $("#ensemble-checkboxes");
    if (!box) return;
    box.innerHTML = "";

    if (!_categories || _categories.length === 0) {
      box.innerHTML = `<div style="color:var(--text-muted); font-size:0.85rem;">${t("err_no_semantic_models")}</div>`;
      return;
    }
    const target = _activeTab;
    const corpusLabels = { id: "ID", en: "EN", pli: "PLI" };

    function fadeRerender() {
      box.style.transition = "opacity 0.12s ease";
      box.style.opacity = "0";
      setTimeout(() => {
        renderCheckboxes();
        requestAnimationFrame(() => { box.style.opacity = "1"; });
      }, 120);
    }

    // Tab bar
    const tabBar = document.createElement("div");
    tabBar.style.cssText = "display:flex; border-bottom:2px solid var(--border); margin-bottom:10px; gap:0;";
    ["id", "en", "pli"].forEach(corpus => {
      const isActive = corpus === target;
      const count = (_checkedModels[corpus] || []).length;
      const btn = document.createElement("button");
      btn.innerHTML = `${corpusLabels[corpus]}${count ? ` <span style="font-size:0.7rem; opacity:0.7;">(${count})</span>` : ""}`;
      btn.style.cssText = `flex:1; padding:8px 0; border:none; cursor:pointer; font-weight:600; font-size:0.9rem; transition:all 0.15s; background:transparent; border-bottom:2px solid ${isActive ? "var(--primary)" : "transparent"}; margin-bottom:-2px; color:${isActive ? "var(--primary)" : "var(--text-muted)"};`;
      btn.addEventListener("click", () => {
        if (_activeTab === corpus) return;
        saveCurrentTabChecks();
        _activeTab = corpus;
        fadeRerender();
      });
      tabBar.appendChild(btn);
    });
    box.appendChild(tabBar);

    // Model checkboxes
    const checkedList = _checkedModels[target] || [];
    _categories.forEach(cat => {
      const validModels = cat.models.filter(m => m.value !== "keyword");
      if (validModels.length === 0) return;

      const groupDiv = document.createElement("div");
      groupDiv.style.marginBottom = "12px";

      const header = document.createElement("div");
      header.style.cssText = "font-weight:600; font-size:0.9rem; color:var(--text-secondary); margin-bottom:6px; border-bottom:1px solid var(--border); padding-bottom:4px;";
      header.textContent = DK.catLabel(cat);
      groupDiv.appendChild(header);

      validModels.forEach(m => {
        const isChecked = checkedList.includes(m.value) ? "checked" : "";
        const lm = resolveModelLang(m.value);
        const langLabels = { "multi": "MULTI", "en": "EN", "indo": "ID" };
        const langColors = { "multi": "var(--accent)", "en": "#5b9bd5", "indo": "#e8a838" };
        const badge = lm ? `<span style="margin-left:auto; font-size:0.7rem; font-weight:700; padding:1px 6px; border-radius:4px; background:${langColors[lm] || "var(--border)"}; color:#0f0f14; white-space:nowrap;">${langLabels[lm] || lm}</span>` : "";
        const incompat = !isModelValidFor(m.value, target);
        const warn = incompat ? `<i data-lucide="alert-triangle" style="width:14px; height:14px; color:var(--accent); flex:none;"></i>` : "";
        const itemDiv = document.createElement("div");
        itemDiv.style.cssText = `background:var(--surface-hover); padding:6px 10px; border-radius:6px; margin-bottom:4px; opacity:${incompat ? "0.55" : "1"};`;
        itemDiv.innerHTML = `
          <label style="display:flex; align-items:center; cursor:pointer; gap:8px; font-size:0.85rem; width:100%;">
            <input type="checkbox" data-corpus="${target}" value="${m.value}" ${isChecked}>
            ${warn}<span style="word-break:break-all;">${m.display}</span>${badge}
          </label>`;
        groupDiv.appendChild(itemDiv);
      });
      box.appendChild(groupDiv);
    });
    // Re-render lucide icons for newly added elements
    if (window.lucide && lucide.createIcons) lucide.createIcons();
  }

  async function openManager() {
    const dialog = $("#ensemble-manager");
    if (!dialog) return;
    if (dialog.showModal) dialog.showModal();
    else dialog.classList.remove("hidden");

    const box = $("#ensemble-checkboxes");
    if (box) box.innerHTML = `<div style="text-align:center; padding:10px;"><div class="spinner" style="margin:auto;"></div></div>`;

    try {
      const [langRes, catRes] = await Promise.all([
        fetch("/api/model-langs"),
        fetch("/api/models")
      ]);
      _modelLangs = langRes.ok ? await langRes.json() : {};
      const catData = catRes.ok ? await catRes.json() : {};
      _categories = catData.categories || [];

      loadPrefs();
      const chk = $("#chk-enable-rerank");
      if (chk) chk.checked = _rerank;
      _activeTab = "id";
      renderCheckboxes();
    } catch (e) {
      if (box) box.innerHTML = `<div style="color:var(--danger);">${t("err_load_config")}</div>`;
    }
  }

  function saveManager() {
    saveCurrentTabChecks();
    const chk = $("#chk-enable-rerank");
    if (chk) _rerank = chk.checked;
    savePrefs();
    // Also POST to server so it persists server-side
    fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(_checkedModels)
    }).catch(() => { });
    const dialog = $("#ensemble-manager");
    if (dialog) { if (dialog.close) dialog.close(); else dialog.classList.add("hidden"); }
    if (window.DK && DK.showToast) DK.showToast(DK.getLang() === "en" ? "Configuration saved" : "Konfigurasi tersimpan");
  }

  // Expose for index.js to call if it wants
  window.DK = window.DK || {};
  DK.openEnsembleManager = openManager;

  document.addEventListener("DOMContentLoaded", () => {
    // Header button (available on all pages)
    const btnEngine = $("#btn-engine-config");
    if (btnEngine) {
      btnEngine.addEventListener("click", () => {
        // If index.js has already bound its own handler, let it handle.
        // We detect this by checking if the page-specific btn exists.
        const indexBtn = $("#btn-ensemble-config");
        if (indexBtn) {
          indexBtn.click();
        } else {
          openManager();
        }
      });
    }

    // Close / Save / Reset (works on all pages since dialog is in base.html)
    const btnClose = $("#btn-close-ensemble");
    if (btnClose) {
      btnClose.addEventListener("click", () => {
        const dialog = $("#ensemble-manager");
        if (dialog) { if (dialog.close) dialog.close(); else dialog.classList.add("hidden"); }
      });
    }
    // Close on click outside (backdrop)
    const emDialog = $("#ensemble-manager");
    if (emDialog) {
      emDialog.addEventListener("click", (e) => {
        if (e.target === emDialog) emDialog.close();
      });
    }
    const btnSave = $("#btn-save-ensemble");
    if (btnSave && !document.getElementById("btn-ensemble-config")) {
      // Only bind our save if index.js hasn't bound its own
      btnSave.addEventListener("click", saveManager);
    }
    const btnReset = $("#btn-reset-ensemble");
    if (btnReset && !document.getElementById("btn-ensemble-config")) {
      btnReset.addEventListener("click", async () => {
        if (window.DK && DK.confirm) {
          if (!await DK.confirm(t("confirm_reset_ensemble"))) return;
        }
        localStorage.removeItem(PREFS_KEY);
        try {
          const def = await fetch("/api/config").then(r => r.json());
          _checkedModels = { id: def.id || [], en: def.en || [], pli: def.pli || [] };
        } catch (e) {
          _checkedModels = { id: [], en: [], pli: [] };
        }

        ["id", "en", "pli"].forEach(k => {
          if (!_checkedModels[k] || _checkedModels[k].length === 0) {
            _checkedModels[k] = ["intfloat/multilingual-e5-base"];
          }
        });

        savePrefs();
        renderCheckboxes();
        if (window.DK && DK.showToast) DK.showToast(DK.getLang() === "en" ? "Reset to defaults" : "Kembali ke setelan awal");
      });
    }

    // ── Hover Preview (Wiki-style) ──
    const refTooltip = document.createElement("div");
    refTooltip.className = "ref-tooltip hidden";
    document.body.appendChild(refTooltip);
    let tooltipTimeout;
    let tooltipHideTimeout;
    let tooltipAbort;

    refTooltip.addEventListener("mouseenter", () => {
      clearTimeout(tooltipHideTimeout);
    });

    // Link "Buka bagian ini" (title row) -> buka teks persis spt klik ref sumbernya: context-aware
    // (dalam-dialog in-place / kartu -> dialog / halaman reader -> navigasi). _refPrev.bypass
    // menembus intersepsi klik-preview di handler klik ref (kalau tidak, malah re-preview).
    // State preview dibagi lintas-IIFE via window._dkRefPreview (dibuat IIFE pertama; intercept
    // klik ref ada di sana). Jangan pakai variabel lokal IIFE itu langsung — tak terlihat dari sini.
    const _refPrev = window._dkRefPreview || (window._dkRefPreview = { show: null, bypass: false });
    const _isTouch = () => !!(window.matchMedia && window.matchMedia("(hover: none)").matches);

    refTooltip.addEventListener("click", (e) => {
      const open = e.target && e.target.closest && e.target.closest(".tooltip-open");
      if (!open) return;
      e.preventDefault();
      const src = refTooltip._srcRef;
      refTooltip.classList.add("hidden");
      refTooltip.style.transform = "translateY(4px)";
      if (src) { _refPrev.bypass = true; try { src.click(); } finally { _refPrev.bypass = false; } }
    });

    // Ada seleksi teks aktif DI DALAM tooltip? -> jangan tutup (biar isinya bisa di-blok & copy).
    const _selInTooltip = () => {
      const sel = window.getSelection && window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
      return refTooltip.contains(sel.anchorNode) || refTooltip.contains(sel.focusNode);
    };

    refTooltip.addEventListener("mouseleave", () => {
      // Delay + cek seleksi: drag-select yang sedikit keluar tepi tak langsung membunuh tooltip,
      // dan selama teksnya masih ke-blok, tooltip tetap hidup supaya bisa di-copy.
      clearTimeout(tooltipHideTimeout);
      tooltipHideTimeout = setTimeout(() => {
        if (_selInTooltip()) return;
        refTooltip.classList.add("hidden");
        refTooltip.style.transform = "translateY(4px)";
      }, 250);
    });

    document.addEventListener("click", (e) => {
      // Klik di dalam tooltip / saat ada seleksi teks tooltip -> jangan tutup.
      if (refTooltip.contains(e.target) || _selInTooltip()) return;
      if (!refTooltip.classList.contains("hidden")) {
        refTooltip.classList.add("hidden");
        refTooltip.style.transform = "translateY(4px)";
      }
    });

    function showRefTooltip(a, immediate) {
      clearTimeout(tooltipTimeout);
      clearTimeout(tooltipHideTimeout);
      refTooltip._srcRef = a;   // dipakai link "Buka bagian ini" utk buka teks persis spt klik ref

      const dlg = a.closest("dialog");
      if (dlg && refTooltip.parentElement !== dlg) {
        dlg.appendChild(refTooltip);
      } else if (!dlg && refTooltip.parentElement !== document.body) {
        document.body.appendChild(refTooltip);
      }

      const rect = a.getBoundingClientRect();

      tooltipTimeout = setTimeout(async () => {
        refTooltip.innerHTML = '<i data-lucide="loader-2" class="spin" style="width:14px;height:14px;vertical-align:-2px"></i> <span style="font-size:0.8rem;color:var(--text-muted)">Memuat...</span>';
        if (window.lucide) window.lucide.createIcons({ root: refTooltip });

        // Initial positioning below the link
        let tx = Math.max(10, rect.left + rect.width / 2 - 175);
        tx = Math.min(tx, window.innerWidth - 360);
        refTooltip.style.left = tx + "px";
        refTooltip.style.top = (rect.bottom + 8) + "px";
        refTooltip.style.transform = "translateY(4px)";
        refTooltip.classList.remove("hidden");

        // requestAnimationFrame agar transisi jalan
        requestAnimationFrame(() => {
          refTooltip.style.transform = "translateY(0)";
        });

        if (tooltipAbort) tooltipAbort.abort();
        tooltipAbort = new AbortController();

        const href = a.getAttribute("href") || "";
        const isPara = a.classList.contains("para-ref");
        const lang = a.dataset.lang || window.DK?.getLang?.() || "id";

        try {
          let textToShow = "";
          let titleToShow = "";
          let htmlReady = false;   // true = textToShow sudah HTML jadi (marker ruas), jangan di-strip

          // Rentang ¶ ("§md15-16" di label chip, hasil resolve_para_span) -> pratinjau
          // GABUNGAN seluruh segmen span, bukan cuma segmen awal href. Daftar cid diturunkan
          // dari label (sumber tunggal yg sama dgn relabel reader); md bernomor urut.
          const _spanCids = (cid) => {
            const mm = (a.textContent || "").match(/§\s*md(\d+)\s*-\s*(\d+)/);
            if (!mm || !cid) return [cid];
            const s0 = parseInt(mm[1], 10), e0 = parseInt(mm[2], 10);
            if (!cid.endsWith(":md" + s0) || !(e0 > s0) || e0 - s0 > 12) return [cid];
            const base = cid.split(":")[0];
            const out = [];
            for (let k = s0; k <= e0; k++) out.push(base + ":md" + k);
            return out;
          };
          const _spanTitle = cids => cids.length > 1
            ? cids[0] + "-" + cids[cids.length - 1].split(":").pop().replace(/^md/, "")
            : cids[0];
          const _cloneClean = el => {
            const clone = el.cloneNode(true);
            clone.querySelectorAll(".seg-tool-btn, .seg-action-btn, .segment-actions, .seg-actions, .btn-add-note, .note-action, .suttaplex-blurb-actions, .seg-add-btn, .seg-ref").forEach(x => x.remove());
            return clone.innerHTML;
          };
          const _localSpanItems = cids => cids
            .map(c => {
              const el = document.getElementById(c) || document.getElementById("dlg-" + c);
              return el ? { seg: c.split(":").pop(), text: _cloneClean(el) } : null;
            }).filter(Boolean);
          const _apiSpanItems = (segments, cids) => cids
            .map(c => {
              const s = (segments || []).find(sg => sg.ids && sg.ids.includes(c));
              return s ? { seg: c.split(":").pop(), text: s.text } : null;
            }).filter(Boolean);
          // Susun preview multi-segmen: penanda batas antar-ruas WAJIB ada — superscript ref
          // ala bible ("md15") bila setting kode-rujukan-ruas (show-seg-ref) nyala, kalau
          // dimatikan user -> garis pemisah ‖ (paritas gaya reader). Segmen tunggal polos.
          const _plainTxt = s => String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          const _escTT = (window.DK && DK.esc) ? DK.esc
            : (s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
          const _composeSpan = items => {
            const showRef = document.documentElement.classList.contains("show-seg-ref");
            return items.map((it, i) => {
              const body = _escTT(_plainTxt(it.text));
              if (items.length === 1) return body;
              const marker = showRef
                ? `<sup class="tt-seg-ref">${_escTT(it.seg)}</sup>`
                : (i > 0 ? `<span class="tt-seg-sep">‖</span> ` : "");
              return marker + body;
            }).join(" ");
          };

          if (isPara) {
            const cid = href.replace(/^#/, "");
            const sid = cid.split(":")[0];
            const cids = _spanCids(cid);
            const localItems = _localSpanItems(cids);
            if (localItems.length) {
              textToShow = _composeSpan(localItems);
              htmlReady = true;
              titleToShow = _spanTitle(cids);
            } else if (sid) {
              const res = await fetch(`/api/sutta/${sid}/${lang}`, { signal: tooltipAbort.signal });
              if (res.ok) {
                const data = await res.json();
                const items = _apiSpanItems(data.segments, cids);
                if (items.length) { textToShow = _composeSpan(items); htmlReady = true; }
                titleToShow = _spanTitle(cids);
              }
            }
          } else {
            // sutta-ref (lintas-sutta / sibling). href = "/{id}/{lang}/{author}#{cid}".
            // Kalau ADA hash (mis. #mn51:md34) -> pratinjau SEGMEN yg dituju (bukan segmen
            // pertama/blurb), pakai author dari path supaya nomor md cocok. Tanpa hash (target
            // tak ter-resolve, mis. bare "/mn51/en") -> jatuh ke blurb / segmen pertama.
            const hashIdx = href.indexOf("#");
            const path = hashIdx >= 0 ? href.substring(0, hashIdx) : href;
            const cid = hashIdx >= 0 ? href.substring(hashIdx + 1) : "";   // "mn51:md34"
            const parts = path.replace(/^\//, "").split("/");              // [id, lang, author?]
            const sid = parts[0];
            const tlang = parts[1] || lang;
            const tauthor = parts[2] || "";
            // Segmen sudah ter-render lokal (page/dialog)? pakai langsung. Span range ikut.
            const cids = cid ? _spanCids(cid) : [];
            const localItems = cid ? _localSpanItems(cids) : [];
            if (localItems.length) {
              textToShow = _composeSpan(localItems);
              htmlReady = true;
              titleToShow = _spanTitle(cids);
            } else if (sid) {
              const url = tauthor
                ? `/api/sutta/${sid}/${tlang}/${encodeURIComponent(tauthor)}`
                : `/api/sutta/${sid}/${tlang}`;
              const res = await fetch(url, { signal: tooltipAbort.signal });
              if (res.ok) {
                const data = await res.json();
                const baseTitle = data.sutta_name ? `${data.formatted_id || sid.toUpperCase()} — ${data.sutta_name}` : (data.formatted_id || sid.toUpperCase());
                if (cid && data.segments) {
                  const items = _apiSpanItems(data.segments, cids);
                  if (items.length) { textToShow = _composeSpan(items); htmlReady = true; titleToShow = _spanTitle(cids); }
                }
                if (!textToShow) {   // tanpa hash / segmen tak ketemu -> blurb / segmen pertama
                  titleToShow = baseTitle;
                  if (data.blurb) textToShow = data.blurb;
                  else if (data.segments && data.segments.length > 0) {
                    const firstSeg = data.segments.find(s => s.text && (!s.heading || s.heading === 0) && !s.ids.some(id => id.startsWith("0.")));
                    if (firstSeg) textToShow = firstSeg.text;
                  }
                }
              }
            }
          }

          // Title row: judul kiri + link "Buka bagian ini" di ujung kanan (buka teks persis spt klik
          // ref: context-aware dialog/non-dialog, via refTooltip._srcRef.click()).
          const _href = (a.getAttribute("href") || "").replace(/"/g, "&quot;");
          const _titleRow = `<div class="tooltip-title"><span class="tooltip-title-text">${titleToShow}</span><a class="tooltip-open" href="${_href}">${t("tooltip_open_section")}</a></div>`;
          if (textToShow) {
            const contentHtml = htmlReady
              ? textToShow   // sudah HTML jadi (marker ruas per-segmen), jangan di-strip
              : String(textToShow).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
            refTooltip.innerHTML = `${_titleRow}<div class="tooltip-content">${contentHtml}</div>`;
          } else {
            refTooltip.innerHTML = `${_titleRow}<div class="tooltip-content" style="color:var(--text-muted)"><i>Tidak ada pratinjau teks tersedia.</i></div>`;
          }

          // Setelah konten termuat, pastikan letaknya tidak keluar dari batas layar
          const ttRect = refTooltip.getBoundingClientRect();
          let topPos = rect.bottom + 8; // Default: di bawah link
          let leftPos = Math.max(10, rect.left + rect.width / 2 - (ttRect.width / 2));
          leftPos = Math.min(leftPos, window.innerWidth - ttRect.width - 10);

          if (topPos + ttRect.height > window.innerHeight) {
            if (rect.top - ttRect.height - 8 > 8) {
              // Kalau di bawah nabrak, tapi di atas cukup, taruh di atas
              topPos = rect.top - ttRect.height - 8;
            } else {
              // Kalau di atas dan di bawah sama-sama sempit, geser ke samping!
              // Sejajarkan vertikal dengan link, pastikan aman di dalam layar
              topPos = rect.top + (rect.height / 2) - (ttRect.height / 2);
              topPos = Math.max(8, Math.min(topPos, window.innerHeight - ttRect.height - 8));

              // Coba taruh di kanan dulu, kalau nggak muat coba di kiri
              if (window.innerWidth - rect.right > ttRect.width + 8) {
                leftPos = rect.right + 8;
              } else if (rect.left > ttRect.width + 8) {
                leftPos = rect.left - ttRect.width - 8;
              } else {
                // Sempit banget (layar HP), mentok aja di pinggir (terpaksa nabrak dikit)
                leftPos = Math.max(8, window.innerWidth - ttRect.width - 8);
              }
            }
          }
          // Jaga-jaga kalau tooltipnya super raksasa, jangan sampai tembus atas
          topPos = Math.max(8, topPos);
          refTooltip.style.top = topPos + "px";
          refTooltip.style.left = leftPos + "px";
        } catch (e) {
          if (e.name !== "AbortError") {
            refTooltip.innerHTML = '<span style="color:red">Gagal memuat pratinjau.</span>';
          }
        }
      }, immediate ? 0 : 300);
    }
    _refPrev.show = showRefTooltip;

    // Hover (desktop): tampilkan tooltip. Touch (mobile) diabaikan di sini — dipicu lewat tap
    // (handler klik ref di atas) supaya event hover sintetis browser tak bikin tooltip kedip.
    document.addEventListener("mouseover", (e) => {
      if (_isTouch()) return;
      const a = e.target && e.target.closest && e.target.closest("a.para-ref, a.sutta-ref");
      if (a) showRefTooltip(a);
    });

    document.addEventListener("mouseout", (e) => {
      if (_isTouch()) return;
      const a = e.target && e.target.closest && e.target.closest("a.para-ref, a.sutta-ref");
      if (!a) return;
      clearTimeout(tooltipTimeout);
      if (tooltipAbort) { tooltipAbort.abort(); tooltipAbort = null; }

      tooltipHideTimeout = setTimeout(() => {
        refTooltip.classList.add("hidden");
        refTooltip.style.transform = "translateY(4px)";
      }, 250);
    });

    document.addEventListener("click", (e) => {
      const a = e.target && e.target.closest && e.target.closest("a.para-ref, a.sutta-ref");
      if (a) {
        return;
      }
      // Klik di dalam tooltip / saat menyeleksi teksnya -> biarkan (bisa select & copy).
      if (refTooltip.contains(e.target) || _selInTooltip()) return;
      clearTimeout(tooltipTimeout);
      if (tooltipAbort) { tooltipAbort.abort(); tooltipAbort = null; }
      refTooltip.classList.add("hidden");
    }, true);
  });
})();

/* ==========================================================================
   Skeleton transisi navigasi (suttaplex & reader).
   Klik link menuju halaman KONTEN (full-page nav) -> tampilkan overlay skeleton
   (#nav-skeleton) selama browser nunggu halaman baru; overlay ke-buang otomatis
   pas halaman baru render (fresh doc tanpa class) atau saat restore bfcache.
   Progressive enhancement murni: TAK ada preventDefault -> nav standar tetap jalan,
   JS mati pun aman. Bukan SPA (tanpa fetch/routing). ====================== */
(function () {
  // First-segment path yg BUKAN halaman konten (suttaplex/reader) -> jgn tampilkan.
  const NON_CONTENT = new Set(["", "browse", "chat", "tentang", "res", "api", "static", "bu", "bi"]);

  function isContentPath(pathname) {
    const seg = pathname.split("/").filter(Boolean);
    // HANYA suttaplex (1 segmen, mis. /mn10). Reader (/mn10/id[/author], 2+ segmen)
    // JANGAN: dia punya skeleton sendiri (#sutta-loading) -> kalau overlay ini ikut
    // nyala jadinya dobel skeleton ("skeleton suttaplex" sekejap lalu ganti skeleton
    // reader = kedip aneh). Bentuk overlay ini pun bentuk suttaplex.
    if (seg.length !== 1) return false;
    return !NON_CONTENT.has(seg[0].toLowerCase());
  }

  let _navTimer = null;
  function showNavSkeleton() {
    document.body.classList.add("is-navigating");
    // Jaring pengaman: kalau nav ke-batal/gantung, buang overlay biar ga nyangkut.
    clearTimeout(_navTimer);
    _navTimer = setTimeout(() => document.body.classList.remove("is-navigating"), 10000);
  }
  function hideNavSkeleton() {
    clearTimeout(_navTimer);
    document.body.classList.remove("is-navigating");
  }

  // BUBBLE phase + cek defaultPrevented: kalau handler lain (mis. buka dialog/chooser)
  // udah preventDefault, kita nurut & ga munculin skeleton (klik itu bukan nav).
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target && e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    if (a.target === "_blank" || a.hasAttribute("download")) return;
    const rawHref = a.getAttribute("href") || "";
    if (rawHref.startsWith("#") || /^[a-z]+:/i.test(rawHref) && !/^https?:/i.test(rawHref)) return; // #hash, mailto:, javascript:, tel:
    let url;
    try { url = new URL(a.href, location.href); } catch (_) { return; }
    if (url.origin !== location.origin) return;                       // eksternal
    if (url.pathname === location.pathname && url.search === location.search) return; // halaman sama (paling hash doang)
    if (!isContentPath(url.pathname)) return;
    showNavSkeleton();
  });

  // Restore bfcache (tombol Back/Forward): halaman lama muncul lagi -> pastikan
  // overlay ga ke-restore ikut kebuka.
  window.addEventListener("pageshow", hideNavSkeleton);
})();
