"""Structure-analysis tools run on each recommended DFT structure.

* Robocrystallographer (Ganose & Jain, MRS Commun. 2019) – a text description of
  the structure: dimensionality, connectivity, coordination, bond lengths.
* Crystal-GENUI (A. Biswas) – coordination polyhedra, distortion metrics, bond
  valence sums and Pauling-rule checks, plus a self-contained HTML viewer.

Both are optional: if the packages are not installed the pipeline continues
without them and the site hides the corresponding panels.
"""

import json
import os
import re
import warnings

ROBOCRYS_DOI = "10.1557/mrc.2019.94"
CRYSTAL_GENUI_URL = "https://github.com/Anny-tech/Crystal-GENUI"


def _pmg_structure(cell):
    from pymatgen.core import Lattice, Structure
    return Structure(Lattice(cell["lattice"]), cell["species"], cell["frac_coords"])


def _clean_numpy_reprs(text):
    # robocrys formats Miller indices from numpy ints: "(np.int64(0), np.int64(0), np.int64(1))"
    text = re.sub(r"np\.(?:int|float)\d*\((-?[\d.]+)\)", r"\1", text)
    return re.sub(r"\((-?\d+), (-?\d+), (-?\d+)\)", r"(\1 \2 \3)", text)


def describe(cell):
    """Robocrystallographer description and the key condensed facts."""
    try:
        from robocrys import StructureCondenser, StructureDescriber
    except ImportError:
        return None
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            condensed = StructureCondenser().condense_structure(_pmg_structure(cell))
            text = StructureDescriber(describe_symmetry_labels=True).describe(condensed)
    except Exception as exc:  # robocrys can fail on unusual bonding; never break the build
        print(f"    ! robocrys failed: {exc}")
        return None
    mineral = condensed.get("mineral") or {}
    return {
        "text": _clean_numpy_reprs(text),
        "dimensionality": condensed.get("dimensionality"),
        "mineral": mineral.get("type") if mineral.get("type") else None,
        "mineral_distance": mineral.get("distance"),
        "tool": "robocrystallographer",
        "doi": ROBOCRYS_DOI,
    }


def polyhedra(cell, label, source_id, outdir):
    """Run Crystal-GENUI; write JSON, CSV tables and the standalone viewer.

    Returns a compact summary for the material page, or None.
    """
    try:
        from crystal_genui.cli import standalone_html
        from crystal_genui.core import analyze_structure
        from crystal_genui.structures import LoadedStructure
        from crystal_genui.tables import TABLES, to_csv
    except ImportError:
        return None
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            loaded = LoadedStructure(_pmg_structure(cell), "optimade", source_id,
                                     f"{label}: recommended DFT structure (TeTI Atlas)")
            report = analyze_structure(loaded, method="shannon", radius_tolerance=0.15)
    except Exception as exc:
        print(f"    ! Crystal-GENUI failed: {exc}")
        return None

    os.makedirs(outdir, exist_ok=True)
    base = os.path.join(outdir, label)
    with open(base + ".json", "w") as fh:
        fh.write(report.model_dump_json(by_alias=True, indent=1))
    with open(base + ".html", "w", encoding="utf-8") as fh:
        fh.write(standalone_html(report))
    for t in TABLES:
        with open(f"{base}_{t}.csv", "w", encoding="utf-8") as fh:
            fh.write(to_csv(report, t))

    r = json.loads(report.model_dump_json(by_alias=True))
    types = []
    for t in r.get("polyhedron_types", []):
        m = t.get("metrics") or {}
        types.append({
            "type_id": t.get("type_id"),
            "center": t.get("center_element"),
            "wyckoff": t.get("wyckoff"),
            "ligand_formula": t.get("ligand_formula"),
            "connectivity": t.get("connectivity"),
            "n_instances": t.get("n_instances"),
            "cn": m.get("coordination_number"),
            "shape": m.get("shape"),
            "avg_bond": m.get("average_bond_length"),
            "volume": m.get("polyhedral_volume"),
            "distortion": m.get("distortion_index"),
            "econ": m.get("effective_coordination_number"),
            "qe": m.get("quadratic_elongation"),
            "bav": m.get("bond_angle_variance"),
            "bvs": m.get("bond_valence_sum"),
        })
    sites = [{"label": s.get("site_label"), "element": s.get("element"), "wyckoff": s.get("wyckoff"),
              "site_symmetry": s.get("site_symmetry"), "oxidation_state": s.get("oxidation_state"),
              "cn": s.get("coordination_number"), "ligands": s.get("ligand_formula"), "shape": s.get("shape"),
              "polyhedron": s.get("forms_polyhedron"), "reason": s.get("reason")}
             for s in r.get("site_environments", [])]
    chem = r.get("crystal_chemistry") or {}
    return {
        "types": types,
        "sites": sites,
        "crystal_chemistry": chem,
        "motifs": sorted({f"{t['ligand_formula']} {t['shape']}" for t in types if t.get("shape")}),
        "shapes": sorted({t["shape"] for t in types if t.get("shape")}),
        "files": {"viewer": f"data/polyhedra/{label}.html", "json": f"data/polyhedra/{label}.json",
                  **{t: f"data/polyhedra/{label}_{t}.csv" for t in TABLES}},
        "tool": "Crystal-GENUI",
        "url": CRYSTAL_GENUI_URL,
        "settings": r.get("settings"),
    }
