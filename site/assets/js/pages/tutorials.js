import { store } from "../store.js";
import { pageArt } from "../art.js";
import { esc, citationHTML, debounce } from "../util.js";

const KIND_LABEL = { review: "Review", course: "Course", book: "Book", software: "Software", database: "Database", notebook: "Notebook" };
const LEVELS = ["intro", "intermediate", "advanced"];
const AUDIENCE = { both: "Everyone", experimental: "Experimentalists", computational: "Computational" };

export async function render(root, _params, query) {
  const all = await store.tutorials();
  const kinds = [...new Set(all.map((t) => t.kind))];
  const topics = [...new Set(all.flatMap((t) => t.topics || []))].sort();
  const state = { q: "", kind: "", level: "", audience: query.get("audience") || "", topic: query.get("topic") || "" };

  root.innerHTML = `<section class="page">${pageArt("inversion", { blobClass: "warm" })}
    <div class="eyebrow">Plugin · Tutorials</div>
    <h1>Learn the field</h1>
    <p class="lead">${all.length} hand-picked reviews, courses, books, notebooks, software and databases for thermoelectric and topological materials.
      Each entry says why it is worth your time. Bibliographic details come from Crossref.</p>
    <div class="filters">
      <input class="input grow" type="search" placeholder="Search titles and notes …" aria-label="Search tutorials">
      <select class="input" data-k="kind" aria-label="Kind"><option value="">All kinds</option>${kinds.map((k) => `<option value="${k}">${KIND_LABEL[k] || k}</option>`).join("")}</select>
      <select class="input" data-k="level" aria-label="Level"><option value="">Any level</option>${LEVELS.map((l) => `<option value="${l}">${l}</option>`).join("")}</select>
      <select class="input" data-k="audience" aria-label="Audience"><option value="">Any audience</option>${Object.entries(AUDIENCE).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
      <select class="input" data-k="topic" aria-label="Topic"><option value="">Any topic</option>${topics.map((t) => `<option value="${t}">${t}</option>`).join("")}</select>
    </div>
    <div class="muted small" id="count"></div>
    <div id="results" style="margin-top:12px"></div>
  </section>`;

  const $ = (s) => root.querySelector(s);
  root.querySelectorAll("select[data-k]").forEach((s) => { s.value = state[s.dataset.k]; });
  function draw() {
    const q = state.q.toLowerCase();
    const list = all.filter((t) =>
      (!state.kind || t.kind === state.kind) && (!state.level || t.level === state.level) &&
      (!state.audience || t.audience === state.audience || (t.audience === "both" && state.audience !== "both")) &&
      (!state.topic || (t.topics || []).includes(state.topic)) &&
      (!q || [t.title, t.why, t.ref?.journal, ...(t.ref?.authors || [])].join(" ").toLowerCase().includes(q)))
      .sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));
    $("#count").textContent = `${list.length} of ${all.length} shown`;
    $("#results").innerHTML = list.length ? `<div class="tut-grid">${list.map((t) => `
      <article class="tut">
        <div class="meta"><span class="badge badge-muted">${KIND_LABEL[t.kind] || esc(t.kind)}</span><span class="badge badge-sg">${esc(t.level)}</span>
          <span class="badge badge-muted">${AUDIENCE[t.audience] || esc(t.audience)}</span></div>
        <h3><a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.title)} ↗</a></h3>
        <div class="why">${esc(t.why)}</div>
        ${t.ref ? `<div class="cite">${citationHTML(t.ref)}</div>` : ""}
        <div class="meta">${(t.topics || []).map((x) => `<span class="faint small">#${esc(x)}</span>`).join(" ")}</div>
      </article>`).join("")}</div>` : '<div class="empty">Nothing matches these filters.</div>';
  }
  $("input[type=search]").addEventListener("input", debounce((e) => { state.q = e.target.value; draw(); }));
  root.querySelectorAll("select[data-k]").forEach((s) => s.addEventListener("change", () => { state[s.dataset.k] = s.value; draw(); }));
  draw();
}
