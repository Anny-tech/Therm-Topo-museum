"""Element data used by the pipeline and exported to the website.

mass       IUPAC standard atomic weight (abridged), g/mol
radius     single-bond covalent radius, Å (Cordero et al., Dalton Trans. 2008)
color      Jmol CPK colour
"""

# Z, symbol, name, mass, covalent radius, Jmol colour
_TABLE = """
1 H Hydrogen 1.008 0.31 FFFFFF
2 He Helium 4.0026 0.28 D9FFFF
3 Li Lithium 6.94 1.28 CC80FF
4 Be Beryllium 9.0122 0.96 C2FF00
5 B Boron 10.81 0.84 FFB5B5
6 C Carbon 12.011 0.76 909090
7 N Nitrogen 14.007 0.71 3050F8
8 O Oxygen 15.999 0.66 FF0D0D
9 F Fluorine 18.998 0.57 90E050
10 Ne Neon 20.180 0.58 B3E3F5
11 Na Sodium 22.990 1.66 AB5CF2
12 Mg Magnesium 24.305 1.41 8AFF00
13 Al Aluminium 26.982 1.21 BFA6A6
14 Si Silicon 28.085 1.11 F0C8A0
15 P Phosphorus 30.974 1.07 FF8000
16 S Sulfur 32.06 1.05 FFFF30
17 Cl Chlorine 35.45 1.02 1FF01F
18 Ar Argon 39.948 1.06 80D1E3
19 K Potassium 39.098 2.03 8F40D4
20 Ca Calcium 40.078 1.76 3DFF00
21 Sc Scandium 44.956 1.70 E6E6E6
22 Ti Titanium 47.867 1.60 BFC2C7
23 V Vanadium 50.942 1.53 A6A6AB
24 Cr Chromium 51.996 1.39 8A99C7
25 Mn Manganese 54.938 1.39 9C7AC7
26 Fe Iron 55.845 1.32 E06633
27 Co Cobalt 58.933 1.26 F090A0
28 Ni Nickel 58.693 1.24 50D050
29 Cu Copper 63.546 1.32 C88033
30 Zn Zinc 65.38 1.22 7D80B0
31 Ga Gallium 69.723 1.22 C28F8F
32 Ge Germanium 72.630 1.20 668F8F
33 As Arsenic 74.922 1.19 BD80E3
34 Se Selenium 78.971 1.20 FFA100
35 Br Bromine 79.904 1.20 A62929
36 Kr Krypton 83.798 1.16 5CB8D1
37 Rb Rubidium 85.468 2.20 702EB0
38 Sr Strontium 87.62 1.95 00FF00
39 Y Yttrium 88.906 1.90 94FFFF
40 Zr Zirconium 91.224 1.75 94E0E0
41 Nb Niobium 92.906 1.64 73C2C9
42 Mo Molybdenum 95.95 1.54 54B5B5
43 Tc Technetium 98 1.47 3B9E9E
44 Ru Ruthenium 101.07 1.46 248F8F
45 Rh Rhodium 102.91 1.42 0A7D8C
46 Pd Palladium 106.42 1.39 006985
47 Ag Silver 107.87 1.45 C0C0C0
48 Cd Cadmium 112.41 1.44 FFD98F
49 In Indium 114.82 1.42 A67573
50 Sn Tin 118.71 1.39 668080
51 Sb Antimony 121.76 1.39 9E63B5
52 Te Tellurium 127.60 1.38 D47A00
53 I Iodine 126.90 1.39 940094
54 Xe Xenon 131.29 1.40 429EB0
55 Cs Caesium 132.91 2.44 57178F
56 Ba Barium 137.33 2.15 00C900
57 La Lanthanum 138.91 2.07 70D4FF
58 Ce Cerium 140.12 2.04 FFFFC7
59 Pr Praseodymium 140.91 2.03 D9FFC7
60 Nd Neodymium 144.24 2.01 C7FFC7
61 Pm Promethium 145 1.99 A3FFC7
62 Sm Samarium 150.36 1.98 8FFFC7
63 Eu Europium 151.96 1.98 61FFC7
64 Gd Gadolinium 157.25 1.96 45FFC7
65 Tb Terbium 158.93 1.94 30FFC7
66 Dy Dysprosium 162.50 1.92 1FFFC7
67 Ho Holmium 164.93 1.92 00FF9C
68 Er Erbium 167.26 1.89 00E675
69 Tm Thulium 168.93 1.90 00D452
70 Yb Ytterbium 173.05 1.87 00BF38
71 Lu Lutetium 174.97 1.87 00AB24
72 Hf Hafnium 178.49 1.75 4DC2FF
73 Ta Tantalum 180.95 1.70 4DA6FF
74 W Tungsten 183.84 1.62 2194D6
75 Re Rhenium 186.21 1.51 267DAB
76 Os Osmium 190.23 1.44 266696
77 Ir Iridium 192.22 1.41 175487
78 Pt Platinum 195.08 1.36 D0D0E0
79 Au Gold 196.97 1.36 FFD123
80 Hg Mercury 200.59 1.32 B8B8D0
81 Tl Thallium 204.38 1.45 A6544D
82 Pb Lead 207.2 1.46 575961
83 Bi Bismuth 208.98 1.48 9E4FB5
84 Po Polonium 209 1.40 AB5C00
85 At Astatine 210 1.50 754F45
86 Rn Radon 222 1.50 428296
"""

ELEMENTS = {}
for _line in _TABLE.strip().splitlines():
    _z, _sym, _name, _mass, _rad, _col = _line.split()
    ELEMENTS[_sym] = {
        "Z": int(_z),
        "symbol": _sym,
        "name": _name,
        "mass": float(_mass),
        "radius": float(_rad),
        "color": "#" + _col,
    }

SYMBOL_BY_Z = {v["Z"]: k for k, v in ELEMENTS.items()}
