"""Chemical formula helpers."""

import re
from functools import reduce
from math import gcd

_TOKEN = re.compile(r"([A-Z][a-z]?)(\d*\.?\d*)")


def parse_formula(formula):
    """'Bi2Te3' -> {'Bi': 2, 'Te': 3}. Integer counts only (no parentheses)."""
    comp = {}
    pos = 0
    for m in _TOKEN.finditer(formula):
        if m.start() != pos:
            raise ValueError(f"Cannot parse formula {formula!r}")
        pos = m.end()
        el, n = m.group(1), m.group(2)
        comp[el] = comp.get(el, 0) + (float(n) if n else 1)
    if pos != len(formula):
        raise ValueError(f"Cannot parse formula {formula!r}")
    return {k: int(v) if float(v).is_integer() else v for k, v in comp.items()}


def reduce_composition(comp):
    if not comp:
        return {}
    counts = [int(round(v)) for v in comp.values()]
    if any(abs(c - v) > 1e-6 for c, v in zip(counts, comp.values())):
        return dict(comp)
    g = reduce(gcd, counts)
    return {k: int(round(v)) // g for k, v in comp.items()}


def optimade_reduced(comp):
    """OPTIMADE chemical_formula_reduced: alphabetical, gcd-reduced, 1 omitted."""
    comp = reduce_composition(comp)
    return "".join(f"{el}{'' if comp[el] == 1 else comp[el]}" for el in sorted(comp))


def same_composition(a, b):
    return reduce_composition(a) == reduce_composition(b)


def composition_from_species(species):
    comp = {}
    for s in species:
        comp[s] = comp.get(s, 0) + 1
    return reduce_composition(comp)
