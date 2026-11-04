
/* ============================================================
   Interactive widgets for the LLM / neural network syllabus.
   Each widget is mounted into <div data-viz="id"></div>.
   Everything is plain SVG + DOM, themed through CSS variables.
   ============================================================ */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const VIZ = {};
  const COL = {
    ink: 'var(--fig-ink,#e6e9f5)', dim: 'var(--fig-dim,#8b93b0)', faint: 'var(--fig-faint,#3a4467)',
    panel: 'var(--fig-panel,#141a2e)', panel2: 'var(--fig-panel2,#1b2340)', edge: 'var(--fig-edge,#2e3a5e)',
    blue: 'var(--fig-blue,#5b8cff)', cyan: 'var(--fig-cyan,#22d3ee)', violet: 'var(--fig-violet,#a78bfa)',
    amber: 'var(--fig-amber,#f5b544)', green: 'var(--fig-green,#34d399)', rose: 'var(--fig-rose,#fb7185)'
  };

  /* ---------- tiny DOM helpers ---------- */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    apply(e, attrs);
    add(e, kids);
    return e;
  }
  function s(tag, attrs, ...kids) {
    const e = document.createElementNS(NS, tag);
    apply(e, attrs);
    add(e, kids);
    return e;
  }
  function apply(e, attrs) {
    if (!attrs) return;
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null) continue;
      if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'text') e.textContent = v;
      else e.setAttribute(k, v);
    }
  }
  function add(e, kids) {
    kids.flat(4).forEach(function (k) {
      if (k == null || k === false) return;
      e.appendChild(typeof k === 'object' ? k : document.createTextNode(String(k)));
    });
  }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); }

  /* ---------- widget scaffolding ---------- */
  function shell(id, opts) {
    const root = document.createElement('div');
    root.className = 'viz-shell';
    const stage = h('div', { class: 'viz-stage' });
    const controls = h('div', { class: 'viz-controls' });
    root.appendChild(stage);
    root.appendChild(controls);
    return { root: root, stage: stage, controls: controls };
  }

  function slider(parent, label, opts) {
    const o = Object.assign({ min: -2, max: 2, step: 0.1, value: 1, fmt: function (v) { return v.toFixed(2); } }, opts);
    const out = h('span', { class: 'viz-val', text: o.fmt(o.value) });
    const input = h('input', { type: 'range', min: o.min, max: o.max, step: o.step, value: o.value, class: 'viz-range' });
    const row = h('label', { class: 'viz-ctrl' },
      h('span', { class: 'viz-lab', text: label }), input, out);
    parent.appendChild(row);
    const api = {
      input: input,
      get value() { return parseFloat(input.value); },
      set(v) { input.value = v; out.textContent = o.fmt(parseFloat(input.value)); }
    };
    input.addEventListener('input', function () {
      out.textContent = o.fmt(parseFloat(input.value));
      if (o.on) o.on(parseFloat(input.value));
    });
    return api;
  }

  function toggle(parent, label, value, onChange) {
    const box = h('input', { type: 'checkbox', class: 'viz-check' });
    box.checked = value;
    const row = h('label', { class: 'viz-toggle' }, box, h('span', { text: label }));
    parent.appendChild(row);
    box.addEventListener('change', function () { onChange(box.checked); });
    return box;
  }

  function select(parent, label, options, value, onChange) {
    const sel = h('select', { class: 'viz-select' });
    options.forEach(function (o) {
      const opt = h('option', { value: o, text: o });
      if (o === value) opt.selected = true;
      sel.appendChild(opt);
    });
    parent.appendChild(h('label', { class: 'viz-ctrl' }, h('span', { class: 'viz-lab', text: label }), sel));
    sel.addEventListener('change', function () { onChange(sel.value); });
    return sel;
  }

  function stats(parent) {
    const box = h('div', { class: 'viz-stats' });
    parent.appendChild(box);
    const map = {};
    return {
      set(key, value, colour) {
        if (!map[key]) {
          const v = h('span', { class: 'viz-stat-v' });
          const row = h('div', { class: 'viz-stat' }, h('span', { class: 'viz-stat-k', text: key }), v);
          map[key] = v; box.appendChild(row);
        }
        map[key].textContent = value;
        if (colour) map[key].style.color = colour;
      }
    };
  }

  function makeSVG(w, hh) {
    const svg = s('svg', {
      viewBox: '0 0 ' + w + ' ' + hh, width: '100%',
      preserveAspectRatio: 'xMidYMid meet', class: 'viz-svg'
    });
    return svg;
  }

  /* ---------- plotting helper ---------- */
  function plot(svg, box, xr, yr) {
    const g = s('g');
    svg.appendChild(g);
    const X = v => box.x + (v - xr[0]) / (xr[1] - xr[0]) * box.w;
    const Y = v => box.y + box.h - (v - yr[0]) / (yr[1] - yr[0]) * box.h;
    const P = {
      g, X, Y,
      line(x1, y1, x2, y2, attrs) { g.appendChild(s('line', Object.assign({ x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2) }, attrs))); },
      path(d, attrs) { g.appendChild(s('path', Object.assign({ d: d }, attrs))); },
      dot(x, y, r, attrs) { g.appendChild(s('circle', Object.assign({ cx: X(x), cy: Y(y), r: r || 3 }, attrs))); },
      txt(x, y, t, attrs) { g.appendChild(s('text', Object.assign({ x: X(x), y: Y(y), 'font-size': 10, fill: COL.dim, 'text-anchor': 'middle', 'font-family': 'ui-monospace,monospace' }, attrs), t)); },
      curve(fn, lo, hi, attrs, n) {
        n = n || 160; let d = '';
        for (let i = 0; i <= n; i++) {
          const x = lo + (hi - lo) * i / n, y = fn(x);
          if (!isFinite(y)) continue;
          d += (d ? ' L' : 'M') + X(x).toFixed(2) + ',' + Y(y).toFixed(2);
        }
        g.appendChild(s('path', Object.assign({ d: d, fill: 'none', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, attrs)));
      },
      poly(pts, attrs) {
        const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(2) + ',' + Y(p[1]).toFixed(2)).join(' ') + (attrs && attrs.close ? ' Z' : '');
        g.appendChild(s('path', Object.assign({ d: d, fill: 'none', 'stroke-width': 2 }, attrs)));
      },
      clear() { clear(g); }
    };
    return P;
  }

  /* ============================================================
     1. v-matrix-transform
     ============================================================ */
  VIZ['v-matrix-transform'] = function (host) {
    const shellUI = shell(host);
    const W = 460, H = 400, cx = W / 2, cy = H / 2, SC = 62;
    const svg = makeSVG(W, H);
    shellUI.stage.appendChild(svg);
    const st = stats(shellUI.controls);
    let M = [[1.2, 0.6], [0.4, 1.0]];
    const R = 3.2;
    const px = (x, y) => [cx + x * SC, cy - y * SC];

    function draw() {
      clear(svg);
      const bg = s('rect', { x: 0, y: 0, width: W, height: H, fill: 'none' });
      svg.appendChild(bg);
      // original grid
      for (let i = -R; i <= R; i++) {
        const a = px(i, -R), b = px(i, R), c = px(-R, i), d = px(R, i);
        svg.appendChild(s('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: COL.faint, 'stroke-width': 0.6, opacity: 0.45 }));
        svg.appendChild(s('line', { x1: c[0], y1: c[1], x2: d[0], y2: d[1], stroke: COL.faint, 'stroke-width': 0.6, opacity: 0.45 }));
      }
      // transformed grid: image of each line
      const tp = (x, y) => px(M[0][0] * x + M[0][1] * y, M[1][0] * x + M[1][1] * y);
      for (let i = -R; i <= R; i++) {
        const a = tp(i, -R), b = tp(i, R), c = tp(-R, i), d = tp(R, i);
        svg.appendChild(s('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: COL.cyan, 'stroke-width': 0.9, opacity: 0.30 }));
        svg.appendChild(s('line', { x1: c[0], y1: c[1], x2: d[0], y2: d[1], stroke: COL.cyan, 'stroke-width': 0.9, opacity: 0.30 }));
      }
      // axes
      const o = px(0, 0);
      svg.appendChild(s('line', { x1: 0, y1: o[1], x2: W, y2: o[1], stroke: COL.edge, 'stroke-width': 1 }));
      svg.appendChild(s('line', { x1: o[0], y1: 0, x2: o[0], y2: H, stroke: COL.edge, 'stroke-width': 1 }));
      // unit square
      const unit = [[0, 0], [1, 0], [1, 1], [0, 1]];
      svg.appendChild(s('polygon', {
        points: unit.map(p => px(p[0], p[1]).join(',')).join(' '),
        fill: 'rgba(91,140,255,0.10)', stroke: COL.blue, 'stroke-width': 1.6, 'stroke-dasharray': '4 3'
      }));
      const tunit = unit.map(p => tp(p[0], p[1]));
      svg.appendChild(s('polygon', {
        points: tunit.map(p => p.join(',')).join(' '),
        fill: 'rgba(34,211,238,0.15)', stroke: COL.cyan, 'stroke-width': 2.2
      }));
      // basis vectors and images
      arrow(svg, o, px(1, 0), COL.blue, 1.3, 0.5);
      arrow(svg, o, px(0, 1), COL.amber, 1.3, 0.5);
      arrow(svg, o, tp(1, 0), COL.blue, 2.6, 1);
      arrow(svg, o, tp(0, 1), COL.amber, 2.6, 1);
      const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
      st.set('det A', det.toFixed(3), det < 0 ? COL.rose : COL.cyan);
      st.set('area factor', Math.abs(det).toFixed(3));
      st.set('rank', Math.abs(det) < 1e-3 ? '1 (collapsed)' : '2', Math.abs(det) < 1e-3 ? COL.rose : COL.green);
      st.set('orientation', det < 0 ? 'flipped' : 'preserved', det < 0 ? COL.rose : COL.dim);
    }
    function arrow(svg, a, b, col, w, op) {
      const defs = s('defs');
      const id = 'ah' + Math.random().toString(36).slice(2, 7);
      const mk = s('marker', { id: id, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' },
        s('path', { d: 'M0,0 L10,5 L0,10 z', fill: col }));
      defs.appendChild(mk); svg.appendChild(defs);
      svg.appendChild(s('line', {
        x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: col, 'stroke-width': w,
        'marker-end': 'url(#' + id + ')', opacity: op
      }));
    }
    const upd = () => { draw(); };
    slider(shellUI.controls, 'a\u2081\u2081', { min: -2, max: 2, step: 0.05, value: M[0][0], on: v => { M[0][0] = v; upd(); } });
    slider(shellUI.controls, 'a\u2081\u2082', { min: -2, max: 2, step: 0.05, value: M[0][1], on: v => { M[0][1] = v; upd(); } });
    slider(shellUI.controls, 'a\u2082\u2081', { min: -2, max: 2, step: 0.05, value: M[1][0], on: v => { M[1][0] = v; upd(); } });
    slider(shellUI.controls, 'a\u2082\u2082', { min: -2, max: 2, step: 0.05, value: M[1][1], on: v => { M[1][1] = v; upd(); } });
    draw();
    return shellUI.root;
  };

  /* ============================================================
     2. v-eigen
     ============================================================ */
  VIZ['v-eigen'] = function (host) {
    const shellUI = shell(host);
    const W = 460, H = 400, SC = 62, cx = W / 2, cy = H / 2;
    const svg = makeSVG(W, H);
    shellUI.stage.appendChild(svg);
    const st = stats(shellUI.controls);
    let M = [[1.4, 0.6], [0.6, 1.2]];
    const px = (x, y) => [cx + x * SC, cy - y * SC];

    function eigen() {
      const tr = M[0][0] + M[1][1], det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
      const disc = tr * tr / 4 - det;
      if (disc < 0) return { complex: true, re: tr / 2, im: Math.sqrt(-disc) };
      const l1 = tr / 2 + Math.sqrt(disc), l2 = tr / 2 - Math.sqrt(disc);
      const vec = l => {
        let v = [M[0][1], l - M[0][0]];
        if (Math.abs(v[0]) + Math.abs(v[1]) < 1e-9) v = [l - M[1][1], M[1][0]];
        const n = Math.hypot(v[0], v[1]) || 1;
        return [v[0] / n, v[1] / n];
      };
      return { complex: false, l1, l2, v1: vec(l1), v2: vec(l2) };
    }
    function draw() {
      clear(svg);
      for (let i = -3; i <= 3; i++) {
        const a = px(i, -3), b = px(i, 3), c = px(-3, i), d = px(3, i);
        svg.appendChild(s('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: COL.faint, 'stroke-width': 0.6, opacity: 0.4 }));
        svg.appendChild(s('line', { x1: c[0], y1: c[1], x2: d[0], y2: d[1], stroke: COL.faint, 'stroke-width': 0.6, opacity: 0.4 }));
      }
      const o = px(0, 0);
      svg.appendChild(s('line', { x1: 0, y1: o[1], x2: W, y2: o[1], stroke: COL.edge }));
      svg.appendChild(s('line', { x1: o[0], y1: 0, x2: o[0], y2: H, stroke: COL.edge }));
      const e = eigen();
      if (e.complex) {
        st.set('\u03bb\u2081', e.re.toFixed(2) + ' + ' + e.im.toFixed(2) + 'i', COL.rose);
        st.set('\u03bb\u2082', e.re.toFixed(2) + ' \u2212 ' + e.im.toFixed(2) + 'i', COL.rose);
        st.set('geometry', 'rotation + scale (no real invariant line)', COL.dim);
        svg.appendChild(s('text', { x: W / 2, y: 30, 'text-anchor': 'middle', fill: COL.rose, 'font-size': 12, 'font-family': 'ui-monospace,monospace' }, 'complex eigenvalues: every direction rotates'));
      } else {
        st.set('\u03bb\u2081', e.l1.toFixed(3), COL.cyan);
        st.set('\u03bb\u2082', e.l2.toFixed(3), COL.rose);
        st.set('geometry', Math.abs(e.l1 - e.l2) < 1e-6 ? 'isotropic scaling' : 'real invariant lines', COL.dim);
        [[e.v1, e.l1, COL.cyan], [e.v2, e.l2, COL.rose]].forEach(function (pair) {
          const v = pair[0], l = pair[1], col = pair[2];
          if (!v) return;
          const tip = [v[0] * 1.6, v[1] * 1.6];
          const a = px(-tip[0] * 1.6, -tip[1] * 1.6), b = px(tip[0] * 1.6, tip[1] * 1.6);
          svg.appendChild(s('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: col, 'stroke-width': 1.1, 'stroke-dasharray': '5 4', opacity: 0.55 }));
          const t2 = px(tip[0], tip[1]);
          svg.appendChild(s('line', { x1: o[0], y1: o[1], x2: t2[0], y2: t2[1], stroke: col, 'stroke-width': 2.6 }));
          const at = [tip[0] * l, tip[1] * l];
          const t3 = px(at[0], at[1]);
          svg.appendChild(s('circle', { cx: t3[0], cy: t3[1], r: 5, fill: col }));
          svg.appendChild(s('text', {
            x: t3[0] + 8, y: t3[1] - 6, fill: col, 'font-size': 11, 'font-family': 'ui-monospace,monospace'
          }, '\u03bb=' + l.toFixed(2)));
        });
      }
      svg.appendChild(s('circle', { cx: o[0], cy: o[1], r: 3, fill: COL.ink }));
    }
    const upd = () => draw();
    slider(shellUI.controls, 'a\u2081\u2081', { min: -1.5, max: 2, step: 0.05, value: M[0][0], on: v => { M[0][0] = v; upd(); } });
    slider(shellUI.controls, 'a\u2081\u2082', { min: -1.5, max: 1.5, step: 0.05, value: M[0][1], on: v => { M[0][1] = v; upd(); } });
    slider(shellUI.controls, 'a\u2082\u2081', { min: -1.5, max: 1.5, step: 0.05, value: M[1][0], on: v => { M[1][0] = v; update(); } });
    slider(shellUI.controls, 'a\u2082\u2082', { min: -1.5, max: 2, step: 0.05, value: M[1][1], on: v => { M[1][1] = v; upd(); } });
    function update() { draw(); }
    draw();
    return shellUI.root;
  };

  /* ============================================================
     3. v-cosine-sim
     ============================================================ */
  VIZ['v-cosine-sim'] = function (host) {
    const ui = shell(host);
    const W = 400, H = 360, SC = 78, cx = W / 2, cy = H / 2;
    const svg = makeSVG(W, H);
    ui.stage.appendChild(svg);
    const st = stats(ui.controls);
    const A = { th: 20, len: 2 }, B = { th: 62, len: 1.6 };
    const deg = d => d * Math.PI / 180;
    function draw() {
      clear(svg);
      for (let i = -2; i <= 2; i++) {
        const gx = cx + i * SC, gy = cy + i * SC;
        svg.appendChild(s('line', { x1: gx, y1: 0, x2: gx, y2: H, stroke: COL.faint, 'stroke-width': 0.6, opacity: 0.35 }));
        svg.appendChild(s('line', { x1: 0, y1: gy, x2: W, y2: gy, stroke: COL.faint, 'stroke-width': 0.6, opacity: 0.35 }));
      }
      svg.appendChild(s('line', { x1: 0, y1: cy, x2: W, y2: cy, stroke: COL.edge }));
      svg.appendChild(s('line', { x1: cx, y1: 0, x2: cx, y2: H, stroke: COL.edge }));
      const ax = A.len * Math.cos(deg(A.th)), ay = A.len * Math.sin(deg(A.th));
      const bx = B.len * Math.cos(deg(B.th)), by = B.len * Math.sin(deg(B.th));
      vec(cx, cy, cx + ax * SC, cy - ay * SC, COL.cyan, 'a');
      vec(cx, cy, cx + bx * SC, cy - by * SC, COL.amber, 'b');
      const dot = ax * bx + ay * by, na = Math.hypot(ax, ay), nb = Math.hypot(bx, by);
      const cos = dot / (na * nb);
      st.set('a \u00b7 b', dot.toFixed(4), COL.ink);
      st.set('\u2016a\u2016\u2016b\u2016', (na * nb).toFixed(4));
      st.set('cos \u03b8', cos.toFixed(4), Math.abs(cos) > 0.99 ? COL.rose : COL.cyan);
      st.set('angle', (Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI).toFixed(1) + '\u00b0');
      // projection of a onto b
      const pb = [bx * dot / (nb * nb), by * dot / (nb * nb)];
      svg.appendChild(s('line', { x1: cx, y1: cy, x2: cx + pb[0] * SC, y2: cy - pb[1] * SC, stroke: COL.violet, 'stroke-width': 3, opacity: 0.75 }));
    }
    function vec(x1, y1, x2, y2, col, lab) {
      const id = 'm' + Math.random().toString(36).slice(2, 6);
      const defs = s('defs', {}, s('marker', { id: id, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' },
        s('path', { d: 'M0,0 L10,5 L0,10 z', fill: col })));
      svg.appendChild(defs);
      svg.appendChild(s('line', { x1, y1, x2, y2, stroke: col, 'stroke-width': 2.6, 'marker-end': 'url(#' + id + ')' }));
      svg.appendChild(s('text', { x: x2 + 10, y: y2 + 4, fill: col, 'font-size': 12, 'font-family': 'ui-monospace,monospace' }, lab));
    }
    slider(ui.controls, 'angle of a', { min: 0, max: 180, step: 1, value: A.th, fmt: v => v + '\u00b0', on: v => { A.th = v; draw(); } });
    slider(ui.controls, 'length of a', { min: 0.3, max: 2.4, step: 0.05, value: A.len, on: v => { A.len = v; draw(); } });
    slider(ui.controls, 'angle of b', { min: 0, max: 180, step: 1, value: B.th, fmt: v => v + '\u00b0', on: v => { B.th = v; draw(); } });
    slider(ui.controls, 'length of b', { min: 0.3, max: 2.4, step: 0.05, value: B.len, on: v => { B.len = v; draw(); } });
    draw();
    return ui.root;
  };

  /* ============================================================
     4. v-activation
     ============================================================ */
  VIZ['v-activation'] = function (host) {
    const ui = shell(host);
    const W = 520, H = 340;
    const svg = makeSVG(W, H);
    ui.stage.appendChild(svg);
    const st = stats(ui.controls);
    const sig = x => 1 / (1 + Math.exp(-x));
    const ACT = {
      sigmoid: [x => sig(x), x => sig(x) * (1 - sig(x))],
      tanh: [Math.tanh, x => 1 - Math.tanh(x) * Math.tanh(x)],
      ReLU: [x => Math.max(0, x), x => (x > 0 ? 1 : 0)],
      LeakyReLU: [x => (x > 0 ? x : 0.1 * x), x => (x > 0 ? 1 : 0.1)],
      GELU: [x => 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x * x * x))), null],
      SiLU: [x => x * sig(x), null]
    };
    let cur = 'GELU', xmark = 0;
    const P = plot(svg, { x: 60, y: 40, w: 420, h: 240 }, [-5, 5], [-1.4, 2.6]);
    for (let i = -5; i <= 5; i++) P.line(i, -1.4, i, 2.6, { stroke: COL.faint, 'stroke-width': 0.6, opacity: 0.3 });
    P.line(-5, 0, 5, 0, { stroke: COL.edge });
    P.line(0, -1.4, 0, 2.6, { stroke: COL.edge });
    P.txt(5, -1.4, '', {});
    const fLayer = s('g'); svg.appendChild(fLayer);
    function draw() {
      const pair = ACT[cur];
      const f = pair[0], fd = pair[1] || (x => (f(x + 1e-3) - f(x - 1e-3)) / 2e-3);
      P.clear();
      for (let i = -5; i <= 5; i++) P.line(i, -1.4, i, 2.6, { stroke: COL.faint, 'stroke-width': 0.6, opacity: 0.3 });
      P.line(-5, 0, 5, 0, { stroke: COL.edge });
      P.line(0, -1.4, 0, 2.6, { stroke: COL.edge });
      P.curve(f, -5, 5, { stroke: COL.cyan });
      P.curve(fd, -5, 5, { stroke: COL.amber, 'stroke-dasharray': '4 3' });
      P.line(xmark, -1.4, xmark, 2.6, { stroke: COL.violet, 'stroke-width': 1, 'stroke-dasharray': '3 3' });
      P.dot(xmark, f(xmark), 5, { fill: COL.cyan });
      P.dot(xmark, fd(xmark), 5, { fill: COL.amber });
      st.set('f(x)', f(xmark).toFixed(4), COL.cyan);
      st.set("f'(x)", fd(xmark).toFixed(4), COL.amber);
      st.set('slope here', Math.abs(fd(xmark)) < 0.05 ? 'saturated' : (Math.abs(fd(xmark)) > 0.9 ? 'live' : 'partial'),
        Math.abs(fd(xmark)) < 0.05 ? COL.rose : COL.green);
      P.txt(-4.6, 2.3, 'f(x)', { fill: COL.cyan, 'text-anchor': 'start' });
      P.txt(-4.6, 2.05, "f'(x)", { fill: COL.amber, 'text-anchor': 'start' });
    }
    select(ui.controls, 'activation', Object.keys(ACT), cur, v => { cur = v; draw(); });
    slider(ui.controls, 'x', { min: -5, max: 5, step: 0.01, value: 0, on: v => { xmark = v; draw(); } });
    draw();
    return ui.root;
  };

  /* ============================================================
     5. v-entropy
     ============================================================ */
  VIZ['v-entropy'] = function (host) {
    const ui = shell(host);
    const W = 520, H = 320;
    const svg = makeSVG(W, H);
    ui.stage.appendChild(svg);
    const st = stats(ui.controls);
    let p = [0.4, 0.25, 0.2, 0.1, 0.05];
    const names = ['A', 'B', 'C', 'D', 'E'];
    function draw() {
      clear(svg);
      const tot = p.reduce((a, b) => a + b, 0);
      const q = p.map(v => v / tot);
      const baseY = 240, maxH = 170, bw = 60;
      q.forEach(function (v, i) {
        const x = 50 + i * 90;
        const hh = v * maxH;
        svg.appendChild(s('rect', { x: x, y: baseY - hh, width: bw, height: hh, rx: 4, fill: COL.cyan, opacity: 0.35 + 0.6 * v }));
        svg.appendChild(s('text', { x: x + bw / 2, y: baseY - hh - 7, 'text-anchor': 'middle', fill: COL.ink, 'font-size': 10, 'font-family': 'ui-monospace,monospace' }, v.toFixed(3)));
        svg.appendChild(s('text', { x: x + bw / 2, y: baseY + 16, 'text-anchor': 'middle', fill: COL.dim, 'font-size': 10 }, names[i]));
        // uniform reference
        svg.appendChild(s('line', { x1: x, y1: baseY - 0.2 * maxH, x2: x + bw, y2: baseY - 0.2 * maxH, stroke: COL.rose, 'stroke-width': 1.2, 'stroke-dasharray': '3 3' }));
      });
      svg.appendChild(s('line', { x1: 30, y1: baseY, x2: W - 30, y2: baseY, stroke: COL.edge }));
      const H_ = -q.reduce((a, v) => a + (v > 0 ? v * Math.log(v) : 0), 0);
      const Hmax = Math.log(q.length);
      const xent = -q.reduce((a, v) => a + v * Math.log(1 / q.length), 0);
      const kl = xent - H_;
      st.set('entropy H(p)', H_.toFixed(4) + ' nats', COL.cyan);
      st.set('max possible', Hmax.toFixed(4) + ' nats');
      st.set('H(p) / H_max', (H_ / Hmax).toFixed(3), H_ / Hmax > 0.97 ? COL.rose : COL.green);
      st.set('perplexity', Math.exp(H_).toFixed(3));
      st.set('KL(p \u2016 uniform)', kl.toFixed(4) + ' nats', COL.amber);
      svg.appendChild(s('text', { x: W / 2, y: 26, 'text-anchor': 'middle', fill: COL.dim, 'font-size': 11 }, 'dashed red line = the uniform distribution' ));
    }
    names.forEach(function (nm, i) {
      slider(ui.controls, 'p(' + nm + ')', { min: 0.001, max: 1, step: 0.005, value: p[i], on: v => { p[i] = v; draw(); } });
    });
    draw();
    return ui.root;
  };

  /* ============================================================
     6. v-bias-variance
     ============================================================ */
  function solve(A, b) {
    const n = b.length;
    const M = A.map((r, i) => r.concat([b[i]]));
    for (let i = 0; i < n; i++) {
      let piv = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
      [M[i], M[piv]] = [M[piv], M[i]];
      if (Math.abs(M[i][i]) < 1e-12) return null;
      for (let r = 0; r < n; r++) {
        if (r === i) continue;
        const f = M[r][i] / M[i][i];
        for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c];
      }
    }
    return M.map((r, i) => r[n] / r[i]);
  }
  VIZ['v-bias-variance'] = function (host) {
    const ui = shell(host);
    const W = 520, H = 340;
    const svg = makeSVG(W, H);
    ui.stage.appendChild(svg);
    const st = stats(ui.controls);
    const truth = x => Math.sin(2.2 * x) * 0.8;
    let seed = 7;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    function gauss() { return Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd()); }
    function data(n, noise) {
      const xs = [], ys = [];
      for (let i = 0; i < n; i++) {
        const x = -1 + 2 * (i + 0.5) / n + gauss() * 0.02;
        xs.push(x); ys.push(truth(x) + gauss() * noise);
      }
      return { xs, ys };
    }
    function fit(xs, ys, d) {
      const m = d + 1;
      const A = Array.from({ length: m }, () => new Array(m).fill(0));
      const b = new Array(m).fill(0);
      for (let i = 0; i < xs.length; i++) {
        for (let r = 0; r < m; r++) {
          for (let c = 0; c < m; c++) A[r][c] += Math.pow(xs[i], r + c);
          b[r] += Math.pow(xs[i], r) * ys[i];
        }
      }
      const w = solve(A, b);
      if (!w) return null;
      return x => w.reduce((acc, c, i) => acc + c * Math.pow(x, i), 0);
    }
    let degree = 1;
    function draw() {
      clear(svg);
      const P = plot(svg, { x: 56, y: 40, w: 430, h: 230 }, [-1.2, 1.2], [-1.8, 1.8]);
      P.line(-1.2, 0, 1.2, 0, { stroke: COL.edge });
      P.line(0, -1.8, 0, 1.8, { stroke: COL.edge });
      P.curve(truth, -1.2, 1.2, { stroke: COL.faint, 'stroke-width': 2, 'stroke-dasharray': '5 4' });
      const D = data(12, 0.18);
      D.xs.forEach((x, i) => P.dot(x, D.ys[i], 3.4, { fill: COL.blue }));
      const f = fit(D.xs, D.ys, degree);
      if (f) P.curve(f, -1.2, 1.2, { stroke: COL.cyan, 'stroke-width': 2.4 });
      // bootstrap estimates of bias^2 and variance
      let bias2 = 0, variance = 0, gs = [];
      const M = 60, grid = [];
      for (let i = 0; i <= 40; i++) grid.push(-1 + 2 * i / 40);
      for (let m = 0; m < M; m++) {
        const dd = data(12, 0.18);
        const ff = fit(dd.xs, dd.ys, degree);
        if (!ff) continue;
        gs.push(grid.map(g => ff(g)));
      }
      if (gs.length) {
        for (let i = 0; i < grid.length; i++) {
          const vals = gs.map(g => g[i]);
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          bias2 += Math.pow(mean - truth(grid[i]), 2) / grid.length;
          variance += vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / vals.length / grid.length;
        }
        gs.slice(0, 25).forEach(g => {
          let d = '';
          g.forEach((y, i) => { d += (i ? 'L' : 'M') + P.X(grid[i]).toFixed(1) + ',' + P.Y(y).toFixed(1); });
          svg.appendChild(s('path', { d: d, fill: 'none', stroke: COL.violet, 'stroke-width': 0.7, opacity: 0.25 }));
        });
      }
      const train = f ? D.xs.reduce((a, x, i) => a + Math.pow(f(x) - D.ys[i], 2), 0) / D.xs.length : NaN;
      st.set('degree', degree, COL.ink);
      st.set('training MSE', train.toFixed(4), COL.cyan);
      st.set('bias\u00b2', bias2.toFixed(4), COL.blue);
      st.set('variance', variance.toFixed(4), COL.violet);
      st.set('bias\u00b2 + variance', (bias2 + variance).toFixed(4), COL.amber);
      const verdict = degree <= 1 ? 'underfitting: high bias' : (degree >= 9 ? 'overfitting: high variance' : 'balance point');
      st.set('diagnosis', verdict, degree <= 1 ? COL.rose : (degree >= 9 ? COL.rose : COL.green));
    }
    slider(ui.controls, 'polynomial degree', { min: 1, max: 12, step: 1, value: 1, fmt: v => v, on: v => { degree = v; draw(); } });
    draw();
    return ui.root;
  };

  /* ============================================================
     7. v-gd-explorer
     ============================================================ */
  VIZ['v-gd-explorer'] = function (host) {
    const ui = shell(host);
    const W = 520, H = 380;
    const svg = makeSVG(W, H);
    ui.stage.appendChild(svg);
    const st = stats(ui.controls);
    const A = [[1, 0], [0, 9]];
    const loss = p => 0.5 * (A[0][0] * p[0] * p[0] + A[1][1] * p[1] * p[1]);
    const grad = p => [A[0][0] * p[0], A[1][1] * p[1]];
    let lr = 0.09, momentum = 0, start = [2.0, 1.05], kind = 'momentum';
    let path = [start.slice()], running = false, raf = null;
    const P = plot(svg, { x: 40, y: 30, w: 440, h: 300 }, [-2.6, 2.6], [-1.7, 1.7]);
    function reset() {
      path = [start.slice()];
      draw();
    }
    function step() {
      const cur = path[path.length - 1];
      const g = grad(cur);
      let nxt;
      if (kind === 'sgd') nxt = [cur[0] - lr * g[0], cur[1] - lr * g[1]];
      else if (kind === 'momentum') {
        const prev = path.length > 1 ? path[path.length - 2] : cur;
        const v = [cur[0] - prev[0], cur[1] - prev[1]];
        nxt = [cur[0] - lr * g[0] + momentum * v[0], cur[1] - lr * g[1] + momentum * v[1]];
      } else {
        nxt = [cur[0] - lr * 1.8 * g[0] / (Math.abs(g[0]) + 0.25), cur[1] - lr * 1.8 * g[1] / (Math.abs(g[1]) + 0.25)];
      }
      if (!isFinite(nxt[0]) || Math.abs(nxt[0]) > 1e4) { stop(); return false; }
      path.push(nxt);
      return Math.abs(loss(nxt) - loss(cur)) > 1e-7;
    }
    function draw() {
      P.clear();
      for (let k = 1; k <= 9; k++) {
        const c = k * 0.35;
        const rx = Math.sqrt(2 * c / A[0][0]), ry = Math.sqrt(2 * c / A[1][1]);
        const pts = [];
        for (let i = 0; i <= 80; i++) {
          const th = 2 * Math.PI * i / 80;
          pts.push([rx * Math.cos(th), ry * Math.sin(th)]);
        }
        P.poly(pts, { stroke: COL.faint, 'stroke-width': 1, opacity: 0.5, close: true });
      }
      P.line(-2.6, 0, 2.6, 0, { stroke: COL.faint, 'stroke-width': 0.8, opacity: 0.6 });
      P.line(0, -1.7, 0, 1.7, { stroke: COL.faint, 'stroke-width': 0.8, opacity: 0.6 });
      P.poly(path, { stroke: COL.cyan, 'stroke-width': 1.8, close: false });
      path.forEach(function (p, i) {
        if (i % 1 === 0) P.dot(p[0], p[1], i === 0 ? 4.5 : 2.6, { fill: i === 0 ? COL.amber : COL.cyan });
      });
      P.dot(0, 0, 4, { fill: COL.green });
      const cur = path[path.length - 1];
      st.set('step', path.length - 1);
      st.set('loss L(x)', loss(cur).toFixed(5), COL.cyan);
      st.set('|gradient|', Math.hypot(grad(cur)[0], grad(cur)[1]).toFixed(4));
      const lamMax = 9;
      st.set('stability limit \u03b7', (2 / lamMax).toFixed(3), lr > 2 / lamMax ? COL.rose : COL.green);
      st.set('status', lr > 2 / lamMax ? 'diverging' : (loss(cur) < 0.01 ? 'converged' : 'descending'),
        lr > 2 / lamMax ? COL.rose : COL.green);
    }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); }
    function loop() {
      if (!running) return;
      for (let i = 0; i < 2; i++) if (!step()) { running = false; break; }
      draw();
      if (running) raf = requestAnimationFrame(loop); else draw();
    }
    svg.addEventListener('click', function (ev) {
      const r = svg.getBoundingClientRect();
      const sx = (ev.clientX - r.left) / r.width * W, sy = (ev.clientY - r.top) / r.height * H;
      const x = (sx - 40) / 440 * 5.2 - 2.6;
      const y = ((30 + 300 - sy) / 300) * 3.4 - 1.7;
      start = [Math.max(-2.5, Math.min(2.5, x)), Math.max(-1.6, Math.min(1.6, y))];
      path = [start.slice()]; draw();
    });
    svg.style.cursor = 'crosshair';
    select(ui.controls, 'optimizer', ['sgd', 'momentum', 'adam-ish'], kind, v => { kind = v; reset(); });
    slider(ui.controls, 'learning rate', { min: 0.005, max: 0.28, step: 0.005, value: lr, fmt: v => v.toFixed(3), on: v => { lr = v; } });
    slider(ui.controls, 'momentum', { min: 0, max: 0.95, step: 0.01, value: momentum, fmt: v => v.toFixed(2), on: v => { momentum = v; } });
    const runBtn = h('button', { class: 'viz-btn', text: 'run' });
    const stepBtn = h('button', { class: 'viz-btn', text: 'step' });
    const stopBtn = h('button', { class: 'viz-btn', text: 'reset' });
    ui.controls.appendChild(h('div', { class: 'viz-btns' }, runBtn, stepBtn, stopBtn));
    runBtn.addEventListener('click', function () {
      running = true;
      if (path.length > 400) reset();
      loop();
    });
    stepBtn.addEventListener('click', function () { running = false; step(); draw(); });
    stopBtn.addEventListener('click', function () { stop(); reset(); });
    draw();
    return ui.root;
  };

  /* ============================================================
     8. v-lr-schedule
     ============================================================ */
  VIZ['v-lr-schedule'] = function (host) {
    const ui = shell(host);
    const W = 520, H = 300;
    const svg = makeSVG(W, H);
    ui.stage.appendChild(svg);
    const st = stats(ui.controls);
    let warm = 8, peak = 1, total = 100, kind = 'cosine';
    const P = plot(svg, { x: 56, y: 30, w: 430, h: 210 }, [0, 100], [0, 1.15]);
    function sched(t) {
      if (t < warm) return peak * t / Math.max(1, warm);
      const u = (t - warm) / Math.max(1, total - warm);
      if (kind === 'cosine') return peak * 0.5 * (1 + Math.cos(Math.PI * Math.min(1, u)));
      if (kind === 'linear') return peak * Math.max(0, 1 - u);
      if (kind === 'inverse-sqrt') return peak * Math.pow(warm / Math.max(t, 1), 0.5);
      return peak * (t < total * 0.85 ? 1 : Math.max(0, (total - t) / (total * 0.15)));
    }
    function draw() {
      P.clear();
      for (let i = 0; i <= 5; i++) P.line(0, i * 0.23, 100, i * 0.23, { stroke: COL.faint, 'stroke-width': 0.7, opacity: 0.35 });
      P.line(0, 0, 100, 0, { stroke: COL.edge });
      P.curve(t => sched(t), 0.05, 100, { stroke: COL.cyan, 'stroke-width': 2.6 });
      st.set('peak LR', peak.toFixed(2), COL.cyan);
      st.set('warmup', warm + ' steps', COL.blue);
      st.set('decay to', (sched(100) / peak * 100).toFixed(1) + '% of peak');
      st.set('LR at 50%', sched(total / 2).toFixed(3));
    }
    select(ui.controls, 'schedule', ['cosine', 'linear', 'inverse-sqrt', 'WSD'], kind, v => { kind = v; draw(); });
    slider(ui.controls, 'warmup steps', { min: 0, max: 40, step: 1, value: warm, fmt: v => v, on: v => { warm = Math.max(0.5, v); draw(); } });
    slider(ui.controls, 'peak LR', { min: 0.1, max: 2, step: 0.05, value: peak, on: v => { peak = v; draw(); } });
    draw();
    return ui.root;
  };

  /* ============================================================
     9. v-backprop-trace
     ============================================================ */
  VIZ['v-backprop-trace'] = function (host) {
    const ui = shell(host);
    const W = 520, H = 420;
    const svg = makeSVG(W, H);
    ui.stage.appendChild(svg);
    const st = stats(ui.controls);
    const x = [1.0, 0.5];
    const W1 = [[0.5, -0.3], [0.2, 0.8]], b1 = [0.1, -0.1];
    const W2 = [0.6, 0.4], b2 = 0.05;
    const y = 1;
    const tanh = Math.tanh, sig = v => 1 / (1 + Math.exp(-v));
    // forward
    const z1 = [W1[0][0] * x[0] + W1[0][1] * x[1] + b1[0], W1[1][0] * x[0] + W1[1][1] * x[1] + b1[1]];
    const a1 = z1.map(tanh);
    const z2 = W2[0] * a1[0] + W2[1] * a1[1] + b2;
    const yhat = sig(z2);
    const L = -(y * Math.log(yhat) + (1 - y) * Math.log(1 - yhat));
    // backward
    const dz2 = yhat - y;
    const dW2 = [dz2 * a1[0], dz2 * a1[1]];
    const da1 = [dz2 * W2[0], dz2 * W2[1]];
    const dz1 = [da1[0] * (1 - a1[0] * a1[0]), da1[1] * (1 - a1[1] * a1[1])];
    const dW1 = [[dz1[0] * x[0], dz1[0] * x[1]], [dz1[1] * x[0], dz1[1] * x[1]]];

    const STAGES = [
      { name: 'input', rows: [['x\u2081', x[0].toFixed(3)], ['x\u2082', x[1].toFixed(3)]], note: 'the network begins here' },
      { name: 'hidden pre-activation', rows: [['z\u2081\u2081', z1[0].toFixed(4)], ['z\u2081\u2082', z1[1].toFixed(4)]], note: 'z\u2081 = W\u2081x + b\u2081' },
      { name: 'hidden activation', rows: [['a\u2081\u2081', a1[0].toFixed(4)], ['a\u2081\u2082', a1[1].toFixed(4)]], note: 'a\u2081 = tanh(z\u2081); these are cached for the backward pass' },
      { name: 'output', rows: [['z\u2082', z2.toFixed(4)], ['\u0177', yhat.toFixed(4)]], note: '\u0177 = \u03c3(W\u2082a\u2081 + b\u2082)' },
      { name: 'loss', rows: [['L', L.toFixed(4)]], note: 'binary cross-entropy against y = 1' },
      { name: 'output gradient', rows: [['dL/dz\u2082', dz2.toFixed(4)], ['dW\u2082', dW2.map(v => v.toFixed(3)).join(', ')]], note: 'for sigmoid + BCE this collapses to (\u0177 \u2212 y): no separate chain needed' },
      { name: 'hidden gradient', rows: [['dL/da\u2081', da1.map(v => v.toFixed(4)).join(', ')], ['dL/dz\u2081', dz1.map(v => v.toFixed(4)).join(', ')]], note: 'multiply by tanh\u2032 = (1 \u2212 a\u00b2): the saturation term' },
      { name: 'weight gradients', rows: [['dW\u2081[0]', dW1[0].map(v => v.toFixed(3)).join(', ')], ['dW\u2081[1]', dW1[1].map(v => v.toFixed(3)).join(', ')]], note: 'ready for the optimizer: w \u2190 w \u2212 \u03b7 dW' }
    ];
    let idx = 0;
    function draw() {
      clear(svg);
      const lx = 30, rx = 270;
      svg.appendChild(s('text', { x: 26, y: 26, fill: COL.dim, 'font-size': 11 }, 'network'));
      // nodes
      const ys = { in: [90, 150], hid: [90, 150], out: [120] };
      function node(xx, yy, lab, col) {
        svg.appendChild(s('circle', { cx: xx, cy: yy, r: 17, fill: COL.panel2, stroke: col, 'stroke-width': 1.8 }));
        svg.appendChild(s('text', { x: xx, y: yy + 4, 'text-anchor': 'middle', fill: COL.ink, 'font-size': 10, 'font-family': 'ui-monospace,monospace' }, lab));
      }
      ys.in.forEach((yy, i) => node(lx + 20, yy, 'x' + (i + 1), COL.blue));
      ys.hid.forEach((yy, i) => node(lx + 110, yy, 'a' + (i + 1), COL.cyan));
      node(lx + 200, 120, '\u0177', COL.amber);
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++)
        svg.appendChild(s('line', { x1: lx + 37, y1: ys.in[i], x2: lx + 93, y2: ys.hid[j], stroke: COL.faint, 'stroke-width': 1, opacity: 0.5 }));
      for (let i = 0; i < 2; i++)
        svg.appendChild(s('line', { x1: lx + 127, y1: ys.hid[i], x2: lx + 183, y2: 120, stroke: COL.faint, 'stroke-width': 1, opacity: 0.5 }));
      // stage panel
      STAGES.forEach(function (sg, i) {
        const yy = 40 + i * 46;
        const active = i === idx, past = i < idx;
        const col = active ? COL.cyan : (past ? COL.green : COL.faint);
        svg.appendChild(s('rect', { x: rx, y: yy, width: 224, height: 40, rx: 8, fill: active ? 'rgba(34,211,238,0.10)' : COL.panel, stroke: col, 'stroke-width': active ? 2 : 1 }));
        svg.appendChild(s('text', { x: rx + 12, y: yy + 16, fill: active ? COL.cyan : COL.dim, 'font-size': 10 }, sg.name));
        svg.appendChild(s('text', { x: rx + 12, y: yy + 31, fill: active ? COL.ink : COL.faint, 'font-size': 9.5, 'font-family': 'ui-monospace,monospace' },
          sg.rows.map(r => r[0] + '=' + r[1]).join('  ')));
      });
      const cur = STAGES[idx];
      st.set('stage', cur.name, COL.cyan);
      st.set('values', cur.rows.map(r => r[0] + ' = ' + r[1]).join(' ; '));
      st.set('direction', idx < 4 ? 'forward' : 'backward', idx < 4 ? COL.blue : COL.amber);
      st.set('loss', L.toFixed(5), COL.rose);
    }
    const prev = h('button', { class: 'viz-btn', text: '\u2190 prev' });
    const next = h('button', { class: 'viz-btn', text: 'next \u2192' });
    const reset = h('button', { class: 'viz-btn', text: 'restart' });
    ui.controls.appendChild(h('div', { class: 'viz-btns' }, prev, next, reset));
    prev.addEventListener('click', function () { idx = Math.max(0, idx - 1); draw(); });
    next.addEventListener('click', function () { idx = Math.min(STAGES.length - 1, idx + 1); draw(); });
    reset.addEventListener('click', function () { idx = 0; draw(); });
    draw();
    return ui.root;
  };

  /* ============================================================
     10. v-conv
     ============================================================ */
  VIZ['v-conv'] = function (host) {
    const ui = shell(host);
    const W = 520, H = 300;
    const svg = makeSVG(W, H);
    ui.stage.appendChild(svg);
    const st = stats(ui.controls);
    const N = 8;
    const img = [];
    for (let i = 0; i < N; i++) { img.push([]); for (let j = 0; j < N; j++) img[i].push((Math.sin(i * 1.1) + Math.cos(j * 1.4) + 2) / 4); }
    const K = [[1, 0, -1], [1, 0, -1], [1, 0, -1]];
    let pos = 0, kernel = 'vertical edge';
    const KERNELS = {
      'vertical edge': [[1, 0, -1], [1, 0, -1], [1, 0, -1]],
      'horizontal edge': [[1, 1, 1], [0, 0, 0], [-1, -1, -1]],
      'blur': [[1 / 9, 1 / 9, 1 / 9], [1 / 9, 1 / 9, 1 / 9], [1 / 9, 1 / 9, 1 / 9]],
      'sharpen': [[0, -1, 0], [-1, 5, -1], [0, -1, 0]]
    };
    function draw() {
      clear(svg);
      const cell = 26, ox = 24, oy = 40;
      const k = KERNELS[kernel];
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const v = img[i][j];
        svg.appendChild(s('rect', { x: ox + j * cell, y: oy + i * cell, width: cell - 1.5, height: cell - 1.5, rx: 2, fill: 'rgba(91,140,255,' + (0.12 + v * 0.62) + ')' }));
      }
      const pi = Math.floor(pos / (N - 2)), pj = pos % (N - 2);
      svg.appendChild(s('rect', { x: ox + pj * cell, y: oy + pi * cell, width: cell * 3 - 1.5, height: cell * 3 - 1.5, fill: 'none', stroke: COL.amber, 'stroke-width': 2.4, rx: 2 }));
      let acc = 0;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) acc += img[pi + a][pj + b] * k[a][b];
      // kernel display
      const kx = 290, ky = 40, kc = 34;
      svg.appendChild(s('text', { x: kx, y: ky - 12, fill: COL.dim, 'font-size': 10 }, 'kernel'));
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
        svg.appendChild(s('rect', { x: kx + b * kc, y: ky + a * kc, width: kc - 3, height: kc - 3, rx: 4, fill: COL.panel2, stroke: COL.violet, 'stroke-width': 1.1 }));
        svg.appendChild(s('text', { x: kx + b * kc + (kc - 3) / 2, y: ky + a * kc + 21, 'text-anchor': 'middle', fill: COL.violet, 'font-size': 10, 'font-family': 'ui-monospace,monospace' },
          (k[a][b] * 9).toFixed(0)));
      }
      svg.appendChild(s('text', { x: kx + 50, y: ky + 3 * kc + 24, fill: COL.dim, 'font-size': 10 }, '(shown \u00d79)'));
      // output map
      const outx = 290, outy = ky + 3 * kc + 44, oc = 18;
      svg.appendChild(s('text', { x: outx, y: outy - 8, fill: COL.dim, 'font-size': 10 }, 'output map'));
      const outVals = [];
      for (let i = 0; i < N - 2; i++) { outVals.push([]); for (let j = 0; j < N - 2; j++) { let s2 = 0; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) s2 += img[i + a][j + b] * k[a][b]; outVals[i].push(s2); } }
      const flat = outVals.flat();
      const mx = Math.max.apply(null, flat.map(Math.abs)) || 1;
      for (let i = 0; i < N - 2; i++) for (let j = 0; j < N - 2; j++) {
        const idx = i * (N - 2) + j, done = idx <= pos;
        const v = outVals[i][j] / mx;
        svg.appendChild(s('rect', {
          x: outx + j * oc, y: outy + i * oc, width: oc - 2, height: oc - 2, rx: 2,
          fill: done ? (v >= 0 ? 'rgba(34,211,238,' + (0.25 + v * 0.6) + ')' : 'rgba(251,113,133,' + (0.25 + Math.abs(v) * 0.6) + ')') : COL.panel,
          stroke: idx === pos ? COL.amber : COL.faint, 'stroke-width': idx === pos ? 2 : 0.5
        }));
      }
      st.set('window', '(' + pi + ',' + pj + ')');
      st.set('dot product', acc.toFixed(3), acc >= 0 ? COL.cyan : COL.rose);
      st.set('output pixels', (pos + 1) + ' / ' + ((N - 2) * (N - 2)));
      st.set('parameters', '9 weights, reused at every position', COL.violet);
    }
    select(ui.controls, 'kernel', Object.keys(KERNELS), kernel, v => { kernel = v; draw(); });
    slider(ui.controls, 'window position', { min: 0, max: 35, step: 1, value: 0, fmt: v => v, on: v => { pos = v; draw(); } });
    const play = h('button', { class: 'viz-btn', text: 'sweep' });
    ui.controls.appendChild(h('div', { class: 'viz-btns' }, play));
    play.addEventListener('click', function () {
      pos = 0;
      const iv = setInterval(function () { pos = (pos + 1) % 36; draw(); if (pos === 0) clearInterval(iv); }, 90);
    });
    draw();
    return ui.root;
  };

  /* ============================================================
     11. v-attention
     ============================================================ */
  VIZ['v-attention'] = function (host) {
    const ui = shell(host);
    const W = 540, H = 340;
    const svg = makeSVG(W, H);
    ui.stage.appendChild(svg);
    const st = stats(ui.controls);
    const toks = ['The', 'cat', 'sat', 'on', 'the', 'mat'];
    const d = 4;
    function emb(i) { return [Math.sin(i * 1.3), Math.cos(i * 0.7), Math.sin(i * 2.1 + 1), Math.cos(i * 1.7 + 2)]; }
    const Q = toks.map((_, i) => emb(i));
    const K = toks.map((_, i) => emb(i).map((v, k) => v * 0.9 + 0.2 * Math.sin(i + k)));
    const V = toks.map((_, i) => emb(i).map(v => v * 1.2));
    let causal = true, qi = 1;
    function scores(i) {
      const s2 = K.map(kk => Q[i].reduce((a, v, j) => a + v * kk[j], 0) / Math.sqrt(d));
      const masked = s2.map((v, j) => (causal && j > i) ? -Infinity : v);
      const mx = Math.max.apply(null, masked.filter(isFinite));
      const ex = masked.map(v => isFinite(v) ? Math.exp(v - mx) : 0);
      const sum = ex.reduce((a, b) => a + b, 0);
      return { raw: s2, w: ex.map(v => v / sum) };
    }
    function draw() {
      clear(svg);
      const ox = 20, oy = 60, cw = 44, rh = 26;
      const sc = scores(qi);
      // column headers
      toks.forEach((t, j) => svg.appendChild(s('text', { x: ox + 70 + j * cw, y: oy - 12, 'text-anchor': 'middle', fill: COL.dim, 'font-size': 10 }, t)));
      toks.forEach(function (t, i) {
        svg.appendChild(s('text', { x: ox + 60, y: oy + i * rh + 17, 'text-anchor': 'end', fill: i === qi ? COL.cyan : COL.dim, 'font-size': 10 }, t));
        sc.w.forEach(function (w, j) {
          const masked = causal && j > i;
          const a = masked ? 0.03 : 0.06 + w * 0.94;
          svg.appendChild(s('rect', {
            x: ox + 70 + j * cw, y: oy + i * rh, width: cw - 3, height: rh - 3, rx: 3,
            fill: masked ? 'rgba(255,255,255,0.04)' : 'rgba(34,211,238,' + a.toFixed(3) + ')',
            stroke: (i === qi) ? COL.cyan : 'none', 'stroke-width': (i === qi) ? 1.2 : 0
          }));
          if (!masked && w > 0.12) svg.appendChild(s('text', { x: ox + 70 + j * cw + (cw - 3) / 2, y: oy + i * rh + 16, 'text-anchor': 'middle', fill: w > 0.45 ? '#07101f' : COL.ink, 'font-size': 9, 'font-family': 'ui-monospace,monospace' }, w.toFixed(2)));
        });
      });
      // query row detail
      svg.appendChild(s('text', { x: ox + 70, y: oy + 6 * rh + 28, fill: COL.dim, 'font-size': 10 },
        'query \u201c' + toks[qi] + '\u201d attends to: ' + sc.w.map((w, j) => (w > 0.08 && !(causal && j > qi)) ? toks[j] + ' (' + w.toFixed(2) + ')' : null).filter(Boolean).join(', ')));
      st.set('selected', toks[qi], COL.cyan);
      st.set('scale', '1/\u221a' + d + ' = ' + (1 / Math.sqrt(d)).toFixed(3));
      st.set('mask', causal ? 'causal' : 'none', causal ? COL.amber : COL.green);
      st.set('row sum', sc.w.reduce((a, b) => a + b, 0).toFixed(4));
    }
    toggle(ui.controls, 'causal mask', causal, v => { causal = v; draw(); });
    slider(ui.controls, 'query token', { min: 0, max: toks.length - 1, step: 1, value: qi, fmt: v => toks[v], on: v => { qi = v; draw(); } });
    draw();
    return ui.root;
  };

  /* ============================================================
     12. v-rope
     ============================================================ */
  VIZ['v-rope'] = function (host) {
    const ui = shell(host);
    const W = 460, H = 340;
    const svg = makeSVG(W, H);
    ui.stage.appendChild(svg);
    const st = stats(ui.controls);
    const q = [1.0, 0.0];
    const k = [0.8, 0.6];
    let m = 3, n = 7, theta = 0.16;
    function rot(v, pos) { const a = pos * theta; return [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)]; }
    function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
    function draw() {
      clear(svg);
      const cx = 120, cy = 170, SC = 62;
      svg.appendChild(s('circle', { cx, cy, r: SC * 1.35, fill: 'none', stroke: COL.faint, 'stroke-width': 0.8 }));
      svg.appendChild(s('line', { x1: cx - SC * 1.5, y1: cy, x2: cx + SC * 1.5, y2: cy, stroke: COL.faint, 'stroke-width': 0.8 }));
      svg.appendChild(s('line', { x1: cx, y1: cy - SC * 1.5, x2: cx, y2: cy + SC * 1.5, stroke: COL.faint, 'stroke-width': 0.8 }));
      const qr = rot(q, m), kr = rot(k, n);
      [[q, COL.violet, 'q (unrotated)'], [k, COL.amber, 'k (unrotated)']].forEach(function (p) {
        svg.appendChild(s('line', { x1: cx, y1: cy, x2: cx + p[0][0] * SC, y2: cy - p[0][1] * SC, stroke: p[1], 'stroke-width': 1.2, 'stroke-dasharray': '3 3', opacity: 0.6 }));
      });
      [[qr, COL.cyan, 'q\u2098'], [kr, COL.green, 'k\u2099']].forEach(function (p) {
        svg.appendChild(s('line', { x1: cx, y1: cy, x2: cx + p[0][0] * SC, y2: cy - p[0][1] * SC, stroke: p[1], 'stroke-width': 3 }));
        svg.appendChild(s('text', { x: cx + p[0][0] * SC * 1.12, y: cy - p[0][1] * SC * 1.12, fill: p[1], 'font-size': 11, 'font-family': 'ui-monospace,monospace', 'text-anchor': 'middle' }, p[2]));
      });
      const angles = [];
      const total = (n - m) * theta;
      const ref = rot(q, 0);
      const rel = Math.abs(dot(rot(q, 0), rot(k, n - m)) - dot(qr, kr)) < 1e-9;
      st.set('position of q', 'm = ' + m, COL.cyan);
      st.set('position of k', 'n = ' + n, COL.green);
      st.set('relative offset', (n - m) + ' steps', COL.amber);
      st.set('q\u1d40k after rotation', dot(qr, kr).toFixed(6), COL.ink);
      st.set('q\u1d40k at offset only', dot(q, rot(k, n - m)).toFixed(6), COL.ink);
      st.set('identical?', rel ? 'yes \u2014 relative position preserved' : 'no', rel ? COL.green : COL.rose);
      svg.appendChild(s('text', { x: 250, y: 40, fill: COL.dim, 'font-size': 10.5 }, 'rotate by pos\u00b7\u03b8, then take the dot product:'));
      svg.appendChild(s('text', { x: 250, y: 58, fill: COL.ink, 'font-size': 10.5, 'font-family': 'ui-monospace,monospace' },
        'angle difference = (' + n + ' \u2212 ' + m + ')\u03b8 = ' + ((n - m) * theta).toFixed(3) + ' rad'));
      svg.appendChild(s('text', { x: 250, y: 300, fill: COL.faint, 'font-size': 10 }, 'only the gap matters, so the score is translation-invariant'));
    }
    slider(ui.controls, 'position m (query)', { min: 0, max: 20, step: 1, value: m, fmt: v => v, on: v => { m = v; draw(); } });
    slider(ui.controls, 'position n (key)', { min: 0, max: 20, step: 1, value: n, fmt: v => v, on: v => { n = v; draw(); } });
    slider(ui.controls, 'base frequency \u03b8', { min: 0.02, max: 0.5, step: 0.01, value: theta, on: v => { theta = v; draw(); } });
    draw();
    return ui.root;
  };

  /* ============================================================
     13. v-kvcache
     ============================================================ */
  VIZ['v-kvcache'] = function (host) {
    const ui = shell(host);
    const W = 520, H = 320;
    const svg = makeSVG(W, H);
    ui.stage.appendChild(svg);
    const st = stats(ui.controls);
    let L = 32, Hh = 32, dh = 128, T = 4096, bytes = 2, batch = 1, params = 7;
    function draw() {
      clear(svg);
      const weights = params * 1e9 * bytes;
      const kv = 2 * L * Hh * T * dh * bytes * batch;
      const maxV = Math.max(weights, kv);
      const bw = 380;
      const rows = [['model weights', weights, COL.cyan],
                    ['KV cache (batch ' + batch + ')', kv, COL.amber]];
      rows.forEach(function (r, i) {
        const y = 70 + i * 80;
        svg.appendChild(s('text', { x: 24, y: y - 8, fill: COL.dim, 'font-size': 10.5 }, r[0]));
        svg.appendChild(s('rect', { x: 24, y: y, width: bw * r[1] / maxV, height: 34, rx: 6, fill: r[2], opacity: 0.75 }));
        svg.appendChild(s('text', { x: 32 + bw * r[1] / maxV, y: y + 22, fill: r[2], 'font-size': 10.5, 'font-family': 'ui-monospace,monospace' }, fmtB(r[1])));
      });
      const ratio = kv / weights;
      st.set('weights', fmtB(weights), COL.cyan);
      st.set('KV cache', fmtB(kv), COL.amber);
      st.set('cache / weights', ratio.toFixed(2) + '\u00d7', ratio > 1 ? COL.rose : COL.green);
      st.set('per token', fmtB(2 * L * Hh * dh * bytes) , COL.dim);
      st.set('formula', '2 \u00b7 L \u00b7 H \u00b7 T \u00b7 d\u2096 \u00b7 bytes');
      svg.appendChild(s('text', { x: W / 2, y: 210, 'text-anchor': 'middle', fill: COL.faint, 'font-size': 10 },
        'the cache grows linearly in T and is paid per concurrent sequence'));
      svg.appendChild(s('text', { x: W / 2, y: 232, 'text-anchor': 'middle', fill: ratio > 1 ? COL.rose : COL.green, 'font-size': 11 },
        ratio > 1 ? 'the cache now dominates memory: batching is limited by KV, not weights' : 'weights still dominate: you can afford to batch'));
    }
    function fmtB(b) {
      if (b >= 1e9) return (b / 1e9).toFixed(2) + ' GB';
      if (b >= 1e6) return (b / 1e6).toFixed(1) + ' MB';
      return (b / 1e3).toFixed(0) + ' KB';
    }
    slider(ui.controls, 'layers L', { min: 8, max: 80, step: 1, value: L, fmt: v => v, on: v => { L = v; draw(); } });
    slider(ui.controls, 'heads H', { min: 8, max: 64, step: 1, value: Hh, fmt: v => v, on: v => { Hh = v; draw(); } });
    slider(ui.controls, 'head dim d\u2096', { min: 64, max: 256, step: 32, value: dh, fmt: v => v, on: v => { dh = v; draw(); } });
    slider(ui.controls, 'context T', { min: 512, max: 131072, step: 512, value: T, fmt: v => (v / 1024).toFixed(0) + 'k', on: v => { T = v; draw(); } });
    slider(ui.controls, 'batch', { min: 1, max: 64, step: 1, value: batch, fmt: v => v, on: v => { batch = v; draw(); } });
    select(ui.controls, 'dtype', ['fp16/bf16 (2B)', 'fp32 (4B)', 'int8 (1B)', 'int4 (0.5B)'], 'fp16/bf16 (2B)', v => {
      bytes = v.indexOf('fp32') >= 0 ? 4 : (v.indexOf('int8') >= 0 ? 1 : (v.indexOf('int4') >= 0 ? 0.5 : 2));
      draw();
    });
    slider(ui.controls, 'model size (B params)', { min: 1, max: 70, step: 1, value: params, fmt: v => v + 'B', on: v => { params = v; draw(); } });
    draw();
    return ui.root;
  };

  /* ============================================================
     14. v-softmax-temp
     ============================================================ */
  VIZ['v-softmax-temp'] = function (host) {
    const ui = shell(host);
    const W = 520, H = 300;
    const svg = makeSVG(W, H);
    ui.stage.appendChild(svg);
    const st = stats(ui.controls);
    const logits = [3.0, 2.4, 1.8, 1.2, 0.6, 0.1];
    const names = ['A', 'B', 'C', 'D', 'E', 'F'];
    let T = 1.0;
    function softmax(T2) {
      const z = logits.map(v => v / T2);
      const mx = Math.max.apply(null, z);
      const e = z.map(v => Math.exp(v - mx));
      const s2 = e.reduce((a, b) => a + b, 0);
      return e.map(v => v / s2);
    }
    function draw() {
      clear(svg);
      const p = softmax(T);
      const baseY = 232, maxH = 170, bw = 54;
      p.forEach(function (v, i) {
        const x = 46 + i * 76;
        const hh = v * maxH;
        svg.appendChild(s('rect', { x: x, y: baseY - hh, width: bw, height: hh, rx: 4, fill: COL.cyan, opacity: 0.4 + 0.6 * Math.min(1, v * 2) }));
        svg.appendChild(s('text', { x: x + bw / 2, y: baseY - hh - 7, 'text-anchor': 'middle', fill: COL.ink, 'font-size': 9.5, 'font-family': 'ui-monospace,monospace' }, v.toFixed(3)));
        svg.appendChild(s('text', { x: x + bw / 2, y: baseY + 16, 'text-anchor': 'middle', fill: COL.dim, 'font-size': 10 }, names[i]));
        svg.appendChild(s('text', { x: x + bw / 2, y: baseY + 30, 'text-anchor': 'middle', fill: COL.faint, 'font-size': 8.5 }, 'z=' + logits[i].toFixed(1)));
      });
      svg.appendChild(s('line', { x1: 26, y1: baseY, x2: W - 26, y2: baseY, stroke: COL.edge }));
      const H_ = -p.reduce((a, v) => a + (v > 0 ? v * Math.log(v) : 0), 0);
      st.set('temperature', T.toFixed(2), COL.cyan);
      st.set('max probability', Math.max.apply(null, p).toFixed(4), Math.max.apply(null, p) > 0.9 ? COL.rose : COL.ink);
      st.set('entropy', H_.toFixed(4) + ' nats', COL.violet);
      st.set('perplexity', Math.exp(H_).toFixed(3));
      st.set('argmax unchanged?', 'yes \u2014 T never reorders', COL.green);
      st.set('effective candidates', p.filter(v => v > 0.01).length + ' of 6', COL.amber);
    }
    slider(ui.controls, 'temperature', { min: 0.05, max: 3, step: 0.05, value: T, on: v => { T = v; draw(); } });
    draw();
    return ui.root;
  };

  /* ============================================================
     15. v-sampling
     ============================================================ */
  VIZ['v-sampling'] = function (host) {
    const ui = shell(host);
    const W = 520, H = 300;
    const svg = makeSVG(W, H);
    ui.stage.appendChild(svg);
    const st = stats(ui.controls);
    let p = [0.32, 0.24, 0.16, 0.12, 0.09, 0.05, 0.02];
    let k = 0, topP = 1.0, minP = 0;
    function draw() {
      clear(svg);
      const order = p.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
      const cum = [];
      let acc = 0;
      order.forEach(function (o) { acc += o[0]; cum.push(acc); });
      const maxP = order[0][0];
      order.forEach(function (o, rank) {
        const v = o[0], orig = o[1];
        let keep = true;
        if (k > 0 && rank >= k) keep = false;
        if (cum[rank] > topP + 1e-9 && rank > 0) keep = false;
        if (v < minP * maxP) keep = false;
        const x = 30 + rank * 68, baseY = 230, maxH = 160, bw = 52;
        const hh = v / maxP * maxH;
        svg.appendChild(s('rect', { x: x, y: baseY - hh, width: bw, height: hh, rx: 4, fill: keep ? COL.cyan : COL.panel2, stroke: keep ? 'none' : COL.faint, 'stroke-width': keep ? 0 : 1, opacity: keep ? 0.85 : 1 }));
        svg.appendChild(s('text', { x: x + bw / 2, y: baseY - hh - 7, 'text-anchor': 'middle', fill: keep ? COL.ink : COL.faint, 'font-size': 9 }, v.toFixed(3)));
        svg.appendChild(s('text', { x: x + bw / 2, y: baseY + 15, 'text-anchor': 'middle', fill: keep ? COL.dim : COL.faint, 'font-size': 9 }, '#' + (rank + 1)));
        svg.appendChild(s('text', { x: x + bw / 2, y: baseY + 28, 'text-anchor': 'middle', fill: COL.faint, 'font-size': 8 }, 'cum ' + cum[rank].toFixed(2)));
      });
      svg.appendChild(s('line', { x1: 20, y1: 230, x2: W - 20, y2: 230, stroke: COL.edge }));
      let kept = 0, mass = 0;
      order.forEach(function (o, rank) {
        let keep = true;
        if (k > 0 && rank >= k) keep = false;
        if (cum[rank] > topP + 1e-9 && rank > 0) keep = false;
        if (o[0] < minP * maxP) keep = false;
        if (keep) { kept++; mass += o[0]; }
      });
      st.set('top-k', k === 0 ? 'off' : k, COL.cyan);
      st.set('top-p', topP.toFixed(2) + ' (nucleus)', COL.violet);
      st.set('min-p', minP.toFixed(2) + ' \u00d7 max');
      st.set('tokens kept', kept + ' / 7', COL.amber);
      st.set('probability mass kept', (mass * 100).toFixed(1) + '%', mass < 0.8 ? COL.rose : COL.green);
      st.set('risk', mass < 0.8 ? 'truncation is cutting real probability' : 'acceptable', mass < 0.8 ? COL.rose : COL.dim);
    }
    slider(ui.controls, 'top-k', { min: 0, max: 7, step: 1, value: 0, fmt: v => v === 0 ? 'off' : v, on: v => { k = v; draw(); } });
    slider(ui.controls, 'top-p', { min: 0.1, max: 1, step: 0.01, value: topP, on: v => { topP = v; draw(); } });
    slider(ui.controls, 'min-p', { min: 0, max: 0.5, step: 0.01, value: minP, on: v => { minP = v; draw(); } });
    draw();
    return ui.root;
  };

  /* ============================================================
     16. v-bpe
     ============================================================ */
  VIZ['v-bpe'] = function (host) {
    const ui = shell(host);
    const W = 520, H = 320;
    const svg = makeSVG(W, H);
    ui.stage.appendChild(svg);
    const st = stats(ui.controls);
    const corpus = [['low', 5], ['lower', 2], ['newest', 6], ['widest', 3], ['lowest', 4]];
    let words = corpus.map(c => [c[0].split(''), c[1]]);
    let vocab = new Set();
    words.forEach(w => w[0].forEach(ch => vocab.add(ch)));
    let history = [], stepNo = 0;
    function pairCounts() {
      const m = new Map();
      words.forEach(function (w) {
        for (let i = 0; i < w[0].length - 1; i++) {
          const key = w[0][i] + '\u0000' + w[0][i + 1];
          m.set(key, (m.get(key) || 0) + w[1]);
        }
      });
      return m;
    }
    function doMerge() {
      const m = pairCounts();
      if (!m.size) return null;
      let best = null, bc = -1;
      m.forEach(function (v, kk) { if (v > bc) { bc = v; best = kk; } });
      const pair = best.split('\u0000');
      words = words.map(function (w) {
        const out = [];
        let i = 0;
        while (i < w[0].length) {
          if (i < w[0].length - 1 && w[0][i] === pair[0] && w[0][i + 1] === pair[1]) { out.push(pair[0] + pair[1]); i += 2; }
          else { out.push(w[0][i]); i++; }
        }
        return [out, w[1]];
      });
      const merged = pair[0] + pair[1];
      vocab.add(merged);
      history.push({ pair: merged, count: bc });
      return { pair: merged, count: bc };
    }
    function draw() {
      clear(svg);
      svg.appendChild(s('text', { x: 24, y: 24, fill: COL.dim, 'font-size': 10.5 }, 'corpus after ' + stepNo + ' merges'));
      words.forEach(function (w, i) {
        const y = 46 + i * 26;
        let x = 24;
        w[0].forEach(function (tok) {
          const wdt = Math.max(22, tok.length * 9 + 10);
          const isNew = tok.length > 1;
          svg.appendChild(s('rect', { x: x, y: y, width: wdt, height: 20, rx: 4, fill: isNew ? 'rgba(34,211,238,0.22)' : COL.panel, stroke: isNew ? COL.cyan : COL.faint, 'stroke-width': 1 }));
          svg.appendChild(s('text', { x: x + wdt / 2, y: y + 14, 'text-anchor': 'middle', fill: isNew ? COL.cyan : COL.dim, 'font-size': 9, 'font-family': 'ui-monospace,monospace' }, tok));
          x += wdt + 3;
        });
        svg.appendChild(s('text', { x: 500, y: y + 14, 'text-anchor': 'end', fill: COL.faint, 'font-size': 9 }, '\u00d7' + w[1]));
      });
      svg.appendChild(s('text', { x: 24, y: 214, fill: COL.dim, 'font-size': 10.5 }, 'merge history'));
      history.slice(-5).forEach(function (hh, i) {
        svg.appendChild(s('text', { x: 24, y: 234 + i * 17, fill: COL.amber, 'font-size': 9.5, 'font-family': 'ui-monospace,monospace' },
          '\u2192 ' + hh.pair + '   (pair seen ' + hh.count + ' times)'));
      });
      const pc = pairCounts();
      let top = null, tc = -1;
      pc.forEach(function (v, kk) { if (v > tc) { tc = v; top = kk; } });
      st.set('merges applied', stepNo, COL.cyan);
      st.set('vocab size', (256 + stepNo) + ' (256 bytes + ' + stepNo + ' merges)', COL.violet);
      st.set('next merge', top ? top.split('\u0000').join('+') + '  \u00d7' + tc : 'none left', COL.amber);
      st.set('tokens in corpus', words.reduce((a, w) => a + w[0].length * w[1], 0));
    }
    const next = h('button', { class: 'viz-btn', text: 'apply merge' });
    const reset = h('button', { class: 'viz-btn', text: 'reset' });
    ui.controls.appendChild(h('div', { class: 'viz-btns' }, next, reset));
    next.addEventListener('click', function () { if (doMerge()) stepNo++; draw(); });
    reset.addEventListener('click', function () {
      words = corpus.map(c => [c[0].split(''), c[1]]);
      vocab = new Set(); words.forEach(w => w[0].forEach(ch => vocab.add(ch)));
      history = []; stepNo = 0; draw();
    });
    draw();
    return ui.root;
  };

  /* ============================================================
     17. v-quant
     ============================================================ */
  VIZ['v-quant'] = function (host) {
    const ui = shell(host);
    const W = 520, H = 260;
    const svg = makeSVG(W, H);
    ui.stage.appendChild(svg);
    const st = stats(ui.controls);
    let xv = 0.734, fmt = 'fp16';
    const FORMATS = {
      fp32: { mant: 23, step: x => Math.pow(2, Math.floor(Math.log2(Math.abs(x) || 1e-9)) - 23) },
      bf16: { mant: 7, step: x => Math.pow(2, Math.floor(Math.log2(Math.abs(x) || 1e-9)) - 7) },
      fp16: { mant: 10, step: x => Math.pow(2, Math.floor(Math.log2(Math.abs(x) || 1e-9)) - 10) },
      fp8: { mant: 3, step: x => Math.pow(2, Math.floor(Math.log2(Math.abs(x) || 1e-9)) - 3) },
      int8: { mant: null, step: x => 1 / 127 },
      int4: { mant: null, step: x => 1 / 7 }
    };
    function draw() {
      clear(svg);
      const f = FORMATS[fmt];
      const step = f.step(xv);
      const q = Math.round(xv / step) * step;
      const err = q - xv;
      const lo = q - 3 * step, hi = q + 3 * step;
      const X = v => 60 + (v - lo) / (hi - lo) * 400;
      svg.appendChild(s('line', { x1: 40, y1: 150, x2: W - 40, y2: 150, stroke: COL.edge, 'stroke-width': 1.4 }));
      for (let i = -3; i <= 3; i++) {
        const v = q + i * step;
        svg.appendChild(s('line', { x1: X(v), y1: 138, x2: X(v), y2: 162, stroke: COL.violet, 'stroke-width': 1.6 }));
        svg.appendChild(s('circle', { cx: X(v), cy: 150, r: 3.4, fill: COL.violet }));
        svg.appendChild(s('text', { x: X(v), y: 182, 'text-anchor': 'middle', fill: COL.faint, 'font-size': 8, 'font-family': 'ui-monospace,monospace' }, v.toFixed(4)));
      }
      svg.appendChild(s('line', { x1: X(xv), y1: 96, x2: X(xv), y2: 150, stroke: COL.cyan, 'stroke-width': 2.4 }));
      svg.appendChild(s('circle', { cx: X(xv), cy: 150, r: 5, fill: COL.cyan }));
      svg.appendChild(s('text', { x: X(xv), y: 88, 'text-anchor': 'middle', fill: COL.cyan, 'font-size': 10, 'font-family': 'ui-monospace,monospace' }, 'true ' + xv.toFixed(5)));
      svg.appendChild(s('line', { x1: X(q), y1: 150, x2: X(q), y2: 118, stroke: COL.amber, 'stroke-width': 2, 'stroke-dasharray': '4 3' }));
      svg.appendChild(s('text', { x: X(q), y: 112, 'text-anchor': 'middle', fill: COL.amber, 'font-size': 10, 'font-family': 'ui-monospace,monospace' }, 'stored ' + q.toFixed(5)));
      st.set('format', fmt.toUpperCase(), COL.violet);
      st.set('local spacing', step.toExponential(3), COL.violet);
      st.set('stored value', q.toFixed(6), COL.amber);
      st.set('absolute error', Math.abs(err).toExponential(3), Math.abs(err) > step / 2 ? COL.rose : COL.ink);
      st.set('relative error', (Math.abs(err / xv) * 100).toFixed(3) + '%', Math.abs(err / xv) > 0.01 ? COL.rose : COL.green);
      st.set('levels between 0 and 1', fmt.indexOf('int') === 0 ? (fmt === 'int8' ? '127' : '7') : '2^' + f.mant + ' per octave', COL.dim);
    }
    select(ui.controls, 'format', Object.keys(FORMATS), fmt, v => { fmt = v; draw(); });
    slider(ui.controls, 'value x', { min: 0.001, max: 4, step: 0.001, value: xv, fmt: v => v.toFixed(3), on: v => { xv = v; draw(); } });
    draw();
    return ui.root;
  };

  /* ============================================================
     18. v-scaling
     ============================================================ */
  VIZ['v-scaling'] = function (host) {
    const ui = shell(host);
    const W = 520, H = 320;
    const svg = makeSVG(W, H);
    ui.stage.appendChild(svg);
    const st = stats(ui.controls);
    const E = 1.69, Aa = 406.4, Bb = 410.7, al = 0.34, be = 0.28;
    const lossOf = (N, D) => E + Aa / Math.pow(N, al) + Bb / Math.pow(D, be);
    let logC = 22;
    function alloc(C) {
      // Chinchilla-style: N ~ sqrt(C/120), D = 20N  (C in FLOPs, C ~ 6ND)
      const N = Math.sqrt(C / 120);
      return { N: N, D: 20 * N };
    }
    function draw() {
      clear(svg);
      const C = Math.pow(10, logC);
      const a = alloc(C);
      const P = plot(svg, { x: 60, y: 30, w: 400, h: 200 }, [18, 26], [1.6, 4.2]);
      for (let g = 18; g <= 26; g += 2) {
        P.line(g, 1.6, g, 4.2, { stroke: COL.faint, 'stroke-width': 0.6, opacity: 0.3 });
        P.txt(g, 1.52, '1e' + g, { 'font-size': 8.5 });
      }
      for (let v = 2; v <= 4; v++) {
        P.line(18, v, 26, v, { stroke: COL.faint, 'stroke-width': 0.6, opacity: 0.3 });
        P.txt(17.7, v, v.toFixed(0), { 'font-size': 8.5 });
      }
      P.line(18, 1.6, 26, 1.6, { stroke: COL.edge });
      P.line(18, 1.6, 18, 4.2, { stroke: COL.edge });
      P.curve(function (lc) {
        const cc = Math.pow(10, lc), a2 = alloc(cc);
        return lossOf(a2.N, a2.D);
      }, 18, 26, { stroke: COL.cyan, 'stroke-width': 2.6 }, 160);
      P.dot(logC, lossOf(a.N, a.D), 5.5, { fill: COL.amber });
      P.txt(logC, lossOf(a.N, a.D) + 0.16, lossOf(a.N, a.D).toFixed(3), { fill: COL.amber, 'font-size': 9.5 });
      st.set('compute budget', (C / 1e21).toFixed(2) + 'e21 FLOPs', COL.cyan);
      st.set('optimal N', (a.N / 1e9).toFixed(2) + 'B params', COL.violet);
      st.set('optimal D', (a.D / 1e12).toFixed(2) + 'T tokens', COL.violet);
      st.set('tokens per param', (a.D / a.N).toFixed(1));
      st.set('predicted loss', lossOf(a.N, a.D).toFixed(4), COL.amber);
      st.set('irreducible E', E.toFixed(2), COL.dim);
      svg.appendChild(s('text', { x: W / 2, y: 258, 'text-anchor': 'middle', fill: COL.dim, 'font-size': 10 },
        'loss = ' + E + ' + ' + Aa + '/N^' + al + ' + ' + Bb + '/D^' + be + '   (Chinchilla fit)'));
      svg.appendChild(s('text', { x: W / 2, y: 280, 'text-anchor': 'middle', fill: COL.faint, 'font-size': 9.5 },
        'drag the budget: both parameters and tokens must grow together'));
      svg.appendChild(s('text', { x: W / 2, y: 302, 'text-anchor': 'middle', fill: COL.rose, 'font-size': 9.5 },
        'extrapolating far past the fitted range is exactly what the field keeps getting wrong'));
    }
    slider(ui.controls, 'log\u2081\u2080 compute', { min: 18, max: 26, step: 0.1, value: logC, fmt: v => '1e' + v.toFixed(1), on: v => { logC = v; draw(); } });
    draw();
    return ui.root;
  };

  /* ---------- export + auto-mount ---------- */
  window.__VIZ = VIZ;
  window.__mountViz = function (root) {
    (root || document).querySelectorAll('[data-viz]').forEach(function (el) {
      const id = el.getAttribute('data-viz');
      const fn = VIZ[id];
      if (!fn) { el.innerHTML = '<div class="viz-missing">missing widget: ' + id + '</div>'; return; }
      if (el.dataset.mounted === '1') return;
      try {
        const content = fn(el);
        el.appendChild(content);
        // stats belong at the bottom of the control column, under the sliders
        const ctrl = content.querySelector ? content.querySelector('.viz-controls') : null;
        const st = ctrl && ctrl.querySelector('.viz-stats');
        if (ctrl && st) ctrl.appendChild(st);
        el.dataset.mounted = '1';
      } catch (err) {
        el.innerHTML = '<div class="viz-missing">widget error: ' + id + ' \u2014 ' + err.message + '</div>';
      }
    });
  };
})();
