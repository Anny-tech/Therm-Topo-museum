// Decorative line-art and layered backdrops, drawn in currentColor so CSS sets the ink.
// Each motif is a real physics sketch: a surface Dirac cone, an inverted band gap,
// the hexagonal Brillouin zone of the tetradymites and a ball-and-stick unit cell.

const svg = (body, vb = "0 0 160 110") =>
  `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const LINEART = {
  // E(k) = ±v|k| cone with the bulk gap edges behind it
  dirac: svg(`
    <ellipse cx="80" cy="16" rx="40" ry="9"/><ellipse cx="80" cy="94" rx="40" ry="9" stroke-dasharray="3 4"/>
    <path d="M40 16 80 55 120 16M40 94 80 55 120 94"/>
    <path d="M14 30c20 4 40 6 66 6s46-2 66-6M14 80c20-4 40-6 66-6s46 2 66 6" opacity=".45"/>
    <circle cx="80" cy="55" r="3" fill="currentColor" stroke="none"/>`),
  // conduction and valence parabolas swapping character near Γ
  inversion: svg(`
    <path d="M18 20C50 20 62 66 80 66S110 20 142 20"/><path d="M18 92C50 92 62 46 80 46s30 46 62 46"/>
    <path d="M80 8v96" stroke-dasharray="2 5" opacity=".55"/>
    <circle cx="80" cy="46" r="3.2" fill="currentColor" stroke="none"/><circle cx="80" cy="66" r="3.2"/>
    <text x="84" y="104" font-size="11" fill="currentColor" stroke="none" font-family="Figtree,sans-serif" font-style="italic">Γ</text>`),
  // 2D hexagonal Brillouin zone with Γ, M, K
  bz: svg(`
    <path d="M80 10l39 22.5v45L80 100 41 77.5v-45z"/><path d="M80 55h39M80 55l19.5-33.75" opacity=".55"/>
    <circle cx="80" cy="55" r="2.6" fill="currentColor" stroke="none"/><circle cx="119" cy="55" r="2.6" fill="currentColor" stroke="none"/><circle cx="99.5" cy="21.25" r="2.6" fill="currentColor" stroke="none"/>
    <g font-size="11" fill="currentColor" stroke="none" font-family="Figtree,sans-serif"><text x="70" y="70">Γ</text><text x="124" y="59">M</text><text x="103" y="16">K</text></g>`),
  // cubic cell with a body-centred atom
  cell: svg(`
    <path d="M45 35h55v55H45zM65 18h55v55H65zM45 35l20-17M100 35l20-17M100 90l20-17M45 90l20-17" />
    <g fill="currentColor" stroke="none" opacity=".9"><circle cx="45" cy="35" r="4"/><circle cx="100" cy="35" r="4"/><circle cx="45" cy="90" r="4"/><circle cx="100" cy="90" r="4"/>
    <circle cx="65" cy="18" r="4"/><circle cx="120" cy="18" r="4"/><circle cx="120" cy="73" r="4"/><circle cx="65" cy="73" r="4" opacity=".5"/></g>
    <circle cx="82.5" cy="54" r="7"/>`),
};

// Gradient blob + outline rings + lattice patch, positioned in percentages of the parent.
export function backdrop({ blob = [52, 6, 50, 80], blobClass = "", ring = [30, 54, 28], ring2 = null, hex = [-6, 58, 50, 40] } = {}) {
  const pos = ([l, t, w, h]) => `left:${l}%;top:${t}%;width:${w}%;height:${h}%`;
  const circ = ([l, t, d]) => `left:${l}%;top:${t}%;width:${d}%;aspect-ratio:1`;
  return `<div class="deco blob ${blobClass}" style="${pos(blob)}"></div>
    ${ring ? `<div class="deco ring" style="${circ(ring)}"></div>` : ""}
    ${ring2 ? `<div class="deco ring thin" style="${circ(ring2)}"></div>` : ""}
    ${hex ? `<div class="deco hexes" style="${pos(hex)}"></div>` : ""}`;
}

// Top-right composition for inner pages: blob, rings, lattice patch and one line-art motif.
export function pageArt(motif = "bz", { blobClass = "" } = {}) {
  return `<div class="page-art" aria-hidden="true">
    ${backdrop({ blob: [30, 0, 60, 86], blobClass, ring: [14, 52, 30], ring2: [82, 4, 16], hex: [0, -10, 70, 70] })}
    <div class="deco lineart" style="left:44%;top:22%;width:32%;height:46%">${LINEART[motif]}</div></div>`;
}
