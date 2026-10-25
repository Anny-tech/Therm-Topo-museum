import { store } from "../store.js";
import { pageArt } from "../art.js";
import { esc } from "../util.js";

const local = (iri) => String(iri || "").replace(/^ttm:/, "");

export async function render(root) {
  const [onto, graph] = await Promise.all([store.ontology(), store.graph()]);
  const g = onto["@graph"];
  const header = g.find((x) => x["@type"] === "owl:Ontology");
  const classes = g.filter((x) => x["@type"] === "owl:Class");
  const objProps = g.filter((x) => x["@type"] === "owl:ObjectProperty");
  const dataProps = g.filter((x) => x["@type"] === "owl:DatatypeProperty");
  const concepts = g.filter((x) => Array.isArray(x["@type"]) && x["@type"].includes("skos:Concept"));
  const count = {};
  graph.nodes.forEach((n) => (count[n.cls] = (count[n.cls] || 0) + 1));
  const relCount = {};
  graph.links.forEach((l) => (relCount[l.rel] = (relCount[l.rel] || 0) + 1));

  // class tree from rdfs:subClassOf
  const kids = {};
  classes.forEach((c) => (kids[c.subClassOf] ||= []).push(c));
  const classTree = (parent) => `<ul>${(kids[parent] || []).map((c) => `<li><b>${esc(local(c["@id"]))}</b>
    ${count[local(c["@id"])] ? `<span class="badge badge-muted">${count[local(c["@id"])]} in graph</span>` : ""}
    ${c.equivalentClass ? `<code>≡ ${esc(c.equivalentClass)}</code>` : ""}<div class="faint small">${esc(c.comment)}</div>${classTree(c["@id"])}</li>`).join("")}</ul>`;
  const roots = [...new Set(classes.map((c) => c.subClassOf))].filter((p) => !classes.some((c) => c["@id"] === p));

  // SKOS concept trees
  const scheme = (pred) => {
    const items = concepts.filter(pred);
    const ck = {};
    items.forEach((c) => (ck[c.broader || ""] ||= []).push(c));
    const used = new Set(graph.nodes.filter((n) => n.cls === "TopologicalPhase" || n.cls === "OperatingRegime").map((n) => n.id.split(":")[1]));
    const tree = (p) => `<ul>${(ck[p] || []).map((c) => {
      const id = local(c["@id"]);
      const range = c["ttm:minTemperatureK"] !== undefined ? ` <code>${c["ttm:minTemperatureK"]}–${c["ttm:maxTemperatureK"]} K</code>` : "";
      return `<li>${used.has(id) ? "" : '<span class="faint">'}${esc(c.label)}${used.has(id) ? "" : "</span>"} <code>ttm:${esc(id)}</code>${range}${tree(c["@id"])}</li>`;
    }).join("")}</ul>`;
    return tree("");
  };

  root.innerHTML = `<section class="page">${pageArt("bz")}
    <div class="eyebrow">Plugin · Knowledge graph</div>
    <h1>The ontology</h1>
    <p class="lead">${esc(header?.comment || "")} Concepts are aligned with schema.org, SKOS, RDFS and OWL, so the knowledge graph can be loaded
      into any RDF tool (rdflib, Protégé, GraphDB) and queried with SPARQL.</p>
    <div class="downloads">
      <a class="btn small" href="data/ontology/ttm.ttl" download>Ontology · Turtle</a>
      <a class="btn ghost small" href="data/ontology/ttm.jsonld" download>Ontology · JSON-LD</a>
      <a class="btn ghost small" href="data/knowledge-graph.jsonld" download>Knowledge graph · JSON-LD (${graph.nodes.length} nodes, ${graph.links.length} edges)</a>
    </div>

    <div class="mat-grid">
      <div class="panel onto-tree"><h3>Classes</h3>${roots.map((r) => `<div class="small muted" style="margin-top:8px">subclasses of <code>${esc(r)}</code></div>${classTree(r)}`).join("")}</div>
      <div>
        <div class="panel onto-tree"><h3>Topological phases <span class="faint small">SKOS scheme</span></h3>${scheme((c) => c["@type"].includes("ttm:TopologicalPhase"))}
          <p class="faint small">Grey concepts are defined but not yet used by any exhibit. Materials are assigned phases by explicit rules on curated, literature-backed
            text. The <code>HighSpillage</code> concept comes from the JARVIS-DFT spin–orbit spillage (≥ 0.5) and marks a DFT screening result, not an experimental classification.</p></div>
        <div class="panel onto-tree"><h3>Thermoelectric operating regimes <span class="faint small">SKOS scheme</span></h3>${scheme((c) => c["@type"].includes("ttm:OperatingRegime"))}
          <p class="faint small">A material is placed in every regime its quoted peak-performance temperatures fall into.</p></div>
      </div>
    </div>

    <h2>Object properties</h2>
    <div class="table-wrap"><table class="data"><thead><tr><th>Property</th><th>Domain</th><th>Range</th><th class="num">Edges in graph</th></tr></thead><tbody>
      ${objProps.map((p) => `<tr><td><code>ttm:${esc(local(p["@id"]))}</code><div class="faint small">${esc(p.label)}</div></td><td>${esc(local(p.domain))}</td><td>${esc(local(p.range))}</td>
        <td class="num">${relCount[local(p["@id"])] || '<span class="na">—</span>'}</td></tr>`).join("")}
      <tr><td><code>skos:broader</code></td><td>Concept</td><td>Concept</td><td class="num">${relCount.broader || 0}</td></tr>
    </tbody></table></div>

    <h2>Data properties</h2>
    <div class="table-wrap"><table class="data compact"><thead><tr><th>Property</th><th>Meaning</th></tr></thead><tbody>
      ${dataProps.map((p) => `<tr><td><code>ttm:${esc(local(p["@id"]))}</code></td><td>${esc(p.comment)}</td></tr>`).join("")}
    </tbody></table></div>

    <h2>Query it</h2>
    <p class="muted">Example: every material that is both a thermoelectric and a strong topological insulator, using Python and rdflib.</p>
<pre class="code">import rdflib
g = rdflib.Graph()
g.parse("data/knowledge-graph.jsonld", format="json-ld", publicID="${esc(location.href.split("#")[0])}")
q = """
PREFIX ttm: &lt;${esc(location.href.split("#")[0])}ontology#&gt;
SELECT ?m WHERE {
  ?m ttm:hasApplication ?a1 , ?a2 ;
     ttm:exhibitsTopologicalPhase ?p .
  FILTER(CONTAINS(STR(?a1), "thermoelectric") &amp;&amp; CONTAINS(STR(?a2), "topological")
         &amp;&amp; CONTAINS(STR(?p), "StrongTopologicalInsulator"))
}"""
for row in g.query(q):
    print(row.m)</pre>
  </section>`;
}
