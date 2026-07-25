#!/usr/bin/env python
"""Test post-processing chat web-md (tanpa dependensi test eksternal; pytest tak terpasang).

Cakupan:
  1. _strip_ghost_refs   — ref hantu dibuang TANPA merusak keseimbangan kurung
                           (regresi: '(seperti yang dijelaskan dalam MN 10)' -> kurung gantung).
  2. _enforce_theravada_terms — idempoten, casing dipertahankan, kebijakan KBBI stabil
                           (regresi: bikuni ke-flip bhikkhunī; nirvana lowercase -> "Nibbāna").
  3. Sanitizer Pali pasca-stream HARUS tetap tiada (regresi: Tipiṭaka -> appakā/pītakaṁ).
  4. Sinkron FE<->BE     — TERM_MAP tunggal: regex dibangun ulang persis cara chat.js (node),
                           hasil di sampel harus IDENTIK dgn _enforce_theravada_terms Python.
  5. Injeksi template    — /chat menyajikan window.DK_TERM_MAP (satu sumber sampai browser).

Jalankan dari folder web-md:  ../../venv/bin/python tests/test_postprocess.py
Butuh `node` di PATH untuk tes #4 (di-skip dgn peringatan kalau tak ada).
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

_HERE = os.path.dirname(os.path.abspath(__file__))
_WEBMD = os.path.dirname(_HERE)
os.chdir(_WEBMD)
sys.path.insert(0, _WEBMD)
sys.argv = ["app.py"]
os.environ["MYDHAMMA_SKIP_WARMUP"] = "1"   # jangan nembak warmup ke server live dari test
import app  # noqa: E402

FAILS = []


def check(name, cond, detail=""):
    print(("PASS" if cond else "FAIL"), "|", name + (("\n     " + detail) if (detail and not cond) else ""))
    if not cond:
        FAILS.append(name)


# ---------- 1. _strip_ghost_refs ----------
G = {"sn45.39", "mn10"}
SEGS = {"mn10:1.2", "sn45.39:md2"}
cases = [
    # (input, grounded_segs, harus_ada, harus_tiada)
    ("A (seperti yang dijelaskan dalam DN 22:1.9). B", None,
     "(seperti yang dijelaskan dalam).", "dalam ."),
    ("A (DN 22:1.9). B", None, "A. B", "DN"),
    ("A (MN 10:1.2). B", None, "(MN 10:1.2)", None),
    ("dalam DN 22:1.9 dikatakan X", None, "dalam dikatakan X", "DN"),
    ("lihat MN 10:99 ya", SEGS, "lihat MN 10 ya", ":99"),
    ("(seperti tercermin dalam struktur pengajaran di SN 12.48:md9).", None,
     "(seperti tercermin dalam struktur pengajaran di).", "di ."),
]
for inp, segs, want, notwant in cases:
    out = app._strip_ghost_refs(inp, G, segs)
    ok = (want in out) and (notwant is None or notwant not in out)
    bal = out.count("(") == out.count(")")
    check(f"ghost-ref: {inp[:48]!r}", ok and bal, f"out={out!r} balanced={bal}")

# ---------- 2. _enforce_theravada_terms ----------
E = app._enforce_theravada_terms
pairs = [
    ("Para biksuni dan biksu membaca Tipitaka.", "Para bikuni dan biku membaca Tipiṭaka."),
    ("nirvana bukan sekadar kata.", "nibbāna bukan sekadar kata."),     # lowercase -> rep lowercase
    ("NIRVANA itu tujuan.", "NIBBĀNA itu tujuan."),                     # ALL-CAPS dipertahankan
    ("Sang Arhat memahami duhkha.", "Sang Arahant memahami dukkha."),
    ("Piṭika dan Tipiṭika dijaga sangha.", "Piṭaka dan Tipiṭaka dijaga saṅgha."),
    ("Gautama, Siddhartha mengajar.", "Siddhattha Gotama mengajar."),   # kombinasi nama duluan
    ("bikuni tetap bikuni.", "bikuni tetap bikuni."),                   # kebijakan KBBI stabil
    # Regresi penghapusan pemecah calque ", di mana" (2026-07-09): konstruksi SAH ini dulu
    # dirusak jadi "... . Pun ia berada." / "bertanya. Dhamma harus dicari." — HARUS utuh.
    ("Ia tetap tenang, di mana pun ia berada.", "Ia tetap tenang, di mana pun ia berada."),
    ("Bhikkhu itu bertanya, di mana Dhamma harus dicari.",
     "Bhikkhu itu bertanya, di mana Dhamma harus dicari."),
    # Potongan model "-ṭa" (kena live: "Vinaya Piṭa"); tetangga sah tak tersentuh.
    ("Vinaya Piṭa dan Sutta Piṭaka dijaga.", "Vinaya Piṭaka dan Sutta Piṭaka dijaga."),
    # Gloss stutter "X (X)": peta bikin "Nibbāna (Nirvana)" -> "Nibbāna (Nibbāna)" -> dedup.
    ("Ia memahami Nibbāna (Nirvana) dengan jernih.", "Ia memahami Nibbāna dengan jernih."),
    ("*Tipiṭaka* (Tipiṭaka) adalah kanon.", "*Tipiṭaka* adalah kanon."),
    # Gloss BEDA KATA / beda-diakritik (tak di peta) = informatif, HARUS dibiarkan.
    ("Tipiṭaka (Tiga Keranjang) adalah kanon.", "Tipiṭaka (Tiga Keranjang) adalah kanon."),
    ("Tipiṭaka (Tripitaka) adalah kanon.", "Tipiṭaka (Tripitaka) adalah kanon."),
    ("makna paṭicca (paticca) dijelaskan.", "makna paṭicca (paticca) dijelaskan."),
]
for inp, want in pairs:
    out = E(inp)
    check(f"enforce: {inp!r}", out == want, f"out={out!r} want={want!r}")
for inp, _w in pairs:
    once, twice = E(inp), E(E(inp))
    check(f"idempoten: {inp[:36]!r}", once == twice, f"1x={once!r} 2x={twice!r}")

# ---------- 3. sanitizer pasca-stream tetap tiada ----------
check("no _sanitize_pali_term", not hasattr(app, "_sanitize_pali_term"))
check("no all_pali_words feeder", "all_pali_words" not in open(os.path.join(_WEBMD, "app.py"), encoding="utf-8").read())

# ---------- 4. sinkron FE<->BE via node ----------
_NODE_SYNC = r"""
const fs = require("fs");
const [mapPath, samplesPath] = process.argv.slice(2);
const MAP = JSON.parse(fs.readFileSync(mapPath, "utf8"));
const samples = JSON.parse(fs.readFileSync(samplesPath, "utf8"));
// Konstruksi & semantik casing HARUS mirror enforceTheravadaTerms di static/chat.js.
const W = "A-Za-z0-9_\\u00C0-\\u024F\\u1E00-\\u1EFF";
const res = MAP.map(([pat, rep]) => [new RegExp(`(?<![${W}])(?:${pat})(?![${W}])`, "gi"), rep]);
const out = samples.map(t => {
  let r = t.normalize("NFC");
  for (const [pat, rep] of res) {
    r = r.replace(pat, (match) => {
      if (match === match.toUpperCase() && match.length > 1) return rep.toUpperCase();
      if (match[0] === match[0].toUpperCase()) return rep.charAt(0).toUpperCase() + rep.slice(1);
      return rep.toLowerCase();
    });
  }
  // Mirror dedup gloss stutter "X (X)" di chat.js/_SELF_GLOSS_RE app.py.
  r = r.replace(
    /(?<![A-Za-z0-9_À-ɏḀ-ỿ-])([A-Za-zÀ-ɏḀ-ỿ][A-Za-z0-9_À-ɏḀ-ỿ-]*)(\*{0,2})[ \t]*\(\s*\*{0,2}\1\*{0,2}\s*\)/gi,
    "$1$2");
  return r;
});
process.stdout.write(JSON.stringify(out));
"""
if shutil.which("node"):
    # Sampel sengaja TANPA nama koleksi ber-kode ("(SN 12)" dst.) — _fix_collection_names
    # (BE-only, butuh peta korpus) di luar cakupan sinkron FE<->BE.
    samples = [inp for inp, _w in pairs] + [
        "Ajaran tentang skandhas, dhyana, dan prajna dalam sutra kuno.",
        "Sang bhikshu dan bhikshuni berlatih satipatthana menuju parinibbana.",
        "Shraddha, maitri, dan klesha; pratityasamutpada; shunyata.",
        "budha mengajarkan upasatha dan patimokkha kepada sotapanna, sakadagami, anagami.",
        "Ānanda (Ānanda) hadir.",   # dedup pada token berawalan DIAKRITIK — parity lookaround FE/BE
    ]
    with tempfile.TemporaryDirectory() as td:
        mp, sp, jp = (os.path.join(td, n) for n in ("map.json", "samples.json", "sync.js"))
        with open(mp, "w", encoding="utf-8") as f:
            json.dump([[p, r] for p, r in app.TERM_MAP], f, ensure_ascii=False)
        with open(sp, "w", encoding="utf-8") as f:
            json.dump(samples, f, ensure_ascii=False)
        with open(jp, "w", encoding="utf-8") as f:
            f.write(_NODE_SYNC)
        js_out = json.loads(subprocess.run(["node", jp, mp, sp], capture_output=True,
                                           text=True, check=True).stdout)
    for t, js in zip(samples, js_out):
        py = E(t)
        check(f"sync FE<->BE: {t[:44]!r}", py == js, f"py={py!r}\n     js={js!r}")
else:
    print("SKIP | sync FE<->BE (node tidak ada di PATH)")

# ---------- 5. injeksi template /chat ----------
app.app.config["TESTING"] = True
with app.app.test_client() as c:
    gcfg = app.gate.get_gate_config()
    if gcfg.get("enabled"):
        c.post("/gate/login", data={"code": gcfg.get("code", "")})
    # /chat kini 302 -> /?chat=1 (panel embedded, halaman standalone tak dipakai) —
    # follow redirect supaya yg dicek halaman yg BENAR-BENAR disajikan ke browser.
    html = c.get("/chat", follow_redirects=True).get_data(as_text=True)
check("/chat injects DK_TERM_MAP", "window.DK_TERM_MAP" in html and "nirv" in html)

cjs = open(os.path.join(_WEBMD, "static", "chat.js"), encoding="utf-8").read()
check("chat.js pakai DK_TERM_MAP (bukan hardcode)", "DK_TERM_MAP" in cjs and "Skandha" not in cjs)

print()
if FAILS:
    print(f"{len(FAILS)} FAIL:", *FAILS, sep="\n  - ")
    sys.exit(1)
print("ALL PASS")
