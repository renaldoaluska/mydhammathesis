/* ============================================================
   eval_output.js — Output Asesmen Pakar
   ============================================================ */
(function () {
  "use strict";

  const GRADE_LABELS = ["Tidak Relevan", "Terkait", "Sangat Relevan", "Relevan Sempurna"];

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }


  function renderLegend(grade_counts) {
    return [0, 1, 2, 3].map(g => {
      const count = grade_counts[String(g)] || 0;
      return `<span class="eo-grade-legend-item">
        <span class="eval-grade-badge grade-${g}">${g}</span>
        ${esc(GRADE_LABELS[g])}: <strong>${count}</strong>
      </span>`;
    }).join("");
  }

  function renderLegendByCorpus(grade_counts_by_corpus) {
    if (!grade_counts_by_corpus || !Object.keys(grade_counts_by_corpus).length) return "";
    const corpora = Object.keys(grade_counts_by_corpus).sort();
    if (corpora.length === 1) return renderLegend(grade_counts_by_corpus[corpora[0]]);
    return corpora.map(db => `
      <div class="eo-corpus-legend-row">
        <span class="lang-tag ${esc(db)}" style="margin-right:6px">${esc(db.toUpperCase())}</span>
        ${renderLegend(grade_counts_by_corpus[db])}
      </div>`).join("");
  }

  function renderProgressByCorpus(progress_by_corpus) {
    if (!progress_by_corpus || !Object.keys(progress_by_corpus).length) return "";
    return Object.entries(progress_by_corpus).map(([db, p]) => {
      const pct = p.queries_total > 0 ? Math.round(p.queries_done / p.queries_total * 100) : 0;
      const done = pct >= 100;
      const passageLabel = p.passages_total ? ` &nbsp;·&nbsp; ${p.passages_graded}/${p.passages_total} pasase` : "";
      return `<div class="eo-progress-wrap">
        <span class="lang-tag ${esc(db)}" style="margin-right:6px;flex-shrink:0">${esc(db.toUpperCase())}</span>
        <div class="eo-progress-bar-bg" style="flex:1">
          <div class="eo-progress-bar-fill${done ? " done" : ""}" style="width:${Math.min(pct,100)}%"></div>
        </div>
        <span class="eo-progress-label">${p.queries_done}/${p.queries_total} kueri${passageLabel} &nbsp; <strong>${pct}%</strong></span>
      </div>`;
    }).join("");
  }

  function shortModel(m) {
    const n = (m || "").split("/").pop().replace(/^gpl-/, "");
    if (n.includes("e5")) return "e5";
    if (n.includes("gte")) return "gte";
    if (n.includes("bge")) return "bge";
    if (/bm25/i.test(n)) return "bm25";
    return n;
  }

  const POOL_K = 10;   // unit eval = top-10 PASASE; rank>POOL_K = grade lama di luar pool

  function renderTable(rows) {
    // Buang baris di luar pool (rank>POOL_K) — sisa grade lama saat pool masih per-sutta.
    rows = (rows || []).filter(r => (parseInt(r.rank) || 0) <= POOL_K);
    // Merge per PASASE (query_id, db, ref, author) — 1 pasase = 1 grade pakar.
    // Model/versi/rank yg menemukannya dikumpulin jadi 1 kolom "Ditemukan".
    const pmap = new Map();
    rows.forEach(r => {
      const ref = r.ref || r.sutta_id;
      const key = `${r.query_id}␟${r.db}␟${ref}␟${r.author || ""}`;
      if (!pmap.has(key)) {
        pmap.set(key, { query_id: r.query_id, query: r.query, db: r.db, ref,
          author: r.author || "", grade: r.grade, text: r.retrieved_text || "", sources: [] });
      }
      const p = pmap.get(key);
      p.sources.push({ model: shortModel(r.model), versi: r.versi === "gpl" ? "GPL" : "B",
        rank: parseInt(r.rank) || 0, sim: parseFloat(r.cosine_sim) || 0 });
      if (!p.text && r.retrieved_text) p.text = r.retrieved_text;
    });

    const passages = Array.from(pmap.values());
    passages.forEach(p => {
      p.sources.sort((a, b) => a.rank - b.rank);
      p.bestRank = p.sources.length ? p.sources[0].rank : 999;
    });

    // Group by kueri, lalu urut by rank terbaik (db sebagai sub-urutan).
    const byQuery = new Map();
    passages.forEach(p => { (byQuery.get(p.query_id) || byQuery.set(p.query_id, []).get(p.query_id)).push(p); });
    const qids = Array.from(byQuery.keys()).sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));

    let body = "";
    qids.forEach(qid => {
      const ps = byQuery.get(qid).sort((a, b) => (a.db || "").localeCompare(b.db) || a.bestRank - b.bestRank);
      body += `<tr class="eo-q-head"><td colspan="6">Kueri ${esc(qid)}: ${esc(ps[0] ? ps[0].query : "")} <span class="eo-q-count">(${ps.length} pasase)</span></td></tr>`;
      ps.forEach(p => {
        const found = p.sources.map(s => `<span class="eo-src" title="sim ${s.sim.toFixed(3)}">${esc(s.model)}·${s.versi}·r${s.rank}</span>`).join(" ");
        body += `<tr>
          <td class="eo-td-num" title="rank terbaik antar-model">${p.bestRank}</td>
          <td><span class="lang-tag ${esc(p.db)}">${esc((p.db || "").toUpperCase())}</span></td>
          <td class="eo-td-sutta"><a href="#" class="eo-text-link" data-text="${esc(p.text)}" data-ref="${esc(p.ref)}" data-author="${esc(p.author)}" data-query="${esc(p.query)}" data-grade="${esc(p.grade)}" data-model="${esc(p.sources.map(s => s.model + "·" + s.versi).join(", "))}">${esc(p.ref)}</a></td>
          <td class="eo-td-author">${esc(p.author || "—")}</td>
          <td><span class="eval-grade-badge grade-${esc(p.grade)}">${esc(p.grade)}</span></td>
          <td class="eo-td-found">${found}</td>
        </tr>`;
      });
    });

    return `
      <div class="eo-table-wrap">
        <table class="eo-table">
          <thead><tr>
            <th title="Rank terbaik (terkecil) antar-model — juga jadi urutan tampil. Banyak seri itu wajar.">Rank↑</th><th>DB</th><th>Segmen</th><th>Author</th><th>Grade</th><th>Ditemukan (model·versi·rank)</th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }

  // ===== Dialog teks pasase (klik Segmen) =====
  function showTextModal(d) {
    let m = document.getElementById("eo-text-modal");
    if (!m) {
      m = document.createElement("div");
      m.id = "eo-text-modal";
      m.className = "eo-modal-overlay hidden";
      m.innerHTML = `<div class="eo-modal"><button class="eo-modal-close" aria-label="Tutup">&times;</button><div class="eo-modal-head"></div><div class="eo-modal-body"></div></div>`;
      document.body.appendChild(m);
      m.addEventListener("click", (e) => {
        if (e.target === m || e.target.classList.contains("eo-modal-close")) m.classList.add("hidden");
      });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") m.classList.add("hidden"); });
    }
    m.querySelector(".eo-modal-head").innerHTML =
      `<div class="eo-modal-ref">${esc(d.ref)}${d.author ? ` <span class="eo-modal-author">· ${esc(d.author)}</span>` : ""}</div>
       <div class="eo-modal-meta">Kueri: <em>${esc(d.query)}</em> &middot; Model: ${esc(d.model)} &middot; Grade: <span class="eval-grade-badge grade-${esc(d.grade)}">${esc(d.grade)}</span></div>`;
    m.querySelector(".eo-modal-body").textContent = d.text || "(teks kosong)";
    m.classList.remove("hidden");
  }

  // delegasi sekali — link Segmen dibuat dinamis saat detail dibuka
  document.addEventListener("click", (e) => {
    const a = e.target.closest(".eo-text-link");
    if (!a) return;
    e.preventDefault();
    showTextModal(a.dataset);
  });

  function render(results) {
    const content = document.getElementById("eo-content");
    const nav = document.getElementById("eo-file-nav");
    document.getElementById("eo-summary-files").textContent = results.length;
    document.getElementById("eo-summary-entries").textContent = results.reduce((s, r) => s + r.total, 0);

    // Build sidebar nav — flat list per expert
    let navHtml = "";
    results.forEach((r, i) => {
      navHtml += `<a href="#file-${i}" class="eo-file-link">
        <span class="eo-file-expert">${esc(r.expert)}</span>
      </a>`;
    });
    nav.innerHTML = navHtml;

    // Build content — flat list per expert
    let contentHtml = "";
    results.forEach((r, i) => {
      contentHtml += `
        <div class="eo-file-section" id="file-${i}">
          <div class="eo-file-header">
            <div class="eo-file-title">
              <h3>${esc(r.expert)}</h3>
            </div>
            ${renderProgressByCorpus(r.progress_by_corpus)}
            <div class="eo-file-meta">
              <span><strong>${r.total}</strong> entri</span>
              <span><strong>${r.models}</strong> model</span>
              <span>${r.corpora.map(c => c.toUpperCase()).join(", ")}</span>
            </div>
            <div class="eo-grade-legend">${renderLegendByCorpus(r.grade_counts_by_corpus) || renderLegend(r.grade_counts)}</div>
          </div>
          <details class="eo-detail-toggle" data-filename="${esc(r.filename)}">
            <summary>Lihat Detail (${r.total} baris)</summary>
            <div class="eo-detail-body"></div>
          </details>
        </div>`;
    });

    content.innerHTML = contentHtml;
    content.classList.remove("hidden");

    content.querySelectorAll("details.eo-detail-toggle").forEach(det => {
      det.addEventListener("toggle", async () => {
        if (!det.open) return;
        const body = det.querySelector(".eo-detail-body");
        if (body.dataset.loaded) return;
        body.innerHTML = `<div style="text-align:center;padding:16px"><div class="spinner" style="margin:auto"></div></div>`;
        try {
          const rows = await fetch(`/api/eval/${window.EVAL_TYPE}/output/rows/${encodeURIComponent(det.dataset.filename)}`).then(r => r.json());
          body.innerHTML = renderTable(rows);
          body.dataset.loaded = "1";
        } catch (e) {
          body.innerHTML = `<p style="color:var(--danger);padding:12px">Gagal memuat: ${esc(e.message)}</p>`;
        }
      }, { once: false });
    });
  }

  // ========== Summary Matrix ==========
  const STEP_DBS = ["id", "en"];

  function renderSummary(summary) {
    const { experts, queries, matrix, partial } = summary;
    if (!experts.length || !queries.length) return;

    // Baris 1: Pakar | #1 (colspan 2) | #2 (colspan 2) | ...
    let row1 = `<th class="eo-sum-th-expert" rowspan="3">Pakar</th>`;
    queries.forEach(q => {
      const label = q.query.length > 22 ? q.query.slice(0, 20) + "…" : q.query;
      row1 += `<th class="eo-sum-th-q" colspan="${STEP_DBS.length}" title="${esc(q.query)}">${esc(label)}</th>`;
    });

    // Baris 2: ID | EN | ID | EN | ...
    let row2 = "";
    queries.forEach(() => {
      STEP_DBS.forEach(db => {
        row2 += `<th class="eo-sum-th-db"><span class="lang-tag ${db}">${db.toUpperCase()}</span></th>`;
      });
    });

    // Baris 3: jumlah pasase per step
    const stepTotals = summary.step_totals || {};
    let row3 = "";
    queries.forEach(q => {
      STEP_DBS.forEach(db => {
        const total = stepTotals[`${q.id}_${db}`];
        row3 += `<th class="eo-sum-th-count">${total || "—"}</th>`;
      });
    });

    const thead = `<thead>
      <tr>${row1}</tr>
      <tr>${row2}</tr>
      <tr>${row3}</tr>
    </thead>`;

    const partialData = partial || {};

    let tbody = `<tbody>`;
    const hasExact = summary.partial_excl !== undefined;   // backend rank-aware (pasca restart)
    experts.forEach(expert => {
      const doneSet = new Set(matrix[expert] || []);
      const expertPartial = partialData[expert] || {};
      const exclData = (summary.partial_excl || {})[expert] || {};
      const totalCells = queries.length * STEP_DBS.length;
      const doneCount = queries.reduce((acc, q) =>
        acc + STEP_DBS.filter(db => doneSet.has(`${q.id}_${db}`)).length, 0);
      const allDone = doneCount === totalCells;
      tbody += `<tr class="${allDone ? "eo-sum-row-done" : ""}" data-expert="${esc(expert)}">
        <td class="eo-sum-td-expert"><span class="eo-online-dot" data-expert="${esc(expert)}" style="display:none"></span>${esc(expert)}</td>`;
      queries.forEach(q => {
        STEP_DBS.forEach(db => {
          const key = `${q.id}_${db}`;
          const total = stepTotals[key] || 0;
          const allG = expertPartial[key] || 0;
          // hasExact: backend udah pisah in-pool vs di luar pool (akurat).
          // else (pra-restart): approx — clamp x<=y, sisanya dianggap excluded.
          const graded = hasExact ? allG : (total ? Math.min(allG, total) : allG);
          const excl = hasExact ? (exclData[key] || 0) : Math.max(0, allG - total);
          const exclLabel = excl ? `<br><span class="eo-sum-excl" title="${excl} pasase dinilai, di luar pool top-10">+${excl}</span>` : "";
          if (doneSet.has(key)) {
            const countLabel = total ? `<br><span class="eo-sum-prog-label">(${graded}/${total})</span>` : "";
            tbody += `<td class="eo-sum-td eo-sum-check" title="${esc(q.query)} / ${db.toUpperCase()} — ${graded}/${total || "?"} in-pool, ${excl} di luar pool"><i data-lucide="check" class="lucide-sm"></i>${countLabel}${exclLabel}</td>`;
          } else if (allG || excl) {
            const progLabel = total ? `${graded}/${total}` : `${graded}`;
            tbody += `<td class="eo-sum-td eo-sum-partial" title="${esc(q.query)} / ${db.toUpperCase()} — ${graded}/${total || "?"} in-pool, ${excl} di luar pool"><i data-lucide="loader" class="lucide-sm lucide-spin"></i><br><span class="eo-sum-prog-label">(${progLabel})</span>${exclLabel}</td>`;
          } else {
            tbody += `<td class="eo-sum-td eo-sum-empty">—</td>`;
          }
        });
      });
      tbody += `</tr>`;
    });
    tbody += `</tbody>`;

    document.getElementById("eo-matrix-wrap").innerHTML = `
      <div class="eo-sum-table-wrap">
        <table class="eo-sum-table">
          ${thead}${tbody}
        </table>
      </div>`;
    document.getElementById("eo-summary-section").classList.remove("hidden");
    refreshIcons();
  }

  // ========== Config Editor ==========
  async function loadConfig(kind) {
    const res = await fetch(`/api/eval/${window.EVAL_TYPE}/config/${kind}`);
    const data = await res.json();
    document.getElementById(`eo-${kind}-editor`).value = JSON.stringify(data, null, 2);
  }

  window.eoCfgSave = async function(kind) {
    if (await DK.prompt("Password:", { type: "password" }) !== "alfaganteng") return;
    const ta = document.getElementById(`eo-${kind}-editor`);
    const msg = document.getElementById(`eo-${kind}-msg`);
    let parsed;
    try {
      parsed = JSON.parse(ta.value);
    } catch (e) {
      msg.innerHTML = '<i data-lucide="triangle-alert"></i> JSON tidak valid';
      msg.style.color = "var(--danger)";
      return;
    }
    try {
      await fetch(`/api/eval/${window.EVAL_TYPE}/config/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      msg.innerHTML = '<i data-lucide="check"></i> Tersimpan';
      msg.style.color = "var(--success)";
      setTimeout(() => location.reload(), 800);
    } catch (e) {
      msg.innerHTML = '<i data-lucide="triangle-alert"></i> Gagal menyimpan';
      msg.style.color = "var(--danger)";
    }
    refreshIcons();
  };

  // ========== Online status polling ==========
  function pollOnline() {
    fetch(`/api/eval/${window.EVAL_TYPE}/online`).then(r => r.json()).then(online => {
      document.querySelectorAll(".eo-online-dot").forEach(dot => {
        const expert = dot.dataset.expert;
        if (online[expert]) {
          dot.style.display = "";
          dot.title = `Sedang online — ${online[expert].step || ""}`;
        } else {
          dot.style.display = "none";
        }
      });
    }).catch(() => {});
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const [results, summary] = await Promise.all([
        fetch(`/api/eval/${window.EVAL_TYPE}/output`).then(r => r.json()),
        fetch(`/api/eval/${window.EVAL_TYPE}/summary`).then(r => r.json()).catch(() => null),
      ]);

      document.getElementById("eo-loading").classList.add("hidden");

      loadConfig("queries");
      loadConfig("experts");

      if (results.length) {
        // Matrix ringkasan hanya relevan saat sudah ada anotasi — kalau kosong
        // jangan render (dulu nongol jadi tabel "—" nyasar di atas footer).
        try { if (summary) renderSummary(summary); } catch (e2) { console.error("renderSummary error:", e2); }
        render(results);
      } else {
        document.getElementById("eo-empty").classList.remove("hidden");
      }

      // Poll online status every 15s
      pollOnline();
      setInterval(pollOnline, 15000);
    } catch (e) {
      document.getElementById("eo-loading").innerHTML =
        `<div class="empty-icon"><i data-lucide="triangle-alert"></i></div><p>Gagal memuat data: ${esc(e.message)}</p>`;
      refreshIcons();
    }
  });
})();
