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
        [/\bPratityasamutpada\b/gi, "paṭiccasamuppāda"]
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
        if (await window.DK.confirm(msg, { danger: true })) {
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
      <div class="chat-mobile-header">
        <button type="button" id="btn-mobile-menu"><i data-lucide="menu"></i></button>
        <span class="chat-mobile-title">myDhamma AI Chat</span>
        <button type="button" id="btn-mobile-new"><i data-lucide="edit"></i></button>
      </div>
      <div class="chat-sidebar-overlay"></div>
      <div class="chat-sidebar">
         <button type="button" id="btn-new-chat" class="btn-primary" style="margin-bottom: 16px; border-radius: 6px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px;">
            <i data-lucide="plus" style="width:16px; height:16px;"></i> <span data-i18n="btn_new_chat">${isEN() ? "New Chat" : "Obrolan Baru"}</span>
         </button>
         <h4 style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px; font-weight: 600; letter-spacing: 0.05em; padding-left: 4px;" data-i18n="history_divider">${isEN() ? "History" : "Riwayat"}</h4>
         <div id="chat-session-list" style="display: flex; flex-direction: column; overflow-y: auto; flex-grow: 1;"></div>
      </div>
      <div class="chat-widget-area">
        <div class="chat-widget">
          <div class="chat-log"></div>
          <form class="chat-input-row" autocomplete="off" style="border-top: 1px solid var(--border); position: relative;">
            <div id="chat-mention-popup" class="chat-mention-popup"></div>
            <div class="chat-input-wrap">
              <div class="chat-input-backdrop" aria-hidden="true"></div>
              <textarea class="chat-input" rows="1" placeholder="${esc(opts.placeholder || (isEN() ? 'e.g. why do I keep suffering?' : 'mis. kenapa ya aku menderita terus?'))}"></textarea>
            </div>
            <button type="submit" class="btn-primary chat-send">${esc(tt("btn_send", "Kirim"))}</button>
          </form>
          <div class="chat-disclaimer">${esc(tt("chat_disclaimer", "⚠ Eksperimental — mungkin membuat kesalahan dalam menyimpulkan; selalu periksa rujukannya."))}</div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons({ root: container });

    // ── Live i18n update saat user switch bahasa ──
    function applyLangToChat() {
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
      if (sendBtn) sendBtn.textContent = tt("btn_send", isEN() ? "Send" : "Kirim");
      // Placeholder textarea
      const chatInput = container.querySelector(".chat-input");
      if (chatInput && !opts.placeholder) {
        chatInput.placeholder = isEN() ? "e.g. why do I keep suffering?" : "mis. kenapa ya aku menderita terus?";
      }
      // Disclaimer
      const disc = container.querySelector(".chat-disclaimer");
      if (disc) disc.textContent = tt("chat_disclaimer",
        isEN()
          ? "⚠ Experimental — may make mistakes; always check the citations."
          : "⚠ Eksperimental — mungkin membuat kesalahan; selalu periksa rujukannya.");
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

    if (btnMobileMenu) btnMobileMenu.addEventListener("click", toggleMobileMenu);
    if (overlay) overlay.addEventListener("click", closeMobileMenu);
    if (btnMobileNew) btnMobileNew.addEventListener("click", () => {
      createNewSession();
      closeMobileMenu();
    });

    const log = container.querySelector(".chat-log");
    const form = container.querySelector(".chat-input-row");
    const input = container.querySelector(".chat-input");
    const sendBtn = container.querySelector(".chat-send");
    const sessionListEl = container.querySelector("#chat-session-list");
    const btnNewChat = container.querySelector("#btn-new-chat");

    // --- SIDEBAR UI LOGIC ---
    function renderSidebar() {
      sessionListEl.innerHTML = "";
      sessions.forEach(s => {
        const item = document.createElement("div");
        item.className = "chat-session-item" + (s.id === currentSessionId ? " active" : "");
        item.innerHTML = `<span class="chat-session-title">${esc(s.title)}</span>
                          <button class="chat-session-delete" title="Hapus Obrolan"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>`;
        item.addEventListener("click", async (e) => {
          if (e.target.closest(".chat-session-delete")) {
            e.stopPropagation();
            if (s.id === currentSessionId) {
              const canSwitch = await checkAndCancelGeneration();
              if (!canSwitch) return;
            }
            const msg = isEN() ? "Delete this chat session?" : "Hapus obrolan ini?";
            if (!(await window.DK.confirm(msg, { danger: true }))) return;

            sessions = sessions.filter(x => x.id !== s.id);
            if (currentSessionId === s.id) {
              currentSessionId = sessions.length > 0 ? sessions[0].id : null;
              if (!currentSessionId) createNewSession();
              else switchSession(currentSessionId);
            } else {
              saveSessions();
            }
            return;
          }
          if (s.id !== currentSessionId) {
            const canSwitch = await checkAndCancelGeneration();
            if (!canSwitch) return;
            switchSession(s.id);
            closeMobileMenu();
          }
        });
        sessionListEl.appendChild(item);
      });
      if (window.lucide) window.lucide.createIcons({ root: sessionListEl });
    }

    function saveSessions() {
      localStorage.setItem("dhammachat_sessions", JSON.stringify({ activeId: currentSessionId, sessions }));
      renderSidebar();
    }

    function createNewSession(doRender = true) {
      currentSessionId = Date.now().toString();
      sessions.unshift({
        id: currentSessionId,
        title: isEN() ? "New Chat" : "Obrolan Baru",
        updatedAt: Date.now(),
        history: []
      });
      history = [];
      if (doRender) {
        saveSessions();
        log.innerHTML = "";
        if (opts.prefill && input) {
          input.value = "";
          opts.prefill = null;
        }
      }
    }

    function switchSession(id) {
      currentSessionId = id;
      const s = sessions.find(x => x.id === id);
      history = s ? s.history : [];
      log.innerHTML = "";
      saveSessions();
      restoreHistory();
    }

    function updateCurrentSession() {
      const s = sessions.find(x => x.id === currentSessionId);
      if (s) {
        s.history = history;
        s.updatedAt = Date.now();
        // Generate title dynamically if it's the first message
        if (s.title === "Obrolan Baru" || s.title === "New Chat") {
          const firstUserMsg = history.find(h => h.role === "user");
          if (firstUserMsg) {
            let t = firstUserMsg.content.trim();
            s.title = t.length > 30 ? t.slice(0, 30) + "..." : t;
          }
        }
      }
      saveSessions();
    }

    const mentionPopup = container.querySelector("#chat-mention-popup");
    let mentionActiveIndex = 0;
    let currentMentionMatch = null;

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
      // Satu endpoint /api/mentionable -> daftar LENGKAP teks kanonik (koleksi + tiap sutta
      // yg punya file), sudah terformat server-side (MN 10, DN 22, dll).
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
      } catch (e) {
        console.warn("Failed to load dynamic mention data", e);
      }
    }
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
      let filtered = pool.filter(s => {
        const aSpace = s.abbr.toLowerCase();
        const aNoSpace = aSpace.replace(/\s+/g, "");
        const n = s.name.toLowerCase();
        return aNoSpace.startsWith(qNoSpace) || aSpace.startsWith(q) || n.includes(q);
      });

      // Limit to 50 items so the DOM doesn't get sluggish
      filtered = filtered.slice(0, 50);

      if (filtered.length === 0) {
        mentionPopup.classList.remove("show");
        return;
      }
      mentionActiveIndex = -1; // start with no selection; first sutta item gets selected below
      mentionPopup.innerHTML = filtered.map((s, i) => {
        if (s.isCollection) {
          // Non-selectable header — hanya petunjuk, user harus ketik angka
          return `<div class="chat-mention-item chat-mention-header" data-iscol="1" title="Ketik nomor, misal ${s.abbr} 10">
            <span class="chat-mention-abbr">${s.abbr}</span>
            <span class="chat-mention-name">${s.name} <span class="chat-mention-hint">← ketik nomor</span></span>
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
        el.addEventListener("click", () => selectMention(el.dataset.abbr, false));
        el.addEventListener("mouseenter", () => {
          allItems.forEach(e => e.classList.remove("active"));
          el.classList.add("active");
          mentionActiveIndex = i;
        });
      });
    }

    function selectMention(abbr, isCollection) {
      if (!currentMentionMatch) return;
      const val = input.value;
      const before = val.substring(0, currentMentionMatch.start);
      const after = val.substring(currentMentionMatch.end);
      // Kalau cuma milih koleksi (MN), kasih spasi biar user ngetik angkanya.
      // Kalau milih Sutta (MN 10), kasih spasi juga buat lanjut ngetik kalimatnya.
      const insert = `@${abbr} `;
      input.value = before + insert + after;
      mentionPopup.classList.remove("show");
      input.focus();
      input.setSelectionRange(before.length + insert.length, before.length + insert.length);
      currentMentionMatch = null;
      syncBackdrop();
    }

    btnNewChat.addEventListener("click", async () => {
      const canSwitch = await checkAndCancelGeneration();
      if (!canSwitch) return;
      createNewSession(true);
      input.focus();
    });

    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 140) + "px";
      syncBackdrop();

      const val = input.value;
      const cursorPos = input.selectionStart;
      const textBeforeCursor = val.substring(0, cursorPos);
      // \.\.\d* — izinkan titik trailing (misal @Snp1.) agar popup tetap tampil
      const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z\-]+(?:\s*\d+(?:\.\d*)?)?)$/);

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
      if (mentionPopup.classList.contains("show")) return; // Cegah submit kalau masih milih mention
      send();
    });



    // Warn before leaving page if generating
    window.addEventListener("beforeunload", (e) => {
      if (isGenerating) {
        e.preventDefault();
        e.returnValue = "";
      }
    });

    // Step 2: Pre-fill input
    let autoSendQuery = null;
    let prefillTag = null;
    const _params = new URLSearchParams(window.location.search);
    const qParam = _params.get("q");
    const tagParam = _params.get("tag");   // ?tag=MN 10 -> buka room baru + tag sutta (tanpa auto-kirim)
    if (qParam) {
      input.value = qParam;
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 140) + "px";
      autoSendQuery = qParam;
      window.history.replaceState({}, document.title, "/chat");
    } else if (tagParam) {
      prefillTag = "@" + tagParam.trim() + " ";
      window.history.replaceState({}, document.title, "/chat");
    }

    // Filter Bahasa/Piṭaka manual DIHAPUS — agen menentukan scope (language/pitaka) sendiri
    // lewat argumen tool search_sutta, jadi toggle UI redundan & membingungkan.

    // Bungkus @mention (mis. @MN 10, @Bu-Pj 1, @SN 56.11) dgn span ber-class `cls`.
    // Input = teks yg SUDAH di-HTML-escape.
    function markMentions(escaped, cls) {
      return escaped.replace(
        /@([A-Za-z]+(?:-[A-Za-z]+)?\s?\d[\d.\-]*)/g,
        (_m, ref) => `<span class="${cls}">@${ref}</span>`
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
    }
    if (inputBackdrop) {
      // Aktifkan overlay (teks textarea jadi transparan) HANYA bila backdrop ada & JS jalan.
      inputBackdrop.parentElement.classList.add("mention-overlay");
      input.addEventListener("scroll", syncBackdrop);
      syncBackdrop();
    }

    function bubble(cls, html) {
      const el = document.createElement("div");
      el.className = "chat-msg " + cls;
      el.innerHTML = html;
      log.appendChild(el);
      el.scrollIntoView({ behavior: "smooth", block: "end" });
      el.scrollIntoView({ behavior: "smooth", block: "end" });
      return el;
    }

    function saveHistory() {
      try {
        localStorage.setItem("dhammachat_history", JSON.stringify(history));
      } catch (e) { console.warn("Failed to save chat history", e); }
    }

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
    }

    function renderBotAnswer(botElement, answerText, results) {
      answerText = answerText || "";
      let thinks = [];
      let textWithoutThink = answerText.replace(/<think>([\s\S]*?)<\/think>\n*/gi, function(match, p1) {
          thinks.push(mdLite(p1));
          return `__THINK_BLOCK_${thinks.length - 1}__\n`;
      }).replace(/<think>([\s\S]*)$/gi, function(match, p1) {
          thinks.push(mdLite(p1));
          return `__THINK_BLOCK_${thinks.length - 1}_OPEN__\n`;
      });
      
      let filteredAns = enforceTheravadaTerms(textWithoutThink);
      let ansHtml = mdLite(filteredAns);
      
      ansHtml = ansHtml.replace(/<p>__THINK_BLOCK_(\d+)__<\/p>/gi, function(match, idx) {
          return `<details class="chat-think"><summary>🤔 Proses Berpikir AI...</summary><div class="chat-think-content">${thinks[idx]}</div></details>\n`;
      }).replace(/__THINK_BLOCK_(\d+)__/gi, function(match, idx) {
          return `<details class="chat-think"><summary>🤔 Proses Berpikir AI...</summary><div class="chat-think-content">${thinks[idx]}</div></details>\n`;
      }).replace(/<p>__THINK_BLOCK_(\d+)_OPEN__<\/p>/gi, function(match, idx) {
          return `<details class="chat-think" open><summary>🤔 Sedang Berpikir...</summary><div class="chat-think-content">${thinks[idx]}</div></details>\n`;
      }).replace(/__THINK_BLOCK_(\d+)_OPEN__/gi, function(match, idx) {
          return `<details class="chat-think" open><summary>🤔 Sedang Berpikir...</summary><div class="chat-think-content">${thinks[idx]}</div></details>\n`;
      });

      ansHtml = ansHtml.replace(/([A-Za-z\-]+\s+\d+(?:\.\d+)*(?:-\d+)?)(?::[a-zA-Z0-9\.\-]+)?(?:\s*\([a-z]{2,3}\/[^)]+\))?/gi, (match, bookId) => {
        if (match.trim() === bookId.trim()) {
          const found = results.some(r => r.formatted_id.toLowerCase() === bookId.trim().toLowerCase() || r.sutta_id.toLowerCase() === bookId.trim().toLowerCase());
          if (!found) return match;
        }
        return `<button type="button" class="chat-inline-cite" data-target="${esc(bookId.trim())}">${esc(match)}</button>`;
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
            Array.from(nextEl.querySelectorAll("li")).forEach(li => {
              const btn = document.createElement("button");
              btn.className = "chat-followup-chip";
              btn.textContent = li.textContent.trim();
              
              btn.onclick = () => {
                input.value = btn.textContent;
                input.style.height = "auto";
                if(typeof syncBackdrop === 'function') syncBackdrop();
                input.focus();
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
          let found = null;
          botElement.parentElement.querySelectorAll(".sutta-card-link").forEach(l => {
            if (l.textContent.includes(target)) found = l.closest(".sutta-card");
          });
          if (found) {
            found.scrollIntoView({ behavior: "smooth", block: "center" });
            found.style.boxShadow = "0 0 0 2px var(--accent)";
            setTimeout(() => found.style.boxShadow = "", 2000);
          }
        });
      });
      // Render tombol aksi (+ Catatan) untuk teks jawaban terlebih dahulu 
      // agar posisinya berada di atas heading Rujukan (di pojok kanan bawah teks jawaban)
      renderAnswerActions(botElement, answerText);

      if (results && results.length > 0) {
        // Filter: hanya tampilkan sutta yang benar-benar dikutip/disebut di teks jawaban
        const citedResults = results.filter(s => {
          if (s.mentioned) return true; // sutta yg di-mention user: selalu tampil
          if (!s.formatted_id) return false;
          const baseId = s.formatted_id.split(':')[0]; // misal "SN 20.9" dari "SN 20.9:md1"
          return answerText.includes(s.formatted_id) || answerText.includes(baseId);
        });

        if (citedResults.length > 0) {
          renderCitations(botElement, citedResults);
        }
      }

      // Pasang kontainer follow-up di PALING BAWAH (setelah rujukan)
      if (followUpContainer) {
        botElement.appendChild(followUpContainer);
      }
    }

    // Tombol simpan JAWABAN (teks) ke Catatan — reuse panel Catatan asli via DK.
    function renderAnswerActions(parent, answerText) {
      const actions = document.createElement("div");
      actions.className = "chat-answer-actions";

      const btn = document.createElement("button");
      btn.className = "btn-add-note";
      btn.textContent = tt("btn_add_note", "+ Catatan");
      btn.addEventListener("click", () => {
        const block = { type: "text", content: answerText };
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
          const header = card.querySelector(".sutta-card-meta") || card.querySelector(".sutta-card-header");
          if (!header) return;
          const askBtn = document.createElement("button");
          askBtn.className = "btn-ask-again";
          askBtn.innerHTML = `<i data-lucide="reply"></i>`;
          askBtn.title = isEN() ? "Ask about this sutta again" : "Tanyakan sutta ini lagi";
          askBtn.addEventListener("click", () => {
            input.value = "@" + (sutta.formatted_id || sutta.sutta_id || "") + " ";
            input.style.height = "auto";
            input.style.height = Math.min(input.scrollHeight, 140) + "px";
            syncBackdrop();
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
            input.scrollIntoView({ behavior: "smooth", block: "nearest" });
          });
          header.insertBefore(askBtn, header.firstChild); // kiri label kitab/badge
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

    const STAGE = {
      understand: isEN() ? "Understanding the question…" : "Memahami pertanyaan…",
      retrieve: isEN() ? "Searching the suttas…" : "Menelusuri sutta yang relevan…",
      generate: isEN() ? "Composing the answer…" : "Menyusun jawaban…",
    };

    async function send() {
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      input.style.height = "auto";
      syncBackdrop();
      sendBtn.disabled = true;
      closeMobileMenu();
      bubble("chat-msg-user", highlightMentions(esc(text)));
      const bot = bubble("chat-msg-bot",
        `<div class="chat-thinking-steps"></div><div class="chat-answer chat-typing" style="display:none;"></div>`);
      const stepsContainer = bot.querySelector(".chat-thinking-steps");
      const status = bot.querySelector(".chat-answer");
      let currentStepEl = null;
      let accumulatedAnswer = "";
      let hasFirstChunk = false;

      // Ensure we don't send massive history
      const historyToSend = history.map(h => ({ role: h.role, content: h.content })).slice(-6);

      history.push({ role: "user", content: text });
      updateCurrentSession();

      isGenerating = true;
      abortController = new AbortController();

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, history: historyToSend, stream: true, lang: isEN() ? "en" : "id" }),
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
                currentStepEl.querySelector(".step-icon").innerHTML = `<i data-lucide="check" style="width:14px;height:14px;color:var(--text-success);"></i>`;
                if (window.lucide) window.lucide.createIcons({ root: currentStepEl });
              }
              let label = obj.label || STAGE[obj.stage] || obj.stage;
              if (obj.stage === "retrieve" && obj.query && !obj.label)
                label = (isEN() ? "Processing: " : "Memproses: ") + "“" + obj.query + "”…";

              currentStepEl = document.createElement("div");
              currentStepEl.className = "chat-thinking-step step-loading";
              currentStepEl.innerHTML = `<span class="step-icon"><i data-lucide="loader-circle" class="lucide-spin" style="width:14px;height:14px;color:var(--text-muted);"></i></span> <span class="step-label">${esc(label)}</span>`;
              stepsContainer.appendChild(currentStepEl);
              if (window.lucide) window.lucide.createIcons({ root: currentStepEl });
            } else if (obj.type === "chunk") {
              if (currentStepEl) {
                currentStepEl.style.display = "none";
                stepsContainer.classList.add("thinking-done");
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
              const loadingUI = `\n\n<div class="chat-thinking-step step-loading" style="margin-top:16px; padding:8px 0;"><span class="step-icon" style="display:inline-block; vertical-align:middle; margin-right:6px;"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide-spin" style="color:var(--text-muted);"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></span> <span class="step-label" style="font-size:0.85rem; color:var(--text-muted); vertical-align:middle;">${isEN() ? "Preparing follow-up questions..." : "Menyiapkan rekomendasi pertanyaan..."}</span></div>\n\n`;
              let hasFollowup = /\*\*Rekomendasi Pertanyaan Lanjutan:\*\*/i.test(displayAnswer) || /\*\*Recommended Follow-up Questions:\*\*/i.test(displayAnswer);
              displayAnswer = displayAnswer.replace(/\*\*(Rekomendasi Pertanyaan Lanjutan|Recommended Follow-up Questions):\*\*[\s\S]*/gi, "");
              const filtered = enforceTheravadaTerms(displayAnswer);
              status.innerHTML = mdLite(filtered) + (hasFollowup ? loadingUI : "");
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
        const finalResults = (final.results || []).filter(r => {
          if (r.mentioned) return true; // sutta yg di-mention user: selalu tampil
          if (!r.formatted_id) return false;
          const baseId = r.formatted_id.split(':')[0];
          return ans.includes(r.formatted_id) || ans.includes(baseId);
        });

        renderBotAnswer(status, ans, finalResults);

        // Tandai step TERAKHIR (generate) selesai — kalau tidak, spinner-nya nyangkut
        // muter terus (step baru ditandai ✓ saat step berikutnya muncul, tapi generate
        // tak punya penerus).
        if (currentStepEl) {
          currentStepEl.classList.remove("step-loading");
          currentStepEl.classList.add("step-done");
          const ic = currentStepEl.querySelector(".step-icon");
          if (ic) ic.innerHTML = `<i data-lucide="check" style="width:14px;height:14px;color:var(--text-success);"></i>`;
          currentStepEl = null;
        }

        // Setelah jawaban tampil: lipat semua langkah proses (understand/retrieve/dst)
        // jadi spoiler <details> tertutup yg bisa dibuka-tutup — transparan tapi ringkas.
        if (stepsContainer && stepsContainer.children.length &&
            !stepsContainer.querySelector(".chat-steps-spoiler")) {
          const steps = Array.from(stepsContainer.children);
          const det = document.createElement("details");
          det.className = "chat-steps-spoiler";
          det.style.cssText = "margin:0 0 8px; font-size:0.8rem;";
          const sum = document.createElement("summary");
          sum.style.cssText = "cursor:pointer; color:var(--text-muted); font-weight:500; list-style:none; display:flex; align-items:center; gap:6px; user-select:none;";
          sum.innerHTML = `<i data-lucide="sparkles" style="width:13px;height:13px;"></i> ${isEN() ? "How myDhamma AI worked" : "Proses myDhamma AI"} <span style="opacity:.6;">(${steps.length} ${isEN() ? "steps" : "langkah"})</span>`;
          const body = document.createElement("div");
          body.style.cssText = "margin-top:6px; padding-left:8px; border-left:2px solid var(--border);";
          steps.forEach(s => { s.style.display = ""; body.appendChild(s); });
          det.appendChild(sum);
          det.appendChild(body);
          stepsContainer.appendChild(det);
          if (window.lucide) window.lucide.createIcons({ root: det });
        }

        history.push({ role: "assistant", content: ans, results: finalResults });
        updateCurrentSession();

      } catch (err) {
        if (err.name === "AbortError") {
          status.remove();
          return;
        }
        status.style.display = "";
        status.className = "chat-answer chat-error";
        status.textContent = isEN() ? "Error: " + err.message : "Terjadi kesalahan: " + err.message;
      } finally {
        isGenerating = false;
        abortController = null;
        sendBtn.disabled = false;
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

    if (!sessions || sessions.length === 0) {
      createNewSession(false);
    } else if (!currentSessionId) {
      currentSessionId = sessions[0].id;
    }

    const initialSession = sessions.find(x => x.id === currentSessionId);
    if (initialSession) {
      history = initialSession.history || [];
      restoreHistory();
    }
    renderSidebar();

    if (autoSendQuery) {
      if (history.length > 0) {
        createNewSession(true);
        input.value = autoSendQuery;
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 140) + "px";
      }
      setTimeout(() => form.requestSubmit(), 100);
    } else if (prefillTag) {
      // Selalu mulai room baru biar konteks sutta yg di-tag bersih (kecuali room skrg msh kosong).
      if (history.length > 0) createNewSession(true);
      input.value = prefillTag;
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 140) + "px";
      syncBackdrop();
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }

    return { send, history };
  }

  window.DhammaChat = { mount };
})();
