#!/usr/bin/env python3
"""Build the data behind the TeTI Atlas website.

    python pipeline/build.py                 # everything (uses the HTTP cache)
    python pipeline/build.py --only bi2te3   # one or more materials
    python pipeline/build.py --refresh       # ignore the HTTP cache
    python pipeline/build.py --strict        # fail if any DOI does not resolve

Outputs go to site/data/. Nothing on the website is typed by hand except the
curated catalogue in pipeline/catalog/*.yaml; every structure and DFT number
comes from the databases and every bibliographic record from Crossref.
"""

import argparse
import datetime as dt
import json
import os
import re
import shutil
import sys
import urllib.request
import zipfile

import yaml

sys.path.insert(0, os.path.dirname(__file__))

from ttm import analysis, crossref, http, ontology  # noqa: E402
from ttm.chem import optimade_reduced, parse_formula, same_composition  # noqa: E402
from ttm.elements import ELEMENTS  # noqa: E402
from ttm.sources import DFT_SOURCES, Jarvis, fetch_cod, select  # noqa: E402
from ttm.writers import to_cif, to_poscar  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CATALOG = os.path.join(ROOT, "pipeline", "catalog")
DATA = os.path.join(ROOT, "site", "data")
JARVIS_URL = "https://ndownloader.figshare.com/files/38521619"  # jdft_3d-12-12-2022.json.zip

SOURCE_META = {
    "mp": {"license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/"},
    "jarvis": {"license": "NIST public data", "license_url": "https://www.nist.gov/open/license"},
    "alex-pbe": {"license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/"},
    "alex-pbesol": {"license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/"},
    "oqmd": {"license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/"},
}
COD_META = {"key": "cod", "name": "Crystallography Open Database", "cite": "10.1107/s0021889809016690",
            "homepage": "https://www.crystallography.net/cod/", "license": "CC0 (public domain)",
            "license_url": "https://creativecommons.org/publicdomain/zero/1.0/"}
BUILD_KEYS = ("sources", "source_status", "cod", "recommended", "recommended_reason", "description", "polyhedra",
              "fetched")
# Preference when no experimental structure is available to arbitrate.
SOURCE_PRIORITY = ["mp", "jarvis", "alex-pbesol", "alex-pbe", "oqmd"]

# Conditions behind the JARVIS-DFT Seebeck coefficients and power factors, from the paper that produced
# them (Choudhary, Garrity & Tavazza, J. Phys.: Condens. Matter 32, 475501 (2020)).
TRANSPORT = {
    "source": "jarvis", "doi": "10.1088/1361-648x/aba06b", "code": "BoltzTraP", "code_doi": "10.1016/j.cpc.2006.03.007",
    "temperature_K": 600, "carrier_concentration_cm3": 1e20, "relaxation_time_s": 1e-14,
    "approximations": "constant relaxation time and rigid band",
    "bands": "OptB88vdW band structure from JARVIS's standard workflow (the paper does not report spin–orbit coupling for transport)",
    "seebeck_unit": "µV/K", "powerfactor_unit": "µW/(m K²)",
    "notes": ["The same 600 K and 10²⁰ cm⁻³ are used for every material, whatever its real operating temperature or doping.",
              "τ cancels in the Seebeck coefficient but sets the absolute scale of the power factor."],
}
VOLUME_BENCHMARK = 5.0  # |ΔV/atom| in % above which agreement with experiment is called poor
SOURCE_NAMES = {s.key: s.name for s in DFT_SOURCES}


def load_yaml(name):
    with open(os.path.join(CATALOG, name)) as fh:
        return yaml.safe_load(fh)


def _plain(o):
    if hasattr(o, "item"):  # numpy scalars
        return o.item()
    if hasattr(o, "tolist"):
        return o.tolist()
    raise TypeError(type(o))


def write_json(path, obj, indent=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as fh:
        json.dump(obj, fh, indent=indent, ensure_ascii=False, default=_plain, separators=(",", ":") if indent is None else None)


def display_formula(mid, comp):
    """Conventional element order, recovered from the human-written id (e.g. 'mnbi2te4' -> 'MnBi2Te4')."""
    syms = {e.lower(): e for e in comp}
    out, i = "", 0
    while i < len(mid):
        if mid[i:i + 2] in syms:
            out, i = out + syms[mid[i:i + 2]], i + 2
        elif mid[i] in syms:
            out, i = out + syms[mid[i]], i + 1
        elif mid[i].isdigit():
            out, i = out + mid[i], i + 1
        else:
            return optimade_reduced(comp)
    try:
        return out if same_composition(parse_formula(out), comp) else optimade_reduced(comp)
    except ValueError:
        return optimade_reduced(comp)


def deviations(params, crystal_system, vpa, ref):
    """Percent deviation of a DFT structure from the COD reference."""
    if not ref:
        return None
    rp = ref["params"]
    out = {}
    if vpa and ref.get("volume_per_atom"):
        out["volume_per_atom"] = round(100 * (vpa - ref["volume_per_atom"]) / ref["volume_per_atom"], 2)
    if crystal_system in ("orthorhombic", "monoclinic", "triclinic"):
        # axis labelling differs between settings; compare sorted lengths
        for k, d, e in zip(("short", "middle", "long"), sorted(params[x] for x in "abc"),
                           sorted(rp[x] for x in "abc")):
            out[k] = round(100 * (d - e) / e, 2)
    else:
        keys = ("a",) if crystal_system == "cubic" else ("a", "c")
        for k in keys:
            out[k] = round(100 * (params[k] - rp[k]) / rp[k], 2)
    return out


def cod_matches_dft(ref, s):
    """Only compare like with like: the same space group and no sign of a different cell choice."""
    if not ref or not ref.get("volume_per_atom"):
        return False
    if s["spacegroup"]["spacegroup_number"] != ref.get("cell_spacegroup_number", ref["spacegroup_number"]):
        return False
    return abs(s["volume_per_atom"] - ref["volume_per_atom"]) / ref["volume_per_atom"] < 0.15


def _sg(s):
    return f"{s['spacegroup']['spacegroup_symbol']} (No. {s['spacegroup']['spacegroup_number']})"


def structure_status(m, b, built_at):
    """Classify how far the displayed structure can be trusted, and list exactly what is missing.

    level: "benchmarked"     recommended structure compared with a COD structure in the same space group
           "not benchmarked" no comparable experimental structure, so the choice rests on DFT alone
           "ambiguous"       no single DFT cell represents the experiment (curated or detected)
    Each issue is {"kind", "severity": "ambiguous" | "missing" | "note", "text"}.
    """
    sources, status, cod = b["sources"] or {}, b["source_status"] or {}, b["cod"]
    rmd, ref = b["recommended"], (cod or {}).get("reference")
    sgs = m.get("spacegroups") or []
    issues = []

    def add(kind, severity, text):
        issues.append({"kind": kind, "severity": severity, "text": text})

    if m.get("structure_ambiguity"):
        add("curated", "ambiguous", " ".join(m["structure_ambiguity"].split()))
    if not sources:
        add("no-dft", "ambiguous", "None of the DFT databases has a structure for this composition.")
    elif rmd and not rmd["spacegroup_match"]:
        add("no-dft-in-sg", "ambiguous",
            f"No database has a relaxed structure in the experimental space group (No. {', '.join(map(str, sgs))}). "
            f"The structure shown is {rmd['name']}'s lowest-energy entry, in {_sg(rmd)}.")

    # experiment
    if cod is None:
        add("cod-unavailable", "missing", f"The Crystallography Open Database could not be reached on {built_at[:10]}.")
    elif not ref:
        icsd = sorted({str(s["properties"]["icsd"]) for s in sources.values() if s["properties"].get("icsd")})
        add("no-cod", "missing",
            f"COD has no structure of this composition in space group No. {', '.join(map(str, sgs))}, so the DFT "
            "structures cannot be checked against experiment here."
            + (f" JARVIS-DFT cites ICSD {', '.join(icsd)} (licensed database) as its experimental parent." if icsd else ""))
    else:
        if ref.get("disordered"):
            add("disordered", "note",
                f"The experimental structure (COD {ref['id']}) has partially occupied or mixed sites; every DFT cell is an "
                "ordered model of it.")
        if rmd and rmd["spacegroup_match"] and not rmd.get("vs_experiment"):
            cell_sg = ref.get("cell_spacegroup_number", ref["spacegroup_number"])
            ratio = ref["volume_per_atom"] / rmd["volume_per_atom"] if ref.get("volume_per_atom") else None
            if cell_sg != rmd["spacegroup"]["spacegroup_number"]:
                add("cod-not-comparable", "ambiguous",
                    f"The experimental reference (COD {ref['id']}) is in space group No. {cell_sg}, the DFT structure in "
                    f"{_sg(rmd)}; lattice parameters are therefore not compared.")
            elif ratio and not 2 / 3 < ratio < 1.5:
                # same space group but a volume per atom off by tens of percent: the deposited cell and atom list disagree
                p = ref["params"]
                add("cod-inconsistent", "missing",
                    f"The COD reference ({ref['id']}) is internally inconsistent: its cell (a = {p['a']:.3f}, "
                    f"c = {p['c']:.3f} Å) gives {ref['volume_per_atom']:.1f} Å³ per listed atom, {ratio:.1f}× the DFT "
                    "value, so it is not used as a reference.")
            else:
                add("cod-not-comparable", "ambiguous",
                    f"The experimental reference (COD {ref['id']}) has {ref['volume_per_atom']:.2f} Å³/atom against "
                    f"{rmd['volume_per_atom']:.2f} for DFT, which suggests a different phase; lattice parameters are not compared.")
        if ref.get("note"):
            add("cod-metadata", "note", ref["note"])
        spread = cod.get("volume_spread")
        if spread and spread > VOLUME_BENCHMARK:
            add("cod-spread", "note",
                f"The {cod['count']} COD entries disagree: their volumes per atom span {spread:.1f} %. "
                f"COD {ref['id']} ({ref.get('year') or 'n.d.'}) is used as the reference: it is closest to the median volume, "
                "and ties go to the more recent study.")
    dv = ((rmd or {}).get("vs_experiment") or {}).get("volume_per_atom")
    if dv is not None and abs(dv) > VOLUME_BENCHMARK:
        add("large-deviation", "note",
            f"Even the closest DFT structure differs from experiment by {dv:+.1f} % in volume per atom.")

    # databases
    for key, st in status.items():
        name = SOURCE_NAMES.get(key, key)
        if st == "unavailable":
            add("source-unavailable", "missing", f"{name} could not be reached when the data were fetched ({built_at[:10]}).")
        elif st == "no entries":
            add("source-empty", "missing", f"{name} has no entry for this composition.")
        elif key in sources and not sources[key]["spacegroup_match"]:
            add("source-other-sg", "note",
                f"{name} has this composition only in other space groups (lowest energy: {_sg(sources[key])}).")
    matched = [s for s in sources.values() if s["spacegroup_match"]]
    if len(matched) == 1:
        add("single-source", "note", f"Only {matched[0]['name']} has the experimental phase, so different "
                                     "functionals cannot be cross-checked.")
    jv = sources.get("jarvis")
    if not (jv and jv["spacegroup_match"]):
        add("no-jarvis", "missing", "There is no JARVIS-DFT entry in the experimental space group, so spin–orbit "
                                    "spillage, the mBJ gap and the BoltzTraP Seebeck coefficients are unavailable.")
    else:
        lost = [label for k, label in (("spillage", "spin–orbit spillage"), ("band_gap_mbj", "mBJ gap"),
                                       ("seebeck_n", "BoltzTraP Seebeck coefficients"))
                if jv["properties"].get(k) is None]
        if lost:
            add("jarvis-partial", "missing", f"JARVIS-DFT {jv['id']} has no {', '.join(lost)}.")

    if any(i["severity"] == "ambiguous" for i in issues):
        level = "ambiguous"
    elif rmd and rmd.get("vs_experiment"):
        level = "benchmarked"
    else:
        level = "not benchmarked"
    return {"level": level, "issues": issues}


def build_compound(m, families, args):
    comp = parse_formula(m["formula"])
    sgs = m.get("spacegroups") or []
    print(f"  {m['id']:<14} {optimade_reduced(comp)}")
    sources, status = {}, {}
    for src in DFT_SOURCES:
        entries = src.fetch(comp)
        if entries is None:
            status[src.key] = "unavailable"
            continue
        chosen, polymorphs = select(entries, sgs)
        status[src.key] = "ok" if chosen else "no entries"
        if not chosen:
            continue
        sym = chosen["symmetry"]
        sources[src.key] = {
            "key": src.key, "name": src.name, "id": chosen["id"], "url": chosen["url"],
            "functional": chosen["functional"], "cite": src.cite,
            "spacegroup_match": chosen["spacegroup_match"],
            "spacegroup": {k: sym[k] for k in ("spacegroup_number", "spacegroup_symbol", "point_group",
                                                 "crystal_system", "hall_symbol")},
            "symprec": sym["symprec"], "wyckoffs": sym["wyckoffs"],
            "conventional": sym["conventional"], "primitive": sym["primitive"],
            "volume_per_atom": sym["volume_per_atom"], "density": sym["density"],
            "properties": chosen["properties"], "n_entries": len(entries), "polymorphs": polymorphs,
        }
    print("      " + "  ".join(f"{k}:{'✓' if k in sources and sources[k]['spacegroup_match'] else status[k]}"
                              for k in status))

    cod = fetch_cod(comp, sgs)
    ref = (cod or {}).get("reference")
    for s in sources.values():
        s["vs_experiment"] = (deviations(s["conventional"]["params"], s["spacegroup"]["crystal_system"],
                                         s["volume_per_atom"], ref) if s["spacegroup_match"] and cod_matches_dft(ref, s)
                              else None)

    matched = [s for s in sources.values() if s["spacegroup_match"]]
    recommended, reason = None, None
    if matched and ref and any(s["vs_experiment"] for s in matched):
        recommended = min((s for s in matched if s["vs_experiment"]),
                          key=lambda s: abs(s["vs_experiment"].get("volume_per_atom", 99)))
        reason = ("Closest volume per atom to the experimental reference "
                  f"(COD {ref['id']}) among DFT structures in the experimental space group.")
    elif matched:
        recommended = sorted(matched, key=lambda s: SOURCE_PRIORITY.index(s["key"]))[0]
        reason = ("No comparable experimental COD structure (same space group and cell) was found; "
                  "database preference order (MP, JARVIS, Alexandria, OQMD)." if ref else
                  "No experimental COD reference found; database preference order (MP, JARVIS, Alexandria, OQMD).")
    elif sources:
        recommended = sorted(sources.values(), key=lambda s: SOURCE_PRIORITY.index(s["key"]))[0]
        reason = ("No DFT entry in the experimental space group was found; showing the lowest-energy "
                  "structure available. Treat with caution.")

    sdir = os.path.join(DATA, "structures", m["id"])
    shutil.rmtree(sdir, ignore_errors=True)
    os.makedirs(sdir, exist_ok=True)
    for s in sources.values():
        sg = f"{s['spacegroup']['spacegroup_symbol']} (No. {s['spacegroup']['spacegroup_number']})"
        prov = f"Source: {s['name']} {s['id']} ({s['functional']}), {s['url']}"
        title = f"{display_formula(m['id'], comp)}_{s['key']}_{s['id']}"
        with open(os.path.join(sdir, f"{s['key']}.cif"), "w") as fh:
            fh.write(to_cif(s["conventional"], title, prov, sg, s["symprec"]))
        with open(os.path.join(sdir, f"{s['key']}.vasp"), "w") as fh:
            fh.write(to_poscar(s["conventional"], f"{title} | {prov} | conventional cell"))
        s["files"] = {"cif": f"data/structures/{m['id']}/{s['key']}.cif",
                      "poscar": f"data/structures/{m['id']}/{s['key']}.vasp"}

    description = poly = None
    if recommended and not args.skip_analysis:
        description = analysis.describe(recommended["conventional"])
        poly = analysis.polyhedra(recommended["conventional"], m["id"], f"{recommended['key']}:{recommended['id']}",
                                  os.path.join(DATA, "polyhedra"))
    return {"sources": sources, "source_status": status, "cod": cod, "recommended": recommended,
            "recommended_reason": reason, "description": description, "polyhedra": poly,
            "fetched": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", nargs="*", help="material ids to (re)build; others are kept from the last build")
    ap.add_argument("--refresh", action="store_true", help="ignore the HTTP cache")
    ap.add_argument("--strict", action="store_true", help="fail if any DOI cannot be resolved")
    ap.add_argument("--skip-analysis", action="store_true", help="skip robocrys / Crystal-GENUI")
    ap.add_argument("--download-jarvis", action="store_true", help="download the JARVIS-DFT dataset (~45 MB zip)")
    args = ap.parse_args()
    http.REFRESH = args.refresh

    if args.download_jarvis or not os.path.exists(Jarvis.FILE):
        if args.download_jarvis:
            print("Downloading JARVIS-DFT 3D dataset …")
            os.makedirs(os.path.dirname(Jarvis.FILE), exist_ok=True)
            zpath = os.path.join(os.path.dirname(Jarvis.FILE), "jdft_3d.zip")
            urllib.request.urlretrieve(JARVIS_URL, zpath)
            with zipfile.ZipFile(zpath) as z:
                z.extractall(os.path.dirname(Jarvis.FILE))

    with open(os.path.join(ROOT, "config.yaml")) as fh:
        config = yaml.safe_load(fh)
    families = load_yaml("families.yaml")
    materials = load_yaml("materials.yaml")
    tutorials = load_yaml("tutorials.yaml")
    fam_ids = {f["id"] for f in families}
    ids = {m["id"] for m in materials}
    for m in materials:
        assert m["family"] in fam_ids, f"{m['id']}: unknown family {m['family']}"
        for x in m.get("members", []):
            assert x in ids, f"{m['id']}: unknown member {x}"

    # ── structures ──
    print("Structures")
    built = {}
    for m in materials:
        path = os.path.join(DATA, "materials", f"{m['id']}.json")
        if m["kind"] != "compound":
            continue
        if args.only and m["id"] not in args.only and os.path.exists(path):
            with open(path) as fh:
                old = json.load(fh)
            built[m["id"]] = {k: old.get(k) for k in BUILD_KEYS}
            continue
        built[m["id"]] = build_compound(m, families, args)

    # ── references (Crossref) ──
    print("References (Crossref)")
    dois = set()
    for m in materials:
        dois.update(m.get("refs", []))
        dois.update(h["doi"] for h in m.get("highlights", []) if h.get("doi"))
    for f in families:
        dois.update(f.get("refs", []))
    dois.update(t["doi"] for t in tutorials if t.get("doi"))
    dois.update(s.cite for s in DFT_SOURCES)
    dois.update([COD_META["cite"], analysis.ROBOCRYS_DOI, TRANSPORT["doi"], TRANSPORT["code_doi"]])
    references, failed = {}, []
    for doi in sorted(d.lower() for d in dois):
        r = crossref.resolve(doi)
        if r:
            references[doi] = r
        else:
            failed.append(doi)
    print(f"  {len(references)} resolved, {len(failed)} failed" + (f": {', '.join(failed)}" if failed else ""))
    if failed and args.strict:
        sys.exit("Unresolved DOIs in --strict mode")

    # ── assemble material records ──
    by_id = {m["id"]: m for m in materials}
    records = []
    for m in materials:
        rec = {k: m.get(k) for k in ("id", "name", "kind", "family", "applications", "topology", "thermoelectric",
                                     "summary", "caveats", "highlights", "members", "spacegroups")}
        rec["refs"] = [d.lower() for d in m.get("refs", [])]
        for h in rec["highlights"] or []:
            h["doi"] = h["doi"].lower() if h.get("doi") else None
        if m["kind"] == "compound":
            comp = parse_formula(m["formula"])
            rec["formula"] = optimade_reduced(comp)
            rec["formula_display"] = display_formula(m["id"], comp)
            rec["elements"] = sorted(comp, key=lambda e: ELEMENTS[e]["Z"])
            b = built[m["id"]]
            rec.update(b)
            rmd = b["recommended"]
            rec["spacegroup"] = ({"number": rmd["spacegroup"]["spacegroup_number"],
                                  "symbol": rmd["spacegroup"]["spacegroup_symbol"],
                                  "crystal_system": rmd["spacegroup"]["crystal_system"]} if rmd else None)
            jv = b["sources"].get("jarvis")
            spill = jv["properties"].get("spillage") if jv and jv["spacegroup_match"] else None
            rec["topological_phases"] = ontology.topological_phases(m, spill)
            rec["motifs"] = (b["polyhedra"] or {}).get("shapes", [])
            homepages = {s.key: s.homepage for s in DFT_SOURCES}
            rec["databases"] = [{"key": s["key"], "name": s["name"], "homepage": homepages.get(s["key"])}
                                for s in b["sources"].values() if s["spacegroup_match"]]
            rec["fetched"] = b.get("fetched") or dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
            rec["structure_status"] = structure_status(m, b, rec["fetched"])
            rec["structure_ambiguity"] = " ".join(m["structure_ambiguity"].split()) if m.get("structure_ambiguity") else None
            if jv and jv["spacegroup_match"]:
                rec["transport_conditions"] = TRANSPORT
        else:
            rec["formula"] = None
            rec["formula_display"] = m["formula"]
            els = set(re.findall(r"[A-Z][a-z]?", m["formula"]))
            rec["elements"] = sorted((e for e in els if e in ELEMENTS), key=lambda e: ELEMENTS[e]["Z"])
            rec["spacegroup"] = None
            rec["topological_phases"] = ontology.topological_phases(m)
            rec["motifs"], rec["databases"] = [], []
        rec["topology_status"] = ("candidate" if re.search(r"candidate|predicted", m.get("topology") or "", re.I)
                                  else "established" if m.get("topology") else None)
        rec["regimes"] = ontology.operating_regimes(m)
        records.append(rec)

    # ── write ──
    print("Writing site/data")
    index = []
    for rec in records:
        path = os.path.join(DATA, "materials", f"{rec['id']}.json")
        rmd = rec.get("recommended")
        thumb = None
        if rmd:
            c = rmd["conventional"] if rmd["conventional"]["nsites"] <= 60 else rmd["primitive"]
            thumb = {"lattice": c["lattice"], "species": c["species"], "frac_coords": c["frac_coords"]}
        props = {}
        if rec["kind"] == "compound":
            srcs = rec["sources"]
            jv, mp = srcs.get("jarvis"), srcs.get("mp")
            alex = srcs.get("alex-pbesol") or srcs.get("alex-pbe")
            if rmd:
                props["e_above_hull"] = rmd["properties"].get("e_above_hull")
                props["volume_dev"] = (rmd.get("vs_experiment") or {}).get("volume_per_atom")
            if jv and jv["spacegroup_match"]:
                p = jv["properties"]
                props.update({"gap_optb88": p.get("band_gap"), "gap_mbj": p.get("band_gap_mbj"),
                              "spillage": p.get("spillage"), "seebeck_n": p.get("seebeck_n"),
                              "seebeck_p": p.get("seebeck_p")})
            if alex and alex["spacegroup_match"]:
                props["gap_alex"] = alex["properties"].get("band_gap")
            props["n_sources"] = len(rec["databases"])
            props["has_cod"] = bool((rec.get("cod") or {}).get("reference"))
            props["status"] = rec["structure_status"]["level"]
            props["n_issues"] = sum(i["severity"] != "note" for i in rec["structure_status"]["issues"])
        rec["jsonld"] = {
            "@context": "https://schema.org/", "@type": "Dataset",
            "name": f"{rec['formula_display']} — {rec['name']}",
            "description": (rec.get("summary") or "").strip(),
            "url": f"{config['site_url'].rstrip('/')}/#/material/{rec['id']}",
            "keywords": rec["applications"] + [ontology.TOPOLOGICAL_PHASES[p][0] for p in rec["topological_phases"]],
            "isBasedOn": [s["url"] for s in (rec.get("sources") or {}).values()],
            "citation": [f"https://doi.org/{d}" for d in rec["refs"]],
            "license": "https://creativecommons.org/licenses/by/4.0/",
        }
        write_json(path, rec)
        index.append({k: rec.get(k) for k in ("id", "name", "kind", "family", "applications", "formula_display",
                                               "elements", "spacegroup", "topology", "topology_status",
                                               "topological_phases", "regimes", "thermoelectric", "members")}
                     | {"props": props, "thumb": thumb,
                        "recommended": {"key": rmd["key"], "name": rmd["name"], "id": rmd["id"]} if rmd else None})

    write_json(os.path.join(DATA, "index.json"), {"families": families, "materials": index})
    write_json(os.path.join(DATA, "references.json"), references)
    tut = []
    for t in tutorials:
        t = dict(t)
        if t.get("doi"):
            t["doi"] = t["doi"].lower()
            t["ref"] = references.get(t["doi"])
            t.setdefault("url", f"https://doi.org/{t['doi']}")
        tut.append(t)
    write_json(os.path.join(DATA, "tutorials.json"), tut)
    used = sorted({e for r in records for e in r["elements"]}, key=lambda e: ELEMENTS[e]["Z"])
    write_json(os.path.join(DATA, "elements.json"), ELEMENTS)

    graph, abox = ontology.build_graph(records, families, references, ELEMENTS)
    write_json(os.path.join(DATA, "graph.json"), graph)
    write_json(os.path.join(DATA, "ontology", "ttm.jsonld"), ontology.tbox(), indent=1)
    with open(os.path.join(DATA, "ontology", "ttm.ttl"), "w") as fh:
        fh.write(ontology.tbox_turtle())
    write_json(os.path.join(DATA, "knowledge-graph.jsonld"), abox, indent=1)

    compounds = [r for r in records if r["kind"] == "compound"]
    write_json(os.path.join(DATA, "build_info.json"), {
        "built": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "site_url": config["site_url"],
        "sources": [{"key": s.key, "name": s.name, "functional": s.functional, "cite": s.cite,
                     "homepage": s.homepage, **SOURCE_META[s.key],
                     "n_structures": sum(1 for r in compounds if s.key in (r.get("sources") or {})),
                     "n_unavailable": sum(1 for r in compounds if (r.get("source_status") or {}).get(s.key) == "unavailable")}
                    for s in DFT_SOURCES] + [COD_META | {"n_structures": sum(1 for r in compounds
                                                                             if (r.get("cod") or {}).get("reference"))}],
        "counts": {"materials": len(records), "compounds": len(compounds), "alloys": len(records) - len(compounds),
                   "structures": sum(len(r.get("sources") or {}) for r in compounds),
                   "references": len(references), "tutorials": len(tut), "elements": len(used),
                   "families": len(families), "graph_nodes": len(graph["nodes"]), "graph_links": len(graph["links"])},
        "unresolved_dois": failed,
        "transport_conditions": TRANSPORT,
        "structure_status": {lvl: sum(1 for r in compounds if r["structure_status"]["level"] == lvl)
                             for lvl in ("benchmarked", "not benchmarked", "ambiguous")},
        "volume_benchmark_percent": VOLUME_BENCHMARK,
        "data_gaps": [{"id": r["id"], "formula_display": r["formula_display"], "level": r["structure_status"]["level"],
                       "issues": [i for i in r["structure_status"]["issues"] if i["severity"] != "note"]}
                      for r in compounds],
        "tools": {"robocrystallographer": analysis.ROBOCRYS_DOI, "crystal_genui": analysis.CRYSTAL_GENUI_URL},
    }, indent=1)
    print(f"Done: {len(records)} materials, {len(graph['nodes'])} graph nodes.")


if __name__ == "__main__":
    main()
