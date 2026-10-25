// Data access. Everything is static JSON produced by pipeline/build.py.

const cache = new Map();

export async function getJSON(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(path).then((r) => {
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      return r.json();
    }));
  }
  return cache.get(path);
}

export const store = {
  index: () => getJSON("data/index.json"),
  material: (id) => getJSON(`data/materials/${id}.json`),
  references: () => getJSON("data/references.json"),
  tutorials: () => getJSON("data/tutorials.json"),
  elements: () => getJSON("data/elements.json"),
  graph: () => getJSON("data/graph.json"),
  buildInfo: () => getJSON("data/build_info.json"),
  plugins: () => getJSON("plugins/registry.json"),
  ontology: () => getJSON("data/ontology/ttm.jsonld"),
};
