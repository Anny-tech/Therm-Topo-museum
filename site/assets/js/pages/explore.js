import { store } from "../store.js";
import { pageArt } from "../art.js";
import { cardHTML, hydrateThumbs } from "../components.js";
import { esc, fmt, formulaHTML, signedPct, spacegroupHTML, debounce, appBadges, statusBadge, STATUS } from "../util.js";

const COLUMNS = [
  ["formula_display", "Material", (m) => `<a href="#/material/${m.id}">${formulaHTML(m.formula_display)}</a>`],
  ["family", "Hall", (m, f) => esc(f[m.family]?.name || m.family)],
  ["sg", "Space group", (m) => (m.spacegroup ? `${spacegroupHTML(m.spacegroup.symbol)} <span class="faint">${m.spacegroup.number}</span>` : "")],
  ["apps", "Applications", (m) => appBadges(m.applications)],
  ["status", "Structure", (m) => statusBadge(m.props?.status)],
  ["e_above_hull", "E<sub>hull</sub> (eV/at)", (m) => fmt(m.props?.e_above_hull, 2), true],
  ["volume_dev", "ΔV vs exp.", (m) => signedPct(m.props?.volume_dev), true],
  ["gap_optb88", "Gap OptB88 (eV)", (m) => fmt(m.props?.gap_optb88, 2), true],
  ["gap_mbj", "Gap TBmBJ (eV)", (m) => fmt(m.props?.gap_mbj, 2), true],
  ["spillage", "SOC spillage", (m) => fmt(m.props?.spillage, 2), true],
  ["seebeck_n", "S<sub>n</sub> (µV/K)<br><span class=\"faint\">600 K, 10²⁰ cm⁻³</span>", (m) => fmt(m.props?.seebeck_n, 3), true],
  ["seebeck_p", "S<sub>p</sub> (µV/K)<br><span class=\"faint\">600 K, 10²⁰ cm⁻³</span>", (m) => fmt(m.props?.seebeck_p, 3), true],
  ["n_sources", "DBs", (m) => fmt(m.props?.n_sources, 1), true],
];

export async function render(root, _params, query) {
  const [{ families, materials }, elements] = await Promise.all([store.index(), store.elements()]);
  const famById = Object.fromEntries(families.map((f) => [f.id, f]));
  const systems = [...new Set(materials.map((m) => m.spacegroup?.crystal_system).filter(Boolean))].sort();
  const state = { q: query.get("q") || "", app: query.get("app") || "all", family: query.get("family") || "", system: "", kind: "", status: query.get("status") || "", view: "cards", sort: null, dir: 1 };

  root.innerHTML = `
  <section class="page">${pageArt("cell")}
    <div class="eyebrow">Plugin · DFT-relaxed crystal structures</div>
    <h1>The collection</h1>
    <p class="lead">${materials.length} materials: ${materials.filter((m) => m.kind === "compound").length} ordered compounds with relaxed structures and
      ${materials.filter((m) => m.kind === "alloy").length} alloy systems that link their end members. Search by formula, name or element.</p>
    <div class="filters">
      <input class="input grow" type="search" placeholder="Search: Bi2Te3, skutterudite, Te, Weyl …" value="${esc(state.q)}" aria-label="Search">
      <div class="seg" data-k="app">
        <button data-v="all">All</button><button data-v="thermoelectric">Thermoelectric</button>
        <button data-v="topological">Topological</button><button data-v="both">Both</button>
      </div>
      <select class="input" data-k="family" aria-label="Hall"><option value="">All halls</option>${families.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join("")}</select>
      <select class="input" data-k="system" aria-label="Crystal system"><option value="">Any crystal system</option>${systems.map((s) => `<option>${s}</option>`).join("")}</select>
      <select class="input" data-k="status" aria-label="Structure status"><option value="">Any structure status</option>${Object.entries(STATUS).map(([k, s]) => `<option value="${k}">${s.text}</option>`).join("")}</select>
      <select class="input" data-k="kind" aria-label="Kind"><option value="">Compounds & alloys</option><option value="compound">Compounds</option><option value="alloy">Alloy systems</option></select>
      <div class="seg" data-k="view"><button data-v="cards">Cards</button><button data-v="table">Table</button></div>
    </div>
    <div class="muted small" id="count"></div>
    <div id="results" style="margin-top:12px"></div>
    <p class="faint small" style="margin-top:18px">Table values: E<sub>hull</sub> from the recommended source. Gaps and spillage from JARVIS-DFT. Seebeck coefficients are
      JARVIS-DFT BoltzTraP values at 600 K and 10²⁰ cm⁻³ for every material (constant relaxation time τ = 10⁻¹⁴ s, rigid bands, OptB88vdW), so they rank materials
      rather than predict a measurement at the material's own operating temperature (see <a href="#/about">Methods</a>). ΔV is the DFT volume per atom relative to the
      experimental COD reference. “Structure” says whether that comparison was possible (benchmarked), impossible (not benchmarked) or whether no single DFT
      cell represents the experiment (ambiguous); each material page lists exactly what is missing.</p>
  </section>`;

  const $ = (s) => root.querySelector(s);
  $("[data-k=family]").value = state.family;
  $("[data-k=status]").value = state.status;
  const syncSeg = () => root.querySelectorAll(".seg").forEach((seg) => seg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", state[seg.dataset.k] === b.dataset.v)));

  let unhydrate = null;
  function matches(m) {
    if (state.app === "both" && m.applications.length < 2) return false;
    if (!["all", "both"].includes(state.app) && !m.applications.includes(state.app)) return false;
    if (state.family && m.family !== state.family) return false;
    if (state.system && m.spacegroup?.crystal_system !== state.system) return false;
    if (state.kind && m.kind !== state.kind) return false;
    if (state.status && m.props?.status !== state.status) return false;
    if (!state.q) return true;
    const q = state.q.trim();
    const hay = [m.formula_display, m.name, famById[m.family]?.name, m.topology, m.thermoelectric, m.spacegroup?.symbol].join(" ").toLowerCase();
    return q.split(/\s+/).every((t) => (/^[A-Z][a-z]?$/.test(t) && m.elements.includes(t)) || hay.includes(t.toLowerCase()));
  }
  function sortVal(m, k) {
    if (k === "formula_display") return m.formula_display;
    if (k === "family") return families.findIndex((f) => f.id === m.family);
    if (k === "sg") return m.spacegroup?.number ?? 999;
    if (k === "apps") return m.applications.join();
    if (k === "status") return Object.keys(STATUS).indexOf(m.props?.status ?? "") >>> 0;
    const v = m.props?.[k];
    return v === null || v === undefined ? (state.dir > 0 ? Infinity : -Infinity) : v;
  }
  function draw() {
    syncSeg();
    let list = materials.filter(matches);
    if (state.sort) list = [...list].sort((a, b) => { const x = sortVal(a, state.sort), y = sortVal(b, state.sort); return (x > y ? 1 : x < y ? -1 : 0) * state.dir; });
    $("#count").textContent = `${list.length} of ${materials.length} shown`;
    unhydrate?.();
    if (!list.length) { $("#results").innerHTML = '<div class="empty">Nothing matches these filters.</div>'; return; }
    if (state.view === "cards") {
      $("#results").innerHTML = `<div class="cards">${list.map((m) => cardHTML(m, famById)).join("")}</div>`;
      unhydrate = hydrateThumbs($("#results"), list, elements);
    } else {
      $("#results").innerHTML = `<div class="table-wrap"><table class="data"><thead><tr>${COLUMNS.map(([k, h, , num]) =>
        `<th class="sortable ${num ? "num" : ""}" data-sort="${k}">${h}${state.sort === k ? (state.dir > 0 ? " ▲" : " ▼") : ""}</th>`).join("")}</tr></thead>
        <tbody>${list.map((m) => `<tr>${COLUMNS.map(([, , f, num]) => `<td class="${num ? "num" : ""}">${f(m, famById)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      root.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => {
        state.dir = state.sort === th.dataset.sort ? -state.dir : 1;
        state.sort = th.dataset.sort;
        draw();
      }));
    }
  }

  $("input[type=search]").addEventListener("input", debounce((e) => { state.q = e.target.value; draw(); }));
  root.querySelectorAll(".seg").forEach((seg) => seg.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) { state[seg.dataset.k] = b.dataset.v; draw(); }
  }));
  root.querySelectorAll("select[data-k]").forEach((s) => s.addEventListener("change", () => { state[s.dataset.k] = s.value; draw(); }));
  draw();
  return () => unhydrate?.();
}
