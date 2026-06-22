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
        // Model sering salah eja "uposatha" -> "upasatha" (prefix "upa-" jauh lebih umum di Pali).
        [/\bUpasatha\b/gi, "uposatha"],
        [/\bSatya\b/gi, "Sacca"],
        [/\bArya\b/gi, "Ariya"],
        [/\bSutera\b/gi, "Sutta"],
        [/\bSutra\b/gi, "Sutta"],
        // Ejaan KBBI: "biksuni"/"biksu" -> "bikuni"/"biku" (biksuni dulu, biar tak keduluan biksu).
        [/\bBiksuni\b/gi, "bikuni"],
        [/\bBiksu\b/gi, "biku"],
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

      // Italic JUGA semua kata ber-diakritik Pali (mis. satipaṭṭhāna, jhāna, paṭiccasamuppāda)
      // yg sering tak masuk daftar di atas. Diakritik Pali = sinyal kuat istilah Pali. Lookbehind/
      // ahead cegah dobel-wrap (kata yg sudah diapit * / _, atau di tengah kata lain).
      const PALI_DIA = "āīūṁṃṅñṭḍṇḷ";
      const PW = "A-Za-z" + PALI_DIA;
      const paliDiaRegex = new RegExp(`(?<![*_${PW}])([${PW}]*[${PALI_DIA}][${PW}]*)(?![*_${PW}])`, "g");
      res = res.replace(paliDiaRegex, "*$1*");

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

        if (/^\s*>\s?/.test(lines[i])) {
          const bqLines = [];
          while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
            let content = lines[i].replace(/^\s*>\s?/, '');
            bqLines.push(content);
            i++;
          }
          const bqContent = bqLines.join('\n');
          // Uniform: tiap baris '> ' -> <blockquote> (sesuai instruksi prompt utk kutipan
          // langsung teks sutta). Dulu di-special-case (hanya kalau diapit */"), akibatnya
          // blockquote model yg tak diapit ke-render jadi <p> biasa -> tampilan kutipan ngaco.
          out.push('<blockquote><p>' + inline(bqContent).replace(/\n/g, '<br>') + '</p></blockquote>');
          continue;
        }

        // GFM table: baris header ber-'|' diikuti baris pemisah (|---|---|). UI tak bisa
        // nampilin pipe mentah, jadi render jadi <table> beneran. Pemisah wajib >=2 kolom.
        const tableSep = l => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(l);
        if (lines[i].includes("|") && i + 1 < lines.length && tableSep(lines[i + 1])) {
          const cells = r => r.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
          const head = cells(lines[i]);
          i += 2;                                           // lewati header + baris pemisah
          const rows = [];
          while (i < lines.length && lines[i].includes("|") && !blank(lines[i])
            && !/^\s*#{1,6}\s+/.test(lines[i])) {
            rows.push(cells(lines[i])); i++;
          }
          let t = "<table class='chat-table'><thead><tr>"
            + head.map(c => "<th>" + inline(c) + "</th>").join("") + "</tr></thead><tbody>";
          for (const r of rows) {
            t += "<tr>" + head.map((_, ci) => "<td>" + inline(r[ci] || "") + "</td>").join("") + "</tr>";
          }
          out.push(t + "</tbody></table>");
          continue;
        }

        if ((isUL(lines[i]) && !isSub(lines[i])) || (isOL(lines[i]) && !isSub(lines[i]))) {
          const ordered = isOL(lines[i]) && !isSub(lines[i]);
          const match = ordered ? isOL : isUL;
          const other = ordered ? isUL : isOL;               // opposite list type
          const items = [];
          while (i < lines.length) {
            if (match(lines[i]) && !isSub(lines[i])) {
              let li;
              if (ordered) {
                const m = lines[i].match(/^\s*(\d+)[.)]\s+(.*)$/);
                li = `<li value="${m[1]}">` + inline(m[2]);
              } else {
                li = "<li>" + inline(lines[i].replace(/^\s*[-*]\s+/, ""));
              }
              i++;

              // Lazy continuation & sublists
              while (i < lines.length && !/^\s*#{1,6}\s+/.test(lines[i]) && !blank(lines[i]) && !/^\s*[-*_]{3,}\s*$/.test(lines[i])) {
                if (isSub(lines[i])) {
                  li += drainSub();
                } else if ((match(lines[i]) || other(lines[i])) && !isSub(lines[i])) {
                  break; // next list item at same level
                } else {
                  li += "<br>" + inline(lines[i].trim());
                  i++;
                }
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
          // Stop juga di blockquote ('> ') & hr ('---'): tanpa ini, baris kutipan/garis
          // yg nempel di bawah paragraf (tanpa baris kosong) keserap jadi <p> -> blockquote hilang.
          // Juga JANGAN stop di isSub (sublist orphan), agar tidak infinite loop.
          while (i < lines.length && !blank(lines[i])
            && !(isUL(lines[i]) && !isSub(lines[i]))
            && !(isOL(lines[i]) && !isSub(lines[i]))
            && !/^\s*#{1,6}\s+/.test(lines[i]) && !/^\s*>\s?/.test(lines[i])
            && !/^\s*[-*_]{3,}\s*$/.test(lines[i])) {
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
            <div class="chat-input-wrap">
              <div id="chat-mention-popup" class="chat-mention-popup"></div>
              <div class="chat-input-inner">
                <div class="chat-input" contenteditable="true" role="textbox" aria-multiline="true"
                    data-placeholder="${esc(opts.placeholder || (isEN() ? "Ask about Buddha's teachings..." : "Tanyakan ajaran Buddha..."))}"></div>
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
      container.querySelectorAll("[data-i18n-en-html]").forEach(el => {
        el.innerHTML = isEN() ? el.dataset.i18nEnHtml : el.dataset.i18nIdHtml;
        if (window.lucide) window.lucide.createIcons({ root: el });
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
      const sendBtn = container.querySelector(".chat-send");
      const chatInput = container.querySelector(".chat-input");
      if (sendBtn && chatInput) {
        if (sendBtn.classList.contains("chat-stop")) {
          sendBtn.title = isEN() ? "Stop" : "Berhenti";
        } else {
          const hasText = getInputText().length > 0;
          sendBtn.title = hasText ? tt("btn_send", isEN() ? "Send" : "Kirim") : (isEN() ? "Mention Text" : "Sebut");
        }
      }
      if (chatInput && !opts.placeholder) {
        chatInput.dataset.placeholder = isEN() ? "Ask about Buddha's teachings..." : "Tanyakan ajaran Buddha...";
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
          const before = window.location.href;
          window.history.back();
          setTimeout(() => {
            if (window.location.href === before) {
              window.location.href = "/";
            }
          }, 200);
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

      resetInputState();

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

    function getInputText() {
      let text = '';
      input.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          text += node.textContent || '';
        }
      });
      return text.replace(/\u00A0/g, ' ').replace(/\u200B/g, '').trim();
    }

    function clearInput() {
      input.innerHTML = '';
    }

    function setInputText(text) {
      clearInput();
      if (text) {
        input.appendChild(document.createTextNode(text));
      }
    }

    function resetInputState() {
      if (input) {
        input.contentEditable = "true";
        input.style.opacity = "";
        input.style.cursor = "text";
        if (input.textContent === (isEN() ? "Please select a translation above..." : "Silakan pilih terjemahan di atas...")) {
          input.textContent = "";
        }
      }
      if (typeof sendBtn !== 'undefined' && sendBtn) {
        sendBtn.disabled = false;
        sendBtn.style.opacity = "";
        sendBtn.style.cursor = "";
      }
      if (window._activePickerCancel) {
        window._activePickerCancel();
        window._activePickerCancel = null;
      }
    }

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

      // Tombol "Obrolan Baru" (sidebar) + tombol "new" (icon, pojok kanan atas mobile)
      // sama-sama nyala "active" pas lagi di room kosong/baru (tak ada sesi aktif di list).
      const newActive = !hasActiveInList;
      [document.getElementById("btn-new-chat"), btnMobileNew].forEach(b => {
        if (b) b.classList.toggle("active", newActive);
      });
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

    // Pas dialog ref mobile kebuka, tombol Back (HP) harus NUTUP dialog dulu, bukan navigate.
    // Saat buka kita pushState; Back -> popstate -> tutup popup & STOP (jangan ganti sesi).
    let mobileRefClose = null;

    window.addEventListener("popstate", (e) => {
      if (window._ignoreNextPopstate) {
        window._ignoreNextPopstate = false;
        return;
      }
      if (mobileRefClose) {
        mobileRefClose(true); // true = dipanggil dari popstate, tak usah history.back()
        return;
      }
      const urlId = new URLSearchParams(window.location.search).get("id");
      if (urlId && urlId !== currentSessionId) {
        const s = sessions.find(x => x.id === urlId);
        if (s) {
          switchSession(urlId, false);
        } else {
          const msg = isEN() ? "Chat session not found" : "Sesi obrolan tidak ditemukan";
          if (window.DK && DK.showToast) DK.showToast(msg, 3000);
          else if (window.showToast) window.showToast(msg);
          createNewSession(true, true, true);
        }
      } else if (!urlId && currentSessionId) {
        createNewSession(true, false, false);
      }
    });

    function createNewSession(doRender = true, updateUrl = true, replaceUrl = false) {
      resetInputState();
      currentSessionId = Date.now().toString();
      history = [];
      if (doRender) {
        saveSessions();
        log.innerHTML = "";
        if (opts.prefill && input) {
          clearInput();
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
      resetInputState();
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
      const urlId = new URLSearchParams(window.location.search).get("id");
      if (urlId !== currentSessionId) {
        updateURLWithSessionId(currentSessionId, true);
      }
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
      mentionPopup.innerHTML = `<div class="chat-mention-item chat-mention-header" style="font-size:0.75rem; color:var(--text-muted); justify-content:center; padding: 4px 12px; border-bottom: 1px solid var(--border-color); margin-bottom: 4px;">Tekan Enter atau Tap untuk memilih rujukan</div>` + filtered.map((s, i) => {
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

      const range = document.createRange();
      range.setStart(input, 0);

      // Posisikan start dan end berdasarkan indeks karakter
      // Kita gunakan helper untuk menemukan node dan offset dari indeks karakter
      function setRangeFromCharOffset(range, startOffset, endOffset) {
        const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT, null, false);
        let currentPos = 0;
        let startNode = null, startNodeOffset = 0;
        let endNode = null, endNodeOffset = 0;

        while (walker.nextNode()) {
          const node = walker.currentNode;
          const length = node.textContent.length;

          if (!startNode && currentPos + length >= startOffset) {
            startNode = node;
            startNodeOffset = startOffset - currentPos;
          }
          if (!endNode && currentPos + length >= endOffset) {
            endNode = node;
            endNodeOffset = endOffset - currentPos;
          }
          if (startNode && endNode) break;
          currentPos += length;
        }

        if (startNode) range.setStart(startNode, startNodeOffset);
        else range.setStart(input, 0);

        if (endNode) range.setEnd(endNode, endNodeOffset);
        else range.setEnd(input, input.childNodes.length);
      }

      setRangeFromCharOffset(range, currentMentionMatch.start, currentMentionMatch.end);

      // Hapus teks "@query"
      range.deleteContents();

      // Sisipkan zero-width space sbg jangkar agar browser bisa menghapus chip di awal div
      const zws = document.createTextNode('\u200B');
      range.insertNode(zws);
      range.setStartAfter(zws);
      range.collapse(true);

      // Buat chip mention
      const chip = document.createElement('span');
      chip.className = 'chat-mention-chip';
      chip.contentEditable = 'false';
      chip.textContent = `@${abbr}`;

      // Sisipkan chip
      range.insertNode(chip);
      range.setStartAfter(chip);
      range.collapse(true);

      const space = document.createTextNode('\u00A0'); // single non-breaking space
      range.insertNode(space);

      // Pindahkan kursor setelah spasi
      const sel = window.getSelection();
      sel.removeAllRanges();
      const newRange = document.createRange();
      newRange.setStartAfter(space);
      newRange.collapse(true);
      sel.addRange(newRange);

      mentionPopup.classList.remove("show");
      currentMentionMatch = null;
      input.focus();
    }

    btnNewChat.addEventListener("click", requestNewChat);

    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.originalEvent || e).clipboardData.getData("text/plain");
      document.execCommand("insertText", false, text);
    });

    input.addEventListener("input", () => {
      setSendMode(isGenerating);

      // Bersihkan sisa <br> dari browser saat dikosongkan agar CSS :empty (placeholder) bisa tampil
      if (input.innerHTML === '<br>' || input.innerHTML === '<br><br>') {
        input.innerHTML = '';
      }

      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 140) + "px";
      input.style.overflowY = input.scrollHeight > 140 ? "auto" : "hidden";

      detectMention();
    });

    function detectMention() {
      const sel = window.getSelection();
      if (!sel.rangeCount) {
        mentionPopup.classList.remove("show");
        currentMentionMatch = null;
        return;
      }

      const range = sel.getRangeAt(0).cloneRange();
      // Ambil seluruh teks dari awal div contenteditable hingga posisi kursor
      range.setStart(input, 0);
      const textBeforeCursor = range.toString();

      // Regex mendeteksi '@' diikuti oleh string query.
      // Mendukung huruf, spasi opsional, dan angka, misalnya: "@MN", "@MN ", "@MN 16", "@MN16".
      // Jika mengetik spasi SETELAH angka ("@MN 16 "), regex ini akan gagal (popup ditutup).
      const match = textBeforeCursor.match(/(?:^|[\s\u200B])@([\p{L}\p{M}\-]+(?:\s*\d*(?:\.\d*)?)?|)$/u);

      if (match) {
        const query = match[1];

        // Simpan posisi absolut (indeks karakter) dari '@' dan akhir kursor
        currentMentionMatch = {
          start: match.index + match[0].indexOf('@'),
          end: textBeforeCursor.length
        };

        renderMentionPopup(query);
      } else {
        mentionPopup.classList.remove("show");
        currentMentionMatch = null;
      }
    }

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
        if (e.key === "Escape") {
          e.preventDefault();
          mentionPopup.classList.remove("show");
          currentMentionMatch = null;
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        const isModifierPressed = e.ctrlKey || e.metaKey;
        // Di mobile, Enter biasa murni buat baris baru. Tapi kalau pakai Ctrl/Cmd+Enter tetep kirim.
        if (window.innerWidth <= 768 && !isModifierPressed) return;
        e.preventDefault();
        form.requestSubmit();
      }
    });

    form.addEventListener("submit", e => {
      e.preventDefault();

      if (isGenerating) {
        if (window._activePickerContinue) {
          window._activePickerContinue();
        } else {
          stopGeneration();
        }
        return;
      }

      const val = getInputText();
      if (!val) {
        input.focus();
        if (!sendBtn.classList.contains("chat-stop")) {
          // Input kosong, tombol '@' diklik. Isi dengan '@' dan taruh kursor di akhirnya
          input.innerHTML = "";
          const textNode = document.createTextNode("@");
          input.appendChild(textNode);

          const sel = window.getSelection();
          const range = document.createRange();
          range.setStartAfter(textNode);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);

          input.dispatchEvent(new Event("input"));
        }
        return;
      }

      mentionPopup.classList.remove("show");
      currentMentionMatch = null;
      send();
    });


    // Item 7: hentikan generasi atas permintaan user (beda dari abort saat pindah sesi:
    // di sini jawaban parsial yg sudah keluar dipertahankan, lihat catch AbortError).
    let userStopped = false;
    function stopGeneration() {
      if (!isGenerating) return;
      userStopped = true;
      if (window._activePickerCancel) {
        window._activePickerCancel();
        window._activePickerCancel = null;
      }
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
        const hasText = getInputText().length > 0;
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
    let prefillTagParam = null;
    const _params = new URLSearchParams(window.location.search);
    const qParam = _params.get("q");
    const tagParam = _params.get("tag");   // ?tag=MN 10 -> buka room baru + tag sutta
    if (qParam) {
      prefillInput = qParam;
      window.history.replaceState({}, document.title, "/chat");
    } else if (tagParam) {
      prefillTagParam = tagParam.trim();
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
          clearInput();
          const chip = document.createElement('span');
          chip.className = 'chat-mention-chip';
          chip.contentEditable = 'false';
          chip.textContent = '@' + btn.dataset.mention;
          input.appendChild(chip);
          input.appendChild(document.createTextNode(' '));
          input.style.height = "auto";
          input.style.height = Math.min(input.scrollHeight, 140) + "px";
          input.focus();
          // Pindahkan kursor setelah chip
          const sel = window.getSelection();
          const range = document.createRange();
          range.setStartAfter(input.lastChild);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
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
            setInputText(q);
            input.style.height = "auto";
            input.style.height = Math.min(input.scrollHeight, 140) + "px";
            form.requestSubmit();
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

    // ── Inline-cite (tombol rujukan dalam teks) — DIPUSATKAN biar render final & streaming sama ──
    // Linkify ref jadi tombol HANYA bila `isValid(base)` true (cegah ref ngarang jadi link palsu).
    function linkifyCitations(html, isValid) {
      const re = /(?:\(|\[)?([A-Za-z\-]+\s+\d+(?:\.\d+)*(?:-\d+)?)(?::([a-zA-Z0-9\.\-]+))?(?:\s*\([a-z]{2,3}\/[^)]+\))?(?:\)|\])?/gi;
      let counter = 1;
      const refMap = {};
      const out = html.replace(re, (match, bookId, segment) => {
        const base = bookId.trim();
        if (!isValid(base)) return match;

        let cleanSegment = segment ? segment.trim() : "";
        if (cleanSegment) {
          cleanSegment = cleanSegment.replace(/[\.,;]+$/, "");
        }

        const fullId = cleanSegment ? `${base}:${cleanSegment}` : base;

        const normFullId = fullId.replace(/\s+/g, "").toLowerCase();
        if (!refMap[normFullId]) {
          refMap[normFullId] = counter++;
        }
        const num = refMap[normFullId];

        // Gaya sujato: id sutta dikurung, segmen di luar kurung -> "[MN 51]:md2" / "[MN 51]:1.2".
        // BUKAN footnote [1] — self-identifying, langsung tahu sutta+segmennya.
        const displayText = cleanSegment ? `[${esc(base)}]:${esc(cleanSegment)}` : `[${esc(base)}]`;
        const replacement = `<button type="button" class="chat-inline-cite" data-target="${esc(base)}" data-full-target="${esc(fullId)}" data-ref-num="${num}">${displayText}</button>`;
        return replacement;
      });
      return out.replace(/[(\[](<button[^>]*class="chat-inline-cite"[^>]*>.*?<\/button>)[)\]]/gi, '$1');
    }

    // Sorot sementara (2 dtk) lalu hilang. `isCard` -> outline di DALAM box biar tak ke-clip
    // overflow:hidden .chat-citations-list (kartu utuh akhirnya tampil di desktop, bukan
    // cuma di popup mobile). Dulu di-set via el.style.outline inline.
    function flashHighlight(el, isCard) {
      if (!el) return;
      el.classList.add("cite-flash");
      if (isCard) el.classList.add("cite-flash-card");
      setTimeout(() => el.classList.remove("cite-flash", "cite-flash-card"), 2000);
    }

    // Ordinal segmen utk pembandingan range: "md5"->{p:"md",n:5}, "4.20"->{p:"",n:4.2}.
    // null kalau tak terurai (biar pemanggil fallback ke cocokan ujung).
    function segOrdinal(seg) {
      const m = (seg || "").match(/^([a-z]*)(\d+(?:\.\d+)?)$/i);
      return m ? { p: m[1].toLowerCase(), n: parseFloat(m[2]) } : null;
    }
    // RANGE-AWARE: apakah fragment (normSegId "base:seg") tercakup target (normFullTarget
    // "base:seg" atau "base:segA-segB"). Dulu range cuma cocok di ujung -> md5 di tengah
    // md4-md6 ke-skip. Sekarang segmen tengah ikut kalau ada di antara.
    function segInTarget(normFullTarget, normSegId) {
      if (!normFullTarget.includes(":") || !normSegId) return false;
      const tSeg = normFullTarget.slice(normFullTarget.indexOf(":") + 1);
      const fSeg = normSegId.slice(normSegId.indexOf(":") + 1);
      if (!tSeg || !fSeg) return false;
      if (tSeg === fSeg) return true;
      if (tSeg.includes("-")) {
        const [a, b] = tSeg.split("-");
        const of = segOrdinal(fSeg), oa = segOrdinal(a), ob = segOrdinal(b);
        if (of && oa && ob && of.p === oa.p && of.p === ob.p) {
          const lo = Math.min(oa.n, ob.n), hi = Math.max(oa.n, ob.n);
          return of.n >= lo && of.n <= hi;
        }
        return fSeg === a || fSeg === b;   // fallback ujung utk format tak terurai
      }
      // Hierarki bertitik: target "4" boleh cocok "4.20" (batas TITIK).
      if (fSeg.startsWith(tSeg + ".") || tSeg.startsWith(fSeg + ".")) return true;
      // Selain itu HARUS exact string (sudah dicek di atas) — JANGAN samain numerik:
      // biar "md2" != "md24" DAN "md2" != "md02" (leading zero = segmen beda).
      return false;
    }

    // Komponen rujukan: { fullRef:"MN 92:md2-md3", base:"MN 92", name:"Abhayarājakumāra" }.
    // base/fullRef dari atribut tombol; name dari kartu yg cocok. Dipakai tooltip (nama saja)
    // & header sheet mobile (id + nama dua baris).
    function citeRefName(btn) {
      const fullRef = btn.getAttribute("data-full-target") || btn.getAttribute("data-target") || "";
      const base = btn.getAttribute("data-target") || fullRef;
      const { foundCard } = findCitation(btn);
      const nameEl = foundCard && foundCard.querySelector(".sutta-card-name");
      const name = nameEl ? nameEl.textContent.trim() : "";
      return { fullRef, base, name };
    }

    // Klik rujukan -> scroll+highlight kartu/segmen. Pakai EVENT-DELEGATION di `log` (sekali),
    // supaya tombol yg muncul progresif SAAT streaming pun langsung klikable tanpa re-bind.
    function showMobileReferencePopup(highlightEl, foundSegs, foundCard, idText, nameText) {
      let overlay = document.getElementById("mobile-ref-overlay");
      let popup = document.getElementById("mobile-ref-popup");

      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "mobile-ref-overlay";
        overlay.className = "mobile-ref-overlay";
        document.body.appendChild(overlay);
      }
      if (!popup) {
        popup = document.createElement("div");
        popup.id = "mobile-ref-popup";
        popup.className = "mobile-ref-popup";
        const header = document.createElement("div");
        header.className = "mobile-ref-popup-header";
        header.innerHTML = `<span class="mobile-ref-popup-titlewrap"><i data-lucide="book-open" style="width:18px;height:18px;flex-shrink:0;"></i> <span class="mobile-ref-popup-titlecol"><span class="mobile-ref-popup-kicker"></span><span class="mobile-ref-popup-title"></span></span></span>`;
        const closeBtn = document.createElement("button");
        closeBtn.className = "mobile-ref-popup-close";
        closeBtn.innerHTML = `<i data-lucide="x" style="width:20px;height:20px;"></i>`;
        header.appendChild(closeBtn);
        const contentEl = document.createElement("div");
        contentEl.id = "mobile-ref-popup-content";
        contentEl.className = "mobile-ref-popup-content";
        popup.appendChild(header);
        popup.appendChild(contentEl);
        document.body.appendChild(popup);
        // Klik backlink "Dirujuk: [n]" di dalam popup -> tutup popup. WAJIB di fase CAPTURE:
        // handler anchor-nya manggil stopPropagation() (utk scroll+pulse ke [n]), jadi klik
        // tak pernah sampai ke listener bubble. Capture jalan duluan, jadi popup tetap nutup.
        contentEl.addEventListener("click", (e) => {
          if (e.target.closest(".cite-backlink") && popup._close) popup._close();
        }, true);
      }

      const content = document.getElementById("mobile-ref-popup-content");

      // Header dua baris: id sutta (kicker) di atas, nama (judul) di bawah — tanpa kurung.
      // Kalau sutta tak punya nama, id dijadikan judul & kicker dikosongkan (biar ga dobel).
      const kickerEl = popup.querySelector(".mobile-ref-popup-kicker");
      const titleEl = popup.querySelector(".mobile-ref-popup-title");
      if (nameText) {
        if (kickerEl) kickerEl.textContent = idText || "";
        if (titleEl) titleEl.textContent = nameText;
      } else {
        if (kickerEl) kickerEl.textContent = "";
        if (titleEl) titleEl.textContent = idText || (isEN() ? "Reference" : "Rujukan");
      }

      // Kalau popup masih nyimpen kartu dari buka sebelumnya (dibuka ulang tanpa nutup),
      // balikin dulu biar tak ada kartu yatim.
      if (popup._restoreCard) { popup._restoreCard(); popup._restoreCard = null; }

      // Pindahkan kartu ASLI ke popup (appendChild = MOVE), jadi listener +Catatan,
      // backlink "Dirujuk", & "Tanya lagi" tetap hidup — beda dgn cloneNode dulu yg
      // membuang semua handler (tombolnya jadi mati). Placeholder utk balikin saat tutup.
      const placeholder = document.createComment("mobile-ref-card-slot");
      foundCard.parentNode.insertBefore(placeholder, foundCard);
      content.innerHTML = "";
      content.appendChild(foundCard);
      const restoreCard = () => {
        if (placeholder.parentNode) {
          placeholder.parentNode.insertBefore(foundCard, placeholder);
          placeholder.remove();
        }
      };
      popup._restoreCard = restoreCard;

      let closed = false;
      function closePopup(fromPopstate = false) {
        if (closed) return;
        closed = true;
        mobileRefClose = null; // Bebaskan intercept popstate
        popup.classList.remove("show");
        overlay.classList.remove("show");

        // Kalau tutupnya bukan dari tombol Back HP, kita harus buang state buatan tadi
        // supaya histori bersih (tak numpuk state #popup).
        if (!fromPopstate && window.location.hash === "#popup") {
          window._ignoreNextPopstate = true;
          window.history.back();
        }

        setTimeout(() => {
          popup.style.display = "none";
          overlay.style.display = "none";
          restoreCard();
          popup._restoreCard = null;
        }, 300);
      }
      overlay.onclick = () => closePopup();
      popup.querySelector(".mobile-ref-popup-close").onclick = () => closePopup();
      popup._close = closePopup;   // dipakai listener capture backlink di atas

      // Push state buatan spy pas HP dipencet Back, popstate ketangkap & tutup popup.
      if (window.location.hash !== "#popup") {
        window.history.pushState(null, "", window.location.pathname + window.location.search + "#popup");
      }
      mobileRefClose = closePopup;

      if (window.lucide) window.lucide.createIcons({ root: popup });

      overlay.style.display = "block";
      popup.style.display = "flex";
      void popup.offsetWidth;
      popup.classList.add("show");
      overlay.classList.add("show");

      if (foundSegs && foundSegs.length > 0) {
        setTimeout(() => {
          const targetRect = foundSegs[0].getBoundingClientRect();
          const contentRect = content.getBoundingClientRect();
          const scrollTop = content.scrollTop + (targetRect.top - contentRect.top);
          content.scrollTo({ top: scrollTop - 20, behavior: 'smooth' });
          foundSegs.forEach(seg => flashHighlight(seg, false));
        }, 350);
      } else {
        setTimeout(() => {
          content.scrollTo({ top: 0, behavior: 'smooth' });
          flashHighlight(foundCard, true);
        }, 350);
      }
    }

    function findCitation(btn) {
      const scope = btn.closest(".chat-msg-bot");
      if (!scope) return { foundCard: null, foundSegs: [], scope: null };
      const target = btn.getAttribute("data-target");
      const fullTarget = (btn.getAttribute("data-full-target") || "").replace(/\s+/g, "").toLowerCase();
      let foundCard = null, foundSegs = [];

      scope.querySelectorAll(".sutta-card").forEach(card => {
        const l = card.querySelector(".sutta-card-link");
        const lText = l ? l.textContent.replace(/\s+/g, "").toLowerCase() : "";
        const tText = target.replace(/\s+/g, "").toLowerCase();
        if (lText.includes(tText)) {
          foundCard = card;
          if (fullTarget.includes(":")) {
            // Range-aware (md4-md6 -> md4,md5,md6) lewat helper yg sama dgn render backlink.
            card.querySelectorAll(".fragment").forEach(frag => {
              if (frag.classList.contains("fragment-blurb")) return;
              const normSegId = (frag.dataset.segmentId || "").replace(/\s+/g, "").toLowerCase();
              if (segInTarget(fullTarget, normSegId)) foundSegs.push(frag);
            });
          }
        }
      });
      return { foundCard, foundSegs, scope };
    }

    function handleCiteClick(btn) {
      const { foundCard, foundSegs, scope } = findCitation(btn);
      if (!scope) return;

      const foundSeg = foundSegs[0] || null;
      const highlightEl = foundSeg || foundCard;
      if (highlightEl && window.innerWidth > 768) {
        const listWrap = highlightEl.closest(".chat-citations-list");
        if (listWrap && listWrap.classList.contains("collapsed-cites")) {
          const expBtn = listWrap.parentElement.querySelector(".btn-expand-cites");
          if (expBtn && expBtn.innerHTML.includes("chevron-down")) {
            listWrap.style.transition = "none";
            expBtn.click();
            setTimeout(() => listWrap.style.transition = "", 50);
          }
        }
      }

      if (!highlightEl) {
        // Jika rujukan belum tersedia (masih streaming), beri tahu user
        const citations = scope.querySelector(".chat-citations");
        if (!citations) {
          const msg = isEN()
            ? "References are still loading…"
            : "Rujukan masih dimuat…";
          if (DK.showToast) {
            DK.showToast(msg, 2000);
          } else if (window.showToast) {
            window.showToast(msg);
          }
        }
        return;
      }

      if (foundSegs.length > 0) {
        foundSegs.forEach(seg => {
          if (seg.classList.contains("hidden-frag")) {
            const grp = seg.closest(".sutta-author-group")
              || seg.closest(".author-frags-container") || foundCard;
            if (grp) {
              grp.querySelectorAll(".hidden-frag").forEach(f => f.classList.remove("hidden-frag"));
              const fade = grp.querySelector(".frags-fade-overlay"); if (fade) fade.remove();
              const moreBtn = grp.querySelector(".btn-show-more"); if (moreBtn) moreBtn.remove();
            } else {
              seg.classList.remove("hidden-frag");
            }
          }
        });
      }

      requestAnimationFrame(() => {
        if (window.innerWidth <= 768) {
          hideCiteTooltip(0);          // tutup tooltip long-press kalau masih nyangkut
          // Header sheet dua baris: id sutta (kicker) + nama (judul), tanpa segmen md.
          const cn = citeRefName(btn);
          showMobileReferencePopup(highlightEl, foundSegs, foundCard, cn.base, cn.name);
        } else {
          const scrollBlock = foundSegs.length > 0 ? "center" : "start";
          highlightEl.scrollIntoView({ behavior: "smooth", block: scrollBlock });
          if (foundSegs.length > 0) {
            foundSegs.forEach(el => flashHighlight(el, false));
          } else {
            // Kartu utuh: outline INSET (cite-flash-card) biar tak ke-clip overflow:hidden
            // .chat-citations-list — sebelumnya outline luar ke-potong jadi tak tampak di desktop.
            flashHighlight(highlightEl, true);
          }
        }
      });
    }
    // Long-press di [n] (mobile): munculin nama+nomor kitab via toast, TANPA buka popup.
    // Tap biasa tetap buka popup. lpSuppressClick mencegah klik penyerta setelah long-press.
    let lpTimer = null, lpSuppressClick = false, lpStartX = 0, lpStartY = 0;
    log.addEventListener("touchstart", (e) => {
      const btn = e.target.closest && e.target.closest(".chat-inline-cite");
      if (!btn) return;
      const t = e.touches[0];
      lpStartX = t.clientX; lpStartY = t.clientY;
      lpSuppressClick = false;
      clearTimeout(lpTimer);
      lpTimer = setTimeout(() => {
        lpTimer = null;
        lpSuppressClick = true;
        if (navigator.vibrate) navigator.vibrate(15);
        showCiteTooltip(btn);     // long-press -> tooltip (nama+nomor kitab), bukan buka popup
        hideCiteTooltip(2600);    // auto-hilang; tap mana pun juga menutupnya (lihat touchstart)
      }, 500);
    }, { passive: true });
    log.addEventListener("touchmove", (e) => {
      if (!lpTimer) return;
      const t = e.touches[0];
      if (Math.abs(t.clientX - lpStartX) > 10 || Math.abs(t.clientY - lpStartY) > 10) {
        clearTimeout(lpTimer); lpTimer = null;   // geser = bukan long-press
      }
    }, { passive: true });
    log.addEventListener("touchend", () => { clearTimeout(lpTimer); lpTimer = null; }, { passive: true });

    log.addEventListener("click", (e) => {
      const btn = e.target.closest && e.target.closest(".chat-inline-cite");
      if (!btn) return;
      if (lpSuppressClick) { lpSuppressClick = false; return; }   // baru long-press -> jangan buka popup
      handleCiteClick(btn);
    });

    let citeTooltipTimer = null;
    let activeTooltipBtn = null;
    let citeTooltipHideTimer = null;
    let citeTooltipEl = document.getElementById("cite-tooltip");

    if (!citeTooltipEl) {
      citeTooltipEl = document.createElement("div");
      citeTooltipEl.id = "cite-tooltip";
      citeTooltipEl.className = "cite-tooltip";
      document.body.appendChild(citeTooltipEl);
    }

    // Tampilkan tooltip rujukan di atas/bawah tombol [n], panah nunjuk ke tengah tombol.
    // Dipakai hover (desktop) & long-press (mobile).
    function showCiteTooltip(btn) {
      clearTimeout(citeTooltipHideTimer);
      // Nama sutta aja (id+segmen udah keliatan di chip inline -> biar ga repetisi).
      const { name, fullRef } = citeRefName(btn);
      citeTooltipEl.textContent = name || fullRef;
      // Reset placement class dulu supaya offsetHeight diukur tanpa panah lama.
      citeTooltipEl.classList.remove("cite-tooltip-top", "cite-tooltip-bottom");
      citeTooltipEl.style.display = "block";

      const rect = btn.getBoundingClientRect();
      // Default di ATAS tombol; kalau mentok atas viewport, pindah ke bawah.
      const placeBottom = rect.top - citeTooltipEl.offsetHeight - 8 < 10;
      const top = placeBottom ? rect.bottom + 8 : rect.top - citeTooltipEl.offsetHeight - 8;
      // Class ini yg memunculkan panah/chevron-nya (lihat .cite-tooltip-top/bottom di CSS).
      citeTooltipEl.classList.add(placeBottom ? "cite-tooltip-bottom" : "cite-tooltip-top");

      let left = rect.left + (rect.width / 2) - (citeTooltipEl.offsetWidth / 2);
      if (left < 10) left = 10;
      if (left + citeTooltipEl.offsetWidth > window.innerWidth - 10) {
        left = window.innerWidth - citeTooltipEl.offsetWidth - 10;
      }
      citeTooltipEl.style.top = top + "px";
      citeTooltipEl.style.left = left + "px";
      // Panah nunjuk ke TENGAH tombol (relatif ke kiri tooltip yg mungkin ter-clamp ke tepi).
      citeTooltipEl.style.setProperty("--cite-arrow-left", (rect.left + rect.width / 2 - left) + "px");
      citeTooltipEl.style.opacity = "1";
    }
    function hideCiteTooltip(delay = 0) {
      clearTimeout(citeTooltipHideTimer);
      citeTooltipHideTimer = setTimeout(() => {
        citeTooltipEl.style.opacity = "0";
        setTimeout(() => { citeTooltipEl.style.display = "none"; }, 200);
      }, delay);
    }

    log.addEventListener("mouseover", (e) => {
      if (window.innerWidth <= 768) return; // Desktop only
      const btn = e.target.closest && e.target.closest(".chat-inline-cite");
      if (!btn) return;
      clearTimeout(citeTooltipTimer);
      activeTooltipBtn = btn;
      citeTooltipTimer = setTimeout(() => {
        if (activeTooltipBtn === btn) showCiteTooltip(btn);
      }, 400);
    });

    log.addEventListener("mouseout", (e) => {
      if (window.innerWidth <= 768) return;
      const btn = e.target.closest && e.target.closest(".chat-inline-cite");
      if (!btn) return;
      clearTimeout(citeTooltipTimer);
      activeTooltipBtn = null;
      setTimeout(() => { if (!citeTooltipEl.matches(":hover")) hideCiteTooltip(); }, 100);
    });

    citeTooltipEl.addEventListener("mouseleave", () => hideCiteTooltip());

    // Tooltip = position:fixed; kalau di-scroll dia bakal "terbang" diam di tempat.
    // Jadi begitu ada scroll, tutup. (Long-press mobile maupun hover desktop.)
    const dismissTooltipOnScroll = () => {
      if (citeTooltipEl.style.display === "block") {
        clearTimeout(citeTooltipTimer);   // batalkan hover yg lagi nunggu muncul
        activeTooltipBtn = null;
        hideCiteTooltip(0);
      }
    };
    log.addEventListener("scroll", dismissTooltipOnScroll, { passive: true });
    window.addEventListener("scroll", dismissTooltipOnScroll, { passive: true, capture: true });

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

      // FIX LIST NESTING: Jika LLM langsung menyambung "Rekomendasi Pertanyaan Lanjutan" tepat di bawah list tanpa baris kosong,
      // mdLite akan menelannya sebagai lazy continuation ke dalam <li> sebelumnya.
      // Solusinya: Paksa tambahkan double newline sebelum heading rekomendasi.
      filteredAns = filteredAns.replace(/\n*\*\*\s*(Rekomendasi\s+Pertanyaan|Pertanyaan\s+(?:Lanjutan|Refleksi|Untuk|Terkait|Diskusi)|Recommended\s+Follow-up\s+Questions)[^*]*\*\*/gi, "\n\n**$1:**");

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

      // Ref jadi tombol HANYA jika base-id-nya ADA di hasil retrieval. Ref ngarang (mis.
      // "DN 16:4.20" yg tak pernah ditarik) -> biarkan teks polos, bukan link palsu menyesatkan.
      ansHtml = linkifyCitations(ansHtml, base => results.some(r => {
        const fid = (r.formatted_id || "").split(":")[0].toLowerCase();
        return fid === base.toLowerCase() || (r.sutta_id || "").toLowerCase() === base.toLowerCase();
      }));
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
            // function addMentionAt(text) {
            //   return text.replace(
            //     /(?<![@\w])(\b(?:[A-Za-z]{1,4}(?:-[A-Za-z]{1,4})?)\s*\d[\d.]*)/g,
            //     (m, ref) => {
            //       // Hanya ubah jika ref cocok dengan salah satu singkatan koleksi yg dikenal
            //       // ATAU ada di validMentionSet (supaya kata biasa tak ikut kena).
            //       const norm = ref.replace(/\s+/g, "").toLowerCase();
            //       const known = validMentionSet
            //         ? validMentionSet.has(norm)
            //         : /^(dn|mn|sn|an|dhp|ud|iti|snp|thag|thig|vv|pv|mil|bu|bi|sk|np|pc|pd|as|pj)\d/i.test(norm);
            //       return known ? "@" + ref : m;
            //     }
            //   );
            // }

            function addMentionAt(text) {
              return text.replace(
                /(?<![@\w])(\b(?:[A-Za-z]{1,4}(?:-[A-Za-z]{1,4})?)\s*\d[\d.]*)/g,
                (m, ref) => {
                  const norm = ref.replace(/\s+/g, "").toLowerCase();
                  // Hanya tambahkan @ kalau validMentionSet sudah siap dan referensi dikenali
                  if (validMentionSet && validMentionSet.has(norm)) {
                    return "@" + ref;
                  }
                  // Kalau tidak dikenali, biarkan seperti semula (tanpa @)
                  return ref;
                }
              );
            }

            Array.from(nextEl.querySelectorAll("li")).forEach(li => {
              const btn = document.createElement("button");
              btn.className = "chat-followup-chip";
              // linkifyCitations jalan duluan -> id sutta di dlm <li> sudah jadi tombol [1].
              // Kalau baca li.textContent langsung, yg kebaca "[1]" bukan "MN 10". Jadi
              // pulihkan dulu: ganti tiap tombol inline-cite -> data-target-nya (base id).
              const liClone = li.cloneNode(true);
              liClone.querySelectorAll(".chat-inline-cite").forEach(b => {
                b.replaceWith(document.createTextNode(b.getAttribute("data-target") || b.textContent));
              });
              // Item 6: buang segmen (mis. "MN 10:md2" -> "MN 10") — mesin tak bisa
              // memproses mention bersegmen, jadi rekomendasi pertanyaan tak boleh memuatnya.
              // Setelah buang segmen, ubah sutta ID jadi @mention kalau belum ada @-nya.
              btn.textContent = addMentionAt(
                liClone.textContent.trim()
                  .replace(/(\b[A-Za-z]+(?:-[A-Za-z]+)?\s?\d+(?:\.\d+)*)\s*:\s*[A-Za-z0-9.\-]+/g, "$1")
              );

              btn.onclick = () => {
                // Item 5: cegah dobel-kirim. Sekali diklik, kunci semua chip & jangan
                // kirim kalau bot masih jalan.
                if (isGenerating) return;
                input.innerText = btn.textContent; // Gunakan innerText karena input sekarang berupa div contenteditable
                input.style.height = "auto";
                if (typeof syncBackdrop === 'function') syncBackdrop();
                // Item 1: JANGAN input.focus() — auto-send langsung jalan, focus cuma
                // memunculkan keyboard mobile sia-sia.
                form.requestSubmit();
              };
              chipsWrap.appendChild(btn);
            });

            el.className = "chat-followups-title";
            el.setAttribute("data-i18n-en", "Follow-up questions:");
            el.setAttribute("data-i18n-id", "Rekomendasi Pertanyaan Lanjutan:");
            el.textContent = isEN() ? "Follow-up questions:" : "Rekomendasi Pertanyaan Lanjutan:";

            // Pindahkan header dan chip wrap ke kontainer baru, cabut dari aliran teks normal
            followUpContainer.appendChild(el);
            followUpContainer.appendChild(chipsWrap);
            nextEl.remove();
          }
        }
      });

      // (Klik rujukan ditangani via event-delegation di `log` -> handleCiteClick.)
      // Render tombol aksi (+ Catatan) untuk teks jawaban terlebih dahulu
      // agar posisinya berada di atas heading Rujukan (di pojok kanan bawah teks jawaban)
      renderAnswerActions(botElement, answerText, results);

      if (results && results.length > 0) {
        // Filter: hanya tampilkan sutta yang benar-benar dikutip/disebut di teks jawaban
        const citedResults = refineResults(results.filter(s => {
          if (s.mentioned) return true; // sutta yg di-mention user: selalu tampil
          if (!s.formatted_id) return false;
          const baseId = s.formatted_id.split(':')[0]; // misal "SN 20.9" dari "SN 20.9:md1"
          return textWithoutThink.includes(s.formatted_id) || textWithoutThink.includes(baseId);
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
      t = t
        .replace(/^\s*#{1,6}\s+/gm, "")                  // heading -> teks biasa
        .replace(/^\s*[-*_]{3,}\s*$/gm, "")              // garis pemisah
        .replace(/\*\*(.+?)\*\*/g, "$1")                 // **tebal**
        .replace(/__(.+?)__/g, "$1")
        .replace(/(^|[^*_])\*(?!\s)([^*]+?)\*(?!\*)/g, "$1$2")  // *miring*
        .replace(/(^|[^*_])_(?!\s)([^_]+?)_(?!_)/g, "$1$2")     // _miring_
        .replace(/^\s*[-*]\s+/gm, "• ");                 // bullet -> •
      // Tabel GFM: ratakan kolom (pipa+pemisah dipertahankan) -> rapi saat di-Salin & saat
      // disimpan ke Catatan (renderAiNoteHtml tetap mem-parse-nya jadi <table> di tampilan).
      if (window.DK && window.DK.mdAlignTables) t = window.DK.mdAlignTables(t);
      return t.replace(/\n{3,}/g, "\n\n").trim();
    }

    // Tombol simpan JAWABAN (teks) ke Catatan — reuse panel Catatan asli via DK.
    function renderAnswerActions(parent, answerText, results) {
      const actions = document.createElement("div");
      actions.className = "chat-answer-actions";

      // Tombol Salin (kiri "+ Catatan"): salin jawaban AI (plaintext rapi) ke clipboard,
      // dgn feedback "Tersalin" sesaat (ikon centang).
      const copyBtn = document.createElement("button");
      copyBtn.className = "btn-add-note btn-chat-copy";
      const copyLabel = isEN() ? "Copy" : "Salin";
      const copiedLabel = isEN() ? "Copied" : "Tersalin";
      copyBtn.innerHTML = `<i data-lucide="copy"></i> <span class="js-copy-label">${copyLabel}</span>`;
      copyBtn.addEventListener("click", () => {
        const text = mdToPlain(answerText);
        const done = () => {
          copyBtn.innerHTML = `<i data-lucide="check"></i> <span class="js-copy-label">${copiedLabel}</span>`;
          copyBtn.classList.add("copied");
          if (window.lucide) window.lucide.createIcons({ root: copyBtn });
          setTimeout(() => {
            copyBtn.innerHTML = `<i data-lucide="copy"></i> <span class="js-copy-label">${copyLabel}</span>`;
            copyBtn.classList.remove("copied");
            if (window.lucide) window.lucide.createIcons({ root: copyBtn });
          }, 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(() => { });
        } else {
          const ta = document.createElement("textarea");
          ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
          document.body.appendChild(ta); ta.select();
          try { document.execCommand("copy"); done(); } catch (e) { }
          ta.remove();
        }
      });
      actions.appendChild(copyBtn);

      const btn = document.createElement("button");
      btn.className = "btn-add-note";
      btn.textContent = tt("btn_add_note", "+ Catatan");
      btn.addEventListener("click", () => {
        // Blok jawaban AI: tandai source "ai" (di Catatan -> non-editable + badge + ref klik
        // "Buka" buka dialog viewer). refs PER-FRAGMEN: tiap entri {id, sid, seg, author} —
        // author diambil per-segmen (tiap fragment punya ref+author sendiri), jadi klik token
        // "MN 10:1.5" buka versi terjemahan + segmen yg PERSIS dirujuk, bukan author default.
        const refs = [];
        (results || []).forEach(r => {
          const id = (r.formatted_id || r.sutta_id || "").split(":")[0].trim();
          const sid = r.sutta_id || "";
          if (!id || !sid) return;
          const frags = r.fragments || [];
          if (frags.length) {
            frags.forEach(f => {
              const author = (f.author && f.author !== "blurb") ? f.author : "";
              const lang = f.db_source || "";
              (f.ref || []).forEach(rf => {
                const s = String(rf);
                const seg = s.includes(":") ? s.split(":").pop() : s;   // "mn10:1.5" -> "1.5"
                refs.push({ id, sid, seg, author, lang });
              });
              refs.push({ id, sid, author, lang });                            // fallback tanpa segmen
            });
          } else {
            refs.push({ id, sid, author: r.author || "", lang: r.db_source || "" });
          }
        });
        const block = { type: "text", source: "ai", content: mdToPlain(answerText), refs };
        if (DK.showNotePicker) DK.showNotePicker(block, btn);
        else if (DK.addBlockToNote) DK.addBlockToNote(block);
      });
      actions.appendChild(btn);
      parent.appendChild(actions);
      if (window.lucide) window.lucide.createIcons({ root: actions });
    }

    function renderCitations(parent, results) {
      if (!results || !results.length) return;
      const wrap = document.createElement("div");
      wrap.className = "chat-citations";
      const ttl = document.createElement("div");
      ttl.className = "chat-citations-title";
      ttl.setAttribute("data-i18n-en", "References");
      ttl.setAttribute("data-i18n-id", "Rujukan");
      ttl.textContent = isEN() ? "References" : "Rujukan";
      wrap.appendChild(ttl);

      if (DK.renderSuttaCardsTo) {
        const listWrap = document.createElement("div");
        listWrap.className = "chat-citations-list";

        DK.renderSuttaCardsTo(listWrap, results, true, { showPreview: true, showAllFragments: true },
          (fragEl, frag, sutta) => {
            const btn = document.createElement("button");
            btn.className = "btn-add-note";
            btn.textContent = tt("btn_add_note", "+ Catatan");
            btn.setAttribute("data-i18n", "btn_add_note");
            btn.addEventListener("click", e => addFragmentToNote(frag, sutta, e.currentTarget));
            fragEl.appendChild(btn);
          });

        listWrap.querySelectorAll(".fragment-score").forEach(score => {
          score.innerHTML = "";
          score.removeAttribute("title");
        });

        listWrap.querySelectorAll(".sutta-card").forEach((card, i) => {
          const sutta = results[i];
          if (!sutta) return;
          const header = card.querySelector(".sutta-card-header");
          const title = card.querySelector(".sutta-card-title");
          if (!header || !title) return;
          const askBtn = document.createElement("button");
          askBtn.className = "btn-ask-again";
          askBtn.innerHTML = `<i data-lucide="at-sign"></i>`;
          askBtn.title = isEN() ? "Ask about this sutta again" : "Tanyakan sutta ini lagi";
          askBtn.setAttribute("aria-label", askBtn.title);
          askBtn.addEventListener("click", () => {
            const mentionText = "@" + (sutta.formatted_id || sutta.sutta_id || "") + " ";
            clearInput();
            const chip = document.createElement('span');
            chip.className = 'chat-mention-chip';
            chip.contentEditable = 'false';
            chip.textContent = mentionText.trim();
            input.appendChild(chip);
            input.appendChild(document.createTextNode(' '));
            input.style.height = "auto";
            input.style.height = Math.min(input.scrollHeight, 140) + "px";
            setSendMode(false);
            input.focus();
            const sel = window.getSelection();
            const range = document.createRange();
            range.setStartAfter(input.lastChild);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            input.scrollIntoView({ behavior: "smooth", block: "nearest" });

            // Auto-close mobile reference popup if clicked from inside it
            const popup = askBtn.closest(".mobile-ref-popup");
            if (popup && popup._close) popup._close();
          });
          header.insertBefore(askBtn, title);
        });

        const inlineLinks = Array.from(parent.querySelectorAll(".chat-inline-cite"));
        inlineLinks.forEach((lk) => {
          if (!lk.id) lk.id = "inline-cite-" + Math.random().toString(36).substr(2, 9);
        });

        function injectBacklinks(containerEl, matchingLinks, isHeader = false) {
          if (!containerEl || matchingLinks.length === 0) return;

          let backlinkContainer;
          if (isHeader) {
            backlinkContainer = containerEl.querySelector(".frag-backlinks-badge");
            if (!backlinkContainer) {
              backlinkContainer = document.createElement("div");
              backlinkContainer.className = "frag-backlinks-badge cite-backlinks-row";
              backlinkContainer.innerHTML = `<i data-lucide="corner-left-up" class="frag-backlinks-icon"></i> <span>${isEN() ? "Cited:" : "Dirujuk:"}</span>`;
              containerEl.appendChild(backlinkContainer);
              if (window.lucide) window.lucide.createIcons({ root: backlinkContainer });
            }
          } else {
            backlinkContainer = containerEl.querySelector(".fragment-score");
            if (!backlinkContainer) return;

            if (!backlinkContainer.classList.contains("hijacked")) {
              backlinkContainer.innerHTML = `<i data-lucide="corner-left-up" class="frag-backlinks-icon"></i> <span>${isEN() ? "Cited:" : "Dirujuk:"}</span>`;
              backlinkContainer.classList.add("hijacked", "cite-backlinks-row");
              backlinkContainer.removeAttribute("title");
              if (window.lucide) window.lucide.createIcons({ root: backlinkContainer });
            }
          }

          // Urutkan sebutan sesuai posisi di jawaban (atas->bawah), lalu label a, b, c…
          // Kalau cuma 1x disebut, cukup panah "↑" (label "a" sendirian aneh).
          const links = matchingLinks.slice().sort((x, y) =>
            (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
          const multi = links.length > 1;
          links.forEach((lk, i) => {
            const a = document.createElement("a");
            // a, b, c… (fallback ke angka kalau >26 sebutan); "↑" kalau tunggal.
            a.textContent = multi ? (i < 26 ? String.fromCharCode(97 + i) : String(i + 1)) : "↑";
            a.className = "cite-backlink";
            a.title = isEN() ? "Jump to mention" : "Ke sebutan";
            if (lk.id) a.dataset.backlinkTo = lk.id;   // dipakai juga oleh popup mobile
            a.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              lk.scrollIntoView({ behavior: "smooth", block: "center" });
              lk.classList.remove("highlight-pulse");
              // Force reflow to restart animation if clicked multiple times
              void lk.offsetWidth;
              lk.classList.add("highlight-pulse");
              // Remove after animation completes (1.8s, give it 2s to be safe)
              setTimeout(() => lk.classList.remove("highlight-pulse"), 2000);
            };
            backlinkContainer.appendChild(a);
          });
        }

        listWrap.querySelectorAll(".sutta-card").forEach((card, i) => {
          const sutta = results[i];
          if (!sutta) return;
          const normSuttaId = (sutta.sutta_id || "").replace(/\s+/g, "").toLowerCase();
          // Identitas kartu utk scoping backlink fragmen — sama persis dgn cara findCitation
          // cocokin kartu (teks .sutta-card-link memuat base id), jadi tak regres utk sutta
          // yg format sutta_id-nya beda (mis. vinaya).
          const cardLinkText = (card.querySelector(".sutta-card-link")?.textContent || "")
            .replace(/\s+/g, "").toLowerCase();

          // 1. Check for whole-sutta links and put them in the header
          const suttaMatchingLinks = inlineLinks.filter(lk => {
            const fullTarget = (lk.getAttribute("data-full-target") || "").replace(/\s+/g, "").toLowerCase();
            const target = (lk.getAttribute("data-target") || "").replace(/\s+/g, "").toLowerCase();
            if (fullTarget.includes(":")) return false; // Ignore segment links
            return (fullTarget === normSuttaId || (!fullTarget && target === normSuttaId));
          });

          if (suttaMatchingLinks.length > 0) {
            const cardHeader = card.querySelector(".sutta-card-header");
            if (cardHeader) {
              injectBacklinks(cardHeader, suttaMatchingLinks, true);
            }
          }

          // 2. Check for fragment links
          const frags = Array.from(card.querySelectorAll(".fragment"));
          if (frags.length === 0) return;

          frags.forEach(fragEl => {
            if (fragEl.classList.contains("fragment-blurb")) return; // Blurbs don't receive fragment backlinks

            const segId = fragEl.dataset.segmentId || "";
            const normSegId = segId.replace(/\s+/g, "").toLowerCase();

            const matchingLinks = inlineLinks.filter(lk => {
              const fullTarget = (lk.getAttribute("data-full-target") || "").replace(/\s+/g, "").toLowerCase();
              if (!fullTarget.includes(":")) return false; // Must be a segment link
              // Base link HARUS milik kartu ini. Tanpa ini, segmen ber-md sama dari sutta
              // beda (mis. MN 10:md2 vs SN 22:md2) ikut ke-tag "Dirujuk" di kartu yg salah.
              const linkBase = (lk.getAttribute("data-target") || "").replace(/\s+/g, "").toLowerCase();
              if (!linkBase || !cardLinkText.includes(linkBase)) return false;
              // Range-aware: md5 di tengah md4-md6 ikut ke-tag, bukan cuma ujungnya.
              return segInTarget(fullTarget, normSegId);
            });
            if (matchingLinks.length > 0) {
              const metaEl = fragEl.querySelector(".fragment-meta");
              injectBacklinks(metaEl, matchingLinks, false);
            }
          });
        });

        wrap.appendChild(listWrap);

        const cards = listWrap.querySelectorAll(".sutta-card");
        if (cards.length > 0) {
          // Default to collapsed state
          listWrap.classList.add("collapsed-cites");

          const overlay = document.createElement("div");
          overlay.className = "cites-fade-overlay";
          listWrap.appendChild(overlay);

          const expandBtn = document.createElement("button");
          expandBtn.className = "btn-expand-cites";
          let isExpanded = false;

          function updateBtn() {
            const enHTML = isExpanded ? `Hide References <i data-lucide='chevron-up'></i>` : `Show References <i data-lucide='chevron-down'></i>`;
            const idHTML = isExpanded ? `Tutup Rujukan <i data-lucide='chevron-up'></i>` : `Tampilkan Rujukan <i data-lucide='chevron-down'></i>`;
            expandBtn.setAttribute("data-i18n-en-html", enHTML);
            expandBtn.setAttribute("data-i18n-id-html", idHTML);
            expandBtn.innerHTML = isEN() ? enHTML : idHTML;
          }
          updateBtn();

          expandBtn.addEventListener("click", () => {
            isExpanded = !isExpanded;
            if (isExpanded) {
              listWrap.style.maxHeight = listWrap.scrollHeight + "px";
              listWrap.classList.remove("collapsed-cites");
              setTimeout(() => {
                if (isExpanded) {
                  listWrap.style.maxHeight = "none";
                  listWrap.style.overflow = "visible";
                }
              }, 400);
            } else {
              listWrap.style.overflow = "hidden";
              listWrap.style.maxHeight = listWrap.scrollHeight + "px";
              void listWrap.offsetHeight; // force reflow
              listWrap.classList.add("collapsed-cites");
              listWrap.style.maxHeight = "";
            }
            updateBtn();
            if (window.lucide) window.lucide.createIcons({ root: expandBtn });
          });

          wrap.appendChild(expandBtn);
        }
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
      homage: { en: "Namo tassa bhagavato arahato sammāsambuddhassa…", id: "Namo tassa bhagavato arahato sammāsambuddhassa…" },
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
        setInputText(text);
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
        let globalIdx = 1;
        pending.forEach((p, pi) => {
          p.translations.sort((a, b) => {
            const aIsSujato = /sujato/i.test(a.author);
            const bIsSujato = /sujato/i.test(b.author);
            const getScore = (t, isSuj) => {
              if (isEN()) {
                if (t.lang === "en" && isSuj) return 0;
                if (t.lang === "en") return 1;
                if (t.lang === "id") return 2;
                if (t.lang === "pli") return 3;
                return 4;
              } else {
                if (t.lang === "id") return 0;
                if (t.lang === "en" && isSuj) return 1;
                if (t.lang === "en") return 2;
                if (t.lang === "pli") return 3;
                return 4;
              }
            };
            const diff = getScore(a, aIsSujato) - getScore(b, bIsSujato);
            return diff !== 0 ? diff : a.author.localeCompare(b.author);
          });

          html += `<div class="chat-trans-group"><div class="chat-trans-sutta">@${esc(p.mn.fid)}</div>`;
          p.translations.forEach((t, ti) => {
            const kbd = globalIdx <= 9 ? `<span class="dk-dlg-kbd num-hint">${globalIdx}</span>` : "";
            globalIdx++;
            html += `<label class="chat-trans-opt"><input type="checkbox" data-pi="${pi}" data-lang="${esc(t.lang)}" data-author="${esc(t.author)}" data-source="${esc(t.source)}"${ti === 0 ? " checked" : ""}> <span class="chat-trans-opt-text">${esc(authorLabel(t.author, t.source))} ${langSpan(t.lang)}</span>${kbd}</label>`;
          });
          html += `</div>`;
        });
        html += `<div class="chat-trans-actions"><button type="button" class="chat-trans-cancel" data-i18n-en="Cancel" data-i18n-id="Batal">${isEN() ? "Cancel" : "Batal"}<span class="dk-dlg-kbd">Esc</span></button><button type="button" class="btn-primary chat-trans-go" data-i18n-en="Continue" data-i18n-id="Lanjut">${isEN() ? "Continue" : "Lanjut"}<span class="dk-dlg-kbd">↵</span></button></div></div>`;
        const el = bubble("chat-msg-bot chat-trans-bubble", html, true);
        const goBtn = el.querySelector(".chat-trans-go");
        goBtn.focus();

        const validateChecks = () => {
          let allGroupsHaveCheck = true;
          pending.forEach((p, pi) => {
            const picks = el.querySelectorAll(`input[data-pi="${pi}"]:checked`);
            if (picks.length === 0) allGroupsHaveCheck = false;
          });
          goBtn.disabled = !allGroupsHaveCheck;
          goBtn.style.opacity = allGroupsHaveCheck ? "" : "0.5";
          goBtn.style.cursor = allGroupsHaveCheck ? "" : "not-allowed";

          if (typeof sendBtn !== 'undefined' && sendBtn) {
            sendBtn.disabled = !allGroupsHaveCheck;
            sendBtn.style.opacity = allGroupsHaveCheck ? "" : "0.4";
            sendBtn.style.cursor = allGroupsHaveCheck ? "" : "not-allowed";
          }
        };

        el.addEventListener("change", (e) => {
          if (e.target.type === "checkbox") validateChecks();
        });

        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); goBtn.click(); }
          else if (e.key === "Escape") { e.preventDefault(); el.querySelector(".chat-trans-cancel").click(); }
          else if (/^[1-9]$/.test(e.key)) {
            const idx = parseInt(e.key, 10) - 1;
            const checks = el.querySelectorAll('input[type="checkbox"]');
            if (checks[idx]) {
              e.preventDefault();
              checks[idx].checked = !checks[idx].checked;
              validateChecks();
            }
          }
        });

        const cancelPicker = () => {
          window._activePickerCancel = null;
          window._activePickerContinue = null;
          el.remove();
          resolve(false);
        };
        window._activePickerCancel = cancelPicker;

        const continuePicker = () => {
          if (goBtn.disabled) return;
          window._activePickerCancel = null;
          window._activePickerContinue = null;
          pending.forEach((p, pi) => {
            const picks = Array.from(el.querySelectorAll(`input[data-pi="${pi}"]:checked`))
              .map(c => ({ lang: c.dataset.lang, author: c.dataset.author, source: c.dataset.source }));
            // Walaupun disabled, fallback ke opsi pertama buat jaga-jaga kalau ada edge case
            mentionPrefs[p.mn.fid] = picks.length ? picks : [p.translations[0]];
          });
          // Ringkas bubble jadi konfirmasi biar riwayat tetap rapi & nyambung. Pakai s18/langSpan
          // supaya prefix "Pakai:"/"Using:" & nama bahasa ikut switch live tanpa refresh.
          el.innerHTML = `<div class="chat-answer chat-trans-done">${s18("Using: ", "Menggunakan: ")}` +
            pending.map(p => mentionPrefs[p.mn.fid]
              .map(x => `<strong>@${esc(p.mn.fid)}</strong> · ${esc(authorLabel(x.author, x.source))} ${langSpan(x.lang)}`)
              .join(", ")).join("; ") + `</div>`;
          resolve(true);
        };
        window._activePickerContinue = continuePicker;

        el.querySelector(".chat-trans-go").addEventListener("click", continuePicker);
        el.querySelector(".chat-trans-cancel").addEventListener("click", cancelPicker);
      });
    }

    async function send() {
      // Item 5: cegah dobel-kirim — set isGenerating SEKARANG (sebelum await apa pun)
      // supaya klik/submit kedua yg menyusul langsung tertolak.
      if (isGenerating) return;
      const text = getInputText();
      if (!text) return;
      isGenerating = true;
      clearInput();
      input.style.height = "auto";
      closeMobileMenu();
      const sessionAtStart = currentSessionId;
      const userBubble = bubble("chat-msg-user", highlightMentions(esc(text)), true);

      // Disable input & send button while waiting for Translation Picker
      input.contentEditable = "false";
      input.style.opacity = "0.6";
      input.style.cursor = "not-allowed";
      // Tampilkan instruksi di dalam input box
      input.textContent = isEN() ? "Please select a translation above..." : "Silakan pilih terjemahan di atas...";

      // Biarkan tombol kirim nyala (Panah Atas) -> buat Lanjut
      sendBtn.disabled = false;
      sendBtn.classList.remove("chat-stop");

      // Poin 4: pilih terjemahan utk @mention (picker hanya muncul kalau ada >1 terjemahan).
      // null = user batal -> kembalikan teks ke input, buang bubble user, reset state.
      const mentionPrefsForMsg = await resolveMentionPrefs(text);

      if (currentSessionId !== sessionAtStart || !isGenerating) return;

      input.contentEditable = "true";
      input.style.opacity = "";
      input.style.cursor = "text";
      input.textContent = ""; // Clear instruksi

      if (mentionPrefsForMsg === null) {
        userBubble.remove();
        setInputText(text);
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 140) + "px";
        isGenerating = false;
        if (!log.querySelector(".chat-msg")) renderEmptyState();
        return;
      }

      // Cakupan pencarian ditentukan backend (mention -> fokus sutta itu; tanpa mention ->
      // semantic luas). Pertanyaan "Fokus atau cari luas?" DIHAPUS: backend mengabaikannya
      // (redundan & membingungkan). Eksplorasi luas tetap tersedia lewat tombol "Cari sutta lain".

      userStopped = false;
      abortController = new AbortController();
      setSendMode(true);   // item 7: tombol Kirim -> Stop
      document.querySelectorAll(".chat-followup-chip, .btn-broad-search").forEach(c => c.disabled = true);
      const bot = bubble("chat-msg-bot",
        `<div class="chat-thinking-steps"></div><div class="chat-answer chat-typing" style="display:none;"></div>`, true);
      bot.classList.add("is-generating");  // gradient border shimmer
      const stepsContainer = bot.querySelector(".chat-thinking-steps");
      const status = bot.querySelector(".chat-answer");
      let currentStepEl = null;
      let accumulatedAnswer = "";
      let hasFirstChunk = false;
      // Base-id ref yg sudah tervalidasi dari step retrieval (found/tool) -> dipakai linkify
      // sitasi SAAT streaming, biar tombol rujukan muncul bertahap & cuma utk teks yg benar2 ada.
      const streamCiteBases = new Set();
      const addCiteBase = v => { const b = (v || "").split(":")[0].trim().toLowerCase(); if (b) streamCiteBases.add(b); };

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
          body: JSON.stringify({ message: text, history: historyToSend, stream: true, lang: isEN() ? "en" : "id", mention_prefs: mentionPrefsForMsg }),
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
              let labEn, labId, labTitle;
              if (obj.stage === "retrieve" && obj.query && !obj.label) {
                let qTrunc = obj.query.length > 50 ? obj.query.substring(0, 50).trim() + "..." : obj.query;
                labEn = "Searching the Tipiṭaka...";
                labId = "Menelusuri pustaka Tipiṭaka...";
                labTitle = "Query: " + qTrunc;
              } else if (obj.stage === "found" && obj.count !== undefined) {
                if (obj.count > 0) {
                  (obj.ids || []).forEach(addCiteBase);   // validasi ref utk linkify streaming
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
                  (obj.data.mentions || []).forEach(addCiteBase);
                  (obj.data.picks || []).forEach(p => addCiteBase(p.mention));
                  const ms = (Array.isArray(obj.data.picks) && obj.data.picks.length)
                    ? obj.data.picks.map(fmtPick).join(", ")
                    : obj.data.mentions.join(", ");
                  labEn = (obj.data.carried ? "Continuing text context: " : "Explicit reference detected: ") + ms;
                  labId = (obj.data.carried ? "Melanjutkan konteks teks: " : "Rujukan eksplisit terdeteksi: ") + ms;
                } else if (obj.data.kind === "glossary") {
                  const cs = (obj.data.collections || []).join(", ");
                  labEn = "Collection glossary: " + cs;
                  labId = "Glosari koleksi: " + cs;
                } else if (obj.data.kind === "name_match") {
                  (obj.data.names || []).forEach(addCiteBase);
                  const ns = obj.data.names.join(", ");
                  labEn = "Text name match: " + ns;
                  labId = "Kecocokan nama teks: " + ns;
                } else if (obj.data.kind === "pali_term") {
                  const cs = (obj.data.corrected || [])
                    .map(c => c.typed.toLowerCase() === c.as.toLowerCase() ? c.as : `${c.typed} → ${c.as}`)
                    .join(", ");
                  labEn = "Converting Pāḷi term(s): " + cs;
                  labId = "Mengonversi istilah Pāḷi: " + cs;
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
              if (labTitle) currentStepEl.title = labTitle;
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
              let hasFollowup = /\*\*\s*(Rekomendasi\s+Pertanyaan|Pertanyaan\s+(?:Lanjutan|Refleksi|Untuk|Terkait|Diskusi)|Recommended\s+Follow-up\s+Questions)[^*]*\*\*/i.test(displayAnswer);
              displayAnswer = displayAnswer.replace(/\*\*\s*(Rekomendasi\s+Pertanyaan|Pertanyaan\s+(?:Lanjutan|Refleksi|Untuk|Terkait|Diskusi)|Recommended\s+Follow-up\s+Questions)[^*]*\*\*[\s\S]*/gi, "");
              const filtered = enforceTheravadaTerms(displayAnswer);
              // Linkify rujukan SAAT streaming (progresif) — hanya base-id yg sudah tervalidasi
              // dari step retrieval; klik ditangani delegasi di `log`. Render final tetap
              // re-linkify dgn data hasil lengkap (renderBotAnswer).
              const streamedHtml = linkifyCitations(mdLite(filtered),
                base => streamCiteBases.has(base.toLowerCase()));
              status.innerHTML = streamedHtml + (hasFollowup ? loadingUI : "");
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

        // Hanya tampilkan sutta yang BENAR-BENAR dikutip LLM (relevan) di luar kotak "think".
        // Cocokkan juga base-id ("SN 20.9" dari "SN 20.9:md1") karena LLM menulis id dasar.
        const ansNoThink = ans.replace(/<think>[\s\S]*?<\/think>\n*/gi, "").replace(/<think>[\s\S]*$/gi, "");
        const finalResults = refineResults((final.results || []).filter(r => {
          if (r.mentioned) return true; // sutta yg di-mention user: selalu tampil
          if (!r.formatted_id) return false;
          const baseId = r.formatted_id.split(':')[0];
          return ansNoThink.includes(r.formatted_id) || ansNoThink.includes(baseId);
        }));

        renderBotAnswer(status, ans, finalResults);

        // Tombol "Cari teks lain" hanya muncul jika memang ada topik yang bisa dieksplorasi
        if (final && final.has_mention && final.total_results <= 2 && final.search_query) {
          // Bersihkan referensi sutta untuk mendapatkan topik murni
          const REF_RE = /@?\b(?:dn|mn|sn|an|kn|dhp|ud|iti|snp|vv|pv|thag|thig|bu-[a-z]+|bi-[a-z]+|pli-tv-[a-z-]+|ds|vb|dt|pp|kv|ya|patthana)\s*\d+(?:\.\d+)?(?:-\d+)?\b/gi;
          const stripRefs = s => (s || "").replace(REF_RE, " ").replace(/\s+/g, " ").trim();
          let topic = stripRefs(final.search_query) || stripRefs(final.query);

          // Hanya buat tombol jika topik tidak kosong
          if (topic) {
            const broadBtn = document.createElement("button");
            broadBtn.className = "btn-broad-search";
            broadBtn.innerHTML = `<i data-lucide="search" style="width:14px;height:14px;margin-right:6px;"></i><span class="js-broad-label"></span>`;
            setI18n(broadBtn.querySelector(".js-broad-label"), "Search other texts on this topic", "Cari teks lain tentang topik ini");
            broadBtn.disabled = isGenerating;

            broadBtn.addEventListener("click", () => {
              if (isGenerating) return;
              const searchMsg = isEN() ? `other texts about ${topic}` : `cari teks lain tentang ${topic}`;
              setInputText(searchMsg);
              input.style.height = "auto";
              send();
            });

            bot.appendChild(broadBtn);
            if (window.lucide) window.lucide.createIcons({ root: broadBtn });
          }
        }
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
            lbl.dataset.i18nEn = "Sādhu sādhu sādhu!";
            lbl.dataset.i18nId = "Sādhu sādhu sādhu!";
            lbl.textContent = isEN() ? "Sādhu sādhu sādhu!" : "Sādhu sādhu sādhu!";
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
        document.querySelectorAll(".chat-followup-chip, .btn-broad-search").forEach(c => c.disabled = false);
      }
    }

    // --- INITIALIZATION ---
    try {
      const stored = localStorage.getItem("dhammachat_sessions");
      if (stored) {
        const data = JSON.parse(stored);
        sessions = data.sessions || [];
        // Ini bagian inget kebuka apa terakhir:
        // currentSessionId = data.activeId || null; 

        // Ganti jadi selalu null saat baru load:
        currentSessionId = null;
      }
    } catch (e) { console.warn("Failed to load chat history", e); }

    const urlParams = new URLSearchParams(window.location.search);
    const urlId = urlParams.get("id");

    if (urlId) {
      const found = sessions.find(x => x.id === urlId);
      if (found) {
        currentSessionId = found.id;
      } else {
        const msg = isEN() ? "Chat session not found" : "Sesi obrolan tidak ditemukan";
        if (window.DK && DK.showToast) DK.showToast(msg, 3000);
        else if (window.showToast) window.showToast(msg);
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
          // Letakkan kursor di akhir
          const sel = window.getSelection();
          const range = document.createRange();
          if (input.lastChild) {
            range.setStartAfter(input.lastChild);
          } else {
            range.setStart(input, 0);
          }
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
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
      };
      if (prefersReduced()) { setInputText(text); sizeAndSync(); finishFocus(); return; }
      clearInput();
      let i = 0;
      (function step() {
        setInputText(text.slice(0, ++i));
        sizeAndSync();
        if (i < text.length) setTimeout(step, speed);
        else finishFocus();
      })();
    }


    if (prefillInput || prefillTagParam) {
      // Selalu mulai room baru biar konteks bersih (kecuali room skrg msh kosong). Hanya
      // MENGISI kotak (animasi ketik/masukin chip); TIDAK auto-kirim (user edit dulu).
      if (history.length > 0) createNewSession(true, true, true);
      
      if (prefillTagParam) {
        clearInput();
        const chip = document.createElement('span');
        chip.className = 'chat-mention-chip';
        chip.contentEditable = 'false';
        chip.textContent = `@${prefillTagParam}`;
        input.appendChild(chip);
        
        const space = document.createTextNode('\u00A0');
        input.appendChild(space);
        
        if (window.innerWidth > 768) {
          input.focus();
          const sel = window.getSelection();
          const range = document.createRange();
          range.setStartAfter(space);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        setSendMode(false);
      } else {
        typeIntoInput(prefillInput);
      }

      const chatInputWrap = container.querySelector(".chat-input-wrap");
      if (chatInputWrap) {
        chatInputWrap.classList.remove("prefill-pulse");
        void chatInputWrap.offsetWidth; // trigger reflow
        chatInputWrap.classList.add("prefill-pulse");
      }
      if (sendBtn) {
        sendBtn.classList.remove("prefill-pulse");
        void sendBtn.offsetWidth;
        sendBtn.classList.add("prefill-pulse");
      }
    } else {
      if (window.innerWidth > 768) {
        setTimeout(() => input.focus(), 100);
      }
    }

    return { send, history };
  }

  window.DhammaChat = { mount };
})();
