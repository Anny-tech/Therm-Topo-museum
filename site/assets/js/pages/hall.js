import { store } from "../store.js";
import { CrystalViewer, INKS } from "../viewer.js";
import { backdrop } from "../art.js";
import { cardHTML, hydrateThumbs } from "../components.js";
import { esc, formulaHTML, citationHTML } from "../util.js";

export async function render(root, [id]) {
  const [{ families, materials }, elements, refs] = await Promise.all([store.index(), store.elements(), store.references()]);
  const famById = Object.fromEntries(families.map((f) => [f.id, f]));
  const fam = famById[id];
  if (!fam) {
    root.innerHTML = `<section class="page"><h1>No such hall</h1><p><a href="#/explore">Back to the collection</a></p></section>`;
    return;
  }
  const list = materials.filter((m) => m.family === id);
  const lead = list.find((m) => m.thumb);
  const i = families.indexOf(fam);
  const prev = families[(i + families.length - 1) % families.length], next = families[(i + 1) % families.length];

  root.style.setProperty("--accent", fam.accent);
  root.innerHTML = `<section class="page">
    <div class="crumbs"><a href="#/explore">Collection</a> / ${esc(fam.name)}</div>
    <div class="hall-head">
      <div>
        <div class="eyebrow">Exhibit hall · ${list.length} materials</div>
        <h1>${esc(fam.name)}</h1>
        <p class="muted">${formulaHTML(fam.subtitle)}</p>
        <p class="lead">${esc(fam.description)}</p>
        <p class="small muted">Structure type: <b>${esc(fam.structure_type)}</b></p>
      </div>
      <div class="hall-art">
        ${backdrop({ blob: [14, 6, 80, 84], ring: [-2, 56, 34], ring2: [74, 0, 22], hex: [30, 50, 80, 60] })}
        <canvas aria-label="Ball-and-stick model of a representative structure"></canvas>
        ${lead ? `<a class="caption" href="#/material/${lead.id}">${formulaHTML(lead.formula_display)} · ${esc(lead.recommended?.name || "")}</a>` : ""}</div>
    </div>
    <h2>Exhibits</h2>
    <div class="cards">${list.map((m) => cardHTML(m, famById)).join("")}</div>
    ${(fam.refs || []).length ? `<h2>Further reading</h2><ul class="refs">${fam.refs.map((d) => refs[d]).filter(Boolean).map((r) => `<li>${citationHTML(r, { full: true })}</li>`).join("")}</ul>` : ""}
    <div class="downloads" style="margin-top:32px;justify-content:space-between">
      <a class="btn ghost small" href="#/hall/${prev.id}">← ${esc(prev.name)}</a>
      <a class="btn ghost small" href="#/hall/${next.id}">${esc(next.name)} →</a>
    </div>
  </section>`;

  const cleanups = [hydrateThumbs(root, list, elements), () => root.style.removeProperty("--accent")];
  if (lead) {
    const inks = [fam.accent, ...INKS.filter((c) => c.toLowerCase() !== fam.accent.toLowerCase())];
    const v = new CrystalViewer(root.querySelector(".hall-art canvas"), lead.thumb, elements,
      { showAxes: false, atomScale: 0.52, palette: inks });
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) v.spin(true, 0.0025);
    cleanups.push(() => v.destroy());
  }
  return () => cleanups.forEach((f) => f && f());
}
