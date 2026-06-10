/* ============================================================
   Dhammakathika — Browse Page
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
    availability: {},
  };

  // ========== Browse ==========
  async function loadBrowseTree() {
    dom.browseLoading.classList.remove("hidden");
    dom.browseTree.classList.add("hidden");
    try {
      const [res, namesRes, availRes] = await Promise.all([
        fetch("/api/browse"),
        fetch("/api/sutta-names"),
        fetch("/api/availability")
      ]);
      if (!res.ok) throw new Error("Failed to load browse tree");
      state.browseData = await res.json();
      state.suttaNames = namesRes.ok ? await namesRes.json() : {};
      state.availability = availRes.ok ? await availRes.json() : {};
      renderBrowseTree();
      dom.browseLoading.classList.add("hidden");
      dom.browseTree.classList.remove("hidden");
      // Handle ?browse=<id> from breadcrumb navigation (was /browse/<id>)
      const browseParam = new URLSearchParams(window.location.search).get("browse");
      if (browseParam) {
        highlightBrowseItem(decodeURIComponent(browseParam));
      } else {
        // Default: do not auto expand Sutta Piṭaka, keep everything collapsed
        // const suttaEl = dom.browseTree.querySelector('[data-browse-id="sutta"]');
        // if (suttaEl) {
        //   const hd = suttaEl.querySelector(":scope > .browse-nikaya-header");
        //   const bd = suttaEl.querySelector(":scope > .browse-nikaya-body");
        //   if (hd && bd) { hd.classList.add("open"); if (bd._renderChildren) bd._renderChildren(); bd.classList.add("open"); }
        // }
      }
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

    // Recursively collect all leaf sutta IDs from a tree array
    function collectLeafIds(arr) {
      const ids = [];
      if (!Array.isArray(arr)) return ids;
      arr.forEach(item => {
        if (typeof item === "string") ids.push(item);
        else if (typeof item === "object") {
          Object.values(item).forEach(v => ids.push(...collectLeafIds(v)));
        }
      });
      return ids;
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

          // Sutta ID and Name (links to suttaplex)
          const mainLink = document.createElement("a");
          mainLink.className = "browse-sutta-link";
          mainLink.href = `/${toShortId(item)}`;
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
      const leaves = collectLeafIds(childrenArr);
      let rangeHtml = "";
      if (leaves.length > 0) {
        const df = displayId(leaves[0]), dl = displayId(leaves[leaves.length - 1]);
        if (leaves.length === 1) {
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

      gHead.innerHTML = `<span class="caret"><i data-lucide="chevron-right"></i></span> <span>${label}</span>${rangeHtml}`;
      const gBody = document.createElement("div"); gBody.className = "browse-vagga-body";

      function renderChildren() {
        if (gBody._rendered) return;
        buildNodes(gBody, childrenArr);
        gBody._rendered = true;
        if (window.refreshIcons) refreshIcons();
      }
      gBody._renderChildren = renderChildren;

      gHead.addEventListener("click", () => {
        const opening = !gHead.classList.contains("open");
        if (opening) { closeSiblings(gEl); renderChildren(); }
        gHead.classList.toggle("open");
        gBody.classList.toggle("open");
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
      nHead.innerHTML = `<span class="caret"><i data-lucide="chevron-right"></i></span> <span>${displayName(pitaka)}</span>`;
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
            knHead.innerHTML = `<span class="caret"><i data-lucide="chevron-right"></i></span> <span>${displayName("kn")}</span>`;
            const knBody = document.createElement("div"); knBody.className = "browse-vagga-body";
            function renderKnChildren() {
              if (knBody._rendered) return;
              Object.keys(children).forEach(knBook => knBody.appendChild(createGroupNode(knBook, children[knBook])));
              knBody._rendered = true;
              if (window.refreshIcons) refreshIcons();
            }
            knBody._renderChildren = renderKnChildren;
            knHead.addEventListener("click", () => { const opening = !knHead.classList.contains("open"); if (opening) { closeSiblings(knGroup); renderKnChildren(); } knHead.classList.toggle("open"); knBody.classList.toggle("open"); });
            knGroup.appendChild(knHead); knGroup.appendChild(knBody);
            nBody.appendChild(knGroup);
          } else if (typeof children === "string") {
            const sLink = document.createElement("div"); sLink.className = "browse-sutta-row";
            sLink.dataset.browseId = children;
            const sName = (state.suttaNames || {})[children];
            const mainLink = document.createElement("a");
            mainLink.className = "browse-sutta-link";
            mainLink.href = `/${String(children).trim().toLowerCase().replace(/^pli-tv-/, "").replace(/^(bu|bi)-vb-/, "$1-")}`;
            mainLink.innerHTML = `<span class="browse-sutta-id">${displayId(children)}</span>` + (sName ? ` <span class="browse-sutta-name">${sName}</span>` : "");
            sLink.appendChild(mainLink);
            nBody.appendChild(sLink);
          } else {
            nBody.appendChild(createGroupNode(book, children));
          }
        });
        if (window.refreshIcons) refreshIcons();
      }
      nBody._renderChildren = renderNikaBody;

      nHead.addEventListener("click", () => {
        const opening = !nHead.classList.contains("open");
        if (opening) { closeSiblings(nEl); renderNikaBody(); }
        nHead.classList.toggle("open");
        nBody.classList.toggle("open");
      });

      nEl.appendChild(nHead); nEl.appendChild(nBody);
      dom.browseTree.appendChild(nEl);
    });
    if (window.refreshIcons) refreshIcons();
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
  function renderAncestorPath(ancestorKeys) {
    for (const key of ancestorKeys) {
      const el = dom.browseTree.querySelector(`[data-browse-id="${CSS.escape(key)}"]`);
      if (!el) continue;
      const body = el.querySelector(":scope > .browse-nikaya-body, :scope > .browse-vagga-body");
      if (body && body._renderChildren) body._renderChildren();
    }
  }

  function highlightBrowseItem(targetId) {
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
    if (!target) {
      const path = findAncestorPath(targetId);
      if (path) renderAncestorPath(path);
      target = findTarget();
    }
    if (!target) return;

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

  loadBrowseTree();
})();
