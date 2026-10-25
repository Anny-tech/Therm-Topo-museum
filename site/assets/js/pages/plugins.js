import { store } from "../store.js";
import { pageArt } from "../art.js";
import { esc } from "../util.js";

export async function render(root) {
  const { plugins } = await store.plugins();
  const card = (p) => `<div class="plugin ${p.status}">
    <div class="ic">${esc(p.icon)}</div>
    <div><h3>${p.route ? `<a href="${esc(p.route)}">${esc(p.name)}</a>` : esc(p.name)}
      <span class="badge ${p.status === "active" ? "badge-good" : "badge-muted"}" style="vertical-align:middle;margin-left:6px">${esc(p.status)}</span></h3>
      <p class="muted" style="margin:4px 0 8px">${esc(p.description)}</p>
      ${(p.provides || []).length ? `<div class="meta" style="display:flex;gap:6px;flex-wrap:wrap">${p.provides.map((x) => `<span class="badge badge-muted">${esc(x)}</span>`).join("")}</div>` : ""}
    </div></div>`;
  root.innerHTML = `<section class="page">${pageArt("cell", { blobClass: "warm" })}
    <div class="eyebrow">Architecture</div>
    <h1>Knowledge plugins</h1>
    <p class="lead">The atlas is a set of plugins over one catalogue of materials. Each plugin adds a kind of knowledge (structures, tutorials,
      ontology and more to come) and is listed in <code>site/plugins/registry.json</code>.</p>
    <h2>Active</h2><div class="plugins">${plugins.filter((p) => p.status === "active").map(card).join("")}</div>
    <h2>Planned</h2><div class="plugins">${plugins.filter((p) => p.status !== "active").map(card).join("")}</div>
    <h2>Writing a plugin</h2>
    <div class="prose">
      <ol>
        <li>Add a stage to <code>pipeline/build.py</code> (or a separate script) that writes static JSON to <code>site/data/&lt;plugin&gt;/</code>.
          Key records by the material <code>id</code> from <code>pipeline/catalog/materials.yaml</code>.</li>
        <li>Add a page module <code>site/assets/js/pages/&lt;plugin&gt;.js</code> that exports <code>render(root, params, query)</code>, and register its route in <code>app.js</code>.</li>
        <li>If the knowledge has concepts, add classes or SKOS concepts to <code>pipeline/ttm/ontology.py</code> so they appear in the knowledge graph.</li>
        <li>Add an entry to <code>site/plugins/registry.json</code>. Record the source and licence of every number.</li>
      </ol>
    </div>
  </section>`;
}
