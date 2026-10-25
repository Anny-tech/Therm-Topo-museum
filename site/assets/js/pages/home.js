import { store } from "../store.js";
import { CrystalViewer, INKS } from "../viewer.js";
import { KnowledgeGraph } from "../graph.js";
import { LINEART, backdrop } from "../art.js";
import { esc, formulaHTML, citationHTML } from "../util.js";

const inksFor = (accent) => [accent, ...INKS.filter((c) => c.toLowerCase() !== (accent || "").toLowerCase())];
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

export async function render(root) {
  const [index, elements, graph, info, refs] = await Promise.all([store.index(), store.elements(), store.graph(), store.buildInfo(), store.references()]);
  const { families, materials } = index;
  const c = info.counts;
  const hero = materials.find((m) => m.id === "bi2te3") || materials.find((m) => m.thumb);
  const chen = refs["10.1126/science.1173034"], poudel = refs["10.1126/science.1156446"];

  root.innerHTML = `
  <section class="page">
    <div class="hero">
      <div>
        <h1>TeTI <em>Atlas</em><span class="dot">.</span></h1>
        <p class="lead">DFT-relaxed crystal structures from Materials Project, JARVIS-DFT, Alexandria and OQMD. Each one is symmetry-checked,
          benchmarked against experimental structures from the Crystallography Open Database, and linked to the key literature.
          Tetradymites, skutterudites, half-Heuslers, Zintl phases, IV–VI chalcogenides and topological semimetals, all in one collection.</p>
        <div class="hero-actions">
          <a class="btn" href="#/explore">Enter the collection →</a>
          <a class="btn ghost" href="#/tutorials">Tutorials</a>
          <a class="btn ghost" href="#/about">How the data is made</a>
        </div>
      </div>
      <div class="hero-art">
        ${backdrop({ blob: [18, 4, 82, 88], blobClass: "sky", ring: [-4, 52, 40], ring2: [70, -2, 26], hex: [-20, -6, 70, 60] })}
        <canvas class="hero-canvas" aria-label="Ball-and-stick model of the ${esc(hero?.formula_display || "")} crystal structure (drag to rotate)"></canvas>
        ${hero ? `<a class="caption" href="#/material/${hero.id}">${formulaHTML(hero.formula_display)} · ${esc(hero.recommended?.name || "")} ${esc(hero.recommended?.id || "")}</a>` : ""}
      </div>
    </div>

    <div class="stats">
      <div class="stat"><b>${c.materials}</b><span>materials on display</span></div>
      <div class="stat"><b>${c.structures}</b><span>DFT structures</span></div>
      <div class="stat"><b>${info.sources.filter((s) => s.n_structures).length}</b><span>open databases</span></div>
      <div class="stat"><b>${c.references}</b><span>Crossref-verified references</span></div>
      <div class="stat"><b>${c.tutorials}</b><span>curated tutorials</span></div>
      <div class="stat"><b>${c.graph_nodes}</b><span>knowledge-graph nodes</span></div>
    </div>
  </section>

  <section class="fact bleed">
    ${backdrop({ blob: [74, -30, 34, 150], blobClass: "warm", ring: [62, 40, 14], hex: [-8, 10, 30, 90] })}
    <div class="inner">
      <div class="tag">Did you know?</div>
      <div>
        <p class="big">The same crystal, <a href="#/material/bi2te3">Bi<sub>2</sub>Te<sub>3</sub></a>, underpins the best room-temperature
          thermoelectric coolers and was one of the first three-dimensional topological insulators confirmed by ARPES.
          Heavy atoms, strong spin–orbit coupling and a narrow gap serve both.</p>
        <div class="src">${[poudel, chen].filter(Boolean).map((r) => citationHTML(r)).join("<br>")}</div>
      </div>
    </div>
  </section>

  <section class="page">
    <div class="sec-head" style="margin-top:24px">
      <div><div class="eyebrow">What the atlas answers</div><h2>Questions behind every page</h2></div>
    </div>
    <div class="questions">
      <div class="question" style="--accent:var(--coral)">
        <div class="q-ic lineart" style="color:var(--coral)">${LINEART.cell}</div>
        <h3>Which DFT structure should I trust?</h3>
        <p>Each compound comes from up to five databases. We keep the relaxation in the experimental space group whose volume is closest to a COD structure, and show how far the others are.</p>
        <a class="more" href="#/about">How structures are chosen →</a>
      </div>
      <div class="question">
        <div class="q-ic lineart" style="color:var(--lav-deep)">${LINEART.inversion}</div>
        <h3>Is it topological, and how sure are we?</h3>
        <p>Spin–orbit spillage from JARVIS-DFT sits next to the experimental papers that settled the question, or the ones still debating it.</p>
        <a class="more" href="#/explore?app=topological">Topological materials →</a>
      </div>
      <div class="question">
        <div class="q-ic lineart" style="color:var(--sky-deep)">${LINEART.bz}</div>
        <h3>What does the crystal actually look like?</h3>
        <p>Robocrystallographer describes each structure in words, and Crystal-GENUI maps its coordination polyhedra, bond valences and Pauling rules.</p>
        <a class="more" href="#/material/${hero?.id || "bi2te3"}">See an example →</a>
      </div>
    </div>

    <div class="sec-head">
      <div><div class="eyebrow">Ontology</div><h2>The knowledge graph</h2>
        <p class="muted">Every exhibit is an instance in a small ontology (<a href="#/ontology">ttm</a>).
        Materials link to their family, crystal system, topological phase (SKOS hierarchy) and thermoelectric operating regime,
        and to the databases and papers that describe them. Toggle classes to explore. Elements and references are hidden at first.</p></div>
      <div class="lineart">${LINEART.dirac}</div>
    </div>
    <div class="kg" id="kg"></div>
    <div class="kg-legend">
      <span><i class="shape-circle"></i> material / family / element / database</span>
      <span><i class="shape-diamond"></i> concept (topological phase, regime)</span>
      <span><i class="shape-square"></i> crystallographic class</span>
      <span>– – skos:broader</span>
      <span>Ringed nodes are alloy systems</span>
    </div>

    <div class="sec-head">
      <div><div class="eyebrow">Collection</div><h2>Exhibit halls</h2>
        <p class="muted">Seven families, each drawn in its own colour. Open a hall to see its members, structure type and key reading.</p></div>
      <div class="lineart">${LINEART.bz}</div>
    </div>
    <div class="halls">
      ${families.map((f) => {
        const n = materials.filter((m) => m.family === f.id).length;
        return `<a class="hall-card" href="#/hall/${f.id}" style="--accent:${f.accent}">
          <span class="n">${n}</span><h3>${esc(f.name)}</h3><div class="sub">${formulaHTML(f.subtitle)}</div>
          <canvas data-hall="${f.id}" aria-hidden="true"></canvas></a>`;
      }).join("")}
    </div>
  </section>`;

  const cleanups = [];
  if (hero?.thumb) {
    const v = new CrystalViewer(root.querySelector(".hero-canvas"), hero.thumb, elements,
      { interactive: true, showAxes: false, atomScale: 0.55, palette: INKS });
    v.zoom = 1.05;
    if (!still) v.spin(true, 0.0025);
    cleanups.push(() => v.destroy());
  }
  const kg = new KnowledgeGraph(root.querySelector("#kg"), graph, { families });
  cleanups.push(() => kg.destroy());

  // a ball-and-stick sketch of a representative structure per hall, in the hall's ink
  const famById = Object.fromEntries(families.map((f) => [f.id, f]));
  root.querySelectorAll("canvas[data-hall]").forEach((cv) => {
    const m = materials.find((x) => x.family === cv.dataset.hall && x.thumb);
    if (!m) return;
    const v = new CrystalViewer(cv, m.thumb, elements, { interactive: false, showAxes: false, showCell: false, atomScale: 0.5,
      palette: inksFor(famById[cv.dataset.hall].accent) });
    v.ro?.disconnect();
  });
  return () => cleanups.forEach((f) => f());
}
