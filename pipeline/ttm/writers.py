"""Write structures as CIF (P1 setting, conventional cell) and VASP POSCAR."""

from .chem import composition_from_species, optimade_reduced


def to_cif(cell, title, provenance, spacegroup, symprec):
    p = cell["params"]
    lines = [
        f"# {title}",
        f"# {provenance}",
        f"# Conventional standard cell from spglib; symmetry detected: {spacegroup} at symprec = {symprec} A.",
        "# Positions are idealised (symmetrised) to that space group.",
        "# Written in P1 so that every site is listed explicitly.",
        f"data_{title.replace(' ', '_')}",
        "_symmetry_space_group_name_H-M   'P 1'",
        "_symmetry_Int_Tables_number      1",
        f"_cell_length_a     {p['a']:.6f}",
        f"_cell_length_b     {p['b']:.6f}",
        f"_cell_length_c     {p['c']:.6f}",
        f"_cell_angle_alpha  {p['alpha']:.4f}",
        f"_cell_angle_beta   {p['beta']:.4f}",
        f"_cell_angle_gamma  {p['gamma']:.4f}",
        f"_cell_volume       {cell['volume']:.4f}",
        f"_chemical_formula_sum '{optimade_reduced(composition_from_species(cell['species']))}'",
        "loop_",
        "_symmetry_equiv_pos_as_xyz",
        "  'x, y, z'",
        "loop_",
        "_atom_site_label",
        "_atom_site_type_symbol",
        "_atom_site_fract_x",
        "_atom_site_fract_y",
        "_atom_site_fract_z",
        "_atom_site_occupancy",
    ]
    counter = {}
    for sp, (x, y, z) in zip(cell["species"], cell["frac_coords"]):
        counter[sp] = counter.get(sp, 0) + 1
        lines.append(f"  {sp}{counter[sp]:<4d} {sp:<3s} {x:.6f} {y:.6f} {z:.6f} 1.0")
    return "\n".join(lines) + "\n"


def to_poscar(cell, title):
    order = []
    for s in cell["species"]:
        if s not in order:
            order.append(s)
    idx = sorted(range(len(cell["species"])), key=lambda i: order.index(cell["species"][i]))
    lines = [title, "1.0"]
    lines += ["  " + " ".join(f"{v:14.8f}" for v in row) for row in cell["lattice"]]
    lines.append("  " + " ".join(order))
    lines.append("  " + " ".join(str(cell["species"].count(s)) for s in order))
    lines.append("Direct")
    lines += ["  " + " ".join(f"{v:.8f}" for v in cell["frac_coords"][i]) for i in idx]
    return "\n".join(lines) + "\n"
