import { store } from "../store.js";
import { pageArt } from "../art.js";
import { CrystalViewer } from "../viewer.js";
import { cardHTML, hydrateThumbs } from "../components.js";
import { esc, fmt, fixed, formulaHTML, signedPct, spacegroupHTML, citationHTML, appBadges, statusBadge, SEVERITY } from "../util.js";

const EXTERNAL = [
  ["Topological Quantum Chemistry", "https://www.topologicalquantumchemistry.org/"],
  ["Materiae (topological materials)", "http://materiae.iphy.ac.cn/"],
  ["Starrydata (experimental TE data)", "https://www.starrydata2.org/"],
];

const label = (s) => s.replace(/([a-z])([A-Z])/g, "$1 $2");
const paramsUsed = (sys) =>
  sys === "cubic" ? ["a"] : ["tetragonal", "hexagonal", "trigonal"].includes(sys) ? ["a", "c"] : ["a", "b", "c"];

export async function render(root, [id]) {
  const [m, index, elements, refs, graph] = await Promise.all([
    store.material(id), store.index(), store.elements(), store.references(), store.graph(),
  ]);
  const conceptLabel = Object.fromEntries(graph.nodes.map((n) => [n.id, n.label]));
  const famById = Object.fromEntries(index.families.map((f) => [f.id, f]));
  const fam = famById[m.family] || {};
  root.style.setProperty("--accent", fam.accent || "#f26b6b");

  const ld = document.createElement("script");
  ld.type = "application/ld+json";
  ld.textContent = JSON.stringify(m.jsonld);
  document.head.appendChild(ld);
  const prevTitle = document.title;
  document.title = `${m.formula_display} · ${m.name} · TeTI Atlas`;
  const cleanups = [() => ld.remove(), () => { document.title = prevTitle; root.style.removeProperty("--accent"); }];

  const refList = (m.refs || []).map((d) => refs[d]).filter(Boolean);
  const head = `
    <div class="crumbs"><a href="#/explore">Collection</a> / <a href="#/hall/${esc(m.family)}">${esc(fam.name || m.family)}</a> / ${formulaHTML(m.formula_display)}</div>
    <div class="mat-head">
      <div><h1>${formulaHTML(m.formula_display)}</h1><div class="name">${esc(m.name)}</div></div>
      <div class="meta">${appBadges(m.applications)}
        ${m.spacegroup ? `<span class="badge badge-sg">${spacegroupHTML(m.spacegroup.symbol)} · #${m.spacegroup.number}</span>` : ""}
        ${m.kind === "alloy" ? '<span class="badge badge-muted">alloy system</span>' : ""}
        ${m.structure_status ? statusBadge(m.structure_status.level) : ""}
        ${m.topology_status === "candidate" ? '<span class="badge badge-warn">topology: candidate</span>' : ""}</div>
    </div>
    <p class="lead" style="max-width:900px">${esc(m.summary || "")}</p>`;

  if (m.kind === "alloy") {
    root.innerHTML = `<section class="page">${pageArt(m.applications?.includes("topological") ? "dirac" : "cell")}${head}
      <div class="callout info"><p>This is an <b>alloy system</b>. Solid solutions have no single ordered DFT structure, so the exhibit links to the
        ordered end members, whose relaxed structures are on display. Alloy properties depend strongly on composition, defects and processing.</p></div>
      <h2>End members</h2>
      <div class="cards">${(m.members || []).map((mid) => index.materials.find((x) => x.id === mid)).filter(Boolean).map((x) => cardHTML(x, famById)).join("")}</div>
      ${appPanels(m, null, conceptLabel)}
      ${highlightsHTML(m, refs)}
      ${caveatsHTML(m)}
      ${refsHTML(refList)}
    </section>`;
    const members = index.materials.filter((x) => (m.members || []).includes(x.id));
    cleanups.push(hydrateThumbs(root, members, elements));
    return () => cleanups.forEach((f) => f());
  }

  const sources = Object.values(m.sources || {});
  const rec = m.recommended;
  const state = { key: rec?.key || sources[0]?.key, cell: "conventional", n: 1 };
  const src = () => m.sources[state.key];

  root.innerHTML = `<section class="page">${pageArt(m.applications?.includes("topological") ? "dirac" : "cell")}${head}
    <div class="mat-grid">
      <div>
        <div class="viewer">
          <canvas aria-label="Interactive crystal structure of ${esc(m.formula_display)}"></canvas>
          <div class="viewer-legend">${[...new Set(sources[0]?.conventional.species || [])].map((s) =>
            `<span><i style="background:${elements[s]?.color}"></i>${esc(s)}</span>`).join("")}</div>
          <div class="viewer-src" id="vsrc"></div>
          <div class="viewer-hover" id="vhover" hidden></div>
          <div class="viewer-bar">
            <div class="seg" id="srcseg">${sources.map((s) => `<button data-v="${s.key}" title="${s.spacegroup_match ? "" : "Space group differs from experiment"}">${esc(s.name)}${s.spacegroup_match ? "" : " ⚠"}</button>`).join("")}</div>
          </div>
          <div class="viewer-bar">
            <div class="seg" id="cellseg"><button data-v="conventional">Conventional</button><button data-v="primitive">Primitive</button></div>
            <span class="sep"></span>
            <button class="tool" data-n="1">1×1×1</button><button class="tool" data-n="2">2×2×2</button>
            <span class="sep"></span>
            <button class="tool on" data-opt="showBonds">Bonds</button><button class="tool on" data-opt="showCell">Cell</button>
            <span class="sep"></span>
            <button class="tool" data-view="a">a</button><button class="tool" data-view="b">b</button><button class="tool" data-view="c">c</button>
            <button class="tool" id="spin">Spin</button>
          </div>
        </div>
        <p class="faint small">Drag to rotate, scroll to zoom, hover over an atom to identify its site. Bonds are drawn where d &lt; 1.18 × (r<sub>cov,i</sub> + r<sub>cov,j</sub>); they are a visual aid, not a bonding analysis.</p>
      </div>
      <div>
        <div class="panel" id="facts"></div>
      </div>
    </div>

    ${statusHTML(m)}
    ${highlightsHTML(m, refs)}
    ${appPanels(m, m.sources.jarvis, conceptLabel)}
    ${compareHTML(m)}
    ${codHTML(m)}
    ${roboHTML(m)}
    ${genuiHTML(m)}
    ${polymorphHTML(m)}
    ${caveatsHTML(m)}
    ${refsHTML(refList)}
    ${linksHTML(m)}
  </section>`;

  const $ = (s) => root.querySelector(s);
  const viewer = new CrystalViewer($("canvas"), src()[state.cell], elements, {
    onHover: (a) => {
      const h = $("#vhover");
      h.hidden = !a;
      if (a) h.textContent = `${a.sp} · site ${a.site + 1} · (${a.frac.map((x) => x.toFixed(4)).join(", ")})`;
    },
  });
  cleanups.push(() => viewer.destroy());

  function sync() {
    const s = src();
    root.querySelectorAll("#srcseg button").forEach((b) => b.classList.toggle("on", b.dataset.v === state.key));
    root.querySelectorAll("#cellseg button").forEach((b) => b.classList.toggle("on", b.dataset.v === state.cell));
    root.querySelectorAll("[data-n]").forEach((b) => b.classList.toggle("on", +b.dataset.n === state.n));
    $("#vsrc").innerHTML = `${esc(s.name)} · <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.id)}</a><br>${esc(s.functional)} · ${s[state.cell].nsites} atoms`;
    $("#facts").innerHTML = factsHTML(m, s, state.cell);
  }
  function load() {
    viewer.n = [state.n, state.n, state.n];
    viewer.setCell(src()[state.cell]);
    sync();
  }
  $("#srcseg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.key = b.dataset.v; load(); } });
  $("#cellseg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.cell = b.dataset.v; load(); } });
  root.querySelectorAll("[data-n]").forEach((b) => b.addEventListener("click", () => { state.n = +b.dataset.n; load(); }));
  root.querySelectorAll("[data-opt]").forEach((b) => b.addEventListener("click", () => {
    b.classList.toggle("on");
    viewer.set(b.dataset.opt, b.classList.contains("on"));
  }));
  root.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => viewer.view(b.dataset.view)));
  $("#spin").addEventListener("click", (e) => {
    const on = e.currentTarget.classList.toggle("on");
    viewer.spin(on, 0.004);
  });
  sync();

  // Crystal-GENUI tabs; the interactive polyhedra viewer is loaded on demand.
  const tabs = root.querySelector("#genui-tabs");
  tabs?.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    tabs.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    root.querySelectorAll("[data-pane]").forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab));
    const frame = root.querySelector("iframe.genui");
    if (b.dataset.tab === "viewer" && frame && !frame.src) frame.src = frame.dataset.src;
  });

  return () => cleanups.forEach((f) => f());
}

function factsHTML(m, s, cellKind) {
  const c = s[cellKind];
  const p = c.params;
  const sg = s.spacegroup;
  const isRec = m.recommended?.key === s.key;
  const props = s.properties || {};
  const wy = (s.wyckoffs || []).map((w) => { const [el, l] = w.split(":"); return `${esc(el)} <i>${esc(l)}</i>`; }).join(", ");
  return `
    <div class="panel-title"><h3>Structure facts</h3>${isRec ? '<span class="badge badge-good">recommended</span>' : ""}</div>
    ${isRec ? `<p class="small muted" style="margin-top:0">${esc(m.recommended_reason || "")}</p>` : ""}
    ${s.spacegroup_match ? "" : `<div class="callout warn small"><p>This relaxed structure is in ${spacegroupHTML(sg.spacegroup_symbol)},
      not the experimental space group. It may be a different polymorph or a distorted relaxation, so it is shown for comparison only.</p></div>`}
    <dl class="kv">
      <dt>Source</dt><dd><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)} ${esc(s.id)}</a></dd>
      <dt>Functional</dt><dd>${esc(s.functional)}</dd>
      <dt>Space group</dt><dd>${spacegroupHTML(sg.spacegroup_symbol)} (#${sg.spacegroup_number}) · ${esc(sg.crystal_system)} · point group ${spacegroupHTML(sg.point_group)}</dd>
      <dt>spglib tolerance</dt><dd>${s.symprec} Å</dd>
      <dt>Cell (${cellKind})</dt><dd>a = ${fixed(p.a, 4)}, b = ${fixed(p.b, 4)}, c = ${fixed(p.c, 4)} Å<br>
        α = ${fixed(p.alpha, 2)}°, β = ${fixed(p.beta, 2)}°, γ = ${fixed(p.gamma, 2)}°</dd>
      <dt>Volume</dt><dd>${fixed(c.volume, 2)} Å³ · ${c.nsites} atoms · ${fixed(s.volume_per_atom, 3)} Å³/atom</dd>
      <dt>Density</dt><dd>${fixed(s.density, 3)} g cm⁻³</dd>
      <dt>Wyckoff sites</dt><dd>${wy}</dd>
      <dt>E above hull</dt><dd>${fmt(props.e_above_hull, 3, "eV/atom")}</dd>
      <dt>Formation energy</dt><dd>${fmt(props.formation_energy, 3, "eV/atom")}</dd>
      ${props.band_gap !== undefined ? `<dt>Band gap</dt><dd>${fmt(props.band_gap, 3, "eV")} <span class="faint small">(${esc(s.functional)}${s.key === "jarvis" ? ", no SOC" : ""})</span></dd>` : ""}
      ${s.vs_experiment ? `<dt>vs experiment</dt><dd>ΔV/atom ${signedPct(s.vs_experiment.volume_per_atom)}</dd>` : ""}
    </dl>
    <h4 style="margin:16px 0 8px">Download this structure</h4>
    <div class="downloads">
      <a class="btn small" href="${esc(s.files.cif)}" download>CIF</a>
      <a class="btn ghost small" href="${esc(s.files.poscar)}" download>POSCAR</a>
    </div>
    <p class="faint small">Files contain the conventional standard cell with positions idealized by spglib at the tolerance above. Cite the source database: <a href="https://doi.org/${esc(s.cite)}" target="_blank" rel="noopener">doi:${esc(s.cite)}</a>.</p>`;
}

function statusHTML(m) {
  const st = m.structure_status;
  if (!st) return "";
  const intro = {
    benchmarked: "The recommended structure was compared with an experimental structure in the same space group.",
    "not benchmarked": "No comparable experimental structure was available, so the recommended structure rests on DFT alone.",
    ambiguous: "No single DFT cell can be trusted to represent the experimental structure. Read the points below before using these structures.",
  }[st.level];
  const order = { ambiguous: 0, missing: 1, note: 2 };
  const issues = [...st.issues].sort((a, b) => order[a.severity] - order[b.severity]);
  return `<div class="panel" style="margin-top:22px">
    <div class="panel-title"><h3>Structure status and missing information</h3>${statusBadge(st.level)}</div>
    <p class="small muted" style="margin:0">${intro}${m.fetched ? ` Data fetched ${esc(m.fetched.slice(0, 10))}.` : ""}</p>
    ${issues.length ? `<ul class="issues">${issues.map((i) => `<li><span class="badge ${SEVERITY[i.severity].cls}">${SEVERITY[i.severity].text}</span><span>${esc(i.text)}</span></li>`).join("")}</ul>`
      : '<p class="small">All five databases, JARVIS spillage and transport data, and an experimental reference are available.</p>'}
  </div>`;
}

function highlightsHTML(m, refs) {
  if (!m.highlights?.length) return "";
  return `<h2>Key experimental facts</h2><div class="highlights">${m.highlights.map((h) => {
    const r = refs[h.doi];
    return `<div class="highlight"><div class="p">${esc(h.property)}</div><div class="v">${formulaHTML(h.value)}</div>
      ${h.conditions ? `<div class="c">${esc(h.conditions)}</div>` : ""}
      ${h.doi ? `<div class="src"><a href="https://doi.org/${esc(h.doi)}" target="_blank" rel="noopener">${r ? `${esc(r.authors?.[0]?.split(" ").slice(-1)[0] || "")} ${r.year}, ${esc(r.journal)}` : `doi:${esc(h.doi)}`}</a></div>` : ""}</div>`;
  }).join("")}</div>`;
}

function appPanels(m, jv, conceptLabel) {
  const jvOk = jv && jv.spacegroup_match;
  const p = jvOk ? jv.properties : {};
  const spill = p.spillage;
  const meter = spill !== null && spill !== undefined
    ? `<div class="small muted" style="margin-top:12px">JARVIS-DFT spin–orbit spillage: <b>${fixed(spill, 2)}</b></div>
       <div class="meter"><i style="left:calc(${Math.min(spill, 2) / 2 * 100}% - 2px)"></i></div>
       <div class="meter-scale"><span>0</span><span>0.5 threshold</span><span>1</span><span>1.5</span><span>≥2</span></div>
       <p class="faint small">Spillage measures how much the occupied wavefunctions change when spin–orbit coupling is switched on. Values ≥ 0.5 indicate an
         SOC-driven band inversion (<a href="https://doi.org/10.1038/s41598-019-45028-y" target="_blank" rel="noopener">Choudhary et al., Sci. Rep. 2019</a>). This is a screening
         signal from semilocal DFT, not a computed topological invariant.</p>`
    : "";
  const tc = m.transport_conditions;
  const te = jvOk && (p.seebeck_n !== null || p.seebeck_p !== null)
    ? `<table class="data compact" style="margin-top:12px"><thead><tr><th>JARVIS-DFT (BoltzTraP)</th><th class="num">n-type</th><th class="num">p-type</th></tr></thead><tbody>
        <tr><td>Seebeck coefficient (µV/K)</td><td class="num">${fmt(p.seebeck_n, 3)}</td><td class="num">${fmt(p.seebeck_p, 3)}</td></tr>
        <tr><td>Power factor (µW m⁻¹ K⁻², τ-dependent)</td><td class="num">${fmt(p.powerfactor_n, 3)}</td><td class="num">${fmt(p.powerfactor_p, 3)}</td></tr>
        <tr><td>Avg. effective mass (m<sub>e</sub>)</td><td class="num">${fmt(p.avg_elec_mass, 2)}</td><td class="num">${fmt(p.avg_hole_mass, 2)}</td></tr>
       </tbody></table>
       ${tc ? `<dl class="kv small" style="margin-top:10px">
         <dt>Temperature</dt><dd>${tc.temperature_K} K</dd>
         <dt>Carrier concentration</dt><dd>10<sup>20</sup> cm⁻³ (electrons for n, holes for p)</dd>
         <dt>Relaxation time τ</dt><dd>10<sup>−14</sup> s, constant</dd>
         <dt>Method</dt><dd><a href="https://doi.org/${esc(tc.code_doi)}" target="_blank" rel="noopener">BoltzTraP</a>, ${esc(tc.approximations)} approximations</dd>
         <dt>Bands</dt><dd>${esc(tc.bands)}</dd></dl>` : ""}
       <p class="faint small">${(tc?.notes || []).map(esc).join(" ")} Source: <a href="https://doi.org/10.1088/1361-648X/aba06b" target="_blank" rel="noopener">Choudhary, Garrity &amp; Tavazza,
         J. Phys.: Condens. Matter 32, 475501 (2020)</a>. Use these numbers to compare materials, not to predict a measured S(T).</p>`
    : "";
  const phases = (m.topological_phases || []).map((ph) => `<span class="badge badge-topological">${esc(conceptLabel[`phase:${ph}`] || label(ph))}</span>`).join("");
  const regimes = (m.regimes || []).map((r) => `<span class="badge badge-thermoelectric">${esc(conceptLabel[`regime:${r}`] || label(r))}</span>`).join("");
  return `<div class="mat-grid">
    <div class="panel"><h3>Topology</h3>
      <p>${esc(m.topology || "No topological classification is recorded for this material.")}</p>
      <div class="meta">${phases}${m.topology_status === "candidate" ? '<span class="badge badge-warn">candidate / predicted</span>' : ""}</div>
      ${meter}
    </div>
    <div class="panel"><h3>Thermoelectric</h3>
      <p>${esc(m.thermoelectric || "No thermoelectric performance is recorded for this material.")}</p>
      <div class="meta">${regimes}</div>
      ${te}
    </div>
  </div>`;
}

function compareHTML(m) {
  const sources = Object.values(m.sources);
  const ref = m.cod?.reference;
  const sys = m.spacegroup?.crystal_system;
  const keys = paramsUsed(sys);
  const devKeys = sys === "cubic" ? ["a"] : ["tetragonal", "hexagonal", "trigonal"].includes(sys) ? ["a", "c"] : ["short", "middle", "long"];
  return `<h2>Database comparison</h2>
    <p class="muted" style="max-width:900px">The same compound relaxed by different databases and functionals. Deviations are relative to the experimental
      reference${ref ? ` (COD <a href="${esc(ref.url)}" target="_blank" rel="noopener">${esc(ref.id)}</a>)` : ""}. PBE typically overestimates lattice
      parameters by 1–2 %. PBEsol and vdW-corrected functionals usually come closer, especially for layered compounds.</p>
    <div class="table-wrap"><table class="data"><thead><tr>
      <th>Source</th><th>Functional</th><th>Space group</th><th class="num">tol. (Å)</th>
      ${keys.map((k) => `<th class="num">${k} (Å)</th>`).join("")}<th class="num">V/atom (Å³)</th>
      <th class="num">ΔV</th>${devKeys.map((k) => `<th class="num">Δ${k}</th>`).join("")}
      <th class="num">E<sub>hull</sub> (eV/at)</th><th>Files</th></tr></thead><tbody>
      ${sources.map((s) => {
        const p = s.conventional.params, v = s.vs_experiment || {};
        return `<tr${m.recommended?.key === s.key ? ' class="rec"' : ""}>
          <td><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a><div class="faint small">${esc(s.id)}${m.recommended?.key === s.key ? " · recommended" : ""}</div></td>
          <td>${esc(s.functional)}</td>
          <td>${spacegroupHTML(s.spacegroup.spacegroup_symbol)} ${s.spacegroup_match ? '<span class="dev-good">✓</span>' : '<span class="dev-bad" title="differs from experiment">✗</span>'}</td>
          <td class="num">${s.symprec}</td>
          ${keys.map((k) => `<td class="num">${fixed(p[k], 3)}</td>`).join("")}
          <td class="num">${fixed(s.volume_per_atom, 2)}</td>
          <td class="num">${signedPct(v.volume_per_atom)}</td>${devKeys.map((k) => `<td class="num">${signedPct(v[k])}</td>`).join("")}
          <td class="num">${fmt(s.properties.e_above_hull, 3)}</td>
          <td><a href="${esc(s.files.cif)}" download>CIF</a> · <a href="${esc(s.files.poscar)}" download>POSCAR</a></td></tr>`;
      }).join("")}
      ${ref ? `<tr class="exp"><td><a href="${esc(ref.url)}" target="_blank" rel="noopener">Experiment (COD)</a><div class="faint small">${esc(ref.id)} · ${esc(ref.authors || "")} ${esc(ref.year || "")}</div></td>
        <td>XRD</td><td>${esc(ref.spacegroup_symbol)}</td><td></td>
        ${keys.map((k) => `<td class="num">${fixed(ref.params[k], 3)}</td>`).join("")}<td class="num">${fixed(ref.volume_per_atom, 2)}</td>
        <td></td>${devKeys.map(() => "<td></td>").join("")}<td></td><td><a href="${esc(ref.cif)}" target="_blank" rel="noopener">CIF</a></td></tr>` : ""}
    </tbody></table></div>
    ${sys && !["cubic", "tetragonal", "hexagonal", "trigonal"].includes(sys) ? '<p class="faint small">For low-symmetry cells, deviations compare the sorted lattice lengths (short / middle / long), because databases may use different axis settings.</p>' : ""}
    <p class="faint small">Deviations are shown only when a DFT structure and the COD reference are in the same space group with volumes within 15 %.
      Otherwise the cells are not comparable one to one. Missing databases are listed under “Structure status” above.</p>`;
}

function codHTML(m) {
  const c = m.cod;
  if (!c?.entries?.length) {
    return `<h2>Experimental structures</h2><p class="muted">No matching experimental structure was found in the Crystallography Open Database.
      Check the ICSD${m.sources?.jarvis?.properties?.icsd ? ` (JARVIS lists ICSD ${esc(m.sources.jarvis.properties.icsd.split(",").slice(0, 4).join(", "))})` : ""}.</p>`;
  }
  return `<h2>Experimental structures <span class="faint small">(${c.count} in COD)</span></h2>
    <p class="muted" style="max-width:900px">Entries from the Crystallography Open Database in the experimental space group. Each deposited CIF is read directly
      (occupancies included) and reduced to the same standard setting as the DFT structures, because COD's catalogue metadata are occasionally inconsistent with the
      deposited cell. The reference used above is the entry closest to the median volume (${fixed(c.median_volume_per_atom, 3)} Å³/atom), so a single outlier
      cannot skew the comparison${c.volume_spread ? `. These entries span ${fixed(c.volume_spread, 1)} % in volume per atom` : ""}.</p>
    <div class="table-wrap"><table class="data"><thead><tr><th>COD</th><th>Space group</th><th class="num">a</th><th class="num">b</th><th class="num">c</th>
      <th class="num">V/atom</th><th class="num">vs median</th><th>Publication</th></tr></thead><tbody>
      ${c.entries.map((e) => `<tr${e.id === c.reference?.id ? ' class="rec"' : ""}>
        <td><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.id)}</a>${e.id === c.reference?.id ? ' <span class="faint small">reference</span>' : ""}
          ${e.disordered ? '<div><span class="badge badge-warn" title="Partially occupied sites">disordered</span></div>' : ""}</td>
        <td>${esc(e.spacegroup_symbol)}${e.setting && e.setting !== "as reported" ? `<div class="faint small">${esc(e.setting)}</div>` : ""}
          ${e.cell_spacegroup_number && e.cell_spacegroup_number !== e.spacegroup_number ? `<div class="faint small">CIF symmetry: No. ${e.cell_spacegroup_number}</div>` : ""}</td>
        <td class="num">${fixed(e.params.a, 3)}</td><td class="num">${fixed(e.params.b, 3)}</td><td class="num">${fixed(e.params.c, 3)}</td>
        <td class="num">${fixed(e.volume_per_atom, 2)}${e.cell_source === "COD metadata" ? '<div class="faint small" title="The CIF could not be parsed">metadata</div>' : ""}</td>
        <td class="num">${signedPct(e.deviation_from_median)}</td>
        <td class="small">${esc(e.authors || "")} (${esc(e.year || "")}) <i>${esc(e.journal || "")}</i> ${esc(e.citation_volume || "")}${e.first_page ? `, ${esc(e.first_page)}` : ""}${e.temperature ? ` · ${esc(e.temperature)} K` : ""}
          ${e.note ? `<div class="faint small">${esc(e.note)}</div>` : ""}</td></tr>`).join("")}
    </tbody></table></div>`;
}

function roboHTML(m) {
  const d = m.description;
  if (!d?.text) return "";
  const paras = d.text.split(/(?<=\.)\s+(?=There (?:are|is)|In the|[A-Z][a-z]?\(\d+\) is)/).filter(Boolean);
  return `<h2>Structure in words</h2>
    <div class="panel"><div class="panel-title"><h3>Robocrystallographer</h3>
      <span class="faint small">${d.mineral ? `mineral prototype: ${esc(d.mineral)} · ` : ""}${d.dimensionality !== null && d.dimensionality !== undefined ? `bonded network: ${d.dimensionality}D` : ""}</span></div>
      <div class="robo">${paras.map((p) => `<p>${esc(p)}</p>`).join("")}</div>
      <p class="faint small">Generated from the recommended structure by <a href="https://github.com/hackingmaterials/robocrystallographer" target="_blank" rel="noopener">robocrystallographer</a>
        (Ganose &amp; Jain, <a href="https://doi.org/${esc(d.doi)}" target="_blank" rel="noopener">MRS Commun. 2019</a>). Bonding uses a heuristic near-neighbour method, so read the coordination
        and dimensionality as a starting point. They are not a substitute for a bonding analysis.</p>
    </div>`;
}

function genuiHTML(m) {
  const P = m.polyhedra;
  if (!P) return "";
  const cc = P.crystal_chemistry || {};
  const conn = (c) => Object.entries(c || {}).filter(([, v]) => v).map(([k, v]) => `${esc(k)} ${+v}`).join(", ") || "isolated";
  const typesTable = P.types?.length
    ? `<div class="table-wrap"><table class="data"><thead><tr><th>Polyhedron</th><th>Site</th><th class="num">CN</th><th>Shape</th><th>Sharing (per polyhedron)</th>
        <th class="num">⟨d⟩ (Å)</th><th class="num">Volume (Å³)</th><th class="num">ECoN</th><th class="num">QE</th><th class="num">BAV (deg²)</th><th class="num">BVS</th></tr></thead><tbody>
        ${P.types.map((t) => `<tr><td>${formulaHTML(t.center)}${formulaHTML(t.ligand_formula)}</td><td>${esc(t.center)} ${esc(t.wyckoff)}</td><td class="num">${t.cn}</td>
          <td>${esc(t.shape)}</td><td>${conn(t.connectivity)}</td><td class="num">${fixed(t.avg_bond, 3)}</td><td class="num">${fixed(t.volume, 2)}</td>
          <td class="num">${fixed(t.econ, 2)}</td><td class="num">${fixed(t.qe, 4)}</td><td class="num">${fixed(t.bav, 2)}</td><td class="num">${fixed(t.bvs, 2)}</td></tr>`).join("")}
       </tbody></table></div>
       <p class="faint small">QE = quadratic elongation, BAV = bond-angle variance (Robinson et al. 1971). ECoN = effective coordination number (Hoppe 1979). BVS = bond-valence sum.</p>`
    : '<p class="muted">No closed coordination polyhedra were found with the default Shannon-radius bonding criterion. Each site\'s reason is listed under “Sites”.</p>';
  const sitesTable = `<div class="table-wrap"><table class="data"><thead><tr><th>Site</th><th>Wyckoff</th><th>Site symmetry</th><th class="num">Ox. state</th>
      <th class="num">CN</th><th>Ligands</th><th>Shape</th><th>Note</th></tr></thead><tbody>
      ${(P.sites || []).map((s) => `<tr><td>${esc(s.label)}</td><td>${esc(s.wyckoff)}</td><td>${spacegroupHTML(s.site_symmetry)}</td>
        <td class="num">${s.oxidation_state > 0 ? "+" : ""}${fmt(s.oxidation_state, 2)}</td><td class="num">${s.cn}</td><td>${formulaHTML(s.ligands)}</td>
        <td>${esc(s.shape || "")}</td><td class="small faint">${s.polyhedron ? "" : esc(s.reason || "")}</td></tr>`).join("")}
    </tbody></table></div>`;
  const gii = cc.global_instability_index;
  const giiText = gii === null || gii === undefined ? "" : gii < 0.1 ? "low: bond valences are well satisfied"
    : gii < 0.2 ? "moderate: some lattice strain" : "high: typical for covalent, metallic or intermetallic bonding, where ionic bond-valence parameters do not apply well";
  const r1 = cc.pauling_rule_1_radius_ratio || [], r2 = cc.pauling_rule_2_electrostatic_valence || [], bvs = cc.bond_valence_sums || [];
  const chem = `
    <p class="muted small">Pauling's rules and bond valences assume ionic bonding with nominal oxidation states (${Object.entries(P.settings?.oxidation_states || {}).map(([e, o]) => `${esc(e)} ${o > 0 ? "+" : ""}${o}`).join(", ")}).
      Most thermoelectrics and topological materials are strongly covalent or metallic, so treat violations as descriptive, not as signs of instability.</p>
    <dl class="kv">
      ${gii !== null && gii !== undefined ? `<dt>Global instability index</dt><dd><b>${fixed(gii, 3)}</b> v.u. <span class="faint">(${giiText}; Salinas-Sanchez et al. 1992)</span></dd>` : ""}
      ${cc.bond_count_balance ? `<dt>Bond count balance</dt><dd>${cc.bond_count_balance.cation_side} cation-side / ${cc.bond_count_balance.anion_side} anion-side ${cc.bond_count_balance.balanced ? '<span class="dev-good">✓</span>' : '<span class="dev-bad">✗</span>'}</dd>` : ""}
      ${cc.site_symmetry_consistent !== undefined ? `<dt>Site symmetry consistent</dt><dd>${cc.site_symmetry_consistent ? '<span class="dev-good">yes</span>' : '<span class="dev-bad">no</span>'}</dd>` : ""}
      ${cc.pauling_rule_3_polyhedron_sharing ? `<dt>Rule 3, sharing</dt><dd>${Object.entries(cc.pauling_rule_3_polyhedron_sharing).map(([k, v]) => `${esc(k)}: ${Object.entries(v).map(([t, n]) => `${t} ${n}`).join(", ")}`).join("<br>") || "—"}</dd>` : ""}
      ${cc.pauling_rule_5_parsimony ? `<dt>Rule 5, parsimony</dt><dd>${Object.entries(cc.pauling_rule_5_parsimony).map(([e, n]) => `${esc(e)}: ${n} environment${n > 1 ? "s" : ""}`).join(", ")}</dd>` : ""}
    </dl>
    <div class="mat-grid" style="margin-top:14px">
      <div>${r1.length ? `<h4>Rule 1: radius ratio</h4><table class="data compact"><thead><tr><th>Site</th><th class="num">r<sub>c</sub>/r<sub>a</sub></th><th class="num">CN pred.</th><th class="num">CN obs.</th><th></th></tr></thead><tbody>
        ${r1.map((r) => `<tr><td>${esc(r.site)}</td><td class="num">${fixed(r.radius_ratio, 3)}</td><td class="num">${r.predicted_cn}</td><td class="num">${r.observed_cn}</td><td>${r.agrees ? '<span class="dev-good">✓</span>' : '<span class="dev-bad">✗</span>'}</td></tr>`).join("")}</tbody></table>` : ""}
      ${r2.length ? `<h4>Rule 2: electrostatic valence</h4><table class="data compact"><thead><tr><th>Anion site</th><th class="num">Σ s</th><th class="num">|charge|</th><th class="num">dev.</th><th></th></tr></thead><tbody>
        ${r2.map((r) => `<tr><td>${esc(r.site)}</td><td class="num">${fixed(r.sum_of_electrostatic_bond_strengths, 2)}</td><td class="num">${fixed(r.anion_charge, 1)}</td><td class="num">${signedPct(r.relative_deviation * 100)}</td><td>${r.satisfied ? '<span class="dev-good">✓</span>' : '<span class="dev-bad">✗</span>'}</td></tr>`).join("")}</tbody></table>` : ""}</div>
      <div>${bvs.length ? `<h4>Bond-valence sums</h4><table class="data compact"><thead><tr><th>Site</th><th class="num">BVS</th><th class="num">expected</th><th class="num">dev.</th></tr></thead><tbody>
        ${bvs.map((r) => `<tr><td>${esc(r.site)}</td><td class="num">${fixed(r.bvs, 3)}</td><td class="num">${fixed(r.expected, 1)}</td><td class="num">${r.deviation > 0 ? "+" : ""}${fixed(r.deviation, 3)}</td></tr>`).join("")}</tbody></table>` : ""}</div>
    </div>`;
  const f = P.files || {};
  return `<h2>Coordination polyhedra</h2>
    <div class="panel">
      <div class="panel-title"><h3>Crystal-GENUI analysis</h3><span class="faint small">motifs: ${(P.motifs || []).map(esc).join(", ") || "none"}</span></div>
      <div class="tabs" id="genui-tabs"><button class="on" data-tab="types">Polyhedra</button><button data-tab="sites">Sites</button>
        <button data-tab="chem">Crystal chemistry</button>${f.viewer ? '<button data-tab="viewer">Interactive 3D</button>' : ""}</div>
      <div data-pane="types">${typesTable}</div>
      <div data-pane="sites" hidden>${sitesTable}</div>
      <div data-pane="chem" hidden>${chem}</div>
      ${f.viewer ? `<div data-pane="viewer" hidden><iframe class="genui" data-src="${esc(f.viewer)}" title="Crystal-GENUI polyhedra viewer" loading="lazy"></iframe>
        <p class="small"><a href="${esc(f.viewer)}" target="_blank" rel="noopener">Open the viewer in a new tab ↗</a></p></div>` : ""}
      <div class="downloads" style="margin-top:12px">${[["json", "JSON"], ["polyhedra", "polyhedra.csv"], ["types", "types.csv"], ["sites", "sites.csv"], ["bonds", "bonds.csv"]]
        .filter(([k]) => f[k]).map(([k, l]) => `<a class="btn ghost small" href="${esc(f[k])}" download>${l}</a>`).join("")}</div>
      <p class="faint small">Computed on the recommended structure with <a href="${esc(P.url)}" target="_blank" rel="noopener">Crystal-GENUI</a> (Ankita Biswas),
        with bonds from Shannon radii (tolerance ${P.settings?.radius_tolerance ?? "—"}) and charge-balanced oxidation states guessed from the composition (pymatgen).</p>
    </div>`;
}

function polymorphHTML(m) {
  const rows = [];
  for (const s of Object.values(m.sources)) for (const p of s.polymorphs || []) rows.push({ ...p, src: s.name });
  if (rows.length <= Object.keys(m.sources).length) return "";
  rows.sort((a, b) => (a.e_above_hull ?? 9) - (b.e_above_hull ?? 9));
  return `<details class="panel" style="margin-top:22px"><summary><b>Other polymorphs in the databases</b> <span class="faint small">(${rows.length} entries with this composition)</span></summary>
    <div class="table-wrap" style="margin-top:12px"><table class="data compact"><thead><tr><th>Database</th><th>ID</th><th>Space group</th><th class="num">E<sub>hull</sub> (eV/at)</th><th class="num">Atoms (prim.)</th></tr></thead><tbody>
    ${rows.map((p) => `<tr><td>${esc(p.src)}</td><td><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.id)}</a></td><td>${spacegroupHTML(p.spacegroup)} <span class="faint">${p.spacegroup_number}</span></td>
      <td class="num">${fmt(p.e_above_hull, 3)}</td><td class="num">${p.nsites}</td></tr>`).join("")}</tbody></table></div>
    <p class="faint small">High-energy entries are often hypothetical or prototype-derived structures, not observed phases.</p></details>`;
}

function caveatsHTML(m) {
  if (!m.caveats) return "";
  return `<div class="callout warn" style="margin-top:22px"><p><b>For the experimentalist:</b> ${esc(m.caveats)}</p></div>`;
}

function refsHTML(list) {
  if (!list.length) return "";
  return `<h2>Key literature</h2><ul class="refs">${list.map((r) => `<li>${citationHTML(r, { full: true })}</li>`).join("")}</ul>`;
}

function linksHTML(m) {
  return `<h2>Elsewhere</h2><div class="downloads">
    ${Object.values(m.sources).map((s) => `<a class="btn ghost small" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)} ${esc(s.id)} ↗</a>`).join("")}
    ${EXTERNAL.map(([n, u]) => `<a class="btn ghost small" href="${u}" target="_blank" rel="noopener">${n} ↗</a>`).join("")}</div>`;
}
