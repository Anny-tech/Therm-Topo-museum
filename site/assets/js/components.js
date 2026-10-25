// Shared UI pieces: material cards with lazily rendered ball-and-stick crystal thumbnails.

import { renderThumb, INKS } from "./viewer.js";
import { appBadges, esc, formulaHTML, spacegroupHTML, statusBadge } from "./util.js";

export function cardHTML(m, famById) {
  const fam = famById[m.family] || {};
  const sg = m.spacegroup ? `<span class="badge badge-sg">${spacegroupHTML(m.spacegroup.symbol)}</span>` : "";
  const alloy = m.kind === "alloy" ? '<span class="badge badge-muted">alloy system</span>' : "";
  const amb = m.props?.status === "ambiguous" ? statusBadge("ambiguous") : "";
  const thumb = m.thumb ? `<canvas data-thumb="${esc(m.id)}" data-ink="${esc(fam.accent || "")}"></canvas>` : `<div class="alloy-mark">${formulaHTML(m.formula_display)}</div>`;
  return `<a class="card" href="#/material/${esc(m.id)}" style="--accent:${fam.accent || "#f26b6b"}">
    <div class="thumb">${thumb}</div>
    <div class="body">
      <div class="formula">${formulaHTML(m.formula_display)}</div>
      <div class="name">${esc(m.name)}</div>
      <div class="meta">${appBadges(m.applications)}${sg}${alloy}${amb}</div>
    </div></a>`;
}

// Render thumbnails only when cards scroll into view.
export function hydrateThumbs(root, materials, elements) {
  const byId = Object.fromEntries(materials.map((m) => [m.id, m]));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const c = e.target;
      io.unobserve(c);
      const m = byId[c.dataset.thumb];
      const ink = c.dataset.ink;
      if (m?.thumb) renderThumb(c, m.thumb, elements, { atomScale: 0.5,
        palette: ink ? [ink, ...INKS.filter((x) => x.toLowerCase() !== ink.toLowerCase())] : INKS });
    }
  }, { rootMargin: "200px" });
  root.querySelectorAll("canvas[data-thumb]").forEach((c) => io.observe(c));
  return () => io.disconnect();
}
