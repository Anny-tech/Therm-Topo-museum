import { store } from "../store.js";
import { pageArt } from "../art.js";
import { esc, formulaHTML, statusBadge, SEVERITY } from "../util.js";

export async function render(root) {
  const info = await store.buildInfo();
  const doi = (d, text) => `<a href="https://doi.org/${esc(d)}" target="_blank" rel="noopener">${text || `doi:${esc(d)}`}</a>`;
  root.innerHTML = `<section class="page prose">${pageArt("dirac")}
    <div class="eyebrow">Methods &amp; provenance</div>
    <h1>How the data is made</h1>
    <p class="lead">Every number in the atlas comes from a named source, and every DOI is checked against Crossref.
      This page explains what the pipeline does and where its limits are. Last build: <b>${esc(info.built)}</b>.</p>

    <h2>Sources and licences</h2>
    <div class="table-wrap"><table class="data"><thead><tr><th>Database</th><th>Functional</th><th class="num">Structures used</th><th>Licence</th><th>Cite</th></tr></thead><tbody>
      ${info.sources.map((s) => `<tr><td><a href="${esc(s.homepage)}" target="_blank" rel="noopener">${esc(s.name)}</a></td><td>${esc(s.functional || "experiment (XRD)")}</td>
        <td class="num">${s.n_structures || '<span class="na">0</span>'}</td><td><a href="${esc(s.license_url)}" target="_blank" rel="noopener">${esc(s.license)}</a></td><td>${doi(s.cite)}</td></tr>`).join("")}
    </tbody></table></div>
    ${info.sources.some((s) => s.n_unavailable) ? `<p class="faint small">Unreachable during the last build: ${info.sources.filter((s) => s.n_unavailable).map((s) => `${esc(s.name)} (${s.n_unavailable} compounds)`).join(", ")}.
      Failed queries are not cached, so the next build tries again; affected exhibits say so under “Structure status”.</p>` : ""}
    <p>Structures were retrieved through the <a href="https://www.optimade.org/" target="_blank" rel="noopener">OPTIMADE</a> API
      (${doi("10.1038/s41597-021-00974-z", "Andersen et al. 2021")}), except JARVIS-DFT, which comes from its published <code>dft_3d</code> dataset.
      Reuse the structures under the licence of the database they came from, and cite it.</p>

    <h2>Choosing the structure</h2>
    <ol>
      <li><b>Match the composition.</b> For each compound, the pipeline queries every database for the reduced formula and keeps all polymorphs.</li>
      <li><b>Match the experimental phase.</b> Among the polymorphs, it picks the entry in the experimentally observed space group with the lowest energy
        above the convex hull. If none matches, it takes the lowest-energy entry and flags it with ⚠ on the exhibit.</li>
      <li><b>Symmetry.</b> <a href="https://spglib.readthedocs.io/" target="_blank" rel="noopener">spglib</a> finds the space group at tolerances of 10⁻³, 10⁻², 0.05 and 0.1 Å.
        The strictest tolerance that recovers the experimental space group is used and shown on every exhibit. This way, numerical noise from a relaxation
        cannot hide the true symmetry, and a looser tolerance is never applied without being reported.</li>
      <li><b>Standardise.</b> Downloads contain the conventional standard cell, with positions idealised by spglib at that tolerance. The primitive cell is
        available in the viewer.</li>
      <li><b>Recommend one.</b> When an experimental structure exists, the recommended structure is the space-group-matching entry whose volume per atom is
        closest to experiment. Otherwise the order is Materials Project, JARVIS-DFT, Alexandria (PBEsol), Alexandria (PBE), OQMD.</li>
    </ol>

    <h2>Benchmarking against experiment</h2>
    <p>Experimental structures come from the <a href="https://www.crystallography.net/cod/" target="_blank" rel="noopener">Crystallography Open Database</a>
      (${doi("10.1107/s0021889809016690", "Gražulis et al. 2009")}). Only entries in the experimental space group are kept. Entries flagged with errors, retracted entries and high-pressure studies are excluded.
      Each deposited CIF is parsed directly, counting atoms with their site occupancies, and reduced by spglib to the same conventional standard setting as the DFT
      structures. COD's catalogue metadata (cell volume, Z) are used only when a CIF cannot be read, because they occasionally disagree with the deposited cell.
      The reference entry is the one closest to the median volume per atom, so one outlying measurement cannot skew the comparison; on a tie the more recent study wins.
      Deviations are reported as:</p>
    <ul>
      <li>cubic: Δa; tetragonal, trigonal and hexagonal: Δa and Δc;</li>
      <li>orthorhombic and lower: the sorted lattice lengths (short / middle / long), which do not depend on the axis setting;</li>
      <li>ΔV per atom in all cases.</li>
    </ul>
    <p>Deviations are shown only when the DFT structure and the COD reference are in the <i>same</i> space group (as determined from the CIF) and their volumes per atom
      agree within 15 %. A larger difference usually means a different phase, a supercell or an inconsistent entry, and such pairs are reported on the exhibit instead of compared.</p>
    <p>As a rule of thumb, PBE overestimates lattice parameters by about 1–2 %. PBEsol is typically within 1 %. For van der Waals–layered compounds
      (tetradymites, GeTe-type and SnSe-type), functionals without a dispersion correction can overestimate the interlayer axis by several percent.
      Room-temperature XRD also includes thermal expansion, which a 0 K relaxation does not.</p>

    <h2>Computed properties</h2>
    <ul>
      <li><b>Band gaps</b> from semilocal DFT (PBE, PBEsol, OptB88vdW) are systematically underestimated. The TBmBJ gaps from JARVIS are usually closer to experiment.
        For heavy-element compounds, spin–orbit coupling (absent in most database gaps) can close or invert the gap.</li>
      <li><b>Spin–orbit spillage</b> (JARVIS-DFT) compares wavefunctions with and without SOC. Values ≥ 0.5 indicate an SOC-driven band inversion
        (${doi("10.1038/s41598-019-45028-y", "Choudhary et al., Sci. Rep. 2019")}). It is a screening signal, not a Z₂ or mirror-Chern invariant.</li>
      <li><b>Seebeck coefficients and power factors</b> (JARVIS-DFT) were computed with ${doi("10.1016/j.cpc.2006.03.007", "BoltzTraP")} in the constant relaxation-time
        and rigid-band approximations (${doi("10.1088/1361-648X/aba06b", "Choudhary, Garrity &amp; Tavazza, J. Phys.: Condens. Matter 32, 475501 (2020)")}).
        Every material uses the same conditions: <b>600 K</b>, a carrier concentration of <b>10²⁰ cm⁻³</b> (electrons for n-type, holes for p-type) and τ = 10⁻¹⁴ s,
        on OptB88vdW band structures (the paper does not report spin–orbit coupling for the transport step). S is in µV/K and the power factor in µW m⁻¹ K⁻².
        τ cancels in S but sets the absolute power factor. Because 600 K and 10²⁰ cm⁻³ are applied to every material, the values rank materials under common
        conditions. They do not predict S at a material's own operating temperature (Bi₂Te₃, for example, is used near 300 K) or doping.</li>
      <li><b>Energy above hull</b> depends on each database's own phase diagram and corrections, so values from different sources are not directly comparable.</li>
    </ul>

    <h2>Structure status and data gaps</h2>
    <p>Every compound gets a structure status, computed by the pipeline:</p>
    <ul>
      <li>${statusBadge("benchmarked")} the recommended structure is in the experimental space group and was compared with a COD structure in the same space group (${info.structure_status?.benchmarked ?? "—"} compounds);</li>
      <li>${statusBadge("not benchmarked")} no comparable experimental structure exists in COD, so the choice rests on DFT alone (${info.structure_status?.["not benchmarked"] ?? "—"});</li>
      <li>${statusBadge("ambiguous")} no single ordered DFT cell represents the experiment: no database has the experimental space group, the experimental cell differs in
        symmetry, or the physics rules it out (disordered sites, a magnetic ground state the databases do not relax) (${info.structure_status?.ambiguous ?? "—"}).</li>
    </ul>
    <p>Each exhibit lists what is missing (unreachable or empty databases, no COD entry, no JARVIS spillage or transport data) and what to keep in mind
      (entries only in other space groups, disordered or disagreeing experimental structures, |ΔV| above ${info.volume_benchmark_percent ?? 5} %). The table below collects the
      ambiguous and missing items for every compound.</p>
    ${gapsHTML(info)}

    <h2>Structure analysis tools</h2>
    <ul>
      <li><a href="https://github.com/hackingmaterials/robocrystallographer" target="_blank" rel="noopener">Robocrystallographer</a>
        (${doi(info.tools?.robocrystallographer || "10.1557/mrc.2019.94", "Ganose &amp; Jain, MRS Commun. 2019")}) writes the text description of each recommended structure,
        built on <a href="https://pymatgen.org" target="_blank" rel="noopener">pymatgen</a> (${doi("10.1016/j.commatsci.2012.10.028", "Ong et al. 2013")}).</li>
      <li><a href="${esc(info.tools?.crystal_genui || "https://github.com/Anny-tech/Crystal-GENUI")}" target="_blank" rel="noopener">Crystal-GENUI</a> (Ankita Biswas)
        computes the coordination polyhedra, distortion indices, bond-valence sums and Pauling-rule checks, and produces the interactive polyhedral viewer and CSV tables.</li>
    </ul>

    <h2>Literature and topology labels</h2>
    <p>The material list, topology and thermoelectric summaries, and the key experimental facts are curated by hand in <code>pipeline/catalog/*.yaml</code>.
      Each entry is tied to a DOI. All ${info.counts.references} DOIs resolved through Crossref in the last build${info.unresolved_dois?.length ? `, except ${info.unresolved_dois.length}` : ""}.
      Topological classes in the ontology are inferred from this curated text by explicit rules. Anything described as predicted is labelled a <i>candidate</i>.</p>

    <h2>Reproduce or extend</h2>
<pre class="code">python -m venv .venv &amp;&amp; . .venv/bin/activate
pip install -r requirements.txt
python pipeline/build.py --download-jarvis   # first run: fetches the JARVIS dft_3d dataset (~40 MB zip)
python -m http.server -d site                # open http://localhost:8000</pre>
    <p>To add a material, add it to <code>pipeline/catalog/materials.yaml</code> with its experimental space group and literature DOIs, then rebuild.</p>
  </section>`;
}

function gapsHTML(info) {
  const rows = (info.data_gaps || []).filter((g) => g.issues.length)
    .sort((a, b) => (a.level === "ambiguous" ? 0 : 1) - (b.level === "ambiguous" ? 0 : 1) || b.issues.length - a.issues.length);
  if (!rows.length) return "";
  return `<details class="panel"><summary><b>Data gaps by compound</b> <span class="faint small">(${rows.length} compounds)</span></summary>
    <div class="table-wrap" style="margin-top:12px"><table class="data compact"><thead><tr><th>Compound</th><th>Status</th><th>Ambiguous or missing</th></tr></thead><tbody>
    ${rows.map((g) => `<tr><td><a href="#/material/${esc(g.id)}">${formulaHTML(g.formula_display)}</a></td><td>${statusBadge(g.level)}</td>
      <td><ul class="issues" style="margin:0">${g.issues.map((i) => `<li><span class="badge ${SEVERITY[i.severity].cls}">${SEVERITY[i.severity].text}</span><span class="small">${esc(i.text)}</span></li>`).join("")}</ul></td></tr>`).join("")}
    </tbody></table></div></details>`;
}
