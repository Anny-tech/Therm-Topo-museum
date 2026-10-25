"""Symmetry analysis with spglib: space group and conventional standard cell."""

import numpy as np
import spglib

from .elements import ELEMENTS, SYMBOL_BY_Z

AVOGADRO = 6.02214076e23


def crystal_system(number):
    for upper, name in ((2, "triclinic"), (15, "monoclinic"), (74, "orthorhombic"),
                        (142, "tetragonal"), (167, "trigonal"), (194, "hexagonal"), (230, "cubic")):
        if number <= upper:
            return name
    raise ValueError(number)


def lattice_parameters(matrix):
    m = np.asarray(matrix, float)
    a, b, c = (float(np.linalg.norm(v)) for v in m)

    def ang(u, v):
        return float(np.degrees(np.arccos(np.clip(np.dot(u, v) / np.linalg.norm(u) / np.linalg.norm(v), -1, 1))))

    return {"a": a, "b": b, "c": c,
            "alpha": ang(m[1], m[2]), "beta": ang(m[0], m[2]), "gamma": ang(m[0], m[1])}


def analyse(lattice, frac_coords, species, targets=None):
    """Return symmetry info and the conventional standard cell of a structure.

    Tolerances are tried from strict to loose (1e-3 → 0.1 Å, the Materials
    Project convention). If `targets` (experimental space-group numbers) is
    given, the strictest tolerance that recovers one of them is used, so that
    numerical noise in a relaxation does not hide the true symmetry; otherwise
    the strictest tolerance is used. The tolerance is reported with the result.
    """
    numbers = [ELEMENTS[s]["Z"] for s in species]
    cell = (np.asarray(lattice, float), np.asarray(frac_coords, float) % 1.0, numbers)
    found = []
    for symprec in (1e-3, 1e-2, 0.05, 0.1):
        d = spglib.get_symmetry_dataset(cell, symprec=symprec)
        if d is not None:
            found.append((symprec, d))
    if not found:
        return None
    symprec, ds = found[0]
    for sp, d in found:
        if targets and int(d.number) in targets:
            symprec, ds = sp, d
            break
    std_species = [SYMBOL_BY_Z[int(z)] for z in ds.std_types]
    std_lat = np.asarray(ds.std_lattice)
    vol = float(abs(np.linalg.det(std_lat)))
    mass = sum(ELEMENTS[s]["mass"] for s in std_species)
    p_lat, p_pos, p_z = spglib.standardize_cell(cell, to_primitive=True, no_idealize=False, symprec=symprec)
    p_lat = np.asarray(p_lat)
    return {
        "spacegroup_number": int(ds.number),
        "spacegroup_symbol": ds.international,
        "hall_symbol": ds.hall,
        "point_group": ds.pointgroup,
        "crystal_system": crystal_system(int(ds.number)),
        "symprec": symprec,
        "wyckoffs": sorted(set(f"{s}:{w}" for s, w in zip(species, ds.wyckoffs))),
        "conventional": {
            "lattice": std_lat.round(6).tolist(),
            "species": std_species,
            "frac_coords": np.asarray(ds.std_positions).round(6).tolist(),
            "params": {k: round(v, 4) for k, v in lattice_parameters(std_lat).items()},
            "volume": round(vol, 3),
            "nsites": len(std_species),
        },
        "primitive": {
            "lattice": p_lat.round(6).tolist(),
            "species": [SYMBOL_BY_Z[int(z)] for z in p_z],
            "frac_coords": np.asarray(p_pos).round(6).tolist(),
            "params": {k: round(v, 4) for k, v in lattice_parameters(p_lat).items()},
            "volume": round(float(abs(np.linalg.det(p_lat))), 3),
            "nsites": len(p_z),
        },
        "volume_per_atom": round(vol / len(std_species), 4),
        "density": round(mass / AVOGADRO / (vol * 1e-24), 4),  # g/cm³
    }
