// Dependency-free canvas crystal-structure viewer.
// Ball-and-stick rendering with depth-sorted shaded spheres, bonds from covalent
// radii, unit-cell outline, drag-rotate, wheel zoom, supercells and atom hover.
// Decorative views can pass a `palette` to colour species with the site's inks instead of Jmol colours.

const BOND_TOLERANCE = 1.18; // bond if d < tol·(r_i + r_j); covalent radii (Cordero 2008)
export const INKS = ["#f26b6b", "#8f74ff", "#2f9be0", "#1d3461", "#f0932b"];
const INK = "rgba(19,37,65,";

function mat3mul(A, B) {
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i][j] += A[i][k] * B[k][j];
  return C;
}
const rotX = (t) => [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]];
const rotZ = (t) => [[Math.cos(t), -Math.sin(t), 0], [Math.sin(t), Math.cos(t), 0], [0, 0, 1]];
const apply = (R, p) => [
  R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2],
  R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2],
  R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2],
];
const frac2cart = (L, f) => [0, 1, 2].map((j) => f[0] * L[0][j] + f[1] * L[1][j] + f[2] * L[2][j]);

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f > 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function buildScene(cell, elements, n = [1, 1, 1], { boundary = true } = {}) {
  const L = cell.lattice;
  const atoms = [];
  const eps = 0.02;
  cell.frac_coords.forEach((f0, idx) => {
    const f = f0.map((x) => ((x % 1) + 1) % 1);
    const shifts = [[0], [0], [0]];
    if (boundary) for (let k = 0; k < 3; k++) if (f[k] < eps) shifts[k].push(n[k]);
    for (let i = 0; i < n[0]; i++) for (let j = 0; j < n[1]; j++) for (let k = 0; k < n[2]; k++)
      for (const sa of shifts[0]) for (const sb of shifts[1]) for (const sc of shifts[2]) {
        const ff = [f[0] + i + sa, f[1] + j + sb, f[2] + k + sc];
        if (ff[0] > n[0] + eps || ff[1] > n[1] + eps || ff[2] > n[2] + eps) continue;
        const sp = cell.species[idx];
        atoms.push({ sp, site: idx, frac: f, pos: frac2cart(L, ff), r: elements[sp]?.radius ?? 1.4, color: elements[sp]?.color ?? "#ff1493" });
      }
  });
  const bonds = [];
  for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) {
    const a = atoms[i], b = atoms[j];
    const dx = a.pos[0] - b.pos[0], dy = a.pos[1] - b.pos[1], dz = a.pos[2] - b.pos[2];
    const d2 = dx * dx + dy * dy + dz * dz, lim = BOND_TOLERANCE * (a.r + b.r);
    if (d2 > 0.25 && d2 < lim * lim) bonds.push([i, j, Math.sqrt(d2)]);
  }
  const corners = [];
  for (const a of [0, n[0]]) for (const b of [0, n[1]]) for (const c of [0, n[2]]) corners.push(frac2cart(L, [a, b, c]));
  const edges = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];
  const center = frac2cart(L, n.map((x) => x / 2));
  return { atoms, bonds, corners, edges, center, axes: [L[0], L[1], L[2]] };
}

export class CrystalViewer {
  constructor(canvas, cell, elements, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.elements = elements;
    this.opts = { interactive: true, atomScale: 0.42, showCell: true, showBonds: true, showAxes: true, background: null,
      palette: null, ...opts };
    this.R = mat3mul(rotX(0.22), rotZ(-0.55));
    this.zoom = 1;
    this.n = [1, 1, 1];
    this.hover = null;
    this.onHover = opts.onHover || null;
    this.setCell(cell);
    this._resize = () => this.draw();
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.draw());
      this.ro.observe(canvas);
    }
    if (this.opts.interactive) this._bind();
  }

  setCell(cell) {
    this.cell = cell;
    const pal = this.opts.palette;
    this.colorOf = pal ? Object.fromEntries([...new Set(cell.species)].map((sp, i) => [sp, pal[i % pal.length]])) : null;
    this.scene = buildScene(cell, this.elements, this.n);
    this.draw();
  }

  setSupercell(n) {
    this.n = n;
    this.scene = buildScene(this.cell, this.elements, n);
    this.draw();
  }

  set(opt, value) {
    this.opts[opt] = value;
    this.draw();
  }

  view(axis) {
    // look down a, b or c (screen-up chosen sensibly)
    const L = this.cell.lattice;
    const v = axis === "a" ? L[0] : axis === "b" ? L[1] : L[2];
    const up = axis === "c" ? L[1] : L[2];
    const norm = (p) => { const l = Math.hypot(...p); return p.map((x) => x / l); };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const d = norm(v); // viewing direction → +y (depth)
    let u = norm(up);
    const x = norm(cross(d, u));
    u = cross(x, d);
    this.R = [x, d, u];
    this.draw();
  }

  _bind() {
    const c = this.canvas;
    let drag = null;
    c.addEventListener("pointerdown", (e) => { drag = [e.clientX, e.clientY]; c.setPointerCapture(e.pointerId); c.classList.add("grabbing"); });
    c.addEventListener("pointerup", (e) => { drag = null; c.releasePointerCapture(e.pointerId); c.classList.remove("grabbing"); });
    c.addEventListener("pointermove", (e) => {
      if (drag) {
        const dx = e.clientX - drag[0], dy = e.clientY - drag[1];
        drag = [e.clientX, e.clientY];
        this.R = mat3mul(rotX(dy * 0.008), mat3mul(rotZ(dx * 0.008), this.R));
        this.draw();
      } else this._hit(e);
    });
    c.addEventListener("pointerleave", () => { if (this.hover) { this.hover = null; this.draw(); this.onHover?.(null); } });
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoom = Math.min(4, Math.max(0.3, this.zoom * Math.exp(-e.deltaY * 0.0015)));
      this.draw();
    }, { passive: false });
  }

  _hit(e) {
    if (!this._proj) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    let best = null;
    for (const p of this._proj) {
      const dx = x - p.sx, dy = y - p.sy;
      if (dx * dx + dy * dy <= p.sr * p.sr && (!best || p.depth < best.depth)) best = p;
    }
    const h = best ? best.atom : null;
    if (h !== this.hover) {
      this.hover = h;
      this.draw();
      this.onHover?.(h);
    }
  }

  draw() {
    const c = this.canvas, ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (this.opts.background) { ctx.fillStyle = this.opts.background; ctx.fillRect(0, 0, w, h); }

    const { atoms, bonds, corners, edges, center } = this.scene;
    const R = this.R;
    const rel = (p) => apply(R, [p[0] - center[0], p[1] - center[1], p[2] - center[2]]);
    const pts = atoms.map((a) => rel(a.pos));
    const cpts = corners.map(rel);
    // fit: bounding radius in the screen plane over all orientations ≈ max 3D distance
    let rmax = 1;
    for (const p of cpts.concat(pts)) rmax = Math.max(rmax, Math.hypot(p[0], p[1], p[2]));
    const scale = (Math.min(w, h) / (2 * (rmax + 1.2))) * this.zoom;
    const persp = (p) => 1 / (1 + p[1] / (rmax * 7)); // gentle perspective
    const S = (p) => { const k = persp(p) * scale; return [w / 2 + p[0] * k, h / 2 - p[2] * k, k]; };

    const items = [];
    if (this.opts.showCell) edges.forEach(([i, j]) => items.push({ t: "edge", depth: (cpts[i][1] + cpts[j][1]) / 2, a: cpts[i], b: cpts[j] }));
    if (this.opts.showBonds) bonds.forEach(([i, j]) => items.push({ t: "bond", depth: (pts[i][1] + pts[j][1]) / 2 + 0.01, i, j }));
    this._proj = [];
    atoms.forEach((a, i) => {
      const [sx, sy, k] = S(pts[i]);
      const sr = Math.max(1.5, a.r * this.opts.atomScale * k);
      this._proj.push({ sx, sy, sr, depth: pts[i][1], atom: a });
      items.push({ t: "atom", depth: pts[i][1], i, sx, sy, sr });
    });
    items.sort((p, q) => q.depth - p.depth);

    const dimmed = this.hover ? (a) => a.site !== this.hover.site : () => false;
    const col = this.colorOf ? (a) => this.colorOf[a.sp] : (a) => a.color;
    for (const it of items) {
      if (it.t === "edge") {
        const [x1, y1] = S(it.a), [x2, y2] = S(it.b);
        ctx.strokeStyle = INK + "0.38)";
        ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      } else if (it.t === "bond") {
        const A = atoms[it.i], B = atoms[it.j];
        const [x1, y1, k1] = S(pts[it.i]), [x2, y2] = S(pts[it.j]);
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        ctx.lineCap = "round";
        ctx.lineWidth = Math.max(1.2, 0.16 * k1);
        ctx.globalAlpha = dimmed(A) && dimmed(B) ? 0.25 : 0.95;
        ctx.strokeStyle = shade(col(A), -0.15); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(mx, my); ctx.stroke();
        ctx.strokeStyle = shade(col(B), -0.15); ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        // solid sphere: soft highlight upper-left, darker rim, thin ink outline
        const a = atoms[it.i], c0 = col(a);
        const g = ctx.createRadialGradient(it.sx - it.sr * 0.35, it.sy - it.sr * 0.4, it.sr * 0.08, it.sx, it.sy, it.sr);
        g.addColorStop(0, shade(c0, 0.6));
        g.addColorStop(0.5, c0);
        g.addColorStop(1, shade(c0, -0.4));
        ctx.globalAlpha = dimmed(a) ? 0.3 : 1;
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(it.sx, it.sy, it.sr, 0, Math.PI * 2); ctx.fill();
        const hot = this.hover && a === this.hover;
        ctx.strokeStyle = hot ? "#132541" : INK + "0.35)";
        ctx.lineWidth = hot ? 2.5 : Math.min(1.2, Math.max(0.6, it.sr * 0.08));
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    if (this.opts.showAxes) this._axes(ctx, h);
  }

  _axes(ctx, h) {
    const o = [34, h - 34];
    const cols = ["#d94848", "#198754", "#1f7fc0"];
    this.scene.axes.forEach((v, i) => {
      const p = apply(this.R, v), l = Math.hypot(...v);
      const x = o[0] + (p[0] / l) * 22, y = o[1] - (p[2] / l) * 22;
      ctx.strokeStyle = cols[i]; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(...o); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = cols[i]; ctx.font = "700 11px Figtree, system-ui, sans-serif";
      ctx.fillText("abc"[i], x + (x - o[0]) * 0.25 - 3, y + (y - o[1]) * 0.25 + 4);
    });
  }

  spin(on = true, speed = 0.004) {
    cancelAnimationFrame(this._spin);
    if (!on) return;
    const step = () => {
      this.R = mat3mul(rotZ(speed), this.R);
      this.draw();
      this._spin = requestAnimationFrame(step);
    };
    this._spin = requestAnimationFrame(step);
  }

  destroy() {
    cancelAnimationFrame(this._spin);
    this.ro?.disconnect();
  }
}

// Static render for cards.
export function renderThumb(canvas, cell, elements, opts = {}) {
  const v = new CrystalViewer(canvas, cell, elements, { interactive: false, showAxes: false, atomScale: 0.5, ...opts });
  v.ro?.disconnect();
  return v;
}
