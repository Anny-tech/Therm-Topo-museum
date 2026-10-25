// Small shared helpers: escaping, formulas, numbers, citations.

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// "Bi2Te3" -> Bi<sub>2</sub>Te<sub>3</sub>; leaves x, y, 1-x etc. readable.
export function formulaHTML(f) {
  if (!f) return "";
  return esc(f)
    .replace(/([A-Za-z\)])(\d+(?:\.\d+)?(?:[−-]?[xy])?|[xy](?![a-z]))/g, "$1<sub>$2</sub>")
    .replace(/−/g, "−");
}

export const spacegroupHTML = (sym) =>
  esc(sym || "").replace(/-(\d)/g, '<span class="ovl">$1</span>').replace(/_(\d)/g, "<sub>$1</sub>");

export function fmt(v, digits = 3, unit = "") {
  if (v === null || v === undefined || Number.isNaN(v)) return '<span class="na">—</span>';
  const s = Math.abs(v) >= 1000 ? v.toFixed(0) : v.toPrecision(digits).replace(/\.?0+$/, (m) => (m.includes(".") ? "" : m));
  return `${s}${unit ? `<span class="unit"> ${unit}</span>` : ""}`;
}

export const fixed = (v, d = 3, unit = "") =>
  v === null || v === undefined ? '<span class="na">—</span>' : `${Number(v).toFixed(d)}${unit ? `<span class="unit"> ${unit}</span>` : ""}`;

export function signedPct(v) {
  if (v === null || v === undefined) return '<span class="na">—</span>';
  const cls = Math.abs(v) < 1 ? "dev-good" : Math.abs(v) < 3 ? "dev-ok" : "dev-bad";
  return `<span class="${cls}">${v > 0 ? "+" : ""}${v.toFixed(2)}%</span>`;
}

export function authorsShort(authors) {
  if (!authors || !authors.length) return "";
  const last = (a) => a.split(" ").slice(-1)[0];
  if (authors.length === 1) return last(authors[0]);
  if (authors.length === 2) return `${last(authors[0])} & ${last(authors[1])}`;
  return `${last(authors[0])} et al.`;
}

export function citationHTML(ref, { full = false } = {}) {
  if (!ref) return "";
  const auth = full ? esc((ref.authors || []).slice(0, 6).join(", ") + ((ref.authors || []).length > 6 ? ", et al." : "")) : esc(authorsShort(ref.authors));
  const vol = ref.volume ? ` <b>${esc(ref.volume)}</b>` : "";
  const page = ref.page ? `, ${esc(ref.page)}` : "";
  return `<span class="cite">${auth}${auth ? ", " : ""}<i>${esc(ref.title)}</i>, ${esc(ref.journal || "")}${vol}${page} (${esc(ref.year || "")}). <a href="${esc(ref.url)}" target="_blank" rel="noopener">doi:${esc(ref.doi)}</a></span>`;
}

export const el = (html) => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

export const APP_LABEL = { thermoelectric: "Thermoelectric", topological: "Topological" };

export function appBadges(apps) {
  return (apps || []).map((a) => `<span class="badge badge-${a}">${APP_LABEL[a] || esc(a)}</span>`).join("");
}

// Structure status from the pipeline (benchmarked / not benchmarked / ambiguous) and issue severities.
export const STATUS = {
  benchmarked: { cls: "badge-good", text: "benchmarked", title: "Compared with an experimental COD structure in the same space group" },
  "not benchmarked": { cls: "badge-muted", text: "not benchmarked", title: "No comparable experimental structure; chosen on DFT alone" },
  ambiguous: { cls: "badge-bad", text: "ambiguous structure", title: "No single DFT cell represents the experimental structure" },
};
export const SEVERITY = {
  ambiguous: { cls: "badge-bad", text: "ambiguous" },
  missing: { cls: "badge-warn", text: "missing" },
  note: { cls: "badge-muted", text: "note" },
};

export function statusBadge(level) {
  const s = STATUS[level];
  return s ? `<span class="badge ${s.cls}" title="${esc(s.title)}">${s.text}</span>` : "";
}

export function debounce(fn, ms = 150) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
