/* ============================================================
   myDhamma — Browse Page
   Shared logic (theme, source, notes, resize) lives in common.js
   ============================================================ */

(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);

  const dom = {
    browseLoading: $("#browse-loading"),
    browseTree: $("#browse-tree"),
  };

  const state = {
    browseData: null,
    suttaNames: {},
    loadedPitakas: new Set(),   // piṭaka yg nama-nya sudah di-load (lazy per-piṭaka)
    unavailable: new Set(),     // leaf id tanpa teks (rute /<id> 404) -> link di-disable
  };

  // Load nama untuk SATU piṭaka, lalu tempel ke node yg sudah ter-render. Dipanggil
  // saat piṭaka pertama kali di-expand -> buka Sutta gak narik nama Vinaya/Abhidhamma.
  function ensurePitakaNames(pitaka) {
    if (!pitaka || state.loadedPitakas.has(pitaka)) return Promise.resolve();
    state.loadedPitakas.add(pitaka);
    return fetch(`/api/sutta-names/${encodeURIComponent(pitaka)}`)
      .then(r => r.ok ? r.json() : {})
      .then(names => { Object.assign(state.suttaNames, names || {}); applyNames(); })
      .catch(() => { state.loadedPitakas.delete(pitaka); });   // izinkan retry
  }

  // Tempel nama ke node yg SUDAH ter-render (race: nama datang setelah node dibuat).
  // Node yg di-render SETELAH nama ada otomatis kebaca dari state.suttaNames.
  function applyNames() {
    const names = state.suttaNames || {};
    dom.browseTree.querySelectorAll(".browse-sutta-row[data-browse-id]").forEach(row => {
      const nm = names[row.dataset.browseId];
      if (!nm) return;
      const link = row.querySelector(".browse-sutta-link");
      if (link && !link.querySelector(".browse-sutta-name")) {
        link.appendChild(document.createTextNode(" "));
        const sp = document.createElement("span");
        sp.className = "browse-sutta-name";
        sp.textContent = nm;
        link.appendChild(sp);
      }
    });
    dom.browseTree.querySelectorAll(".browse-node-label[data-label-id] .anak").forEach(lbl => {
      const nm = names[lbl.dataset.labelId];
      if (nm) lbl.textContent = nm;
    });
  }

  // ========== Browse ==========
  async function loadBrowseTree() {
    dom.browseLoading.classList.remove("hidden");
    dom.browseTree.classList.add("hidden");
    try {
      const res = await fetch("/api/browse");
      if (!res.ok) throw new Error("Failed to load browse tree");
      state.browseData = await res.json();

      // Leaf tanpa teks (rute /<id> = 404) -> di-disable saat render. Non-kritis:
      // gagal fetch = anggap semua tersedia (tree tetap render). WAJIB sebelum renderBrowseTree.
      try {
        const ur = await fetch("/api/browse-unavailable");
        if (ur.ok) state.unavailable = new Set(((await ur.json()) || {}).unavailable || []);
      } catch (_) { /* biarkan kosong */ }

      // Render tree TANPA nama (payload kecil) TAPI masih HIDDEN. Deep-link (?browse=<id>)
      // expand path-nya DI BALIK skeleton dulu -> reveal baru setelah path beneran ke-expand
      // (+ nama piṭaka target ke-load via ensurePitakaNames), biar ga keliatan janky/lag pas
      // expand. rAF-scroll di highlightBrowseItem fire SETELAH reveal jadi tetap nge-scroll bener.
      renderBrowseTree();
      const browseParam = new URLSearchParams(window.location.search).get("browse");
      if (browseParam) {
        try { await highlightBrowseItem(decodeURIComponent(browseParam)); }
        catch (_) { /* highlight non-kritis -> tetap reveal tree */ }
      }
      dom.browseLoading.classList.add("hidden");
      dom.browseTree.classList.remove("hidden");
    } catch (e) {
      console.error("Browse error:", e);
      const errLabel = (window.DK && window.DK.t) ? window.DK.t("error_prefix") : "Error";
      dom.browseLoading.innerHTML = `<div class="empty-icon"><i data-lucide="triangle-alert"></i></div><p>${errLabel}: ${e.message}</p>`;
      if (window.refreshIcons) refreshIcons();
    }
  }

  function renderBrowseTree() {
    dom.browseTree.innerHTML = "";
    if (!state.browseData) return;

    const pitakas = ["sutta", "vinaya", "abhidhamma"];
    const names = state.suttaNames || {};

    function displayName(key) {
      return names[key] || key.toUpperCase();
    }

    function displayId(id) {
      let shortK = String(id).trim().toLowerCase().replace(/^pli-tv-/, "");
      shortK = shortK.replace(/^(bu|bi)-vb-/, "$1-");

      const match = shortK.match(/^([a-z\-]+?)([0-9].*)$/i);
      if (match) {
        let prefix = match[1];
        let num = match[2];
        if (["dn", "mn", "sn", "an"].includes(prefix.toLowerCase())) {
          return prefix.toUpperCase() + " " + num;
        }
        prefix = prefix.split("-").map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("-");
        return prefix + " " + num;
      }

      if (["dn", "mn", "sn", "an"].includes(shortK.toLowerCase())) {
        return shortK.toUpperCase();
      }
      return shortK.split("-").map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("-");
    }

    // Leaf TERAWAL & TERAKHIR (utk range "DN 1–34") tanpa kumpulin SEMUA leaf -> O(kedalaman),
    // bukan O(seluruh subtree). collectLeafIds lama boros alokasi (spread rekursif) utk nikaya
    // gede (AN ~9000 sutta) padahal range cuma butuh ujung-ujungnya.
    function firstLeaf(n) {
      if (Array.isArray(n)) { for (const it of n) { const r = firstLeaf(it); if (r) return r; } return null; }
      if (typeof n === "string") return n;
      if (n && typeof n === "object") { for (const v of Object.values(n)) { const r = firstLeaf(v); if (r) return r; } }
      return null;
    }
    function lastLeaf(n) {
      if (Array.isArray(n)) { for (let i = n.length - 1; i >= 0; i--) { const r = lastLeaf(n[i]); if (r) return r; } return null; }
      if (typeof n === "string") return n;
      if (n && typeof n === "object") { const vs = Object.values(n); for (let i = vs.length - 1; i >= 0; i--) { const r = lastLeaf(vs[i]); if (r) return r; } }
      return null;
    }

    // Accordion: close sibling groups when opening one
    function closeSiblings(el) {
      const parent = el.parentElement;
      if (!parent) return;
      for (const sib of parent.children) {
        if (sib === el) continue;
        const sh = sib.querySelector(":scope > .browse-nikaya-header, :scope > .browse-vagga-header");
        const sb = sib.querySelector(":scope > .browse-nikaya-body, :scope > .browse-vagga-body");
        if (sh) sh.classList.remove("open");
        if (sb) sb.classList.remove("open");
      }
    }

    // Anti-loncat saat expand (accordion nutup sibling di ATAS bikin konten nyusut ->
    // node yg baru dibuka melompat, user kehilangan posisi). Expand instan (display
    // toggle, tanpa animasi) jadi bisa dikoreksi 1 task tanpa flicker:
    //   1) ANCHOR sinkron: batalkan pergeseran header -> loncatan tak pernah ke-paint.
    //   2) GLIDE halus: kalau header ke-dorong ke atas viewport (<8px) atau kepepet di
    //      bawah (>40% tinggi kontainer, anak-anak kepotong), luncurkan ke ~14px dari atas
    //      biar node + isinya kelihatan. Kalau sudah nyaman di atas, diam (tak over-scroll).
    // `before` = header.getBoundingClientRect().top yg DIUKUR SEBELUM mutasi buka.
    function anchorAndGlide(header, before) {
      const scroller = document.getElementById("search-scroll");
      if (!scroller) return;
      scroller.scrollTop += header.getBoundingClientRect().top - before;
      const smooth = (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
        ? "auto" : "smooth";
      requestAnimationFrame(() => {
        const s = scroller.getBoundingClientRect();
        const hTop = header.getBoundingClientRect().top - s.top;
        if (hTop < 8 || hTop > s.height * 0.4) scroller.scrollBy({ top: hTop - 14, behavior: smooth });
      });
    }

    function buildNodes(parent, arr) {
      if (!Array.isArray(arr)) return;
      arr.forEach(item => {
        if (typeof item === "string") {
          const sLink = document.createElement("div"); sLink.className = "browse-sutta-row";
          sLink.dataset.browseId = item;
          const sName = (state.suttaNames || {})[item];

          function toShortId(id) {
            let s = String(id).trim().toLowerCase().replace(/^pli-tv-/, "").replace(/^(bu|bi)-vb-/, "$1-");
            return s;
          }

          // Sutta ID and Name (links to suttaplex). Leaf tanpa teks -> <span> non-klik (link 404).
          const dead = state.unavailable && state.unavailable.has(item);
          const mainLink = document.createElement(dead ? "span" : "a");
          mainLink.className = "browse-sutta-link" + (dead ? " unavailable" : "");
          if (dead) {
            mainLink.setAttribute("aria-disabled", "true");
            mainLink.title = (window.DK && window.DK.t) ? window.DK.t("browse_unavailable") : "Teks belum tersedia";
          } else {
            mainLink.href = `/${toShortId(item)}`;
          }
          mainLink.innerHTML = `<span class="browse-sutta-id">${displayId(item)}</span>` + (sName ? ` <span class="browse-sutta-name">${sName}</span>` : "");
          sLink.appendChild(mainLink);

          parent.appendChild(sLink);
        } else if (typeof item === "object") {
          Object.keys(item).forEach(key => parent.appendChild(createGroupNode(key, item[key])));
        }
      });
    }

    function createGroupNode(name, childrenArr) {
      const gEl = document.createElement("div"); gEl.className = "browse-vagga";
      gEl.dataset.browseId = name;
      const gHead = document.createElement("div"); gHead.className = "browse-vagga-header";

      // Determine display name using suttaNames, fallback to regex format
      let label = (state.suttaNames || {})[name];
      if (!label) {
        label = name.replace(/^[a-z0-9]+-/, "").replace(/-/g, " ");
        label = label.charAt(0).toUpperCase() + label.slice(1);
      }

      // Show range of sutta IDs
      const _first = firstLeaf(childrenArr), _last = lastLeaf(childrenArr);
      let rangeHtml = "";
      if (_first) {
        const df = displayId(_first), dl = displayId(_last);
        if (_first === _last) {
          rangeHtml = ` <span class="browse-vagga-range">${df}</span>`;
        } else {
          const spaceIdx = df.indexOf(" ");
          let dfDisplay = df, suffix = dl;
          if (spaceIdx > 0 && dl.startsWith(df.slice(0, spaceIdx + 1))) {
            const pfx = df.slice(0, spaceIdx + 1);
            // Strip inline range from first ID (e.g. "29.1-21" → "29.1")
            const numFirst = df.slice(spaceIdx + 1).replace(/-.*$/, "");
            // For last ID, take the range end (e.g. "29.21-50" → "29.50", "29.50" → "29.50")
            const numLast = dl.slice(spaceIdx + 1).replace(/(\d+)-(\d+)$/, "$2");
            dfDisplay = pfx + numFirst;
            const fp = numFirst.split(".");
            const lp = numLast.split(".");
            let commonLen = 0;
            for (let i = 0; i < Math.min(fp.length, lp.length) - 1; i++) {
              if (fp[i] === lp[i]) commonLen = i + 1; else break;
            }
            suffix = commonLen > 0 ? lp.slice(commonLen).join(".") : numLast;
          }
          rangeHtml = ` <span class="browse-vagga-range">${dfDisplay}<span class="range-dash">–</span>${suffix}</span>`;
        }
      }

      gHead.innerHTML = `<span class="caret"><i data-lucide="chevron-right"></i></span> <span class="browse-node-label anak" data-label-id="${name}">${label}</span>${rangeHtml}`;
      const gBody = document.createElement("div"); gBody.className = "browse-vagga-body";

      function renderChildren() {
        if (gBody._rendered) return;
        buildNodes(gBody, childrenArr);
        gBody._rendered = true;
        if (window.lucide) lucide.createIcons({ root: gBody });   // scoped: jangan re-scan seluruh dokumen
      }
      gBody._renderChildren = renderChildren;

      gHead.addEventListener("click", () => {
        const opening = !gHead.classList.contains("open");
        const before = opening ? gHead.getBoundingClientRect().top : 0;
        if (opening) { closeSiblings(gEl); renderChildren(); }
        gHead.classList.toggle("open");
        gBody.classList.toggle("open");
        if (opening) anchorAndGlide(gHead, before);
      });
      gEl.appendChild(gHead); gEl.appendChild(gBody);
      return gEl;
    }

    pitakas.forEach((pitaka) => {
      const pitData = state.browseData[pitaka];
      if (!pitData) return;

      const nEl = document.createElement("div"); nEl.className = "browse-nikaya";
      nEl.dataset.browseId = pitaka;
      const nHead = document.createElement("div"); nHead.className = "browse-nikaya-header";
      nHead.innerHTML = `<span class="caret"><i data-lucide="chevron-right"></i></span> <span class="browse-node-label" data-label-id="${pitaka}">${displayName(pitaka)}</span>`;
      const nBody = document.createElement("div"); nBody.className = "browse-nikaya-body";

      function renderNikaBody() {
        if (nBody._rendered) return;
        nBody._rendered = true;
        Object.keys(pitData).forEach((book) => {
          const children = pitData[book];
          if (book === "kn" && !Array.isArray(children) && typeof children === "object") {
            const knGroup = document.createElement("div"); knGroup.className = "browse-vagga";
            knGroup.dataset.browseId = "kn";
            const knHead = document.createElement("div"); knHead.className = "browse-vagga-header";
            knHead.innerHTML = `<span class="caret"><i data-lucide="chevron-right"></i></span> <span class="browse-node-label" data-label-id="kn">${displayName("kn")}</span>`;
            const knBody = document.createElement("div"); knBody.className = "browse-vagga-body";
            function renderKnChildren() {
              if (knBody._rendered) return;
              Object.keys(children).forEach(knBook => knBody.appendChild(createGroupNode(knBook, children[knBook])));
              knBody._rendered = true;
              if (window.lucide) lucide.createIcons({ root: knBody });   // scoped
            }
            knBody._renderChildren = renderKnChildren;
            knHead.addEventListener("click", () => { const opening = !knHead.classList.contains("open"); const before = opening ? knHead.getBoundingClientRect().top : 0; if (opening) { closeSiblings(knGroup); renderKnChildren(); } knHead.classList.toggle("open"); knBody.classList.toggle("open"); if (opening) anchorAndGlide(knHead, before); });
            knGroup.appendChild(knHead); knGroup.appendChild(knBody);
            nBody.appendChild(knGroup);
          } else if (typeof children === "string") {
            const sLink = document.createElement("div"); sLink.className = "browse-sutta-row";
            sLink.dataset.browseId = children;
            const sName = (state.suttaNames || {})[children];
            const dead = state.unavailable && state.unavailable.has(children);
            const mainLink = document.createElement(dead ? "span" : "a");
            mainLink.className = "browse-sutta-link" + (dead ? " unavailable" : "");
            if (dead) {
              mainLink.setAttribute("aria-disabled", "true");
              mainLink.title = (window.DK && window.DK.t) ? window.DK.t("browse_unavailable") : "Teks belum tersedia";
            } else {
              mainLink.href = `/${String(children).trim().toLowerCase().replace(/^pli-tv-/, "").replace(/^(bu|bi)-vb-/, "$1-")}`;
            }
            mainLink.innerHTML = `<span class="browse-sutta-id">${displayId(children)}</span>` + (sName ? ` <span class="browse-sutta-name">${sName}</span>` : "");
            sLink.appendChild(mainLink);
            nBody.appendChild(sLink);
          } else {
            nBody.appendChild(createGroupNode(book, children));
          }
        });
        if (window.lucide) lucide.createIcons({ root: nBody });   // scoped
      }
      nBody._renderChildren = renderNikaBody;

      nHead.addEventListener("click", () => {
        const opening = !nHead.classList.contains("open");
        const before = opening ? nHead.getBoundingClientRect().top : 0;
        if (opening) {
          closeSiblings(nEl);
          if (!state.loadedPitakas.has(pitaka)) {
            nBody.innerHTML = `
              <div class="browse-vagga" style="pointer-events: none;">
                  <div class="browse-vagga-header" style="animation: skeleton-pulse 1.5s infinite ease-in-out;">
                      <span class="caret" style="width: 16px; height: 16px; border-radius: 4px; background: var(--border-strong); display: inline-block; margin-right: 8px;"></span>
                      <span style="width: 120px; height: 14px; border-radius: 4px; background: var(--border-strong); display: inline-block;"></span>
                  </div>
              </div>
              <div class="browse-vagga" style="pointer-events: none;">
                  <div class="browse-vagga-header" style="animation: skeleton-pulse 1.5s infinite ease-in-out; animation-delay: 0.15s;">
                      <span class="caret" style="width: 16px; height: 16px; border-radius: 4px; background: var(--border-strong); display: inline-block; margin-right: 8px;"></span>
                      <span style="width: 90px; height: 14px; border-radius: 4px; background: var(--border-strong); display: inline-block;"></span>
                  </div>
              </div>
              <div class="browse-vagga" style="pointer-events: none;">
                  <div class="browse-vagga-header" style="animation: skeleton-pulse 1.5s infinite ease-in-out; animation-delay: 0.3s;">
                      <span class="caret" style="width: 16px; height: 16px; border-radius: 4px; background: var(--border-strong); display: inline-block; margin-right: 8px;"></span>
                      <span style="width: 140px; height: 14px; border-radius: 4px; background: var(--border-strong); display: inline-block;"></span>
                  </div>
              </div>
            `;
            nHead.classList.add("open");
            nBody.classList.add("open");
            ensurePitakaNames(pitaka).then(() => {
              nBody.innerHTML = "";
              nBody._rendered = false;
              renderNikaBody();
            });
          } else {
            renderNikaBody();
            nHead.classList.add("open");
            nBody.classList.add("open");
          }
          anchorAndGlide(nHead, before);
        } else {
          nHead.classList.remove("open");
          nBody.classList.remove("open");
        }
      });

      nEl.appendChild(nHead); nEl.appendChild(nBody);
      dom.browseTree.appendChild(nEl);
    });
    if (window.lucide) lucide.createIcons({ root: dom.browseTree });   // scoped
  }

  // ========== Browse Highlight (from breadcrumb navigation) ==========

  // Search browseData for targetId, returning ancestor key path (not including pitaka itself).
  // Returns array of group keys from top-most group down to (and including) the one containing target,
  // or null if not found.
  function findAncestorPath(targetId) {
    const norm = targetId.toLowerCase();
    function normKey(k) { return k.replace(/^pli-tv-/, "").replace(/^(bu|bi)-vb-/, "$1-").toLowerCase(); }
    function search(arr, path) {
      if (!Array.isArray(arr)) return null;
      for (const item of arr) {
        if (typeof item === "string") {
          if (item === targetId || normKey(item) === norm) return path;
        } else if (typeof item === "object") {
          for (const [key, children] of Object.entries(item)) {
            if (key === targetId || normKey(key) === norm) return [...path, key];
            const r = search(children, [...path, key]);
            if (r) return r;
          }
        }
      }
      return null;
    }
    if (!state.browseData) return null;
    for (const pitaka of ["sutta", "vinaya", "abhidhamma"]) {
      const pitData = state.browseData[pitaka];
      if (!pitData) continue;
      if (pitaka === targetId) return [pitaka];
      for (const [book, children] of Object.entries(pitData)) {
        if (book === targetId || normKey(book) === norm) return [pitaka, book];
        const arr = Array.isArray(children) ? children : Object.entries(children).map(([k, v]) => ({ [k]: v }));
        const r = search(arr, [pitaka, book]);
        if (r) return r;
      }
    }
    return null;
  }

  // Render only the ancestors along the path to the target (fast, targeted).
  async function renderAncestorPath(ancestorKeys) {
    if (ancestorKeys.length > 0) {
      await ensurePitakaNames(ancestorKeys[0]);
    }
    for (const key of ancestorKeys) {
      const el = dom.browseTree.querySelector(`[data-browse-id="${CSS.escape(key)}"]`);
      if (!el) continue;
      const body = el.querySelector(":scope > .browse-nikaya-body, :scope > .browse-vagga-body");
      if (body && body._renderChildren) body._renderChildren();
    }
  }

  async function highlightBrowseItem(targetId) {
    const path = findAncestorPath(targetId);
    if (path && path.length > 0) {
      await ensurePitakaNames(path[0]);
    }

    function findTarget() {
      let t = dom.browseTree.querySelector(`[data-browse-id="${CSS.escape(targetId)}"]`);
      if (!t) {
        const norm = targetId.toLowerCase();
        for (const el of dom.browseTree.querySelectorAll("[data-browse-id]")) {
          const short = el.dataset.browseId.replace(/^pli-tv-/, "").replace(/^(bu|bi)-vb-/, "$1-");
          if (short === norm) { t = el; break; }
        }
      }
      return t;
    }

    let target = findTarget();
    if (!target && path) {
      await renderAncestorPath(path);
      target = findTarget();
    }
    if (!target) return;

    // Accordion: tutup SEMUA yg lagi kebuka dulu, baru buka path target. Tanpa ini,
    // deep-link (mis. header "Telusuri" saat SUDAH di home -> client-side, tanpa reload)
    // cuma nambah .open di path baru -> pitaka lama tetap kebuka = bisa >1 tree kebuka.
    dom.browseTree.querySelectorAll(
      ".browse-nikaya-header.open, .browse-vagga-header.open, .browse-nikaya-body.open, .browse-vagga-body.open"
    ).forEach(o => o.classList.remove("open"));

    // Expand every ancestor (and the target itself if it's a group)
    const openNode = (node) => {
      for (const h of node.querySelectorAll(":scope > .browse-nikaya-header, :scope > .browse-vagga-header"))
        h.classList.add("open");
      for (const b of node.querySelectorAll(":scope > .browse-nikaya-body, :scope > .browse-vagga-body")) {
        if (b._renderChildren) b._renderChildren();
        b.classList.add("open");
      }
    };
    let el = target;
    while (el && el !== dom.browseTree) {
      if (el.classList.contains("browse-nikaya") || el.classList.contains("browse-vagga"))
        openNode(el);
      el = el.parentElement;
    }

    // Determine what to scroll to & highlight
    requestAnimationFrame(() => {
      let scrollTarget = target;
      if (target.classList.contains("browse-vagga"))
        scrollTarget = target.querySelector(":scope > .browse-vagga-header") || target;
      else if (target.classList.contains("browse-nikaya"))
        scrollTarget = target.querySelector(":scope > .browse-nikaya-header") || target;

      scrollTarget.scrollIntoView({ behavior: "smooth", block: "center" });
      scrollTarget.classList.add("highlight-glow");
      scrollTarget.addEventListener("animationend", () => scrollTarget.classList.remove("highlight-glow"), { once: true });
    });

    window.history.replaceState({}, "", "/");
  }

  // ========== Init ==========
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

  // ── Deep-link client-side dari header (tanpa reload) ──
  // Dipanggil link "Telusuri" di header saat SUDAH di home: expand+scroll ke piṭaka
  // langsung, tanpa full navigation ke /?browse=<id>. highlightBrowseItem sendiri sudah
  // meng-clean URL balik ke "/" via replaceState (no-op di sini karena memang sudah di /).
  // Balikin true kalau tree siap & ditangani; false kalau belum ke-load -> caller biarin
  // navigasi anchor biasa (reload) sebagai fallback.
  window.dkBrowseDeepLink = function (id) {
    if (!id || !state.browseData) return false;
    highlightBrowseItem(id);   // async, fire-and-forget (expand + scroll + highlight)
    return true;
  };

  loadBrowseTree();
})();
