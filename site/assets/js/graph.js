// Knowledge-graph explorer: a small force-directed layout on canvas.
// Nodes are ontology instances (ttm:Material, ttm:MaterialFamily, ...);
// edges are ontology relations (memberOfFamily, exhibitsTopologicalPhase, ...).

export const CLASS_STYLE = {
  Application: { color: "#f0a43b", r: 15, label: "Applications" },
  MaterialFamily: { color: null, r: 11, label: "Families" },
  Material: { color: null, r: 5, label: "Materials" },
  TopologicalPhase: { color: "#7b5cf5", r: 7, label: "Topological phases" },
  OperatingRegime: { color: "#f26b6b", r: 7, label: "Operating regimes" },
  SpaceGroup: { color: "#6ec0f0", r: 5, label: "Space groups" },
  CrystalSystem: { color: "#1f7fc0", r: 7, label: "Crystal systems" },
  StructureType: { color: "#3fae7a", r: 6, label: "Structure types" },
  CoordinationMotif: { color: "#f59fb5", r: 6, label: "Coordination motifs" },
  Database: { color: "#132541", r: 7, label: "Databases" },
  ChemicalElement: { color: null, r: 5, label: "Elements" },
  ScholarlyReference: { color: "#9aa6bb", r: 3.5, label: "References" },
};
const DEFAULT_ON = ["Application", "MaterialFamily", "Material", "TopologicalPhase", "OperatingRegime", "CrystalSystem", "StructureType"];

const REL_LABEL = {
  memberOfFamily: "member of family", hasApplication: "has application", exhibitsTopologicalPhase: "exhibits phase",
  operatesIn: "operates in", crystallizesIn: "crystallizes in", inCrystalSystem: "in crystal system",
  containsElement: "contains", alloyOf: "alloy of", describedIn: "described in", computedBy: "computed by",
  hasStructureType: "structure type", hasCoordinationMotif: "coordination motif", broader: "skos:broader",
};

export class KnowledgeGraph {
  constructor(container, graph, { families = [], onNavigate } = {}) {
    this.root = container;
    this.full = graph;
    this.onNavigate = onNavigate;
    this.famColor = Object.fromEntries(families.map((f) => [f.id, f.accent]));
    this.active = new Set(DEFAULT_ON);
    this.view = { x: 0, y: 0, k: 1 };
    this._build();
    this._filter();
  }

  _build() {
    const classes = Object.keys(CLASS_STYLE).filter((c) => this.full.nodes.some((n) => n.cls === c));
    this.root.innerHTML = `
      <div class="kg-toolbar">
        <div class="kg-chips">${classes.map((c) => `<button class="chip ${this.active.has(c) ? "on" : ""}" data-cls="${c}">
          <span class="dot" style="background:${CLASS_STYLE[c].color || "linear-gradient(135deg,#f26b6b,#8f74ff,#2f9be0)"}"></span>${CLASS_STYLE[c].label}
          <span class="count">${this.full.nodes.filter((n) => n.cls === c).length}</span></button>`).join("")}</div>
        <input class="kg-search" type="search" placeholder="Find a node…" aria-label="Find a node in the graph">
      </div>
      <div class="kg-stage"><canvas></canvas><div class="kg-tip" hidden></div>
        <div class="kg-hint">drag to pan · scroll to zoom · click a node to open it</div></div>`;
    this.canvas = this.root.querySelector("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.tip = this.root.querySelector(".kg-tip");
    this.root.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => {
      const c = b.dataset.cls;
      this.active.has(c) ? this.active.delete(c) : this.active.add(c);
      b.classList.toggle("on");
      this._filter();
    }));
    this.root.querySelector(".kg-search").addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      this.search = q ? this.nodes.filter((n) => n.label.toLowerCase().includes(q) || (n.name || "").toLowerCase().includes(q)) : null;
      if (this.search && this.search.length === 1) this.focus = this.search[0];
      this._kick(0.1);
    });
    this._bind();
    this.ro = new ResizeObserver(() => this._draw());
    this.ro.observe(this.canvas);
  }

  _color(n) {
    if (n.cls === "Material") return this.famColor[n.family] || "#ccc";
    if (n.cls === "MaterialFamily") return n.color || "#ccc";
    if (n.cls === "ChemicalElement") return n.color || "#ccc";
    return CLASS_STYLE[n.cls]?.color || "#ccc";
  }

  _radius(n) {
    const base = CLASS_STYLE[n.cls]?.r ?? 5;
    return n.cls === "Material" || n.cls === "ScholarlyReference" ? base + Math.min(4, Math.sqrt(n.vdeg || 0) * 0.6) : base + Math.min(8, Math.sqrt(n.vdeg || 0));
  }

  _filter() {
    const old = Object.fromEntries((this.nodes || []).map((n) => [n.id, n]));
    const nodes = this.full.nodes.filter((n) => this.active.has(n.cls)).map((n) => {
      const o = old[n.id];
      return o || { ...n, x: (Math.random() - 0.5) * 400, y: (Math.random() - 0.5) * 400, vx: 0, vy: 0 };
    });
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const links = this.full.links.filter((l) => byId[l.source] && byId[l.target]).map((l) => ({ ...l, s: byId[l.source], t: byId[l.target] }));
    nodes.forEach((n) => { n.vdeg = 0; n.nb = new Set(); });
    links.forEach((l) => { l.s.vdeg++; l.t.vdeg++; l.s.nb.add(l.t); l.t.nb.add(l.s); });
    this.nodes = nodes;
    this.links = links;
    this._kick(1);
  }

  _kick(alpha) {
    this.alpha = Math.max(this.alpha || 0, alpha);
    if (!this.raf) this.raf = requestAnimationFrame(() => this._tick());
  }

  _tick() {
    this.raf = null;
    const N = this.nodes, a = this.alpha;
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i < N.length; i++) {
        const p = N[i];
        for (let j = i + 1; j < N.length; j++) {
          const q = N[j];
          let dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy;
          if (d2 > 160000) continue;
          if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
          const f = (-(p.cls === "Material" && q.cls === "Material" ? 380 : 900) * a) / d2;
          const d = Math.sqrt(d2), fx = (f * dx) / d, fy = (f * dy) / d;
          p.vx += fx; p.vy += fy; q.vx -= fx; q.vy -= fy;
          const minD = this._radius(p) + this._radius(q) + 4;
          if (d < minD) { const push = ((minD - d) / d) * 0.5; p.vx -= dx * push; p.vy -= dy * push; q.vx += dx * push; q.vy += dy * push; }
        }
      }
      for (const l of this.links) {
        const rest = l.rel === "memberOfFamily" ? 45 : l.rel === "broader" ? 70 : l.rel === "describedIn" ? 30 : 90;
        const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, d = Math.hypot(dx, dy) || 1;
        const k = l.rel === "memberOfFamily" ? 0.09 : 0.03;
        const f = ((d - rest) / d) * k * a;
        l.s.vx += dx * f; l.s.vy += dy * f; l.t.vx -= dx * f; l.t.vy -= dy * f;
      }
      for (const n of N) {
        n.vx -= n.x * 0.004 * a; n.vy -= n.y * 0.004 * a;
        if (n.fixed) { n.vx = n.vy = 0; continue; }
        n.vx *= 0.6; n.vy *= 0.6;
        n.x += n.vx; n.y += n.vy;
      }
    }
    this.alpha *= 0.985;
    if (!this._fitted && this.alpha < 0.5) this._fit();
    this._draw();
    if (this.alpha > 0.01) this.raf = requestAnimationFrame(() => this._tick());
  }

  _fit() {
    if (!this.nodes.length) return;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const n of this.nodes) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); }
    const k = Math.min(w / (x1 - x0 + 120), h / (y1 - y0 + 80), 2);
    this.view = { k, x: -((x0 + x1) / 2) * k, y: -((y0 + y1) / 2) * k };
    this._fitted = true;
  }

  _screen(n) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    return [w / 2 + this.view.x + n.x * this.view.k, h / 2 + this.view.y + n.y * this.view.k];
  }

  _world(sx, sy) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    return [(sx - w / 2 - this.view.x) / this.view.k, (sy - h / 2 - this.view.y) / this.view.k];
  }

  _pick(sx, sy) {
    const [x, y] = this._world(sx, sy);
    let best = null, bd = Infinity;
    for (const n of this.nodes) {
      const d = Math.hypot(n.x - x, n.y - y), r = this._radius(n) + 3 / this.view.k;
      if (d < r && d < bd) { best = n; bd = d; }
    }
    return best;
  }

  _bind() {
    const c = this.canvas;
    let drag = null, moved = false;
    c.addEventListener("pointerdown", (e) => {
      const r = c.getBoundingClientRect();
      const n = this._pick(e.clientX - r.left, e.clientY - r.top);
      drag = { n, x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y };
      moved = false;
      c.setPointerCapture(e.pointerId);
      if (n) n.fixed = true;
    });
    c.addEventListener("pointermove", (e) => {
      const r = c.getBoundingClientRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      if (drag) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 3) moved = true;
        if (drag.n) { [drag.n.x, drag.n.y] = this._world(sx, sy); this._kick(0.15); }
        else { this.view.x = drag.vx + e.clientX - drag.x; this.view.y = drag.vy + e.clientY - drag.y; this._draw(); }
        return;
      }
      const n = this._pick(sx, sy);
      if (n !== this.hover) { this.hover = n; c.style.cursor = n ? "pointer" : "grab"; this._draw(); }
      this._showTip(n, sx, sy);
    });
    c.addEventListener("pointerup", (e) => {
      c.releasePointerCapture(e.pointerId);
      if (drag?.n) { drag.n.fixed = false; if (!moved) this._open(drag.n); }
      drag = null;
    });
    c.addEventListener("pointerleave", () => { this.hover = null; this.tip.hidden = true; this._draw(); });
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      const [wx, wy] = this._world(sx, sy);
      this.view.k = Math.min(5, Math.max(0.2, this.view.k * Math.exp(-e.deltaY * 0.0015)));
      const [nx, ny] = this._screen({ x: wx, y: wy });
      this.view.x += sx - nx; this.view.y += sy - ny;
      this._draw();
    }, { passive: false });
  }

  _open(n) {
    if (!n.href) return;
    if (n.href.startsWith("#")) this.onNavigate ? this.onNavigate(n.href) : (location.hash = n.href);
    else window.open(n.href, "_blank", "noopener");
  }

  _showTip(n, sx, sy) {
    if (!n) { this.tip.hidden = true; return; }
    const rels = {};
    for (const l of this.links) {
      if (l.s === n) (rels[l.rel] ||= []).push(l.t.label);
    }
    const relHTML = Object.entries(rels).slice(0, 4).map(([r, v]) =>
      `<div><span class="rel">${REL_LABEL[r] || r}</span> ${v.slice(0, 4).join(", ")}${v.length > 4 ? ` +${v.length - 4}` : ""}</div>`).join("");
    this.tip.innerHTML = `<div class="kg-tip-cls">ttm:${n.cls}</div><div class="kg-tip-label">${n.label}</div>
      ${n.name ? `<div class="kg-tip-name">${n.name}</div>` : ""}${n.title ? `<div class="kg-tip-name">${n.title}</div>` : ""}
      ${n.comment ? `<div class="kg-tip-name">${n.comment}</div>` : ""}${relHTML}`;
    this.tip.hidden = false;
    const w = this.canvas.clientWidth;
    this.tip.style.left = `${Math.min(sx + 14, w - 260)}px`;
    this.tip.style.top = `${sy + 14}px`;
  }

  _draw() {
    const c = this.canvas, ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const { k } = this.view;
    const focus = this.hover || this.focus;
    const lit = focus ? new Set([focus, ...focus.nb]) : this.search ? new Set(this.search.flatMap((n) => [n, ...n.nb])) : null;

    ctx.lineWidth = 1;
    for (const l of this.links) {
      const on = lit ? lit.has(l.s) && lit.has(l.t) && (focus ? l.s === focus || l.t === focus : true) : true;
      const [x1, y1] = this._screen(l.s), [x2, y2] = this._screen(l.t);
      ctx.strokeStyle = on && lit ? "rgba(19,37,65,0.55)" : l.rel === "broader" ? "rgba(108,79,224,0.45)" : "rgba(19,37,65,0.11)";
      if (lit && !on) ctx.strokeStyle = "rgba(19,37,65,0.035)";
      ctx.setLineDash(l.rel === "broader" ? [4, 3] : []);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const n of this.nodes) {
      const [x, y] = this._screen(n), r = this._radius(n) * Math.sqrt(k);
      const dim = lit && !lit.has(n);
      ctx.globalAlpha = dim ? 0.18 : 1;
      const col = this._color(n);
      if (n.cls === "MaterialFamily" || n.cls === "Application") {
        ctx.fillStyle = col + "26";
        ctx.beginPath(); ctx.arc(x, y, r * 1.9, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = col + "55"; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.fillStyle = col;
      ctx.beginPath();
      if (n.cls === "TopologicalPhase" || n.cls === "OperatingRegime") {
        ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
      } else if (n.cls === "SpaceGroup" || n.cls === "CrystalSystem" || n.cls === "StructureType") {
        ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
      } else ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (n.cls === "Material" && n.kind === "alloy") { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke(); }
      if (n === focus) { ctx.strokeStyle = "#132541"; ctx.lineWidth = 2.5; ctx.stroke(); }
      const big = ["Application", "MaterialFamily", "TopologicalPhase", "OperatingRegime", "CrystalSystem", "Database"].includes(n.cls);
      if (!dim && (big || k > 1.3 || (lit && lit.has(n)))) {
        ctx.font = `${big ? 800 : 600} ${big ? 12.5 : 10.5}px Figtree, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.lineJoin = "round"; ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.strokeText(n.label, x, y + r + (big ? 15 : 12));
        ctx.fillStyle = big ? "#132541" : "#3d4c68";
        ctx.fillText(n.label, x, y + r + (big ? 15 : 12));
      }
      ctx.globalAlpha = 1;
    }
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
  }
}
