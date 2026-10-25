"""Data sources: OPTIMADE providers (DFT), JARVIS-DFT dataset, and COD (experiment)."""

import json
import math
import os
import statistics

import numpy as np
import spglib

from . import http
from .chem import composition_from_species, optimade_reduced, parse_formula, same_composition
from .symmetry import analyse

STRUCT_FIELDS = "id,chemical_formula_reduced,lattice_vectors,cartesian_site_positions,species_at_sites,species,nsites,last_modified"


def _num(x):
    if x is None or x == "na" or x == "":
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(v) else v


def _optimade_structure(attrs):
    """OPTIMADE attributes -> (lattice, frac_coords, element symbols)."""
    lat = np.asarray(attrs["lattice_vectors"], float)
    cart = np.asarray(attrs["cartesian_site_positions"], float)
    frac = cart @ np.linalg.inv(lat)
    sym_of = {s["name"]: s["chemical_symbols"][0] for s in (attrs.get("species") or [])}
    species = [sym_of.get(n, n) for n in attrs["species_at_sites"]]
    return lat.tolist(), frac.tolist(), species


def _optimade_query(base, filt, fields, max_pages=6):
    out, url, params = [], f"{base}/structures", {"filter": filt, "response_fields": fields, "page_limit": 50}
    for _ in range(max_pages):
        data = http.get_json(url, params=params)
        if not data:
            return out if out else None
        out.extend(data.get("data", []))
        nxt = (data.get("links") or {}).get("next")
        if not nxt:
            break
        url, params = (nxt if isinstance(nxt, str) else nxt.get("href")), None
    return out


# ───────────────────────────── DFT providers ─────────────────────────────

class OptimadeProvider:
    def __init__(self, key, name, base, extra_fields, functional, cite, homepage):
        self.key, self.name, self.base = key, name, base
        self.extra_fields, self.functional = extra_fields, functional
        self.cite, self.homepage = cite, homepage
        self.failures = 0  # consecutive failed queries; after three the server is treated as down for this run

    def entry_url(self, entry_id, attrs=None):
        return f"{self.base}/structures/{entry_id}"

    def properties(self, attrs):
        return {}

    def fetch(self, comp):
        filt = f'chemical_formula_reduced="{optimade_reduced(comp)}"'
        if self.failures >= 3:
            return None
        rows = _optimade_query(self.base, filt, STRUCT_FIELDS + "," + self.extra_fields)
        if rows is None:
            self.failures += 1
            return None
        self.failures = 0
        entries = []
        for row in rows:
            a = row["attributes"]
            try:
                lat, frac, species = _optimade_structure(a)
            except (KeyError, TypeError, ValueError, np.linalg.LinAlgError):
                continue
            if not same_composition(composition_from_species(species), comp):
                continue
            entries.append({"source": self.key, "id": row["id"], "url": self.entry_url(row["id"], a),
                            "functional": self.functional,
                            "structure": {"lattice": lat, "frac_coords": frac, "species": species},
                            "properties": self.properties(a)})
        return entries


class MaterialsProject(OptimadeProvider):
    def __init__(self):
        super().__init__("mp", "Materials Project", "https://optimade.materialsproject.org/v1",
                         "_mp_stability", "GGA/GGA+U/r2SCAN (MP mixing scheme)",
                         "10.1063/1.4812323", "https://materialsproject.org")

    def entry_url(self, entry_id, attrs=None):
        return f"https://next-gen.materialsproject.org/materials/{entry_id}"

    def properties(self, a):
        stab = a.get("_mp_stability") or {}
        thermo = stab.get("gga_gga+u_r2scan") or stab.get("gga_gga+u") or stab.get("r2scan") or {}
        return {"e_above_hull": _num(thermo.get("energy_above_hull")),
                "formation_energy": _num(thermo.get("formation_energy_per_atom"))}


class Alexandria(OptimadeProvider):
    def __init__(self, flavour="pbe"):
        label = {"pbe": "PBE", "pbesol": "PBEsol"}[flavour]
        super().__init__(f"alex-{flavour}", f"Alexandria ({label})", f"https://alexandria.icams.rub.de/{flavour}/v1",
                         "_alexandria_hull_distance,_alexandria_formation_energy_per_atom,_alexandria_band_gap,"
                         "_alexandria_band_gap_direct,_alexandria_magnetization,_alexandria_xc_functional",
                         label, "10.1002/adma.202210788", "https://alexandria.icams.rub.de/")

    def properties(self, a):
        return {"e_above_hull": _num(a.get("_alexandria_hull_distance")),
                "formation_energy": _num(a.get("_alexandria_formation_energy_per_atom")),
                "band_gap": _num(a.get("_alexandria_band_gap")),
                "band_gap_direct": _num(a.get("_alexandria_band_gap_direct")),
                "magnetization": _num(a.get("_alexandria_magnetization"))}


class OQMD(OptimadeProvider):
    def __init__(self):
        super().__init__("oqmd", "OQMD", "https://oqmd.org/optimade/v1",
                         "_oqmd_stability,_oqmd_delta_e,_oqmd_band_gap,_oqmd_entry_id,_oqmd_icsd_id",
                         "PBE (+U)", "10.1038/npjcompumats.2015.10", "https://oqmd.org")

    def entry_url(self, entry_id, attrs=None):
        # OPTIMADE ids are OQMD calculation ids; link to the human-readable entry page when known
        eid = (attrs or {}).get("_oqmd_entry_id")
        return f"https://oqmd.org/materials/entry/{eid}" if eid else f"{self.base}/structures/{entry_id}"

    def properties(self, a):
        return {"e_above_hull": _num(a.get("_oqmd_stability")),
                "formation_energy": _num(a.get("_oqmd_delta_e")),
                "band_gap": _num(a.get("_oqmd_band_gap"))}


class Jarvis:
    """JARVIS-DFT 3D dataset (figshare), which carries spillage and BoltzTraP data."""

    key, name, functional = "jarvis", "JARVIS-DFT", "OptB88vdW"
    cite, homepage = "10.1038/s41524-020-00440-1", "https://jarvis.nist.gov"
    FILE = os.path.join(os.path.dirname(__file__), "..", "cache", "jdft_3d-12-12-2022.json")

    def __init__(self):
        self._index = None

    def _load(self):
        if self._index is None:
            if not os.path.exists(self.FILE):
                print("    ! JARVIS dataset missing; run `python pipeline/build.py --download-jarvis`")
                self._index = {}
                return
            print("    loading JARVIS-DFT dataset …")
            with open(self.FILE) as fh:
                rows = json.load(fh)
            self._index = {}
            for r in rows:
                try:
                    key = optimade_reduced(parse_formula(r["formula"]))
                except ValueError:
                    continue
                self._index.setdefault(key, []).append(r)

    def fetch(self, comp):
        self._load()
        out = []
        for r in self._index.get(optimade_reduced(comp), []):
            at = r["atoms"]
            lat = np.asarray(at["lattice_mat"], float)
            coords = np.asarray(at["coords"], float)
            frac = coords @ np.linalg.inv(lat) if at.get("cartesian") else coords
            out.append({
                "source": self.key, "id": r["jid"],
                "url": f"https://www.ctcms.nist.gov/~knc6/jsmol/{r['jid']}.html",
                "functional": self.functional,
                "structure": {"lattice": lat.tolist(), "frac_coords": frac.tolist(), "species": list(at["elements"])},
                "properties": {
                    "e_above_hull": _num(r.get("ehull")),
                    "formation_energy": _num(r.get("formation_energy_peratom")),
                    "band_gap": _num(r.get("optb88vdw_bandgap")),
                    "band_gap_mbj": _num(r.get("mbj_bandgap")),
                    "band_gap_hse": _num(r.get("hse_gap")),
                    "spillage": _num(r.get("spillage")),
                    "seebeck_n": _num(r.get("n-Seebeck")),
                    "seebeck_p": _num(r.get("p-Seebeck")),
                    "powerfactor_n": _num(r.get("n-powerfact")),
                    "powerfactor_p": _num(r.get("p-powerfact")),
                    "avg_elec_mass": _num(r.get("avg_elec_mass")),
                    "avg_hole_mass": _num(r.get("avg_hole_mass")),
                    "bulk_modulus": _num(r.get("bulk_modulus_kv")),
                    "shear_modulus": _num(r.get("shear_modulus_gv")),
                    "exfoliation_energy": _num(r.get("exfoliation_energy")),
                    "magmom": _num(r.get("magmom_outcar")),
                    "dimensionality": r.get("dimensionality") if r.get("dimensionality") != "na" else None,
                    "icsd": r.get("icsd") if r.get("icsd") not in (None, "na", "") else None,
                },
            })
        return out


DFT_SOURCES = [MaterialsProject(), Jarvis(), Alexandria("pbe"), Alexandria("pbesol"), OQMD()]


def select(entries, spacegroups):
    """Analyse symmetry, choose the best entry matching the experimental space group.

    Returns (chosen_entry, polymorph_table). Selection: entries whose space group
    is in `spacegroups`, lowest energy above hull, then fewest sites.
    """
    analysed = []
    for e in entries:
        s = e["structure"]
        sym = analyse(s["lattice"], s["frac_coords"], s["species"], spacegroups)
        if sym is None:
            continue
        e["symmetry"] = sym
        analysed.append(e)
    if not analysed:
        return None, []

    def rank(e):
        h = e["properties"].get("e_above_hull")
        return (h if h is not None else 9e9, len(e["structure"]["species"]))

    matching = sorted((e for e in analysed if e["symmetry"]["spacegroup_number"] in spacegroups), key=rank)
    polymorphs = [{"id": e["id"], "url": e["url"], "spacegroup": e["symmetry"]["spacegroup_symbol"],
                   "spacegroup_number": e["symmetry"]["spacegroup_number"],
                   "e_above_hull": e["properties"].get("e_above_hull"), "nsites": len(e["structure"]["species"])}
                  for e in sorted(analysed, key=rank)][:12]
    if matching:
        chosen = matching[0]
        chosen["spacegroup_match"] = True
    else:
        chosen = sorted(analysed, key=rank)[0]
        chosen["spacegroup_match"] = False
    return chosen, polymorphs


# ───────────────────────────── COD (experiment) ─────────────────────────────

COD_BASE = "https://www.crystallography.net/cod/optimade/v1"
COD_FIELDS = ("id,chemical_formula_reduced,_cod_a,_cod_b,_cod_c,_cod_alpha,_cod_beta,_cod_gamma,_cod_vol,_cod_Z,"
              "_cod_formula,_cod_sgNumber,_cod_sg,_cod_year,_cod_journal,_cod_title,_cod_authors,_cod_volume,"
              "_cod_firstpage,_cod_flags,_cod_celltemp,_cod_diffrtemp,_cod_cellpressure")


def _cod_atoms_per_fu(formula):
    tokens = formula.strip("- ").split()
    try:
        return sum(sum(parse_formula(t).values()) for t in tokens)
    except ValueError:
        return None


def _rhombo_to_hex(a, alpha):
    al = math.radians(alpha)
    return 2 * a * math.sin(al / 2), a * math.sqrt(3 * (1 + 2 * math.cos(al)))


def _cod_cif_cell(cod_id, spacegroups):
    """Volume per atom and spglib-standardised conventional cell from the COD CIF itself.

    COD's catalogue metadata (cell volume, Z, formula) is sometimes inconsistent with
    the deposited cell, e.g. a supercell reported with the Z of the small cell. Reading
    the CIF avoids that: atoms are counted with their occupancies, and the cell is
    reduced to the same conventional standard setting used for the DFT structures.
    Disordered sites are given one spglib type per distinct (species, occupancy) set.
    """
    import warnings

    from pymatgen.io.cif import CifParser

    from .symmetry import lattice_parameters

    text = http.get_text(f"https://www.crystallography.net/cod/{cod_id}.cif")
    if not text:
        return None
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            st = CifParser.from_str(text, occupancy_tolerance=1.05).parse_structures(primitive=False)[0]
    except Exception:  # noqa: BLE001 - malformed or unusual CIFs fall back to COD metadata
        return None
    kinds = {}
    numbers = [kinds.setdefault(tuple(sorted((str(e), round(o, 3)) for e, o in site.species.items())), len(kinds) + 1)
               for site in st]
    cell = (st.lattice.matrix, st.frac_coords % 1.0, numbers)
    found = [(sp, d) for sp in (1e-3, 1e-2, 0.05, 0.1) if (d := spglib.get_symmetry_dataset(cell, symprec=sp)) is not None]
    if not found:
        return None
    sp, ds = next(((sp, d) for sp, d in found if int(d.number) in spacegroups), found[0])
    params = {k: round(v, 4) for k, v in lattice_parameters(np.asarray(ds.std_lattice)).items()}
    return {"volume_per_atom": round(st.volume / st.composition.num_atoms, 4), "params": params,
            "spacegroup_number": int(ds.number), "disordered": not st.is_ordered,
            "nsites": len(st), "symprec": sp}


def fetch_cod(comp, spacegroups):
    els = sorted(comp)
    filt = "elements HAS ALL " + ",".join(f'"{e}"' for e in els) + f" AND nelements={len(els)}"
    rows = _optimade_query(COD_BASE, filt, COD_FIELDS, max_pages=4)
    if rows is None:
        return None
    out = []
    for row in rows:
        a = row["attributes"]
        try:
            ok = same_composition(parse_formula(a.get("chemical_formula_reduced") or ""), comp)
        except ValueError:
            ok = False
        if not ok:
            continue
        sg = int(_num(a.get("_cod_sgNumber")) or 0)
        flags = a.get("_cod_flags") or ""
        if sg not in spacegroups or "errors" in flags or "retracted" in flags:
            continue
        if (_num(a.get("_cod_cellpressure")) or 0) > 200:
            continue  # high-pressure study (COD pressure is in kPa)
        A, B, C = (_num(a.get(k)) for k in ("_cod_a", "_cod_b", "_cod_c"))
        al, be, ga = (_num(a.get(k)) for k in ("_cod_alpha", "_cod_beta", "_cod_gamma"))
        if None in (A, B, C):
            continue
        setting = "as reported"
        if 143 <= sg <= 167 and abs(A - B) < 1e-3 and abs(A - C) < 1e-3 and al and abs(al - 90) > 1e-3:
            A, C = _rhombo_to_hex(A, al)
            B, al, be, ga = A, 90.0, 90.0, 120.0
            setting = "rhombohedral → hexagonal"
        vol, Z, apfu = _num(a.get("_cod_vol")), _num(a.get("_cod_Z")), _cod_atoms_per_fu(a.get("_cod_formula") or "")
        vpa = vol / (Z * apfu) if vol and Z and apfu else None
        params, source = {"a": A, "b": B, "c": C, "alpha": al, "beta": be, "gamma": ga}, "COD metadata"
        parsed = _cod_cif_cell(row["id"], spacegroups)
        note = None
        if parsed:
            if vpa and abs(parsed["volume_per_atom"] - vpa) / parsed["volume_per_atom"] > 0.02:
                note = (f"COD catalogue metadata imply {vpa:.2f} Å³/atom, but the deposited CIF gives "
                        f"{parsed['volume_per_atom']:.2f} Å³/atom; the CIF is used.")
            vpa, params, setting = parsed["volume_per_atom"], parsed["params"], "standardised from CIF"
            source = "CIF"
        authors = a.get("_cod_authors") or ""
        out.append({
            "id": row["id"], "url": f"https://www.crystallography.net/cod/{row['id']}.html",
            "cif": f"https://www.crystallography.net/cod/{row['id']}.cif",
            "spacegroup_number": sg, "spacegroup_symbol": a.get("_cod_sg"),
            # the space group of the cell whose parameters are given (spglib on the CIF when it could be read)
            "cell_spacegroup_number": parsed["spacegroup_number"] if parsed else sg,
            "params": params, "setting": setting, "cell_source": source, "note": note,
            "disordered": (parsed or {}).get("disordered"),
            "volume_per_atom": round(vpa, 4) if vpa else None,
            "temperature": _num(a.get("_cod_celltemp")) or _num(a.get("_cod_diffrtemp")),
            "year": a.get("_cod_year"), "journal": a.get("_cod_journal"),
            "title": a.get("_cod_title"),
            "authors": authors.split(";")[0].strip() + (" et al." if ";" in authors else ""),
            "citation_volume": a.get("_cod_volume"), "first_page": a.get("_cod_firstpage"),
        })
    if not out:
        return {"entries": [], "reference": None}
    vols = [e["volume_per_atom"] for e in out if e["volume_per_atom"]]
    med = statistics.median(vols) if vols else None
    for e in out:
        e["deviation_from_median"] = (round(100 * (e["volume_per_atom"] - med) / med, 2)
                                      if med and e["volume_per_atom"] else None)
    # closest to the median; with an even count the two middle entries tie, so prefer the more recent study
    ref = min((e for e in out if e["volume_per_atom"]),
              key=lambda e: (round(abs(e["volume_per_atom"] - med), 3), -int(e["year"] or 0)), default=out[0])
    spread = round(100 * (max(vols) - min(vols)) / med, 2) if len(vols) > 1 else None
    out.sort(key=lambda e: str(e["year"] or ""), reverse=True)
    return {"entries": out[:15], "count": len(out), "median_volume_per_atom": round(med, 4) if med else None,
            "volume_spread": spread, "reference": ref}
