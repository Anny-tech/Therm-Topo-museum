"""The TeTI Atlas ontology (TBox) and knowledge-graph builder (ABox).

The vocabulary is deliberately small and explicit. Classes and properties are
aligned with schema.org, SKOS, RDFS and (for elements) Wikidata where a
well-known term exists. Concept hierarchies (topological phases, operating
regimes) are SKOS concept schemes so that tools can reason over `skos:broader`.
"""

import re

NS = "ttm"

CONTEXT = {
    "ttm": "ontology#",  # resolved against the site URL (JSON-LD @base)
    "schema": "https://schema.org/",
    "skos": "http://www.w3.org/2004/02/skos/core#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "owl": "http://www.w3.org/2002/07/owl#",
    "xsd": "http://www.w3.org/2001/XMLSchema#",
    "dcterms": "http://purl.org/dc/terms/",
    "label": "rdfs:label",
    "comment": "rdfs:comment",
    "broader": {"@id": "skos:broader", "@type": "@id"},
    "subClassOf": {"@id": "rdfs:subClassOf", "@type": "@id"},
    "domain": {"@id": "rdfs:domain", "@type": "@id"},
    "range": {"@id": "rdfs:range", "@type": "@id"},
    "equivalentClass": {"@id": "owl:equivalentClass", "@type": "@id"},
}

# Classes: id -> (label, comment, superclass, external equivalent)
CLASSES = {
    "Material": ("Material", "A solid-state material on display in the atlas.", "schema:Thing", None),
    "Compound": ("Compound", "A stoichiometric, ordered crystalline phase with a DFT-relaxed structure.", "ttm:Material", None),
    "AlloySystem": ("Alloy system", "A solid solution between exhibited end-member compounds; no single DFT cell.", "ttm:Material", None),
    "MaterialFamily": ("Material family", "An exhibit hall: a chemically/structurally related family.", "skos:Collection", None),
    "StructureType": ("Structure type", "A crystal-structure prototype (e.g. tetradymite, skutterudite).", "skos:Concept", None),
    "SpaceGroup": ("Space group", "One of the 230 crystallographic space groups.", "skos:Concept", None),
    "CrystalSystem": ("Crystal system", "One of the seven crystal systems.", "skos:Concept", None),
    "ChemicalElement": ("Chemical element", "A chemical element.", "schema:Thing", "http://www.wikidata.org/entity/Q11344"),
    "Application": ("Application", "A technological application domain.", "skos:Concept", None),
    "TopologicalPhase": ("Topological phase", "A class of electronic band topology.", "skos:Concept", None),
    "OperatingRegime": ("Operating regime", "Temperature window in which a thermoelectric is used.", "skos:Concept", None),
    "CoordinationMotif": ("Coordination motif", "Coordination-polyhedron shape found in a structure (Crystal-GENUI).", "skos:Concept", None),
    "Database": ("Database", "An open materials database providing DFT or experimental structures.", "schema:Dataset", None),
    "ScholarlyReference": ("Scholarly reference", "A peer-reviewed publication, identified by DOI.", "schema:ScholarlyArticle", None),
    "DFTStructure": ("DFT-relaxed structure", "A structure relaxed with density-functional theory in a specific database.", "schema:Dataset", None),
    "ExperimentalStructure": ("Experimental structure", "A structure refined from diffraction data (COD).", "schema:Dataset", None),
}

# Object properties: id -> (label, domain, range)
PROPERTIES = {
    "memberOfFamily": ("member of family", "Material", "MaterialFamily"),
    "hasStructureType": ("has structure type", "MaterialFamily", "StructureType"),
    "crystallizesIn": ("crystallizes in", "Compound", "SpaceGroup"),
    "inCrystalSystem": ("in crystal system", "SpaceGroup", "CrystalSystem"),
    "containsElement": ("contains element", "Material", "ChemicalElement"),
    "hasApplication": ("has application", "Material", "Application"),
    "exhibitsTopologicalPhase": ("exhibits topological phase", "Material", "TopologicalPhase"),
    "operatesIn": ("operates in", "Material", "OperatingRegime"),
    "alloyOf": ("alloy of", "AlloySystem", "Compound"),
    "describedIn": ("described in", "Material", "ScholarlyReference"),
    "hasDFTStructure": ("has DFT structure", "Compound", "DFTStructure"),
    "hasExperimentalStructure": ("has experimental structure", "Compound", "ExperimentalStructure"),
    "computedBy": ("computed by", "DFTStructure", "Database"),
    "hasCoordinationMotif": ("has coordination motif", "Compound", "CoordinationMotif"),
}

# Datatype properties (value carried on Material / DFTStructure nodes)
DATA_PROPERTIES = {
    "chemicalFormula": "Reduced chemical formula.",
    "spaceGroupNumber": "International Tables space-group number.",
    "latticeA": "Conventional lattice parameter a (Å).",
    "latticeB": "Conventional lattice parameter b (Å).",
    "latticeC": "Conventional lattice parameter c (Å).",
    "energyAboveHull": "Energy above the convex hull (eV/atom).",
    "bandGap": "DFT band gap (eV) in the stated functional.",
    "spinOrbitSpillage": "JARVIS spin–orbit spillage; ≥ 0.5 indicates SOC-driven band inversion.",
    "seebeckN": "JARVIS-DFT BoltzTraP Seebeck coefficient, n-type (µV/K), at 600 K and 1e20 cm^-3 electrons, constant relaxation time.",
    "seebeckP": "JARVIS-DFT BoltzTraP Seebeck coefficient, p-type (µV/K), at 600 K and 1e20 cm^-3 holes, constant relaxation time.",
    "functional": "Exchange–correlation functional of the calculation.",
}

TOPOLOGICAL_PHASES = {
    # id: (label, broader)
    "TopologicalPhaseRoot": ("Topological phases", None),
    "TopologicalInsulator": ("Topological insulator", "TopologicalPhaseRoot"),
    "StrongTopologicalInsulator": ("Strong Z2 topological insulator", "TopologicalInsulator"),
    "TopologicalCrystallineInsulator": ("Topological crystalline insulator", "TopologicalInsulator"),
    "MagneticTopologicalInsulator": ("Magnetic topological insulator", "TopologicalInsulator"),
    "AxionInsulator": ("Axion insulator", "MagneticTopologicalInsulator"),
    "TopologicalSemimetal": ("Topological semimetal", "TopologicalPhaseRoot"),
    "DiracSemimetal": ("Dirac semimetal", "TopologicalSemimetal"),
    "WeylSemimetal": ("Weyl semimetal", "TopologicalSemimetal"),
    "NodalLineSemimetal": ("Nodal-line semimetal", "TopologicalSemimetal"),
    "Z2Semimetal": ("Z2 non-trivial semimetal", "TopologicalSemimetal"),
    "BandInvertedCandidate": ("Band-inverted (candidate)", "TopologicalPhaseRoot"),
    "NearTopologicalTransition": ("Near a topological transition", "TopologicalPhaseRoot"),
    "HighSpillage": ("SOC band inversion indicated (spillage ≥ 0.5, DFT)", "BandInvertedCandidate"),
}

# Every rule whose pattern occurs in the curated `topology` text applies.
TOPOLOGY_RULES = [
    (r"antiferromagnetic topological insulator", "MagneticTopologicalInsulator"),
    (r"axion", "AxionInsulator"),
    (r"crystalline insulator", "TopologicalCrystallineInsulator"),
    (r"strong topological insulator|3d topological insulator", "StrongTopologicalInsulator"),
    (r"dirac semimetal(?!-like)", "DiracSemimetal"),
    (r"weyl semimetal", "WeylSemimetal"),
    (r"nodal-line", "NodalLineSemimetal"),
    (r"non-trivial z2", "Z2Semimetal"),
    (r"band-inverted", "BandInvertedCandidate"),
    (r"strong/weak ti", "NearTopologicalTransition"),
]

REGIMES = {
    # id: (label, T_min, T_max)
    "Cryogenic": ("Cryogenic (< 250 K)", 0, 250),
    "NearRoomTemperature": ("Near room temperature (250–500 K)", 250, 500),
    "MidTemperature": ("Mid temperature (500–900 K)", 500, 900),
    "HighTemperature": ("High temperature (> 900 K)", 900, 5000),
}

APPLICATIONS = {
    "thermoelectric": ("Thermoelectrics", "Heat-to-electricity conversion and solid-state cooling."),
    "topological": ("Topological quantum materials", "Topological insulators, semimetals and related phases."),
}


def topological_phases(material, spillage=None):
    text = (material.get("topology") or "").lower()
    found = [cid for pat, cid in TOPOLOGY_RULES if re.search(pat, text)]
    if spillage is not None and spillage >= 0.5:
        found.append("HighSpillage")
    return list(dict.fromkeys(found))


def operating_regimes(material):
    """Infer thermoelectric regimes from temperatures quoted in the curated text."""
    if "thermoelectric" not in material.get("applications", []):
        return []
    texts = [material.get("thermoelectric") or ""]
    texts += [f"{h.get('value', '')} {h.get('conditions', '')}" for h in material.get("highlights", [])
              if "zT" in h.get("property", "")]
    temps = []
    for t in texts:
        # ranges like "500–850 K" and single values like "923 K"
        for lo, hi in re.findall(r"(\d{2,4})\s*[–-]\s*(\d{2,4})\s*K", t):
            temps += [int(lo), int(hi)]
        temps += [int(v) for v in re.findall(r"(?<![–\-\d])(\d{2,4})\s*K", t)]
        if "room temperature" in t.lower():
            temps.append(300)
    if not temps:
        return []
    lo, hi = min(temps), max(temps)
    return [rid for rid, (_, a, b) in REGIMES.items() if lo < b and hi >= a]


def _node(nodes, nid, label, cls, **extra):
    if nid not in nodes:
        nodes[nid] = {"id": nid, "label": label, "cls": cls, **extra}
    return nid


def build_graph(materials, families, references, elements):
    """Return (graph_for_viz, jsonld_abox)."""
    nodes, links = {}, []

    def link(a, b, rel):
        links.append({"source": a, "target": b, "rel": rel})

    for app, (label, comment) in APPLICATIONS.items():
        _node(nodes, f"app:{app}", label, "Application", comment=comment)
    for fam in families:
        _node(nodes, f"family:{fam['id']}", fam["name"], "MaterialFamily",
              href=f"#/hall/{fam['id']}", color=fam.get("accent"), comment=fam.get("subtitle"))
        st = f"stype:{fam['structure_type']}"
        _node(nodes, st, fam["structure_type"].split(",")[0], "StructureType")
        link(f"family:{fam['id']}", st, "hasStructureType")

    used_phases, used_regimes = set(), set()
    for m in materials:
        mid = f"material:{m['id']}"
        _node(nodes, mid, m["formula_display"], "Material", href=f"#/material/{m['id']}",
              kind=m["kind"], family=m["family"], name=m.get("name"))
        link(mid, f"family:{m['family']}", "memberOfFamily")
        for app in m["applications"]:
            link(mid, f"app:{app}", "hasApplication")
        for el in (m.get("elements") or []):
            eid = f"element:{el}"
            _node(nodes, eid, el, "ChemicalElement", name=elements[el]["name"], color=elements[el]["color"],
                  Z=elements[el]["Z"])
            link(mid, eid, "containsElement")
        sg = m.get("spacegroup")
        if sg:
            sid = f"sg:{sg['number']}"
            _node(nodes, sid, f"{sg['symbol']} (#{sg['number']})", "SpaceGroup", number=sg["number"])
            link(mid, sid, "crystallizesIn")
            cs = f"cs:{sg['crystal_system']}"
            _node(nodes, cs, sg["crystal_system"].capitalize(), "CrystalSystem")
            if not any(l["source"] == sid and l["rel"] == "inCrystalSystem" for l in links):
                link(sid, cs, "inCrystalSystem")
        for ph in (m.get("topological_phases") or []):
            used_phases.add(ph)
            link(mid, f"phase:{ph}", "exhibitsTopologicalPhase")
        for rg in (m.get("regimes") or []):
            used_regimes.add(rg)
            link(mid, f"regime:{rg}", "operatesIn")
        for other in (m.get("members") or []):
            link(mid, f"material:{other}", "alloyOf")
        for motif in (m.get("motifs") or []):
            mo = f"motif:{motif}"
            _node(nodes, mo, motif.capitalize(), "CoordinationMotif")
            link(mid, mo, "hasCoordinationMotif")
        for db in (m.get("databases") or []):
            did = f"db:{db['key']}"
            _node(nodes, did, db["name"], "Database", href=db.get("homepage"))
            link(mid, did, "computedBy")
        for doi in (m.get("refs") or []):
            ref = references.get(doi)
            if ref:
                rid = f"doi:{doi}"
                _node(nodes, rid, f"{ref['authors'][0].split()[-1] if ref['authors'] else ''} {ref['year']}".strip(),
                      "ScholarlyReference", title=ref["title"], href=ref["url"])
                link(mid, rid, "describedIn")

    # concept hierarchies (only branches that are actually used)
    needed = set()
    for ph in used_phases:
        while ph:
            needed.add(ph)
            ph = TOPOLOGICAL_PHASES[ph][1]
    for ph in needed:
        label, broader = TOPOLOGICAL_PHASES[ph]
        _node(nodes, f"phase:{ph}", label, "TopologicalPhase")
        if broader:
            link(f"phase:{ph}", f"phase:{broader}", "broader")
    if needed:
        link("phase:TopologicalPhaseRoot", "app:topological", "broader")
    for rg in used_regimes:
        _node(nodes, f"regime:{rg}", REGIMES[rg][0], "OperatingRegime")
        link(f"regime:{rg}", "app:thermoelectric", "broader")

    degree = {}
    for l in links:
        degree[l["source"]] = degree.get(l["source"], 0) + 1
        degree[l["target"]] = degree.get(l["target"], 0) + 1
    for n in nodes.values():
        n["degree"] = degree.get(n["id"], 0)

    graph = {"nodes": list(nodes.values()), "links": links,
             "classes": {k: v[0] for k, v in CLASSES.items()} | {"Application": "Application"}}
    return graph, _jsonld(nodes, links)


def _jsonld(nodes, links):
    by_source = {}
    for l in links:
        by_source.setdefault(l["source"], []).append(l)
    items = []
    for n in nodes.values():
        item = {"@id": n["id"], "@type": f"ttm:{n['cls']}", "label": n["label"]}
        if (n.get("href") or "").startswith("http"):
            item["schema:url"] = n["href"]
        if n.get("title"):
            item["schema:name"] = n["title"]
        for l in by_source.get(n["id"], []):
            key = "broader" if l["rel"] == "broader" else f"ttm:{l['rel']}"
            item.setdefault(key, []).append({"@id": l["target"]})
        items.append(item)
    return {"@context": CONTEXT | {"material": "material/", "family": "family/", "element": "element/",
                                   "sg": "spacegroup/", "cs": "crystal-system/", "phase": "ttm:", "regime": "ttm:",
                                   "app": "application/", "motif": "motif/", "db": "database/",
                                   "stype": "structure-type/", "doi": "https://doi.org/"},
            "@graph": items}


def tbox():
    """The ontology itself as JSON-LD."""
    graph = [{"@id": "ttm:", "@type": "owl:Ontology", "label": "TeTI Atlas ontology",
              "comment": "Vocabulary linking thermoelectric and topological materials to structure, chemistry, "
                         "phases, provenance and literature.", "dcterms:license": "https://creativecommons.org/licenses/by/4.0/"}]
    for cid, (label, comment, sup, equiv) in CLASSES.items():
        c = {"@id": f"ttm:{cid}", "@type": "owl:Class", "label": label, "comment": comment, "subClassOf": sup}
        if equiv:
            c["equivalentClass"] = equiv
        graph.append(c)
    for pid, (label, dom, rng) in PROPERTIES.items():
        graph.append({"@id": f"ttm:{pid}", "@type": "owl:ObjectProperty", "label": label,
                      "domain": f"ttm:{dom}", "range": f"ttm:{rng}"})
    for pid, comment in DATA_PROPERTIES.items():
        graph.append({"@id": f"ttm:{pid}", "@type": "owl:DatatypeProperty", "label": pid, "comment": comment})
    graph.append({"@id": "ttm:TopologicalPhaseScheme", "@type": "skos:ConceptScheme", "label": "Topological phases"})
    for cid, (label, broader) in TOPOLOGICAL_PHASES.items():
        c = {"@id": f"ttm:{cid}", "@type": ["skos:Concept", "ttm:TopologicalPhase"], "label": label,
             "skos:inScheme": {"@id": "ttm:TopologicalPhaseScheme"}}
        if broader:
            c["broader"] = f"ttm:{broader}"
        graph.append(c)
    graph.append({"@id": "ttm:OperatingRegimeScheme", "@type": "skos:ConceptScheme", "label": "Thermoelectric operating regimes"})
    for rid, (label, lo, hi) in REGIMES.items():
        graph.append({"@id": f"ttm:{rid}", "@type": ["skos:Concept", "ttm:OperatingRegime"], "label": label,
                      "skos:inScheme": {"@id": "ttm:OperatingRegimeScheme"},
                      "ttm:minTemperatureK": lo, "ttm:maxTemperatureK": hi})
    return {"@context": CONTEXT, "@graph": graph}


def tbox_turtle():
    """Human-readable Turtle rendering of the TBox."""
    out = ["@prefix ttm: <ontology#> .", "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
           "@prefix owl: <http://www.w3.org/2002/07/owl#> .", "@prefix skos: <http://www.w3.org/2004/02/skos/core#> .",
           "@prefix schema: <https://schema.org/> .", ""]

    def q(s):
        return '"' + s.replace('"', '\\"') + '"'

    for cid, (label, comment, sup, equiv) in CLASSES.items():
        out.append(f"ttm:{cid} a owl:Class ;\n    rdfs:label {q(label)} ;\n    rdfs:comment {q(comment)} ;\n"
                   f"    rdfs:subClassOf {sup}" + (f" ;\n    owl:equivalentClass <{equiv}>" if equiv else "") + " .\n")
    for pid, (label, dom, rng) in PROPERTIES.items():
        out.append(f"ttm:{pid} a owl:ObjectProperty ;\n    rdfs:label {q(label)} ;\n"
                   f"    rdfs:domain ttm:{dom} ;\n    rdfs:range ttm:{rng} .\n")
    for pid, comment in DATA_PROPERTIES.items():
        out.append(f"ttm:{pid} a owl:DatatypeProperty ;\n    rdfs:comment {q(comment)} .\n")
    for cid, (label, broader) in TOPOLOGICAL_PHASES.items():
        out.append(f"ttm:{cid} a skos:Concept, ttm:TopologicalPhase ;\n    skos:prefLabel {q(label)}"
                   + (f" ;\n    skos:broader ttm:{broader}" if broader else "") + " .\n")
    for rid, (label, lo, hi) in REGIMES.items():
        out.append(f"ttm:{rid} a skos:Concept, ttm:OperatingRegime ;\n    skos:prefLabel {q(label)} .\n")
    return "\n".join(out)
