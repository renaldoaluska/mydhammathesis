/* ============================================================
 * chat.js — Mesin chat RAG yang REUSABLE.
 * Mount ke elemen mana pun: DhammaChat.mount(el, opts).
 *   opts.endpoint    (default "/api/chat")
 *   opts.placeholder
 * Bergantung pada DK (common.js) untuk render kartu sutta + tombol Catatan,
 * jadi kutipan tampil sebagai kartu yang SAMA dengan hasil pencarian, dan
 * "+ Catatan" terhubung ke panel Catatan asli. Tanpa DK pun tetap jalan
 * (kartu sederhana, tanpa tombol Catatan) — aman dipakai standalone.
 * ============================================================ */
(function () {
  function mount(container, opts) {
    opts = opts || {};
    const endpoint = opts.endpoint || "/api/chat";
    let history = []; // {role, content, results}
    const DK = window.DK || {};
    const esc = DK.esc || (s => (s || "").replace(/[&<>]/g,
      c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])));
    // tt(key, fallback): cari terjemahan lewat DK.t (common.js), fallback ke string default
    const tt = (k, fb) => {
      if (DK.t) { const v = DK.t(k); if (v !== k) return v; }
      return fb !== undefined ? fb : k;
    };
    const isEN = () => {
      // DK.getLang() baca dari localStorage (set oleh common.js language toggle)
      // DK.state.lang juga diterima kalau di-set oleh index.js / sutta.js
      const lang = (DK.getLang && DK.getLang())
        || (DK.state && DK.state.lang)
        || localStorage.getItem("dk-lang")
        || "id";
      return lang === "en";
    };

    function enforceTheravadaTerms(text) {
      if (!text) return text;
      // Fallback darurat saja, sisanya di-handle native oleh AI via system prompt
      const replacements = [
        [/\b(?:Gautama|Gotama)[\s,]+(?:Siddhartha|Siddhattha|Siddharta)\b/gi, "Siddhattha Gotama"],
        [/\b(?:Siddhartha|Siddhattha|Siddharta)[\s,]+(?:Gautama|Gotama)\b/gi, "Siddhattha Gotama"],
        [/\bGautama\b/gi, "Gotama"],
        [/\b(?:Siddhartha|Siddharta)\b/gi, "Siddhattha"],
        [/\bSutra(s)?\b/gi, "Sutta"],
        [/\bDharma\b/gi, "Dhamma"],
        [/\bKarma\b/gi, "Kamma"],
        [/\bNirvana\b/gi, "Nibbāna"],
        [/\bAvidya\b/gi, "Avijjā"],
        [/\bBodhisattva\b/gi, "Bodhisatta"],
        [/\bArhat\b/gi, "Arahat"],
        [/\bBudha\b/gi, "Buddha"],
        [/\bSatya\b/gi, "Sacca"],
        [/\bArya\b/gi, "Ariya"],
        [/\bSutera\b/gi, "Sutta"],
        [/\bSutra\b/gi, "Sutta"],
        // Sanskerta teknis Buddhis yang sering bocor (mis. "kumpul-kumpul (skandhas)")
        [/\bSkandha(s)?\b/gi, "khandha"],
        [/\bDhyana(s)?\b/gi, "jhāna"],
        [/\bPraj(?:n|ñ)a\b/gi, "paññā"],
        [/\bVij(?:n|ñ)ana\b/gi, "viññāṇa"],
        [/\bSamskara(s)?\b/gi, "saṅkhāra"],
        [/\bTrishna\b/gi, "taṇhā"],
        [/\bAnatman\b/gi, "anattā"],
        [/\bSh?unyata\b/gi, "suññatā"],
        [/\bBhikshuni(s)?\b/gi, "bhikkhunī"],
        [/\bBhikshu(s)?\b/gi, "bhikkhu"],
        [/\bShraddha\b/gi, "saddhā"],
        [/\bMaitri\b/gi, "mettā"],
        [/\bDuhkha\b/gi, "dukkha"],
        [/\bKlesha(s)?\b/gi, "kilesa"],
        [/\bPratityasamutpada\b/gi, "paṭiccasamuppāda"],
        // Restore DIAKRITIK Pali "telanjang" (model kecil sering nulis tanpa diakritik).
        // Kurasi rendah-tabrakan dgn kata Indonesia (sengaja TANPA "sila"/"mara"/"nana").
        [/\bSatipatthana\b/gi, "satipaṭṭhāna"],
        [/\bParinibbana\b/gi, "parinibbāna"],
        [/\bNibbana\b/gi, "nibbāna"],
        [/\bPaticcasamuppada\b/gi, "paṭiccasamuppāda"],
        [/\bBrahmavihara\b/gi, "brahmavihāra"],
        [/\bVipassana\b/gi, "vipassanā"],
        [/\bSamadhi\b/gi, "samādhi"],
        [/\bJhana\b/gi, "jhāna"],
        [/\bPanna\b/gi, "paññā"],
        [/\bMetta\b/gi, "mettā"],
        [/\bKaruna\b/gi, "karuṇā"],
        [/\bMudita\b/gi, "muditā"],
        [/\bUpekkha\b/gi, "upekkhā"],
        [/\bTanha\b/gi, "taṇhā"],
        [/\bAnatta\b/gi, "anattā"],
        [/\bSankhara\b/gi, "saṅkhāra"],
        [/\bNikaya\b/gi, "nikāya"],
        [/\bTipitaka\b/gi, "tipiṭaka"],
        [/\bPatimokkha\b/gi, "pātimokkha"],
        [/\bSotapanna\b/gi, "sotāpanna"],
        [/\bSakadagami\b/gi, "sakadāgāmī"],
        [/\bAnagami\b/gi, "anāgāmī"],
        [/\bKasina\b/gi, "kasiṇa"]
      ];
      let res = text;
      for (const [pat, rep] of replacements) {
        res = res.replace(pat, (match) => {
          if (match === match.toUpperCase() && match.length > 1) return rep.toUpperCase();
          if (match[0] === match[0].toUpperCase()) return rep.charAt(0).toUpperCase() + rep.slice(1);
          return rep.toLowerCase();
        });
      }

      // Auto-italicize common Pali terms if not already surrounded by * or _
      const paliTerms = [
        "Dhamma", "Sutta", "Suttas", "Tipiṭaka", "Tipitaka", "Nibbāna", "Nibbana",
        "Kamma", "Saṃsāra", "Samsara", "Dukkha", "Sacca", "Ariya", "Metta", "Mettā",
        "Karuna", "Karuṇā", "Mudita", "Muditā", "Upekkha", "Upekkhā", "Magga",
        "Nirodha", "Samudaya", "Khandha", "Paññā", "Panna", "Sīla", "Sila",
        "Samādhi", "Samadhi", "Bhikkhu", "Bhikkhunī", "Bhikkhuni", "Sangha", "Saṅgha",
        "Vinaya", "Abhidhamma", "Saddhā", "Saddha"
      ];

      const paliRegex = new RegExp(`(?<![\\*\\_A-Za-z])\\b(${paliTerms.join('|')})\\b(?![\\*\\_A-Za-z])`, 'gi');
      res = res.replace(paliRegex, function (match) {
        return `*${match}*`;
      });

      // Calque "di mana" sbg konjungsi intrakalimat (", di mana <klausa>") -> pecah jadi kalimat baru.
      // Cuma pola berkoma (hampir pasti calque); "tahu di mana" / "di mana-mana" yg sah tak tersentuh.
      res = res.replace(/,\s*di\s+mana\s+(\S)/gi, (_m, c) => ". " + c.toUpperCase());

      return res;
    }

    // Mini-markdown -> blok HTML rapi (paragraf, list, **tebal**). Aman: esc dulu.
    // Parser baris-per-baris: item list berurutan (walau dipisah baris kosong)
    // digabung jadi SATU list -> penomoran 1,2,3 oleh browser, bukan "1. 1. 1.".
    function mdLite(src) {
      const inline = t => esc(t)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/__(.+?)__/g, "<strong>$1</strong>")
        .replace(/(^|[^*_])\*(?!\s)([^*]+?)\*(?!\*)/g, "$1<em>$2</em>")
        .replace(/(^|[^*_])_(?!\s)([^_]+?)_(?!_)/g, "$1<em>$2</em>");
      const isUL = l => /^\s*[-*]\s+/.test(l);
      const isOL = l => /^\s*\d+[.)]\s+/.test(l);
      const isSub = l => /^\s{2,}[-*]\s+/.test(l);          // indented bullet = sub-item
      const blank = l => /^\s*$/.test(l);
      const lines = (src || "").replace(/\r/g, "").trim().split("\n");
      const out = [];
      let i = 0;

      // Collect nested sub-bullets that follow a list item and return <ul>…</ul> HTML.
      function drainSub() {
        const subs = [];
        while (i < lines.length) {
          if (isSub(lines[i])) {
            subs.push("<li>" + inline(lines[i].replace(/^\s*[-*]\s+/, "")) + "</li>");
            i++;
          } else if (blank(lines[i]) && i + 1 < lines.length && isSub(lines[i + 1])) {
            i++;                                             // skip blank between sub-items
          } else break;
        }
        return subs.length ? "<ul>" + subs.join("") + "</ul>" : "";
      }

      while (i < lines.length) {
        if (blank(lines[i])) { i++; continue; }

        const headerMatch = lines[i].match(/^\s*(#{1,6})\s+(.*)$/);
        if (headerMatch) {
          const level = headerMatch[1].length;
          const tag = "h" + (level > 4 ? 4 : level + 2); // bump headers so they aren't huge
          out.push("<" + tag + ">" + inline(headerMatch[2]) + "</" + tag + ">");
          i++;
          continue;
        }

        if (/^\s*[-*_]{3,}\s*$/.test(lines[i])) {
          out.push("<hr class='chat-divider'>");
          i++;
          continue;
        }

        if (isUL(lines[i]) || isOL(lines[i])) {
          const ordered = isOL(lines[i]);
          const match = ordered ? isOL : isUL;
          const other = ordered ? isUL : isOL;               // opposite list type
          const items = [];
          while (i < lines.length) {
            if (match(lines[i])) {
              let li;
              if (ordered) {
                const m = lines[i].match(/^\s*(\d+)[.)]\s+(.*)$/);
                // Simpan NOMOR asli model -> <li value=N>, biar tak restart "1." saat
                // list ke-split oleh sub-bullet (browser nomori per <ol>).
                li = `<li value="${m[1]}">` + inline(m[2]);
              } else {
                li = "<li>" + inline(lines[i].replace(/^\s*[-*]\s+/, ""));
              }
              i++;
              // Absorb interleaved opposite-type sub-items or indented bullets as
              // a nested <ul>/<ol> inside the current <li>, instead of breaking
              // the parent list (which would restart OL numbering).
              const nested = drainSub();
              if (!nested && i < lines.length && other(lines[i])) {
                // Non-indented opposite-type items (e.g. "- x" right after "1. y")
                const subTag = ordered ? "ul" : "ol";
                const subMatch = other;
                const subItems = [];
                while (i < lines.length) {
                  if (subMatch(lines[i])) {
                    subItems.push("<li>" + inline(lines[i].replace(/^\s*(?:\d+[.)]\s+|[-*]\s+)/, "")) + "</li>");
                    i++;
                  } else if (blank(lines[i]) && i + 1 < lines.length && subMatch(lines[i + 1])) {
                    i++;
                  } else break;
                }
                li += "<" + subTag + ">" + subItems.join("") + "</" + subTag + ">";
              } else {
                li += nested;
              }
              items.push(li + "</li>");
            } else if (blank(lines[i]) && i + 1 < lines.length && (match(lines[i + 1]) || isSub(lines[i + 1]))) {
              i++;                                           // skip blank between items
            } else break;
          }
          const tag = ordered ? "ol" : "ul";
          out.push("<" + tag + ">" + items.join("") + "</" + tag + ">");
        } else {
          const para = [];
          while (i < lines.length && !blank(lines[i]) && !isUL(lines[i]) && !isOL(lines[i]) && !/^\s*#{1,6}\s+/.test(lines[i])) {
            para.push(lines[i]); i++;
          }
          out.push("<p>" + para.map(inline).join("<br>") + "</p>");
        }
      }
      return out.join("");
    }

    // --- SESSION MANAGEMENT LOGIC ---
    let sessions = [];
    let currentSessionId = null;
    let isGenerating = false;
    let abortController = null;

    async function checkAndCancelGeneration() {
      if (isGenerating) {
        const msg = isEN() ? "The bot is still generating an answer. Cancel and switch?" : "Bot masih sedang mengetik. Batalkan dan pindah obrolan?";
        // Aksinya = hentikan generasi & pindah, BUKAN menghapus chat. Jadi jangan pakai
        // danger (label default-nya "Hapus"/"Delete" -> bikin nyasar); label eksplisit.
        if (await window.DK.confirm(msg, {
          confirmLabel: isEN() ? "Stop & switch" : "Hentikan & pindah",
          cancelLabel: isEN() ? "Keep generating" : "Lanjut dulu",
        })) {
          if (abortController) abortController.abort();
          isGenerating = false;
          return true;
        }
        return false;
      }
      return true;
    }



    container.classList.add("chat-app-wrapper");
    container.innerHTML = `
      <div class="chat-header-bar">
        <div class="chat-header-left">
          <button type="button" id="btn-chat-home" class="chat-header-btn" title="${isEN() ? "Back" : "Kembali"}"><i data-lucide="arrow-left"></i></button>
          <button type="button" id="btn-mobile-menu" class="chat-header-btn" title="${isEN() ? "History" : "Riwayat"}"><i data-lucide="history"></i></button>
        </div>
        <div class="chat-header-right">
          <div style="position:relative;">
            <button type="button" id="btn-chat-settings" class="chat-header-btn" title="${isEN() ? "Settings" : "Pengaturan"}"><i data-lucide="settings"></i></button>
            <div class="chat-settings-menu" id="chat-settings-menu"></div>
          </div>
          <button type="button" id="btn-mobile-new" class="chat-header-btn" title="${isEN() ? "New Chat" : "Obrolan Baru"}"><i data-lucide="edit"></i></button>
        </div>
      </div>
      <div class="chat-sidebar-overlay"></div>
      <div class="chat-sidebar">
         <div class="chat-sidebar-head">
            <button type="button" id="btn-chat-back-desktop" class="chat-sidebar-back" title="${isEN() ? "Back" : "Kembali"}"><i data-lucide="arrow-left"></i></button>
            <button type="button" id="btn-new-chat" class="btn-primary chat-new-btn">
               <i data-lucide="plus"></i> <span data-i18n="btn_new_chat">${isEN() ? "New Chat" : "Obrolan Baru"}</span>
            </button>
            <button type="button" id="btn-sidebar-close" class="chat-sidebar-close" title="${isEN() ? "Close" : "Tutup"}"><i data-lucide="x"></i></button>
         </div>
         <h4 style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px; font-weight: 600; letter-spacing: 0.05em; padding-left: 4px;" data-i18n="history_divider">${isEN() ? "History" : "Riwayat"}</h4>
         <div id="chat-session-list" style="display: flex; flex-direction: column; overflow-y: auto; flex-grow: 1;"></div>
      </div>
      <div class="chat-widget-area">
        <div class="chat-brand-badge" aria-hidden="true"><span>myDhamma AI</span></div>
        <div class="chat-widget">
          <div class="chat-log"></div>
          <form class="chat-input-row" autocomplete="off" style="position: relative;">
            <div id="chat-mention-popup" class="chat-mention-popup"></div>
            <div class="chat-input-wrap">
              <div class="chat-input-inner">
                <div class="chat-input-backdrop" aria-hidden="true"></div>
                <textarea class="chat-input" rows="1" placeholder="${esc(opts.placeholder || (isEN() ? 'e.g. why do I keep suffering?' : 'mis. kenapa ya aku menderita terus?'))}"></textarea>
              </div>
              <button type="submit" class="btn-primary chat-send" title="${isEN() ? 'Send' : 'Kirim'}"><i data-lucide="arrow-up"></i></button>
            </div>
          </form>
          <div class="chat-disclaimer">${esc(tt("chat_disclaimer", "⚠ AI dapat membuat kesalahan; selalu periksa rujukannya."))}</div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons({ root: container });

    const settingsMenu = container.querySelector("#chat-settings-menu");
    const langToggle = document.getElementById("btn-lang-toggle");
    const themeToggle = document.getElementById("btn-theme-toggle");
    if (settingsMenu) {
      if (langToggle) settingsMenu.appendChild(langToggle);
      if (themeToggle) settingsMenu.appendChild(themeToggle);
    }

    const btnChatSettings = container.querySelector("#btn-chat-settings");

    function toggleSettingsMenu(e) {
      e.stopPropagation();
      settingsMenu.classList.toggle("open");
    }

    if (btnChatSettings) btnChatSettings.addEventListener("click", toggleSettingsMenu);

    document.addEventListener("click", (e) => {
      if (settingsMenu && !settingsMenu.contains(e.target)) {
        if (btnChatSettings && btnChatSettings.contains(e.target)) return;
        settingsMenu.classList.remove("open");
      }
    });

    const btnChatHome = container.querySelector("#btn-chat-home");
    if (btnChatHome) btnChatHome.addEventListener("click", () => window.location.href = "/");

    // Set teks elemen + simpan kedua bahasa di data-attr supaya sweep di applyLangToChat
    // bisa menukar live tanpa render ulang. WAJIB dipakai HANYA pada elemen daun (tanpa
    // anak), krn sweep mengganti textContent (akan menghapus anak kalau ada).
    function setI18n(el, en, id) {
      if (!el) return;
      if (el._typeTimer) { clearTimeout(el._typeTimer); el._typeTimer = null; }
      el.dataset.i18nEn = en;
      el.dataset.i18nId = id;
      el.textContent = isEN() ? en : id;
    }

    const prefersReduced = () =>
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Efek ketik: tulis `text` huruf demi huruf ke `el`. Psikologis bikin langkah proses
    // (Memahami/Memproses/…) terasa aktif, bukan diam menunggu. Timer disimpan di elemen
    // supaya bisa di-finalize/diganti. Hormati prefers-reduced-motion.
    function typeInto(el, text, speed = 18) {
      if (!el) return;
      if (el._typeTimer) { clearTimeout(el._typeTimer); el._typeTimer = null; }
      if (prefersReduced()) { el.textContent = text; return; }
      el.textContent = "";
      let i = 0;
      (function step() {
        el.textContent = text.slice(0, ++i);
        el._typeTimer = i < text.length ? setTimeout(step, speed) : null;
      })();
    }

    // Lompat ke teks penuh (mis. saat langkah ditandai selesai sebelum ketik kelar).
    function finalizeType(el) {
      if (!el || !el._typeTimer) return;
      clearTimeout(el._typeTimer);
      el._typeTimer = null;
      const full = isEN() ? el.dataset.i18nEn : el.dataset.i18nId;
      if (full != null) el.textContent = full;
    }

    // setI18n + langsung diketik (utk label langkah proses).
    function setI18nTyped(el, en, id) {
      if (!el) return;
      el.dataset.i18nEn = en;
      el.dataset.i18nId = id;
      typeInto(el, isEN() ? en : id);
    }

    // Ketik lalu ganti-ganti varian terus-menerus (a la "blabla-ing" Claude) — utk langkah
    // yg nunggunya lama (mis. menyusun jawaban) biar user gak bosen. `variants`=[{en,id}].
    // Pakai slot _typeTimer yg sama -> finalizeType/setI18n/sweep otomatis menghentikannya.
    function cycleType(el, variants, speed = 22, hold = 1100) {
      if (!el || !variants.length) return;
      if (el._typeTimer) { clearTimeout(el._typeTimer); el._typeTimer = null; }
      el.dataset.i18nEn = variants[0].en;
      el.dataset.i18nId = variants[0].id;
      if (prefersReduced()) { el.textContent = isEN() ? variants[0].en : variants[0].id; return; }
      let vi = 0;
      function typePhrase() {
        // data-attr diperbarui per frasa -> kalau user switch bahasa di tengah, frasa
        // berjalan tampil utuh di bahasa baru.
        el.dataset.i18nEn = variants[vi].en;
        el.dataset.i18nId = variants[vi].id;
        const text = isEN() ? variants[vi].en : variants[vi].id;
        let i = 0;
        (function step() {
          el.textContent = text.slice(0, ++i);
          el._typeTimer = setTimeout(
            i < text.length ? step : () => { vi = (vi + 1) % variants.length; typePhrase(); },
            i < text.length ? speed : hold
          );
        })();
      }
      typePhrase();
    }

    // ── Live i18n update saat user switch bahasa ──
    function applyLangToChat() {
      // Sweep generik: semua elemen ber-data-i18n-en/id (string dinamis di bubble:
      // "Stopped", "Coba lagi", "Memproses: …", dll) ikut ganti tanpa refresh.
      container.querySelectorAll("[data-i18n-en]").forEach(el => {
        if (el._typeTimer) { clearTimeout(el._typeTimer); el._typeTimer = null; }
        el.textContent = isEN() ? el.dataset.i18nEn : el.dataset.i18nId;
      });
      // "Obrolan Baru" / "New Chat"
      const newChatSpan = container.querySelector("[data-i18n='btn_new_chat']");
      if (newChatSpan) newChatSpan.textContent = tt("btn_new_chat", isEN() ? "New Chat" : "Obrolan Baru");
      // "Riwayat" / "History"
      const histH4 = container.querySelector("[data-i18n='history_divider']");
      if (histH4) histH4.textContent = tt("history_divider", isEN() ? "History" : "Riwayat");
      // Filter labels (lbl_language, lbl_pitaka)
      container.querySelectorAll("[data-i18n-label]").forEach(el => {
        el.textContent = tt(el.dataset.i18nLabel, el.textContent);
      });
      // Tombol Kirim / Send
      // Tombol Kirim / Send
      const sendBtn = container.querySelector(".chat-send");
      const chatInput = container.querySelector(".chat-input");
      if (sendBtn && chatInput) {
        if (sendBtn.classList.contains("chat-stop")) {
          sendBtn.title = isEN() ? "Stop" : "Berhenti";
        } else {
          const hasText = chatInput.value.trim().length > 0;
          sendBtn.title = hasText ? tt("btn_send", isEN() ? "Send" : "Kirim") : (isEN() ? "Mention Text" : "Sebut");
        }
      }
      // Placeholder textarea
      if (chatInput && !opts.placeholder) {
        chatInput.placeholder = isEN() ? "e.g. why do I keep suffering?" : "mis. kenapa ya aku menderita terus?";
      }
      // Disclaimer
      const disc = container.querySelector(".chat-disclaimer");
      if (disc) disc.textContent = tt("chat_disclaimer",
        isEN()
          ? "⚠ AI may make mistakes; always check the citations."
          : "⚠ AI dapat membuat kesalahan; selalu periksa rujukannya.");
      // Empty-state (sapaan + contoh) di-render sekali; kalau lagi tampil, bangun ulang
      // biar teks ikut bahasa baru tanpa perlu refresh.
      if (log.querySelector(".chat-empty-state")) {
        clearEmptyState();
        renderEmptyState();
      }
    }
    window.addEventListener("dk-lang-change", applyLangToChat);

    const sidebar = container.querySelector(".chat-sidebar");
    const overlay = container.querySelector(".chat-sidebar-overlay");
    const btnMobileMenu = container.querySelector("#btn-mobile-menu");
    const btnMobileNew = container.querySelector("#btn-mobile-new");

    function toggleMobileMenu() {
      if (window.innerWidth > 768) return;
      sidebar.classList.toggle("open");
      if (sidebar.classList.contains("open")) {
        overlay.classList.add("show");
      } else {
        overlay.classList.remove("show");
      }
    }

    function closeMobileMenu() {
      if (sidebar.classList.contains("open")) {
        sidebar.classList.remove("open");
        overlay.classList.remove("show");
      }
    }

    // Tombol back: kembali ke asal buka /chat (mis. halaman sutta lewat "Tanya AI").
    // Fallback ke home kalau tak ada riwayat (mis. /chat dibuka langsung). Dua tombol:
    // floating di mobile-header (#btn-chat-back) + di sidebar-head desktop (#btn-chat-back-desktop).
    const goBack = () => {
      try {
        if (document.referrer && new URL(document.referrer).host === window.location.host) {
          window.history.back();
        } else {
          window.location.href = "/";
        }
      } catch (e) {
        window.location.href = "/";
      }
    };
    container.querySelector("#btn-chat-back")?.addEventListener("click", goBack);
    container.querySelector("#btn-chat-back-desktop")?.addEventListener("click", goBack);

    if (btnMobileMenu) btnMobileMenu.addEventListener("click", toggleMobileMenu);
    if (overlay) overlay.addEventListener("click", closeMobileMenu);
    const btnSidebarClose = container.querySelector("#btn-sidebar-close");
    if (btnSidebarClose) btnSidebarClose.addEventListener("click", closeMobileMenu);
    // Permintaan "obrolan baru" (tombol sidebar & floating). Kalau ada generasi jalan,
    // batalkan dulu (abort + reset tombol Stop). Kalau room sekarang MASIH KOSONG, jangan
    // bikin sesi baru lagi — cukup tetap di situ; cegah spam sesi kosong di histori.
    async function requestNewChat() {
      const canSwitch = await checkAndCancelGeneration();
      if (!canSwitch) return;
      if (history.length === 0) {
        // Reuse room kosong (tak bikin sesi baru), tapi render ULANG empty-state biar
        // animasi "baru masuk" (sapaan diketik + chip muncul stagger + contoh acak baru)
        // tetap main — berasa fresh walau sesinya sama.
        // PENTING: turn yg di-STOP tanpa jawaban parsial TIDAK ter-commit ke history
        // (history tetap []), tapi bubble user + catatan "dihentikan" masih nyangkut di DOM.
        // renderEmptyState() akan bail kalau .chat-msg masih ada -> new-chat seolah tak jalan.
        // Maka bersihkan log dulu.
        clearEmptyState();
        log.innerHTML = "";
        renderEmptyState();
      } else {
        createNewSession(true, true, true);
      }
      // tutup sidebar (mobile) tanpa input.focus() biar keyboard tak otomatis muncul.
      closeMobileMenu();
    }

    if (btnMobileNew) btnMobileNew.addEventListener("click", requestNewChat);

    const log = container.querySelector(".chat-log");
    const widgetArea = container.querySelector(".chat-widget-area");
    // Badge "myDhamma AI" + scrim atas hanya tampak saat ADA percakapan (bukan empty-state).
    function updateBrandBadge() {
      if (widgetArea) widgetArea.classList.toggle("show-brand", !log.querySelector(".chat-empty-state"));
    }
    const form = container.querySelector(".chat-input-row");
    const input = container.querySelector(".chat-input");
    const sendBtn = container.querySelector(".chat-send");
    const sessionListEl = container.querySelector("#chat-session-list");
    const btnNewChat = container.querySelector("#btn-new-chat");

    // --- SIDEBAR UI LOGIC ---
    async function deleteSession(s) {
      // SATU dialog saja: konfirmasi hapus. Jangan tumpuk dgn dialog "Hentikan & pindah"
      // (checkAndCancelGeneration) — itu bikin nyasar + dua <dialog> beruntun bentrok.
      const msg = isEN() ? "Delete this chat session?" : "Hapus obrolan ini?";
      if (!(await window.DK.confirm(msg, { danger: true }))) return;
      // Kalau yg dihapus = sesi aktif yg sedang generate, hentikan diam-diam (tanpa dialog).
      if (s.id === currentSessionId && isGenerating) {
        if (abortController) abortController.abort();
        isGenerating = false;
      }
      sessions = sessions.filter(x => x.id !== s.id);
      if (currentSessionId === s.id) {
        currentSessionId = sessions.length > 0 ? sessions[0].id : null;
        if (!currentSessionId) createNewSession();
        else switchSession(currentSessionId);
      } else {
        saveSessions();
      }
    }

    async function renameSession(s) {
      const msg = isEN() ? "Rename chat" : "Ganti nama obrolan";
      const name = await window.DK.prompt(msg, {
        defaultValue: s.title,
        confirmLabel: isEN() ? "Save" : "Simpan",
      });
      if (name == null) return;            // batal
      const t2 = name.trim();
      if (!t2) return;
      // Judul kustom -> updateCurrentSession tak akan menimpa (hanya auto-set jika judul
      // masih "Obrolan Saya"/"My Chat").
      s.title = t2.length > 60 ? t2.slice(0, 60) : t2;
      saveSessions();
    }

    // --- Kebab menu (titik tiga) per sesi: Ganti nama / Hapus ---
    let sessionMenuEl = null;
    function closeSessionMenu() {
      if (!sessionMenuEl) return;
      sessionMenuEl.remove();
      sessionMenuEl = null;
      document.removeEventListener("click", onSessionMenuOutside, true);
      window.removeEventListener("resize", closeSessionMenu);
      sessionListEl.removeEventListener("scroll", closeSessionMenu);
    }
    function onSessionMenuOutside(e) {
      if (sessionMenuEl && !sessionMenuEl.contains(e.target)) closeSessionMenu();
    }
    function openSessionMenu(s, anchorBtn) {
      closeSessionMenu();
      const menu = document.createElement("div");
      menu.className = "chat-session-menu";
      menu.innerHTML =
        `<button class="chat-session-menu-item" data-act="rename"><i data-lucide="pencil"></i><span>${isEN() ? "Rename" : "Ganti nama"}</span></button>
         <button class="chat-session-menu-item danger" data-act="delete"><i data-lucide="trash-2"></i><span>${isEN() ? "Delete" : "Hapus"}</span></button>`;
      container.appendChild(menu);
      sessionMenuEl = menu;
      // Posisi: di bawah tombol, rata kanan ke tombol; klamp ke viewport.
      const r = anchorBtn.getBoundingClientRect();
      let left = r.right - menu.offsetWidth;
      let top = r.bottom + 4;
      left = Math.max(8, Math.min(left, window.innerWidth - menu.offsetWidth - 8));
      if (top + menu.offsetHeight > window.innerHeight - 8) top = r.top - menu.offsetHeight - 4;
      menu.style.left = left + "px";
      menu.style.top = top + "px";
      menu.querySelector('[data-act="rename"]').onclick = (ev) => { ev.stopPropagation(); closeSessionMenu(); renameSession(s); };
      menu.querySelector('[data-act="delete"]').onclick = (ev) => { ev.stopPropagation(); closeSessionMenu(); deleteSession(s); };
      if (window.lucide) window.lucide.createIcons({ root: menu });
      // daftar listener tutup di tick berikutnya supaya klik pembuka ini tak langsung menutup.
      setTimeout(() => {
        document.addEventListener("click", onSessionMenuOutside, true);
        window.addEventListener("resize", closeSessionMenu);
        sessionListEl.addEventListener("scroll", closeSessionMenu);
      }, 0);
    }

    function renderSidebar() {
      sessionListEl.innerHTML = "";
      let hasActiveInList = false;

      sessions.forEach(s => {
        const isActive = s.id === currentSessionId;
        if (isActive) hasActiveInList = true;
        const item = document.createElement("div");
        item.className = "chat-session-item" + (isActive ? " active" : "");
        item.innerHTML = `<span class="chat-session-title">${esc(s.title)}</span>
                          <button class="chat-session-menu-btn" title="${isEN() ? "Options" : "Opsi"}"><i data-lucide="ellipsis-vertical" style="width:15px;height:15px;"></i></button>`;
        item.addEventListener("click", async (e) => {
          const menuBtn = e.target.closest(".chat-session-menu-btn");
          if (menuBtn) {
            e.stopPropagation();
            openSessionMenu(s, menuBtn);
            return;
          }
          if (s.id !== currentSessionId) {
            const canSwitch = await checkAndCancelGeneration();
            if (!canSwitch) return;
            switchSession(s.id);
          }
          // Item 13: klik sesi mana pun (termasuk yg sedang aktif) tetap menutup sidebar.
          closeMobileMenu();
        });
        sessionListEl.appendChild(item);
      });
      if (window.lucide) window.lucide.createIcons({ root: sessionListEl });

      const newChatBtn = document.getElementById("btn-new-chat");
      if (newChatBtn) {
        if (!hasActiveInList) {
          newChatBtn.classList.add("active");
        } else {
          newChatBtn.classList.remove("active");
        }
      }
    }

    function saveSessions() {
      localStorage.setItem("dhammachat_sessions", JSON.stringify({ activeId: currentSessionId, sessions }));
      renderSidebar();
    }

    function updateURLWithSessionId(id, replace = false) {
      if (!id) return;
      const url = new URL(window.location.href);
      url.searchParams.set("id", id);
      if (replace) {
        window.history.replaceState({ sessionId: id }, document.title, url.toString());
      } else {
        window.history.pushState({ sessionId: id }, document.title, url.toString());
      }
    }

    window.addEventListener("popstate", (e) => {
      const urlId = new URLSearchParams(window.location.search).get("id");
      if (urlId && urlId !== currentSessionId) {
        const s = sessions.find(x => x.id === urlId);
        if (s) {
          switchSession(urlId, false);
        } else {
          if (window.showToast) window.showToast(isEN() ? "Chat session not found." : "Sesi obrolan tidak ditemukan.");
          createNewSession(true, true, true);
        }
      } else if (!urlId && currentSessionId) {
        createNewSession(true, false, false);
      }
    });

    function createNewSession(doRender = true, updateUrl = true, replaceUrl = false) {
      currentSessionId = Date.now().toString();
      history = [];
      if (doRender) {
        saveSessions();
        log.innerHTML = "";
        if (opts.prefill && input) {
          input.value = "";
          opts.prefill = null;
        }
        renderEmptyState();
      }
      if (updateUrl) {
        const url = new URL(window.location.href);
        url.searchParams.delete("id");
        url.searchParams.delete("q");
        url.searchParams.delete("tag");
        if (replaceUrl) {
          window.history.replaceState({ sessionId: null }, document.title, url.toString());
        } else {
          window.history.pushState({ sessionId: null }, document.title, url.toString());
        }
      }
    }

    function switchSession(id, updateUrl = true) {
      currentSessionId = id;
      const s = sessions.find(x => x.id === id);
      history = s ? s.history : [];
      log.innerHTML = "";
      saveSessions();
      restoreHistory();
      if (updateUrl) updateURLWithSessionId(id, true);
    }

    function updateCurrentSession() {
      let s = sessions.find(x => x.id === currentSessionId);
      if (!s) {
        if (history.length === 0) return;
        s = {
          id: currentSessionId,
          title: isEN() ? "My Chat" : "Obrolan Saya",
          updatedAt: Date.now(),
          history: []
        };
        sessions.unshift(s);
      }
      if (s) {
        s.history = history;
        s.updatedAt = Date.now();
        // Generate title dynamically if it's the first message
        if (s.title === "Obrolan Saya" || s.title === "My Chat") {
          const firstUserMsg = history.find(h => h.role === "user");
          if (firstUserMsg) {
            let t = firstUserMsg.content.trim();
            s.title = t.length > 30 ? t.slice(0, 30) + "..." : t;
            renderSidebar();
          }
        }
      }
      saveSessions();
    }

    const mentionPopup = container.querySelector("#chat-mention-popup");
    let mentionActiveIndex = 0;
    let currentMentionMatch = null;

    document.addEventListener("click", (e) => {
      if (mentionPopup.classList.contains("show") && !mentionPopup.contains(e.target) && e.target !== input) {
        mentionPopup.classList.remove("show");
        currentMentionMatch = null;
      }
    });

    let dynamicMentionData = {
      collections: [
        { abbr: "DN", name: "Dīgha Nikāya", isCollection: true },
        { abbr: "MN", name: "Majjhima Nikāya", isCollection: true },
        { abbr: "SN", name: "Saṃyutta Nikāya", isCollection: true },
        { abbr: "AN", name: "Aṅguttara Nikāya", isCollection: true },
        { abbr: "Dhp", name: "Dhammapada", isCollection: true }
      ],
      suttas: []
    };

    async function loadMentionData() {
      // Coba ambil dari localStorage dulu biar instan
      try {
        const cached = localStorage.getItem("mentionData");
        if (cached) {
          const data = JSON.parse(cached);
          if (Array.isArray(data.collections) && data.collections.length)
            dynamicMentionData.collections = data.collections.map(c => ({
              abbr: c.abbr, name: c.name || c.abbr, isCollection: true
            }));
          if (Array.isArray(data.suttas))
            dynamicMentionData.suttas = data.suttas.map(s => ({
              abbr: s.abbr, name: s.name || "", isCollection: false
            }));
          validMentionSet = new Set([
            ...dynamicMentionData.suttas.map(s => normMention(s.abbr)),
            ...dynamicMentionData.collections.map(c => normMention(c.abbr))
          ]);
        }
      } catch (e) { }

      // Tetap fetch dari server di background untuk update terbaru
      try {
        const res = await fetch("/api/mentionable");
        const data = await res.json();
        if (Array.isArray(data.collections) && data.collections.length)
          dynamicMentionData.collections = data.collections.map(c => ({
            abbr: c.abbr, name: c.name || c.abbr, isCollection: true
          }));
        if (Array.isArray(data.suttas))
          dynamicMentionData.suttas = data.suttas.map(s => ({
            abbr: s.abbr, name: s.name || "", isCollection: false
          }));

        // Simpan ke cache
        try {
          localStorage.setItem("mentionData", JSON.stringify(data));
        } catch (e) { }

        // Set kunci sutta valid (ternormalisasi) -> dipakai utk warnai mention
        // yg TAK ADA di korpus sebagai non-aktif. Termasuk koleksi (tanpa nomor).
        validMentionSet = new Set([
          ...dynamicMentionData.suttas.map(s => normMention(s.abbr)),
          ...dynamicMentionData.collections.map(c => normMention(c.abbr))
        ]);
        // Re-render overlay typing kalau user sudah terlanjur ngetik mention sebelum data datang.
        if (typeof syncBackdrop === "function") syncBackdrop();
        // Kalau empty-state lagi tampil dgn contoh fallback, segarkan chip mention
        // dgn contoh acak dari sumber (hanya tukar chips, animasi sapaan tak di-restart).
        const emptyEl = log.querySelector(".chat-empty-state");
        const chipsWrap = emptyEl && emptyEl.querySelector(".chat-empty-mentions .chat-empty-chips");
        if (chipsWrap && validMentionSet) {
          chipsWrap.innerHTML = sampleMentionExamples(4).map(mentionChipHTML).join("");
          bindMentionChips(chipsWrap);
        }
      } catch (e) {
        console.warn("Failed to load dynamic mention data", e);
        if (!validMentionSet) validMentionSet = new Set();
      }
    }
    // normMention: samakan "MN 10" / "mn10" -> "mn10" utk pencocokan validitas.
    const normMention = s => (s || "").toLowerCase().replace(/\s+/g, "");
    let validMentionSet = null;   // null = data belum siap (anggap semua valid dulu)
    // Load it asynchronously right away
    loadMentionData();

    function renderMentionPopup(query) {
      const q = query.toLowerCase().replace(/\s+/g, " "); // Normalize spaces

      let pool = [];
      // Jika ada angka di query (misal mn1, mn 1), cari di daftar suttas
      if (/\d/.test(q) || q.includes(" ")) {
        pool = dynamicMentionData.suttas;
      } else {
        // Jika cuma huruf, tampilkan koleksi (sebagai header petunjuk) + sutta
        pool = [...dynamicMentionData.collections, ...dynamicMentionData.suttas];
      }

      // Filter: startswith on abbr (without spaces), or includes in name
      // Strip trailing dot (user mungkin baru ketik titik: @Snp1.)
      const qNoSpace = q.replace(/\s+/g, "").replace(/\.$/, "");

      const removeDiacritics = str => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const qNorm = removeDiacritics(qNoSpace);
      const qFullNorm = removeDiacritics(q);

      let filtered = pool.filter(s => {
        const aSpace = s.abbr.toLowerCase();
        const aNoSpace = aSpace.replace(/\s+/g, "");
        const n = s.name.toLowerCase();
        return removeDiacritics(aNoSpace).startsWith(qNorm) || removeDiacritics(aSpace).startsWith(qFullNorm) || removeDiacritics(n).includes(qFullNorm);
      });

      // Limit to 50 items so the DOM doesn't get sluggish
      filtered = filtered.slice(0, 50);

      if (filtered.length === 0) {
        if (q === "") {
          mentionPopup.innerHTML = `<div class="chat-mention-item chat-mention-header"><span class="chat-mention-abbr" style="width:auto;margin-right:8px;"><i data-lucide="info" style="width:14px;height:14px"></i></span><span class="chat-mention-name">Ketik singkatan sutta, misal: MN 10</span></div>`;
          mentionPopup.classList.add("show");
          if (window.lucide) window.lucide.createIcons({ root: mentionPopup });
        } else {
          mentionPopup.classList.remove("show");
        }
        return;
      }
      mentionActiveIndex = -1; // start with no selection; first sutta item gets selected below
      mentionPopup.innerHTML = filtered.map((s, i) => {
        if (s.isCollection) {
          return `<div class="chat-mention-item" data-abbr="${s.abbr}" data-idx="${i}">
            <span class="chat-mention-abbr">${s.abbr}</span>
            <span class="chat-mention-name">${s.name}</span>
          </div>`;
        }
        return `<div class="chat-mention-item" data-abbr="${s.abbr}" data-idx="${i}">
          <span class="chat-mention-abbr">${s.abbr}</span>
          <span class="chat-mention-name">${s.name}</span>
        </div>`;
      }).join("");
      mentionPopup.classList.add("show");

      // Highlight item sutta pertama secara otomatis
      const selectableItems = mentionPopup.querySelectorAll(".chat-mention-item:not(.chat-mention-header)");
      if (selectableItems.length > 0) {
        selectableItems[0].classList.add("active");
        mentionActiveIndex = 0;
      }

      const allItems = mentionPopup.querySelectorAll(".chat-mention-item:not(.chat-mention-header)");
      allItems.forEach((el, i) => {
        el.addEventListener("click", () => selectMention(el.dataset.abbr));
        el.addEventListener("mouseenter", () => {
          allItems.forEach(e => e.classList.remove("active"));
          el.classList.add("active");
          mentionActiveIndex = i;
        });
      });
    }

    function selectMention(abbr) {
      if (!currentMentionMatch) return;
      const val = input.value;
      const before = val.substring(0, currentMentionMatch.start);
      const after = val.substring(currentMentionMatch.end);
      // Kode mention pakai spasi (mis. "@MN 10") biar konsisten dgn suttaplex & UI lain.
      const insert = `@${abbr} `;
      input.value = before + insert + after;
      mentionPopup.classList.remove("show");
      input.focus();
      input.setSelectionRange(before.length + insert.length, before.length + insert.length);
      currentMentionMatch = null;
      syncBackdrop();
    }

    btnNewChat.addEventListener("click", requestNewChat);

    input.addEventListener("input", () => {
      setSendMode(isGenerating); // Update the icon based on text
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 140) + "px";
      syncBackdrop();

      const val = input.value;
      const cursorPos = input.selectionStart;
      const textBeforeCursor = val.substring(0, cursorPos);
      // \.\.\d* — izinkan titik trailing (misal @Snp1.) agar popup tetap tampil
      const match = textBeforeCursor.match(/(?:^|\s)@([\p{L}\p{M}\-]*(?:\s*\d+(?:\.\d*)?)?)$/u);

      if (match) {
        currentMentionMatch = { start: match.index + (match[0].startsWith(" ") ? 1 : 0), end: cursorPos };
        renderMentionPopup(match[1]);
      } else {
        mentionPopup.classList.remove("show");
        currentMentionMatch = null;
      }
    });

    input.addEventListener("keydown", e => {
      if (mentionPopup.classList.contains("show")) {
        const items = mentionPopup.querySelectorAll(".chat-mention-item:not(.chat-mention-header)");
        if (!items.length) return;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          items[mentionActiveIndex].classList.remove("active");
          mentionActiveIndex = (mentionActiveIndex + 1) % items.length;
          items[mentionActiveIndex].classList.add("active");
          items[mentionActiveIndex].scrollIntoView({ block: "nearest" });
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          items[mentionActiveIndex].classList.remove("active");
          mentionActiveIndex = (mentionActiveIndex - 1 + items.length) % items.length;
          items[mentionActiveIndex].classList.add("active");
          items[mentionActiveIndex].scrollIntoView({ block: "nearest" });
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const activeItem = items[mentionActiveIndex];
          if (activeItem) selectMention(activeItem.dataset.abbr);
          return;
        }
        // Spasi = Enter saat popup match: langsung pilih item aktif. Hanya jika ADA item
        // aktif — kalau tidak, biarkan spasi diketik normal (jangan blokir input).
        if (e.key === " ") {
          const activeItem = items[mentionActiveIndex];
          if (activeItem) { e.preventDefault(); selectMention(activeItem.dataset.abbr); return; }
        }
        if (e.key === "Escape") {
          e.preventDefault();
          mentionPopup.classList.remove("show");
          currentMentionMatch = null;
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
    });

    form.addEventListener("submit", e => {
      e.preventDefault();

      mentionPopup.classList.remove("show");
      currentMentionMatch = null;

      // Item 7: saat bot sedang menjawab, tombol berfungsi sebagai STOP.
      if (isGenerating) { stopGeneration(); return; }

      const val = input.value.trim();
      if (!val) {
        // if empty, the button is "at-sign", clicking it inserts '@'
        input.value = "@";
        input.focus();
        input.dispatchEvent(new Event("input"));
        return;
      }
      send();
    });

    // Item 7: hentikan generasi atas permintaan user (beda dari abort saat pindah sesi:
    // di sini jawaban parsial yg sudah keluar dipertahankan, lihat catch AbortError).
    let userStopped = false;
    function stopGeneration() {
      if (!isGenerating) return;
      userStopped = true;
      if (abortController) abortController.abort();
    }
    function setSendMode(generating) {
      if (generating) {
        sendBtn.innerHTML = '<i data-lucide="square"></i>';
        if (window.lucide) window.lucide.createIcons({ root: sendBtn });
        sendBtn.title = isEN() ? "Stop" : "Berhenti";
        sendBtn.classList.add("chat-stop");
        sendBtn.disabled = false;
      } else {
        const hasText = input.value.trim().length > 0;
        sendBtn.innerHTML = hasText ? '<i data-lucide="arrow-up"></i>' : '<i data-lucide="at-sign"></i>';
        if (window.lucide) window.lucide.createIcons({ root: sendBtn });
        sendBtn.title = hasText ? tt("btn_send", isEN() ? "Send" : "Kirim") : (isEN() ? "Mention" : "Sebut Teks");
        sendBtn.classList.remove("chat-stop");
        sendBtn.disabled = false;
      }
    }



    // Warn before leaving page if generating
    window.addEventListener("beforeunload", (e) => {
      if (isGenerating) {
        e.preventDefault();
        e.returnValue = "";
      }
    });

    // Step 2: Pre-fill input. ?q= (dari pencarian) & ?tag= (dari halaman sutta) HANYA mengisi
    // kotak input, TIDAK auto-kirim — biar user bisa edit dulu sebelum bertanya.
    let prefillInput = null;
    const _params = new URLSearchParams(window.location.search);
    const qParam = _params.get("q");
    const tagParam = _params.get("tag");   // ?tag=MN 10 -> buka room baru + tag sutta
    if (qParam) {
      prefillInput = qParam;
      window.history.replaceState({}, document.title, "/chat");
    } else if (tagParam) {
      prefillInput = "@" + tagParam.trim() + " ";
      window.history.replaceState({}, document.title, "/chat");
    }

    // Set initial send mode (shows @ if empty, arrow if has text from prefill)
    setSendMode(false);

    // Filter Bahasa/Piṭaka manual DIHAPUS — agen menentukan scope (language/pitaka) sendiri
    // lewat argumen tool search_sutta, jadi toggle UI redundan & membingungkan.

    // Bungkus @mention (mis. @MN 10, @Bu-Pj 1, @SN 56.11) dgn span ber-class `cls`.
    // Input = teks yg SUDAH di-HTML-escape.
    function markMentions(escaped, cls) {
      return escaped.replace(
        /@([\p{L}\p{M}]+(?:-[\p{L}\p{M}]+)?(?:\s*\d[\d.\-]*)?)/gu,
        (_m, ref) => {
          // Sutta yg TAK ADA di korpus -> warnai non-aktif (data belum siap = anggap valid).
          const inactive = validMentionSet && !validMentionSet.has(normMention(ref));
          const c = inactive ? `${cls} ${cls}-inactive` : cls;
          return `<span class="${c}">@${ref}</span>`;
        }
      );
    }
    // Chip utk bubble pesan user (final, ada padding).
    function highlightMentions(escaped) { return markMentions(escaped, "chat-mention-chip"); }
    // Overlay backdrop di belakang textarea: highlight @mention saat MENGETIK (tanpa padding
    // supaya posisi karakter tetap presisi dgn textarea transparan di atasnya).
    const inputBackdrop = container.querySelector(".chat-input-backdrop");
    function syncBackdrop() {
      if (!inputBackdrop) return;
      inputBackdrop.innerHTML = markMentions(esc(input.value), "chat-input-mark") + " ";
      inputBackdrop.scrollTop = input.scrollTop;
      input.style.overflowY = input.scrollHeight > 140 ? "auto" : "hidden";
    }
    if (inputBackdrop) {
      // Aktifkan overlay (teks textarea jadi transparan) HANYA bila backdrop ada & JS jalan.
      inputBackdrop.parentElement.classList.add("mention-overlay");
      input.addEventListener("scroll", syncBackdrop);
      syncBackdrop();
    }

    function bubble(cls, html, animate) {
      clearEmptyState();              // item 20: pesan pertama menggusur empty-state
      const el = document.createElement("div");
      // `animate` hanya utk bubble yg BARU dikirim (klik Kirim) — bukan saat restore
      // riwayat/pindah sesi (biar gak semua bubble ikut animasi tiap buka sesi).
      el.className = "chat-msg " + cls + (animate ? " chat-msg-enter" : "");
      el.innerHTML = html;
      log.appendChild(el);
      el.scrollIntoView({ behavior: "smooth", block: "end" });
      el.scrollIntoView({ behavior: "smooth", block: "end" });
      return el;
    }

    // ── Item 20: empty-state (roda Dhamma berputar + sapaan animasi) ──
    // Roda dhammacakka dipinjam dari logo header (gradient id di-namespace ulang).
    const WHEEL_SVG = `<svg class="chat-empty-wheel" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <defs><linearGradient id="chatWheelGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#c89bff"/>
          <stop offset="50%" stop-color="#a255ff"/>
          <stop offset="100%" stop-color="#7c3aed"/>
        </linearGradient></defs>
        <g stroke="url(#chatWheelGrad)">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2.5"/>
          <path d="M12 2v7.5"/><path d="M12 14.5v7.5"/><path d="M2 12h7.5"/><path d="M14.5 12h7.5"/>
          <path d="M4.93 4.93l5.3 5.3"/><path d="M13.77 13.77l5.3 5.3"/>
          <path d="M4.93 19.07l5.3-5.3"/><path d="M13.77 10.23l5.3-5.3"/>
        </g></svg>`;

    // Fallback contoh sutta utk chip mention bila data /api/mentionable belum termuat.
    // Lang-agnostic (kode + nama Pāli) -> sama utk ID/EN.
    const EMPTY_MENTION_EXAMPLES = [
      { abbr: "MN 10", name: "Satipaṭṭhāna" },
      { abbr: "SN 22.59", name: "Anattalakkhaṇa" },
      { abbr: "AN 3.65", name: "Kesamutti" },
      { abbr: "Ud 8.3", name: "Tatiyanibbāna" },
    ];

    // Ambil n contoh acak langsung dari sumber (/api/mentionable, sudah termuat ke
    // dynamicMentionData). Hanya yg punya nama (biar chip enak dibaca). Kalau data
    // belum siap -> pakai fallback statis di atas.
    function sampleMentionExamples(n) {
      if (validMentionSet === null) return [];
      const pool = (dynamicMentionData.suttas || []).filter(s => s.abbr && s.name);
      if (pool.length < n) return EMPTY_MENTION_EXAMPLES.slice(0, n);
      const arr = pool.slice();
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr.slice(0, n).map(s => ({ abbr: s.abbr, name: s.name }));
    }

    function mentionChipHTML(m) {
      return `<button type="button" class="chat-empty-chip" data-mention="${esc(m.abbr)}">
           <span class="chat-empty-chip-at">@</span>${esc(m.abbr)}<span class="chat-empty-chip-name">${esc(m.name)}</span>
         </button>`;
    }

    function bindMentionChips(scope) {
      scope.querySelectorAll(".chat-empty-chip").forEach(btn => {
        btn.addEventListener("click", () => {
          input.value = "@" + btn.dataset.mention + " ";
          input.style.height = "auto";
          input.style.height = Math.min(input.scrollHeight, 140) + "px";
          syncBackdrop();
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
          // Update ikon tombol karena set .value manual ga memicu event 'input'
          setSendMode(isGenerating);
        });
      });
    }
    // Contoh prompting biasa (topik) — ambil acak dari daftar bersama di common.js (DK).
    function sampleQueries(n) {
      const all = (DK.RECOMMENDED_QUERIES && (DK.RECOMMENDED_QUERIES[isEN() ? "en" : "id"] || DK.RECOMMENDED_QUERIES.id)) || [];
      const pool = all.slice();
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      return pool.slice(0, n);
    }

    let emptyTypeTimer = null;
    function clearEmptyState() {
      if (emptyTypeTimer) { clearTimeout(emptyTypeTimer); emptyTypeTimer = null; }
      const e = log.querySelector(".chat-empty-state");
      if (e) e.remove();
      updateBrandBadge();
    }

    function renderEmptyState(skipAnimation = false) {
      if (log.querySelector(".chat-msg") || log.querySelector(".chat-empty-state")) { updateBrandBadge(); return; }
      const empty = document.createElement("div");
      empty.className = "chat-empty-state" + (skipAnimation ? " no-animate" : "");
      // Kode mention pakai spasi (mis. @MN 10) biar konsisten dgn suttaplex & UI lain.
      // Contoh diambil acak dari sumber (fallback statis bila data belum termuat).
      const chips = sampleMentionExamples(4).map(mentionChipHTML).join("");
      // Contoh prompting topik (acak) — klik = langsung kirim sbg pertanyaan.
      const promptChips = sampleQueries(4).map(q =>
        `<button type="button" class="chat-empty-prompt" data-query="${esc(q)}">${esc(q)}</button>`).join("");
      empty.innerHTML = `
        <div class="chat-empty-logo">
          ${WHEEL_SVG}
          <i data-lucide="sparkles" class="chat-empty-sparkle"></i>
        </div>
        <div class="chat-empty-greeting">
          <span class="chat-empty-greet-1">myDhamma AI</span>
          <span class="chat-empty-greet-2"><span class="chat-empty-typed"></span><span class="chat-empty-caret"></span></span>
        </div>
        <div class="chat-empty-mentions">
          <span class="chat-empty-mentions-label">${isEN() ? "Mention a specific text, e.g." : "Sebut teks tertentu, misalnya"}</span>
          <div class="chat-empty-chips">${chips}</div>
        </div>
        ${promptChips ? `<div class="chat-empty-prompts">
          <span class="chat-empty-mentions-label">${isEN() ? "or just ask about a topic" : "atau tanya sebuah topik"}</span>
          <div class="chat-empty-chips">${promptChips}</div>
        </div>` : ""}`;
      log.appendChild(empty);
      if (window.lucide) window.lucide.createIcons({ root: empty });
      updateBrandBadge();   // empty-state aktif -> sembunyikan badge brand

      // Animasi ketik baris kedua
      const typedEl = empty.querySelector(".chat-empty-typed");
      const fullText = isEN() ? "Sotthi hotu! How can I help you today?" : "Sotthi hotu! Ada yang bisa saya bantu?";
      if (typedEl) {
        if (skipAnimation) {
          typedEl.textContent = fullText;
        } else {
          let i = 0;
          // jeda kecil dulu biar "Sotthi hotu!" sempat muncul
          emptyTypeTimer = setTimeout(function tick() {
            typedEl.textContent = fullText.slice(0, ++i);
            if (i >= fullText.length) { emptyTypeTimer = null; return; }
            emptyTypeTimer = setTimeout(tick, 55);
          }, 450);
        }
      }

      // Klik chip mention -> sisipkan mention ke input (tanpa auto-kirim), fokus utk lanjut ketik
      bindMentionChips(empty);

      // Klik chip prompt topik -> animasi "terbang ke atas" (chip naik + empty-state
      // memudar) lalu kirim sbg pertanyaan. Tanpa focus biar keyboard mobile tak nongol.
      empty.querySelectorAll(".chat-empty-prompt").forEach(btn => {
        btn.addEventListener("click", () => {
          if (isGenerating || empty.classList.contains("dismissing")) return;
          const q = btn.dataset.query;
          empty.querySelectorAll("button").forEach(b => b.disabled = true);
          btn.classList.add("flying");
          empty.classList.add("dismissing");

          mentionPopup.classList.remove("show");
          currentMentionMatch = null;

          setTimeout(() => {
            input.value = q;
            input.style.height = "auto";
            syncBackdrop();
            form.requestSubmit();   // bubble() akan clearEmptyState()
          }, 240);
        });
      });
    }

    function saveHistory() {
      try {
        localStorage.setItem("dhammachat_history", JSON.stringify(history));
      } catch (e) { console.warn("Failed to save chat history", e); }
    }

    const _initParams = new URLSearchParams(window.location.search);
    const _qParam = _initParams.get("q");
    const _tagParam = _initParams.get("tag");

    history = [];
    try {
      if (_qParam || _tagParam) {
        // CLEAR history if navigating from external link to start a fresh context
        localStorage.removeItem("dhammachat_history");
      } else {
        const saved = localStorage.getItem("dhammachat_history");
        if (saved) history = JSON.parse(saved);
      }
    } catch (e) { console.warn("Failed to load chat history", e); }

    function restoreHistory() {
      history.forEach(item => {
        if (item.role === "user") {
          bubble("chat-msg-user", highlightMentions(esc(item.content)));
        } else if (item.role === "assistant") {
          const bot = bubble("chat-msg-bot", '<div class="chat-answer"></div>');
          renderBotAnswer(bot.querySelector(".chat-answer"), item.content, item.results || []);
        }
      });
      if (log.lastElementChild) log.lastElementChild.scrollIntoView({ behavior: "auto", block: "end" });
      renderEmptyState();   // item 20: kalau riwayat kosong, tampilkan sapaan
    }

    // Rujukan: buang kartu yg TAK punya terjemahan id/en. Teks Pāli-only tak bisa dipahami
    // model (qwen) jadi tak layak jadi rujukan (poin 6) — blurb/synopsis id/en tetap dihitung.
    function hasReadableText(sutta) {
      return (sutta.fragments || []).some(f => {
        const tx = f.texts || {};
        return (tx.id && tx.id.trim()) || (tx.en && tx.en.trim());
      });
    }
    // Dedup kartu by base id (mis. "SN 20.9" dari "SN 20.9:md1") supaya sutta yg sama tak
    // muncul 2x (sinopsis/segmen dobel) saat retrieval/mention balikin entri kembar (poin 5).
    function dedupSuttas(results) {
      const seen = new Set();
      return (results || []).filter(s => {
        const key = ((s.formatted_id || s.sutta_id || "").split(":")[0]).toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    // Saring jadi daftar kartu Rujukan final: buang pli-only, lalu dedup.
    function refineResults(results) {
      return dedupSuttas((results || []).filter(hasReadableText));
    }

    function renderBotAnswer(botElement, answerText, results) {
      answerText = answerText || "";
      let thinks = [];
      let textWithoutThink = answerText.replace(/<think>([\s\S]*?)<\/think>\n*/gi, function (match, p1) {
        thinks.push(mdLite(p1));
        return `__THINK_BLOCK_${thinks.length - 1}__\n`;
      }).replace(/<think>([\s\S]*)$/gi, function (match, p1) {
        thinks.push(mdLite(p1));
        return `__THINK_BLOCK_${thinks.length - 1}_OPEN__\n`;
      });

      let filteredAns = enforceTheravadaTerms(textWithoutThink);
      // Force-replace kalimat basa-basi "Berdasarkan kutipan yang Anda berikan..." dengan kalimat berwibawa
      filteredAns = filteredAns.replace(/^\s*(?:Berdasarkan|Menurut|Dari|Based on|According to)[^\n]{1,50}(?:kutip|dokumen|teks|referensi|sutta|passage|quote|text)[^\n]{1,50}(?:Anda|kamu|diberi|diserta|dikutip|di atas|sedia|provided|above|you)[^\n]*?(?:[:,]|\n)\s*/i, "Dalam ajaran Buddha, ");
      let ansHtml = mdLite(filteredAns);

      ansHtml = ansHtml.replace(/<p>__THINK_BLOCK_(\d+)__<\/p>/gi, function (match, idx) {
        return `<details class="chat-think"><summary>🤔 Proses Berpikir AI...</summary><div class="chat-think-content">${thinks[idx]}</div></details>\n`;
      }).replace(/__THINK_BLOCK_(\d+)__/gi, function (match, idx) {
        return `<details class="chat-think"><summary>🤔 Proses Berpikir AI...</summary><div class="chat-think-content">${thinks[idx]}</div></details>\n`;
      }).replace(/<p>__THINK_BLOCK_(\d+)_OPEN__<\/p>/gi, function (match, idx) {
        return `<details class="chat-think" open><summary>🤔 Sedang Berpikir...</summary><div class="chat-think-content">${thinks[idx]}</div></details>\n`;
      }).replace(/__THINK_BLOCK_(\d+)_OPEN__/gi, function (match, idx) {
        return `<details class="chat-think" open><summary>🤔 Sedang Berpikir...</summary><div class="chat-think-content">${thinks[idx]}</div></details>\n`;
      });

      ansHtml = ansHtml.replace(/([A-Za-z\-]+\s+\d+(?:\.\d+)*(?:-\d+)?)(?::([a-zA-Z0-9\.\-]+))?(?:\s*\([a-z]{2,3}\/[^)]+\))?/gi, (match, bookId, segment) => {
        const fullId = segment ? `${bookId.trim()}:${segment.trim()}` : bookId.trim();
        if (fullId === bookId.trim()) {
          const found = results.some(r => r.formatted_id.toLowerCase() === bookId.trim().toLowerCase() || r.sutta_id.toLowerCase() === bookId.trim().toLowerCase());
          if (!found) return match;
        }
        return `<button type="button" class="chat-inline-cite" data-target="${esc(bookId.trim())}" data-full-target="${esc(fullId)}">${esc(match)}</button>`;
      });
      botElement.innerHTML = ansHtml;

      // Extract follow-up questions to move them to the bottom
      let followUpContainer = null;

      // Ubah daftar rekomendasi pertanyaan lanjutan menjadi chip yang bisa diklik
      botElement.querySelectorAll("p, h3, h4, h5, strong").forEach(el => {
        if (el.tagName === "STRONG" && el.parentElement && el.parentElement.tagName === "P") el = el.parentElement;
        const txt = el.textContent.trim().toLowerCase();
        if (/rekomendasi\s+pertanyaan|pertanyaan\s+(?:lanjutan|refleksi|untuk|terkait)/.test(txt) || txt.includes("follow-up questions") || txt.includes("pertanyaan diskusi")) {
          let nextEl = el.nextElementSibling;
          while (nextEl && nextEl.tagName !== "UL" && nextEl.tagName !== "OL" && nextEl.textContent.trim() === "") {
            const temp = nextEl;
            nextEl = nextEl.nextElementSibling;
            temp.remove(); // Hapus elemen kosong di antaranya
          }
          if (nextEl && (nextEl.tagName === "UL" || nextEl.tagName === "OL")) {
            followUpContainer = document.createElement("div");
            followUpContainer.className = "chat-followups-container";

            const chipsWrap = document.createElement("div");
            chipsWrap.className = "chat-followups";
            // Helper: ubah sutta ID yg belum punya @ jadi @mention.
            // Pola: singkatan koleksi + spasi opsional + angka (mis. MN 10, SN 22.59, AN 3.65,
            // Bu-Pj 1, Snp 1.8, Ud 8.3, Iti 110, Dhp 1, Thag 1.1, Vv 1.1, Pv 1.1, Mil …).
            // Lookbehind (?<![@\w]) cegah dobel-@ dan awalan kata lain yg kebetulan mirip.
            function addMentionAt(text) {
              return text.replace(
                /(?<![@\w])(\b(?:[A-Za-z]{1,4}(?:-[A-Za-z]{1,4})?)\s*\d[\d.]*)/g,
                (m, ref) => {
                  // Hanya ubah jika ref cocok dengan salah satu singkatan koleksi yg dikenal
                  // ATAU ada di validMentionSet (supaya kata biasa tak ikut kena).
                  const norm = ref.replace(/\s+/g, "").toLowerCase();
                  const known = validMentionSet
                    ? validMentionSet.has(norm)
                    : /^(dn|mn|sn|an|dhp|ud|iti|snp|thag|thig|vv|pv|mil|bu|bi|sk|np|pc|pd|as|pj)\d/i.test(norm);
                  return known ? "@" + ref : m;
                }
              );
            }

            Array.from(nextEl.querySelectorAll("li")).forEach(li => {
              const btn = document.createElement("button");
              btn.className = "chat-followup-chip";
              // Item 6: buang segmen (mis. "MN 10:md2" -> "MN 10") — mesin tak bisa
              // memproses mention bersegmen, jadi rekomendasi pertanyaan tak boleh memuatnya.
              // Setelah buang segmen, ubah sutta ID jadi @mention kalau belum ada @-nya.
              btn.textContent = addMentionAt(
                li.textContent.trim()
                  .replace(/(\b[A-Za-z]+(?:-[A-Za-z]+)?\s?\d+(?:\.\d+)*)\s*:\s*[A-Za-z0-9.\-]+/g, "$1")
              );

              btn.onclick = () => {
                // Item 5: cegah dobel-kirim. Sekali diklik, kunci semua chip & jangan
                // kirim kalau bot masih jalan.
                if (isGenerating) return;
                input.value = btn.textContent;
                input.style.height = "auto";
                if (typeof syncBackdrop === 'function') syncBackdrop();
                // Item 1: JANGAN input.focus() — auto-send langsung jalan, focus cuma
                // memunculkan keyboard mobile sia-sia.
                form.requestSubmit();
              };
              chipsWrap.appendChild(btn);
            });

            el.className = "chat-followups-title";
            el.innerHTML = txt.includes("rekomendasi") ? "Rekomendasi Pertanyaan" : "Follow-up Questions";

            // Pindahkan header dan chip wrap ke kontainer baru, cabut dari aliran teks normal
            followUpContainer.appendChild(el);
            followUpContainer.appendChild(chipsWrap);
            nextEl.remove();
          }
        }
      });

      botElement.querySelectorAll(".chat-inline-cite").forEach(btn => {
        btn.addEventListener("click", () => {
          const target = btn.getAttribute("data-target");
          const fullTarget = btn.getAttribute("data-full-target");
          let foundCard = null;
          let foundSeg = null;

          // Item 8: segmen yang diminta (mis. "md2"/"1.2" dari "MN 10:md2") — kita
          // cocokkan PER-SEGMEN, bukan string penuh "MN 10:md2" (yg sering gagal karena
          // tag fragmen ditampilkan terpisah), supaya highlight jatuh tepat di segmennya.
          const seg = (fullTarget && fullTarget.includes(":")) ? fullTarget.split(":").pop().trim() : null;
          const segRe = seg ? new RegExp("(^|[\\s,:])" + seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[\\s,])") : null;

          botElement.parentElement.querySelectorAll(".sutta-card").forEach(card => {
            const l = card.querySelector(".sutta-card-link");
            if (l && l.textContent.includes(target)) {
              foundCard = card;
              // Cari segmen spesifik di dalam kartu ini
              if (segRe) {
                card.querySelectorAll(".fragment-ref").forEach(ref => {
                  const rt = ref.textContent;
                  if (rt.includes(":" + seg) || segRe.test(rt)) {
                    foundSeg = ref.closest(".fragment");
                  }
                });
              }
            }
          });

          let highlightEl = foundSeg || foundCard;
          if (highlightEl) {
            // Item 1: kalau segmen target masih tersembunyi di balik "Tampilkan N lagi",
            // EXPAND dulu seluruh grupnya (buang fade + tombol show-more), baru highlight.
            if (foundSeg && foundSeg.classList.contains("hidden-frag")) {
              const grp = foundSeg.closest(".sutta-author-group")
                || foundSeg.closest(".author-frags-container") || foundCard;
              if (grp) {
                grp.querySelectorAll(".hidden-frag").forEach(f => f.classList.remove("hidden-frag"));
                const fade = grp.querySelector(".frags-fade-overlay"); if (fade) fade.remove();
                const moreBtn = grp.querySelector(".btn-show-more"); if (moreBtn) moreBtn.remove();
              } else {
                foundSeg.classList.remove("hidden-frag");
              }
            }
            // Tunggu 1 frame agar layout terbuka dulu sebelum scroll + highlight.
            requestAnimationFrame(() => {
              highlightEl.scrollIntoView({ behavior: "smooth", block: "center" });
              highlightEl.style.boxShadow = "0 0 0 2px var(--ai-color)";
              setTimeout(() => highlightEl.style.boxShadow = "", 2000);
            });
          }
        });
      });
      // Render tombol aksi (+ Catatan) untuk teks jawaban terlebih dahulu 
      // agar posisinya berada di atas heading Rujukan (di pojok kanan bawah teks jawaban)
      renderAnswerActions(botElement, answerText);

      if (results && results.length > 0) {
        // Filter: hanya tampilkan sutta yang benar-benar dikutip/disebut di teks jawaban
        const citedResults = refineResults(results.filter(s => {
          if (s.mentioned) return true; // sutta yg di-mention user: selalu tampil
          if (!s.formatted_id) return false;
          const baseId = s.formatted_id.split(':')[0]; // misal "SN 20.9" dari "SN 20.9:md1"
          return answerText.includes(s.formatted_id) || answerText.includes(baseId);
        }));

        if (citedResults.length > 0) {
          renderCitations(botElement, citedResults);
        }
      }

      // Pasang kontainer follow-up di PALING BAWAH (setelah rujukan)
      if (followUpContainer) {
        botElement.appendChild(followUpContainer);
      }
    }

    // Item 4: markdown jawaban AI -> teks polos rapi untuk Catatan. Note text-block
    // disimpan/dirender sbg plaintext (textContent), jadi markup tak akan dieksekusi —
    // kita buang penanda **/*/#/- tapi PERTAHANKAN baris & penomoran (1. 2. 3.).
    function mdToPlain(src) {
      let t = (src || "")
        .replace(/<think>[\s\S]*?<\/think>\n*/gi, "")   // buang blok berpikir
        .replace(/<think>[\s\S]*$/gi, "")
        // Poin 10: blok "Rekomendasi Pertanyaan Lanjutan" jangan ikut ke +Catatan.
        .replace(/\n*\*\*\s*(?:Rekomendasi Pertanyaan(?: Lanjutan)?|Recommended Follow-up Questions)\s*:?\s*\*\*[\s\S]*$/i, "");
      t = enforceTheravadaTerms(t);
      return t
        .replace(/^\s*#{1,6}\s+/gm, "")                  // heading -> teks biasa
        .replace(/^\s*[-*_]{3,}\s*$/gm, "")              // garis pemisah
        .replace(/\*\*(.+?)\*\*/g, "$1")                 // **tebal**
        .replace(/__(.+?)__/g, "$1")
        .replace(/(^|[^*_])\*(?!\s)([^*]+?)\*(?!\*)/g, "$1$2")  // *miring*
        .replace(/(^|[^*_])_(?!\s)([^_]+?)_(?!_)/g, "$1$2")     // _miring_
        .replace(/^\s*[-*]\s+/gm, "• ")                  // bullet -> •
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    // Tombol simpan JAWABAN (teks) ke Catatan — reuse panel Catatan asli via DK.
    function renderAnswerActions(parent, answerText) {
      const actions = document.createElement("div");
      actions.className = "chat-answer-actions";

      const btn = document.createElement("button");
      btn.className = "btn-add-note";
      btn.textContent = tt("btn_add_note", "+ Catatan");
      btn.addEventListener("click", () => {
        const block = { type: "text", content: mdToPlain(answerText) };
        if (DK.showNotePicker) DK.showNotePicker(block, btn);
        else if (DK.addBlockToNote) DK.addBlockToNote(block);
      });
      actions.appendChild(btn);
      parent.appendChild(actions);
    }

    function renderCitations(parent, results) {
      if (!results || !results.length) return;
      const wrap = document.createElement("div");
      wrap.className = "chat-citations";
      const ttl = document.createElement("div");
      ttl.className = "chat-citations-title";
      ttl.textContent = isEN() ? "References" : "Rujukan";
      wrap.appendChild(ttl);

      if (DK.renderSuttaCardsTo) {
        // Konteks selalu tampil; dedup segmen-bersebelahan ditangani renderSuttaCardsTo
        // (dedupTexts) — sama persis seperti hasil pencarian web-md, tanpa centangan.
        DK.renderSuttaCardsTo(wrap, results, true, { showPreview: true },
          (fragEl, frag, sutta) => {
            const btn = document.createElement("button");
            btn.className = "btn-add-note";
            btn.textContent = tt("btn_add_note", "+ Catatan");
            btn.setAttribute("data-i18n", "btn_add_note");
            btn.addEventListener("click", e => addFragmentToNote(frag, sutta, e.currentTarget));
            fragEl.appendChild(btn);
          });

        // Tombol "Tanyakan lagi" — SATU per kartu sutta (di header), bukan per segmen.
        // Tag sutta UTUH ke input chat di room yg SAMA (continuity).
        wrap.querySelectorAll(".sutta-card").forEach((card, i) => {
          const sutta = results[i];
          if (!sutta) return;
          const header = card.querySelector(".sutta-card-header");
          const title = card.querySelector(".sutta-card-title");
          if (!header || !title) return;
          const askBtn = document.createElement("button");
          askBtn.className = "btn-ask-again";
          // Ikon @ — aksi-nya men-mention ulang sutta ini ke input; title/tooltip
          // dipertahankan supaya maksudnya jelas (bukan sekadar "mention orang").
          askBtn.innerHTML = `<i data-lucide="at-sign"></i>`;
          askBtn.title = isEN() ? "Ask about this sutta again" : "Tanyakan sutta ini lagi";
          askBtn.setAttribute("aria-label", askBtn.title);
          askBtn.addEventListener("click", () => {
            input.value = "@" + (sutta.formatted_id || sutta.sutta_id || "") + " ";
            input.style.height = "auto";
            input.style.height = Math.min(input.scrollHeight, 140) + "px";
            syncBackdrop();
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
            input.scrollIntoView({ behavior: "smooth", block: "nearest" });
          });
          header.insertBefore(askBtn, title); // kiri nomor kitab
        });
      } else {
        // Fallback tanpa DK: daftar ringkas
        results.forEach(s => {
          const row = document.createElement("div");
          row.className = "chat-cite-fallback";
          row.innerHTML = `<a href="/${esc(s.sutta_id)}" target="_blank">`
            + `<strong>${esc(s.formatted_id)}</strong>`
            + (s.sutta_name ? " — " + esc(s.sutta_name) : "") + "</a>";
          wrap.appendChild(row);
        });
      }
      parent.appendChild(wrap);
      if (window.refreshIcons) window.refreshIcons();
    }

    // Mirror index.js addFragmentToNote -> pakai panel Catatan asli via DK.
    function addFragmentToNote(frag, sutta, anchorEl) {
      const lang = (DK.state && DK.state.lang) || "id";
      const pickedLang = [lang, "id", "en", "pli"].find(l => frag.texts && frag.texts[l]);
      const texts = pickedLang ? { [pickedLang]: frag.texts[pickedLang] } : (frag.texts || {});
      const block = {
        type: "sutta",
        data: {
          sutta_id: sutta.sutta_id,
          formatted_id: sutta.formatted_id,
          sutta_name: sutta.sutta_name || "",
          ref: frag.ref,
          ref_display: frag.author === "blurb" ? "sinopsis"
            : (frag.ref_display || (frag.ref || []).join(", ")),
          author: frag.author || "",
          source: frag.source || "",
          texts,
          parts: frag.parts || null,
          parts_lang: (frag.parts && pickedLang) ? pickedLang : null,
          available_links: sutta.available_links || {},
        },
      };
      if (DK.showNotePicker) DK.showNotePicker(block, anchorEl);
      else if (DK.addBlockToNote) DK.addBlockToNote(block);
    }

    // Kedua bahasa disimpan supaya label langkah bisa ikut switch live (lihat setI18n).
    const STAGE_I18N = {
      understand: { en: "Understanding your message…", id: "Memahami pesan Anda…" },
      retrieve: { en: "Searching the suttas…", id: "Menelusuri sutta yang relevan…" },
      generate: { en: "Composing the answer…", id: "Menyusun jawaban…" },
    };

    // Varian senada utk langkah "generate" (nunggunya lama) — diputar bergiliran.
    // Pasangan ID/EN dijaga paralel.
    const GENERATE_VARIANTS = [
      { en: "Composing the answer…", id: "Menyusun jawaban…" },
      { en: "Weaving the words…", id: "Merangkai kata…" },
      { en: "Linking the references…", id: "Menautkan rujukan…" },
      { en: "Aligning with the texts…", id: "Menyelaraskan dengan teks…" },
      { en: "Polishing the phrasing…", id: "Merapikan kalimat…" },
    ];

    // Tombol "Coba lagi" utk giliran yang gagal/dihentikan tanpa jawaban utuh.
    // `committed` = apakah giliran ini sudah masuk history (kasus parsial). Kalau iya,
    // buang dulu entri-nya (assistant+user) supaya send() tak dobel; kalau belum
    // (stop/error tanpa reply), history memang bersih -> jangan pop apa pun.
    function appendRetry(botEl, userBubbleEl, text, committed) {
      const btn = document.createElement("button");
      btn.className = "btn-retry";
      btn.innerHTML = `<i data-lucide="rotate-cw" style="width:13px;height:13px;vertical-align:-2px;margin-right:5px;"></i><span class="js-retry-label"></span>`;
      setI18n(btn.querySelector(".js-retry-label"), "Try again", "Coba lagi");
      btn.addEventListener("click", () => {
        if (isGenerating) return;
        if (botEl) botEl.remove();
        if (userBubbleEl) userBubbleEl.remove();
        if (committed) {
          if (history.length && history[history.length - 1].role === "assistant") history.pop();
          if (history.length && history[history.length - 1].role === "user") history.pop();
          updateCurrentSession();
        }
        input.value = text;
        send();
      });
      botEl.appendChild(btn);
      if (window.lucide) window.lucide.createIcons({ root: btn });
    }

    // ── Poin 4: pemilihan terjemahan utk @mention ──
    // Cache daftar terjemahan per sutta + pilihan user. Keyed formatted_id ("MN 10").
    const translationCache = {};   // normId ("mn10") -> [{lang,author,source}]
    const mentionPrefs = {};       // formatted_id -> [{lang,author,source}]

    // Ambil @mention dari teks (pola sama dgn markMentions). -> [{fid:"MN 10", norm:"mn10"}].
    function extractMentions(text) {
      const re = /@([\p{L}\p{M}]+(?:-[\p{L}\p{M}]+)?(?:\s*\d[\d.\-]*)?)/gu;
      const out = [], seen = new Set();
      let m;
      while ((m = re.exec(text)) !== null) {
        const fid = m[1].trim();
        const norm = fid.replace(/\s+/g, "").toLowerCase();
        if (seen.has(norm)) continue;
        seen.add(norm);
        out.push({ fid, norm, raw: m[0] });
      }
      return out;
    }

    async function fetchTranslations(norm) {
      if (translationCache[norm]) return translationCache[norm];
      try {
        const res = await fetch("/api/sutta-translations/" + encodeURIComponent(norm));
        const data = await res.json();
        const tr = Array.isArray(data.translations) ? data.translations : [];
        translationCache[norm] = tr;
        return tr;
      } catch (e) { return []; }
    }

    // Tentukan prefs terjemahan utk mention di pesan. Auto kalau 1 opsi; tampilkan picker
    // (bubble) kalau >1 & belum dipilih. Return map {fid:[{lang,author,source}]}, atau
    // null kalau user membatalkan picker.
    async function resolveMentionPrefs(text) {
      const mentions = extractMentions(text);
      if (!mentions.length) return {};
      const pending = [];
      for (const mn of mentions) {
        if (mentionPrefs[mn.fid]) continue;        // sudah dipilih di sesi ini
        const tr = await fetchTranslations(mn.norm);
        if (!tr.length) continue;                  // tak ada terjemahan kebaca -> biar backend fallback
        if (tr.length === 1) { mentionPrefs[mn.fid] = [tr[0]]; continue; }  // 1 opsi -> auto
        pending.push({ mn, translations: tr });
      }
      if (pending.length) {
        const ok = await showTranslationPicker(pending);
        if (!ok) return null;                      // batal
      }
      const prefs = {};
      for (const mn of mentions) if (mentionPrefs[mn.fid]) prefs[mn.fid] = mentionPrefs[mn.fid];
      return prefs;
    }

    // Picker "disguise" sebagai chat bubble (deterministik, tanpa round-trip LLM).
    // Resolve(true) saat user klik Lanjut (mengisi mentionPrefs); resolve(false) saat batal.
    function showTranslationPicker(pending) {
      return new Promise(resolve => {
        const authorLabel = (a, src) => (DK.authorLongName ? DK.authorLongName(a, src) : a);
        // Nama bahasa per arah i18n (en=label Inggris, !en=label Indonesia).
        const langName = (l, en) => l === "id" ? (en ? "Indonesian" : "Indonesia")
          : l === "en" ? "English" : (l || "").toUpperCase();
        // Span dwibahasa: simpan kedua teks di data-attr supaya sweep applyLangToChat
        // (dk-lang-change) menukar live tanpa perlu refresh.
        const s18 = (en, id) => `<span data-i18n-en="${esc(en)}" data-i18n-id="${esc(id)}">${esc(isEN() ? en : id)}</span>`;
        const langSpan = l => `<span class="chat-trans-lang">(${s18(langName(l, true), langName(l, false))})</span>`;

        let html = `<div class="chat-answer chat-trans-picker"><div class="chat-trans-head" data-i18n-en="Pick the translation(s) to cite:" data-i18n-id="Pilih terjemahan yang hendak dikutip:">${isEN() ? "Pick the translation(s) to cite:" : "Pilih terjemahan yang hendak dikutip:"}</div>`;
        pending.forEach((p, pi) => {
          html += `<div class="chat-trans-group"><div class="chat-trans-sutta">@${esc(p.mn.fid)}</div>`;
          p.translations.forEach((t, ti) => {
            html += `<label class="chat-trans-opt"><input type="checkbox" data-pi="${pi}" data-lang="${esc(t.lang)}" data-author="${esc(t.author)}" data-source="${esc(t.source)}"${ti === 0 ? " checked" : ""}> <span>${esc(authorLabel(t.author, t.source))} ${langSpan(t.lang)}</span></label>`;
          });
          html += `</div>`;
        });
        html += `<div class="chat-trans-actions"><button type="button" class="btn-primary chat-trans-go" data-i18n-en="Continue" data-i18n-id="Lanjut">${isEN() ? "Continue" : "Lanjut"}</button><button type="button" class="chat-trans-cancel" data-i18n-en="Cancel" data-i18n-id="Batal">${isEN() ? "Cancel" : "Batal"}</button></div></div>`;
        const el = bubble("chat-msg-bot chat-trans-bubble", html, true);

        el.querySelector(".chat-trans-go").addEventListener("click", () => {
          pending.forEach((p, pi) => {
            const picks = Array.from(el.querySelectorAll(`input[data-pi="${pi}"]:checked`))
              .map(c => ({ lang: c.dataset.lang, author: c.dataset.author, source: c.dataset.source }));
            // Kalau user tak centang apa pun -> default ke opsi pertama (jangan kosong).
            mentionPrefs[p.mn.fid] = picks.length ? picks : [p.translations[0]];
          });
          // Ringkas bubble jadi konfirmasi biar riwayat tetap rapi & nyambung. Pakai s18/langSpan
          // supaya prefix "Pakai:"/"Using:" & nama bahasa ikut switch live tanpa refresh.
          el.innerHTML = `<div class="chat-answer chat-trans-done">${s18("Using: ", "Menggunakan: ")}` +
            pending.map(p => mentionPrefs[p.mn.fid]
              .map(x => `<strong>@${esc(p.mn.fid)}</strong> · ${esc(authorLabel(x.author, x.source))} ${langSpan(x.lang)}`)
              .join(", ")).join("; ") + `</div>`;
          resolve(true);
        });
        el.querySelector(".chat-trans-cancel").addEventListener("click", () => { el.remove(); resolve(false); });
      });
    }

    function resolveScopePref() {
      return new Promise(resolve => {
        const s18 = (en, id) => `<span data-i18n-en="${esc(en)}" data-i18n-id="${esc(id)}">${esc(isEN() ? en : id)}</span>`;
        let html = `<div class="chat-answer chat-trans-picker"><div class="chat-trans-head" data-i18n-en="Focus search ONLY on mentioned texts?" data-i18n-id="Fokus pencarian HANYA pada teks yang di-@?">${isEN() ? "Focus search ONLY on mentioned texts?" : "Fokus pencarian HANYA pada teks yang di-@?"}</div>`;
        html += `<div class="chat-trans-actions" style="margin-top: 12px;">
          <button type="button" class="chat-trans-cancel" style="margin-right: auto;">${s18("Cancel", "Batal")}</button>
          <button type="button" class="btn-primary chat-scope-broad" style="background: var(--bg-hover); color: var(--text-color); box-shadow: none;">${s18("No (Broad Search)", "Tidak (Cari luas)")}</button>
          <button type="button" class="btn-primary chat-scope-narrow">${s18("Yes (Focus)", "Ya (Fokus)")}</button>
        </div></div>`;

        const el = bubble("chat-msg-bot chat-trans-bubble", html, true);

        el.querySelector(".chat-scope-narrow").addEventListener("click", () => {
          el.innerHTML = `<div class="chat-answer chat-trans-done">${s18("Search Scope: ", "Cakupan Pencarian: ")}<strong>${s18("Mentioned texts only", "Hanya teks yang di-@")}</strong></div>`;
          resolve({ broad_search: false, ok: true });
        });
        el.querySelector(".chat-scope-broad").addEventListener("click", () => {
          el.innerHTML = `<div class="chat-answer chat-trans-done">${s18("Search Scope: ", "Cakupan Pencarian: ")}<strong>${s18("Explore all texts", "Eksplorasi teks lain")}</strong></div>`;
          resolve({ broad_search: true, ok: true });
        });
        el.querySelector(".chat-trans-cancel").addEventListener("click", () => { el.remove(); resolve({ ok: false }); });
      });
    }

    async function send() {
      // Item 5: cegah dobel-kirim — set isGenerating SEKARANG (sebelum await apa pun)
      // supaya klik/submit kedua yg menyusul langsung tertolak.
      if (isGenerating) return;
      const text = input.value.trim();
      if (!text) return;
      isGenerating = true;
      input.value = "";
      input.style.height = "auto";
      syncBackdrop();
      closeMobileMenu();
      const userBubble = bubble("chat-msg-user", highlightMentions(esc(text)), true);

      // Poin 4: pilih terjemahan utk @mention (picker hanya muncul kalau ada >1 terjemahan).
      // null = user batal -> kembalikan teks ke input, buang bubble user, reset state.
      const mentionPrefsForMsg = await resolveMentionPrefs(text);
      if (mentionPrefsForMsg === null) {
        userBubble.remove();
        input.value = text;
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 140) + "px";
        syncBackdrop();
        isGenerating = false;
        if (!log.querySelector(".chat-msg")) renderEmptyState();
        return;
      }

      // Tanyakan cakupan pencarian HANYA jika ada mention dan konteksnya bukan sekadar meringkas sutta.
      let isBroadSearch = false;
      const mentions = extractMentions(text);
      if (mentions.length > 0) {
        let askScope = true;
        let ctx = text;
        mentions.forEach(mn => ctx = ctx.replace(mn.raw, ""));
        ctx = ctx.toLowerCase().replace(/[^\w\s]/g, "").trim();

        if (!ctx) {
          askScope = false; // Hanya mention tok
        } else {
          const generic = new Set([
            "jelaskan", "jelasin", "terangin", "terangkan", "apa", "itu", "tentang", "isi", "isinya",
            "berisi", "dong", "tolong", "pls", "please", "kasih", "tau", "tahu", "ringkas", "ringkasan",
            "summary", "summarize", "bahas", "membahas", "bantu", "jelaskn", "maksud", "maksudnya",
            "arti", "artinya", "makna", "maknanya", "cerita", "ceritain", "di", "dalam", "menurut",
            "dari", "mengenai", "soal", "seputar", "gimana", "bagaimana", "yg", "yang", "ada", "aja",
            "saja", "sih", "ya", "woi", "sutta", "kitab", "teks", "buku", "pitaka", "vinaya", "jataka",
            "ini", "tersebut", "nya", "bercerita"
          ]);
          const words = ctx.split(/\s+/);
          if (words.every(w => generic.has(w))) askScope = false; // Cuma minta rangkuman
        }

        if (askScope) {
          const scopeRes = await resolveScopePref();
          if (!scopeRes.ok) {
            // Bersihkan bubble dari DOM (termasuk bubble terjemahan yg terlanjur 'done')
            let next = userBubble.nextElementSibling;
            while (next) {
              const temp = next;
              next = next.nextElementSibling;
              temp.remove();
            }
            userBubble.remove();
            input.value = text;
            input.style.height = "auto";
            input.style.height = Math.min(input.scrollHeight, 140) + "px";
            syncBackdrop();
            isGenerating = false;
            if (!log.querySelector(".chat-msg")) renderEmptyState();
            return;
          }
          isBroadSearch = scopeRes.broad_search;
        }
      }

      userStopped = false;
      abortController = new AbortController();
      setSendMode(true);   // item 7: tombol Kirim -> Stop
      document.querySelectorAll(".chat-followup-chip").forEach(c => c.disabled = true);
      const bot = bubble("chat-msg-bot",
        `<div class="chat-thinking-steps"></div><div class="chat-answer chat-typing" style="display:none;"></div>`, true);
      bot.classList.add("is-generating");  // gradient border shimmer
      const stepsContainer = bot.querySelector(".chat-thinking-steps");
      const status = bot.querySelector(".chat-answer");
      let currentStepEl = null;
      let accumulatedAnswer = "";
      let hasFirstChunk = false;

      // Ensure we don't send massive history, and clean up assistant's <think> tags
      const historyToSend = history.map(h => {
        let content = h.content;
        if (h.role === "assistant") {
          content = content.replace(/<think>[\s\S]*?<\/think>\n*/gi, "")
            .replace(/<think>[\s\S]*$/gi, "")
            .replace(/\*\*(Rekomendasi Pertanyaan Lanjutan|Recommended Follow-up Questions):\*\*[\s\S]*/gi, "")
            .trim();
        }
        return { role: h.role, content: content };
      }).slice(-6);

      // Giliran user TIDAK di-commit ke history di sini — kalau di-push duluan lalu
      // di-stop/error tanpa reply, dia jadi `user` nyangkut tanpa `assistant` (konteks
      // ngaco + ke-restore pas reload). Commit user+assistant BERSAMAAN hanya saat
      // ada reply (sukses / parsial). Lihat catch & blok sukses.

      function createAndAnimateSpoiler(container) {
        if (!container || !container.children.length || container.querySelector(".chat-steps-spoiler")) return;
        const steps = Array.from(container.children);
        const det = document.createElement("details");
        det.className = "chat-steps-spoiler";
        det.style.cssText = "margin:0; font-size:0.8rem;";
        det.open = true;
        const sum = document.createElement("summary");
        sum.style.cssText = "cursor:pointer; color:var(--text-muted); font-weight:500; list-style:none; display:flex; align-items:center; gap:6px; user-select:none;";
        sum.innerHTML = `<i data-lucide="chevron-right" class="spoiler-arrow" style="width:14px;height:14px;"></i> <i data-lucide="sparkles" style="width:13px;height:13px;"></i> <span class="js-spoiler-title"></span> <span style="opacity:.6;">(${steps.length} <span class="js-spoiler-unit"></span>)</span>`;
        setI18n(sum.querySelector(".js-spoiler-title"), "How myDhamma AI worked", "Proses myDhamma AI");
        setI18n(sum.querySelector(".js-spoiler-unit"), "steps", "langkah");
        const body = document.createElement("div");
        body.style.cssText = "margin-top:6px; padding-left:8px; border-left:2px solid var(--border); overflow:hidden;";
        steps.forEach(s => { s.style.display = ""; body.appendChild(s); });
        det.appendChild(sum);
        det.appendChild(body);
        container.appendChild(det);
        if (window.lucide) window.lucide.createIcons({ root: det });

        requestAnimationFrame(() => {
          // Set initial explicit values for transition to start from
          body.style.maxHeight = body.scrollHeight + "px";
          body.style.opacity = "1";
          body.style.transition = "max-height 0.35s ease-in-out, opacity 0.25s ease-out, margin-top 0.35s ease-in-out";

          // Force reflow so the browser registers the initial state before we change it
          void body.offsetHeight;

          // Apply target values
          body.style.maxHeight = "0px";
          body.style.opacity = "0";
          body.style.marginTop = "0px";

          setTimeout(() => {
            det.removeAttribute("open");
            body.style.transition = "";
            body.style.maxHeight = "";
            body.style.opacity = "";
            body.style.marginTop = "6px";
          }, 360);
        });
      }

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, history: historyToSend, stream: true, lang: isEN() ? "en" : "id", mention_prefs: mentionPrefsForMsg, broad_search: isBroadSearch }),
          signal: abortController.signal
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Gagal");
        }
        // Baca SSE: event {stage} update status, payload akhir {answer, results}.
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "", final = null;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n\n")) >= 0) {
            const raw = buf.slice(0, nl).replace(/^data:\s?/, "").trim();
            buf = buf.slice(nl + 2);
            if (!raw) continue;
            const obj = JSON.parse(raw);
            if (obj.stage) {
              if (currentStepEl) {
                currentStepEl.classList.remove("step-loading");
                currentStepEl.classList.add("step-done");
                // Kalau label sebelumnya masih diketik, lompat ke teks penuh saat ditandai ✓.
                finalizeType(currentStepEl.querySelector(".step-label"));
                currentStepEl.querySelector(".step-icon").innerHTML = `<i data-lucide="check" style="width:14px;height:14px;color:var(--text-success);"></i>`;
                if (window.lucide) window.lucide.createIcons({ root: currentStepEl });
              }
              // Label dwibahasa: label dari server (obj.label/trace) dikonstruksi secara dinamis
              // di sisi klien jika dikirim secara terstruktur, sehingga bisa switch live.
              let labEn, labId;
              if (obj.stage === "retrieve" && obj.query && !obj.label) {
                let qTrunc = obj.query.length > 50 ? obj.query.substring(0, 50).trim() + "..." : obj.query;
                labEn = "Processing: “" + qTrunc + "”";
                labId = "Memproses: “" + qTrunc + "”";
              } else if (obj.stage === "found" && obj.count !== undefined) {
                if (obj.count > 0) {
                  const s = obj.ids.join(", ");
                  const mId = obj.more ? ` (+${obj.more} lagi)` : "";
                  const mEn = obj.more ? ` (+${obj.more} more)` : "";
                  labEn = `Found ${obj.count} candidate texts: ${s}${mEn}`;
                  labId = `Menemukan ${obj.count} teks kandidat: ${s}${mId}`;
                } else {
                  labEn = "No matching texts found";
                  labId = "Tidak menemukan teks yang cocok";
                }
              } else if (obj.stage === "tool" && obj.data) {
                if (obj.data.kind === "mention") {
                  // Poin 7: tampilkan terjemahan terpilih (author + bahasa) bila ada, biar jelas
                  // teks mana yg ditelusuri; fallback ke daftar id sutta saja kalau tak ada pick.
                  const langLbl = l => l === "id" ? (isEN() ? "Indonesian" : "Indonesia")
                    : l === "en" ? "English" : (l || "").toUpperCase();
                  const fmtPick = p => {
                    const aname = (DK.authorLongName ? DK.authorLongName(p.author, p.source) : p.author) || "";
                    return "@" + p.mention + (aname ? " — " + aname : "") + (p.lang ? " (" + langLbl(p.lang) + ")" : "");
                  };
                  const ms = (Array.isArray(obj.data.picks) && obj.data.picks.length)
                    ? obj.data.picks.map(fmtPick).join(", ")
                    : obj.data.mentions.join(", ");
                  labEn = (obj.data.carried ? "Continuing sutta context: " : "Explicit reference detected: ") + ms;
                  labId = (obj.data.carried ? "Melanjutkan konteks sutta: " : "Rujukan eksplisit terdeteksi: ") + ms;
                } else if (obj.data.kind === "glossary") {
                  const cs = (obj.data.collections || []).join(", ");
                  labEn = "Collection glossary: " + cs;
                  labId = "Glosari koleksi: " + cs;
                } else if (obj.data.kind === "name_match") {
                  const ns = obj.data.names.join(", ");
                  labEn = "Text name match: " + ns;
                  labId = "Kecocokan nama teks: " + ns;
                } else if (obj.data.kind === "nikaya_scope") {
                  const ss = obj.data.scopes.join(", ");
                  labEn = "Restricted to: " + ss;
                  labId = "Dibatasi ke kitab: " + ss;
                } else if (obj.data.kind === "hybrid_search" || obj.data.kind === "hybrid_search_extra") {
                  const qs = obj.data.queries.map(q => `“${q}”`).join("  ·  ");
                  const prefixEn = obj.data.kind === "hybrid_search_extra" ? "Hybrid search for extra context: " : "Hybrid search: ";
                  const prefixId = obj.data.kind === "hybrid_search_extra" ? "Pencarian hybrid untuk konteks tambahan: " : "Pencarian hybrid: ";
                  labEn = prefixEn + qs;
                  labId = prefixId + qs;
                }
              } else if (obj.label) {
                labEn = labId = obj.label;
              } else if (STAGE_I18N[obj.stage]) {
                labEn = STAGE_I18N[obj.stage].en;
                labId = STAGE_I18N[obj.stage].id;
              } else {
                labEn = labId = obj.stage;
              }

              currentStepEl = document.createElement("div");
              currentStepEl.className = "chat-thinking-step step-loading";
              currentStepEl.innerHTML = `<span class="step-icon"><i data-lucide="loader-circle" class="lucide-spin" style="width:14px;height:14px;color:var(--text-muted);"></i></span> <span class="step-label"></span>`;
              const labelSpan = currentStepEl.querySelector(".step-label");
              // Langkah "generate" (nunggu lama) -> putar varian senada; lainnya -> ketik sekali.
              if (obj.stage === "generate" && !obj.label) cycleType(labelSpan, GENERATE_VARIANTS);
              else setI18nTyped(labelSpan, labEn, labId);
              stepsContainer.appendChild(currentStepEl);
              if (window.lucide) window.lucide.createIcons({ root: currentStepEl });
            } else if (obj.type === "chunk") {
              if (currentStepEl) {
                finalizeType(currentStepEl.querySelector(".step-label"));
                stepsContainer.classList.add("thinking-done");
              }

              if (!hasFirstChunk) {
                hasFirstChunk = true;
                createAndAnimateSpoiler(stepsContainer);
              }

              status.style.display = "";
              status.classList.remove("chat-typing");
              accumulatedAnswer += obj.text;

              const thinkMatch = accumulatedAnswer.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
              if (thinkMatch) {
                let thinkEl = bot.querySelector(".chat-llm-think");
                if (!thinkEl) {
                  thinkEl = document.createElement("div");
                  thinkEl.className = "chat-llm-think chat-thinking-step step-done";
                  thinkEl.style.marginTop = "4px";
                  thinkEl.style.marginBottom = "8px";
                  thinkEl.innerHTML = `<span class="step-icon"><i data-lucide="cpu" style="width:14px;height:14px;color:var(--text-muted);"></i></span> <details style="display:inline-block; vertical-align:top; width:calc(100% - 24px);"><summary style="cursor:pointer; font-size:0.85rem; color:var(--text-muted); font-weight:500;">${isEN() ? "myDhamma AI Thinking Process" : "Proses Pemikiran myDhamma AI"}</summary><div class="think-content" style="margin-top:6px; font-size:0.8rem; color:var(--text-muted); font-style:italic; border-left:2px solid var(--border); padding-left:10px; white-space:pre-wrap; max-height:200px; overflow-y:auto; overflow-x:hidden;"></div></details>`;
                  stepsContainer.appendChild(thinkEl);
                  if (window.lucide) window.lucide.createIcons({ root: thinkEl });
                }
                const thinkContent = thinkEl.querySelector(".think-content");
                const content = thinkMatch[1].trim();
                if (thinkContent.textContent !== content) {
                  thinkContent.textContent = content;
                  thinkContent.scrollTop = thinkContent.scrollHeight;
                }
              }

              let displayAnswer = accumulatedAnswer.replace(/<think>[\s\S]*?<\/think>\n*/gi, "").replace(/<think>[\s\S]*$/gi, "");
              // Hide follow-up questions during streaming to prevent ghosting/jumping
              const loadingUI = `\n\n<div class="chat-thinking-step step-loading" style="margin-top:16px; padding:8px 0;"><span class="step-icon" style="margin-right:6px;"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide-spin" style="color:var(--text-muted);"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></span> <span class="step-label" style="font-size:0.85rem; color:var(--text-muted);">${isEN() ? "Preparing references & follow-up questions..." : "Menyiapkan rujukan & rekomendasi pertanyaan..."}</span></div>\n\n`;
              let hasFollowup = /\*\*Rekomendasi Pertanyaan Lanjutan:\*\*/i.test(displayAnswer) || /\*\*Recommended Follow-up Questions:\*\*/i.test(displayAnswer);
              displayAnswer = displayAnswer.replace(/\*\*(Rekomendasi Pertanyaan Lanjutan|Recommended Follow-up Questions):\*\*[\s\S]*/gi, "");
              const filtered = enforceTheravadaTerms(displayAnswer);
              status.innerHTML = mdLite(filtered) + (hasFollowup ? loadingUI : "");
              // Caret kedip "sedang mengetik" di akhir teks (selama belum nyiapin
              // followup). Disisip ke dalam blok terakhir biar inline di ujung kalimat.
              if (!hasFollowup) {
                const caret = document.createElement("span");
                caret.className = "chat-stream-caret";
                const last = status.lastElementChild;
                if (last && /^(UL|OL)$/.test(last.tagName)) {
                  // List: tempel caret ke <li> TERAKHIR biar ngikut di ujung poin, bukan
                  // nyangkut sebagai blok terpisah di bawah list.
                  const lastLi = last.lastElementChild;
                  (lastLi || status).appendChild(caret);
                } else if (last) {
                  last.appendChild(caret);
                } else {
                  status.appendChild(caret);
                }
              }
            } else if (obj.type === "final") {
              final = obj;
            } else if (obj.error) {
              throw new Error(obj.error);
            } else if (obj.answer) {
              final = obj;
            }
          }
        }
        if (!final) throw new Error(isEN() ? "no response" : "tidak ada respons");

        const ans = final.answer || (isEN() ? "(no answer)" : "(tidak ada jawaban)");

        status.style.display = "";
        status.classList.remove("chat-typing");
        status.innerHTML = "";

        // Hanya tampilkan sutta yang BENAR-BENAR dikutip LLM (relevan). Cocokkan
        // juga base-id ("SN 20.9" dari "SN 20.9:md1") karena LLM menulis id dasar.
        // Tidak fallback ke seluruh hasil: kalau tak ada yang dikutip, jangan munculkan kartu.
        const finalResults = refineResults((final.results || []).filter(r => {
          if (r.mentioned) return true; // sutta yg di-mention user: selalu tampil
          if (!r.formatted_id) return false;
          const baseId = r.formatted_id.split(':')[0];
          return ans.includes(r.formatted_id) || ans.includes(baseId);
        }));

        renderBotAnswer(status, ans, finalResults);

        // Tandai step TERAKHIR (generate) selesai — kalau tidak, spinner-nya nyangkut
        // muter terus (step baru ditandai ✓ saat step berikutnya muncul, tapi generate
        // tak punya penerus).
        if (currentStepEl) {
          currentStepEl.classList.remove("step-loading");
          currentStepEl.classList.add("step-done");
          const ic = currentStepEl.querySelector(".step-icon");
          if (ic) {
            ic.innerHTML = `<i data-lucide="check" style="width:14px;height:14px;color:var(--text-success);"></i>`;
            if (window.lucide) window.lucide.createIcons({ root: ic });
          }
          const lbl = currentStepEl.querySelector(".step-label");
          if (lbl) {
            lbl.dataset.i18nEn = "Done";
            lbl.dataset.i18nId = "Selesai";
            lbl.textContent = isEN() ? "Done" : "Selesai";
          }
          currentStepEl = null;
        }

        // Setelah jawaban tampil: pastikan langkah proses (understand/retrieve/dst)
        // terlipat jadi spoiler <details> tertutup (fallback jika tak ada chunk).
        if (stepsContainer && stepsContainer.children.length &&
          !stepsContainer.querySelector(".chat-steps-spoiler")) {
          createAndAnimateSpoiler(stepsContainer);
        }

        history.push({ role: "user", content: text });
        history.push({ role: "assistant", content: ans, results: finalResults });
        updateCurrentSession();

      } catch (err) {
        if (err.name === "AbortError") {
          // Item 7: STOP oleh user -> pertahankan jawaban parsial yg sudah keluar &
          // simpan ke riwayat. Abort krn pindah sesi (userStopped=false) -> buang.
          if (userStopped) {
            // Item 15: langkah yg masih berputar ("Memahami pertanyaan…" dst) jangan
            // dibiarkan loading — tandai sbg dihentikan (ID/EN sesuai bahasa).
            const loadingStep = stepsContainer.querySelector(".step-loading");
            if (loadingStep) {
              loadingStep.classList.remove("step-loading");
              loadingStep.classList.add("step-done");
              const ic = loadingStep.querySelector(".step-icon");
              if (ic) ic.innerHTML = `<i data-lucide="x" style="width:14px;height:14px;color:var(--danger);"></i>`;
              const lbl = loadingStep.querySelector(".step-label");
              if (lbl) setI18n(lbl, "Stopped", "Dihentikan");
              if (window.lucide) window.lucide.createIcons({ root: loadingStep });
            }
            if (accumulatedAnswer.trim()) {
              status.style.display = "";
              status.classList.remove("chat-typing");
              renderBotAnswer(status, accumulatedAnswer, []);
              // Ada jawaban parsial -> commit user+assistant (giliran ini "ada isinya").
              history.push({ role: "user", content: text });
              history.push({ role: "assistant", content: accumulatedAnswer, results: [] });
              updateCurrentSession();
              appendRetry(bot, userBubble, text, true);
            } else {
              // Tak ada jawaban parsial: tampilkan catatan dihentikan, bukan area kosong.
              // TIDAK di-commit ke history (tak ada reply) -> tak ninggalin `user` orphan.
              status.style.display = "";
              status.classList.remove("chat-typing");
              status.className = "chat-answer chat-stopped";
              setI18n(status, "Generation stopped.", "Proses dihentikan.");
              appendRetry(bot, userBubble, text, false);
            }
          } else {
            status.remove();
          }
          return;
        }
        status.style.display = "";
        status.className = "chat-answer chat-error";
        setI18n(status, "Error: " + err.message, "Terjadi kesalahan: " + err.message);
        // Error tanpa reply -> tidak di-commit ke history (tak ada orphan `user`).
        appendRetry(bot, userBubble, text, false);
      } finally {
        isGenerating = false;
        abortController = null;
        userStopped = false;
        setSendMode(false);   // item 7: tombol kembali ke Kirim
        bot.classList.remove("is-generating");  // matikan gradient border shimmer
        document.querySelectorAll(".chat-followup-chip").forEach(c => c.disabled = false);
      }
    }

    // --- INITIALIZATION ---
    try {
      const stored = localStorage.getItem("dhammachat_sessions");
      if (stored) {
        const data = JSON.parse(stored);
        sessions = data.sessions || [];
        currentSessionId = data.activeId || null;
      }
    } catch (e) { console.warn("Failed to load chat history", e); }

    const urlParams = new URLSearchParams(window.location.search);
    const urlId = urlParams.get("id");

    if (urlId) {
      const found = sessions.find(x => x.id === urlId);
      if (found) {
        currentSessionId = found.id;
      } else {
        if (window.showToast) window.showToast(isEN() ? "Chat session not found." : "Sesi obrolan tidak ditemukan.");
        currentSessionId = null; // force creation of new session
      }
    }

    if (!sessions || sessions.length === 0) {
      createNewSession(false, true, true);
    } else if (!currentSessionId) {
      createNewSession(false, true, true);
    } else {
      updateURLWithSessionId(currentSessionId, true);
    }

    const initialSession = sessions.find(x => x.id === currentSessionId);
    if (initialSession) {
      history = initialSession.history || [];
      restoreHistory();
    } else {
      history = [];
      renderEmptyState();
    }
    renderSidebar();

    // Isi kotak input dgn efek ketik (biar user sadar teksnya tertulis), lalu fokus (desktop).
    // Hormati prefers-reduced-motion -> set langsung. Tinggi & backdrop mention ikut diperbarui
    // tiap karakter. Autofocus HANYA desktop (mobile: hindari keyboard nutup teks).
    function typeIntoInput(text, speed = 26) {
      const finishFocus = () => {
        if (window.innerWidth > 768) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
        // Update tombol kirim: .value diset programmatic (bukan user ketik) jadi event
        // `input` tidak terpicu → panggil setSendMode manual supaya ikon ↑ tampil.
        setSendMode(false);
        const wrap = container.querySelector(".chat-input-wrap");
        if (wrap) {
          wrap.classList.add("attention-pulse");
          setTimeout(() => wrap.classList.remove("attention-pulse"), 2000);
        }
        if (sendBtn) {
          sendBtn.classList.add("attention-pulse");
          setTimeout(() => sendBtn.classList.remove("attention-pulse"), 2000);
        }
      };
      const sizeAndSync = () => {
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 140) + "px";
        syncBackdrop();
      };
      if (prefersReduced()) { input.value = text; sizeAndSync(); finishFocus(); return; }
      input.value = "";
      let i = 0;
      (function step() {
        input.value = text.slice(0, ++i);
        sizeAndSync();
        if (i < text.length) setTimeout(step, speed);
        else finishFocus();
      })();
    }

    if (prefillInput) {
      // Selalu mulai room baru biar konteks bersih (kecuali room skrg msh kosong). Hanya
      // MENGISI kotak (animasi ketik); TIDAK auto-kirim (user edit dulu).
      if (history.length > 0) createNewSession(true, true, true);
      typeIntoInput(prefillInput);

      const chatInputWrap = root.querySelector(".chat-input-wrap");
      if (chatInputWrap) {
        chatInputWrap.classList.remove("prefill-pulse");
        void chatInputWrap.offsetWidth; // trigger reflow
        chatInputWrap.classList.add("prefill-pulse");
      }
      if (btnSend) {
        btnSend.classList.remove("prefill-pulse");
        void btnSend.offsetWidth;
        btnSend.classList.add("prefill-pulse");
      }
    }

    return { send, history };
  }

  window.DhammaChat = { mount };
})();
