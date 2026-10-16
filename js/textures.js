'use strict';
// Procedural textures. Floors, walls, pillars, props and decals are painted once per area
// into small canvases, then stamped with drawImage every frame (fast on phones).

const TEX_SCALE = 2;              // texture pixels per world unit, so tiles stay crisp on retina screens
const TS = TILE * TEX_SCALE;      // tile texture size in pixels
const FACE_H = 0.62;              // wall face height, as a fraction of a tile
const FLOOR_VARIANTS = 8;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return c;
}

const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const jitter = (c, amt, R) => { const k = 1 + (R() * 2 - 1) * amt; return c.map(v => clamp(v * k, 0, 255)); };
const tint = (c, t, to) => c.map((v, i) => v + (to[i] - v) * t);

function speckle(g, w, h, R, count, size, light = 0.08, dark = 0.14) {
  for (let i = 0; i < count; i++) {
    const s = size * (0.4 + R());
    g.fillStyle = R() < 0.5 ? `rgba(255,255,255,${light * R()})` : `rgba(0,0,0,${dark * R()})`;
    g.fillRect(R() * w, R() * h, s, s);
  }
}

function crackPath(g, x, y, steps, R, step = 6) {
  g.beginPath();
  g.moveTo(x, y);
  let a = R() * TAU;
  for (let i = 0; i < steps; i++) {
    a += (R() - 0.5) * 1.3;
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    g.lineTo(x, y);
  }
}

// A bevelled stone block: lit from the top-left.
function stoneBlock(g, x, y, w, h, base, R, bevel = 3, r = 3) {
  const c = jitter(base, 0.06, R);
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  const gr = g.createLinearGradient(x, y, x + w * 0.6, y + h);
  gr.addColorStop(0, rgb(tint(c, 0.07, [255, 255, 255])));
  gr.addColorStop(1, rgb(tint(c, 0.12, [0, 0, 0])));
  g.fillStyle = gr;
  g.fill();
  g.save();
  g.clip();
  g.translate(x, y);
  speckle(g, w, h, R, w * h / 30, 2, 0.05, 0.1);
  g.restore();
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(x + r, y, w - r * 2, bevel);
  g.fillRect(x, y + r, bevel, h - r * 2);
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillRect(x + r, y + h - bevel, w - r * 2, bevel);
  g.fillRect(x + w - bevel, y + r, bevel, h - r * 2);
}

// ---------------------------------------------------------------- Floors

function paintFloor(th, v) {
  const R = mulberry32(1000 + v * 7919 + th.key.length * 31);
  const P = th.tex;
  const base = mkCanvas(TS, TS), g = base.getContext('2d');
  const glow = th.key === 'hell' || th.key === 'fungal' ? mkCanvas(TS, TS) : null;
  g.fillStyle = rgb(tint(P.floor, 0.6, P.grout)); // joints between stones
  g.fillRect(0, 0, TS, TS);
  const gap = 2, pat = v % 4;
  if (pat === 0) stoneBlock(g, gap, gap, TS - gap * 2, TS - gap * 2, P.floor, R, 3, 4);
  else if (pat === 1) {
    const h = TS / 2;
    stoneBlock(g, gap, gap, TS - gap * 2, h - gap * 1.5, P.floor, R);
    stoneBlock(g, gap, h + gap / 2, TS * 0.58 - gap * 1.5, h - gap * 1.5, P.floor, R);
    stoneBlock(g, TS * 0.58 + gap / 2, h + gap / 2, TS * 0.42 - gap * 1.5, h - gap * 1.5, P.floor, R);
  } else if (pat === 2) {
    const s2 = TS / 2;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) stoneBlock(g, i * s2 + gap / 2 + (i ? 0 : gap / 2), j * s2 + gap / 2 + (j ? 0 : gap / 2), s2 - gap * 1.5, s2 - gap * 1.5, P.floor, R);
  } else {
    const w2 = TS / 2;
    stoneBlock(g, gap, gap, w2 - gap * 1.5, TS - gap * 2, P.floor, R);
    stoneBlock(g, w2 + gap / 2, gap, w2 - gap * 1.5, TS - gap * 2, P.floor, R);
  }
  if (R() < 0.55) {
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 1.6;
    crackPath(g, R() * TS, R() * TS, 4 + ((R() * 5) | 0), R);
    g.stroke();
  }

  // Area flavor
  if (th.key === 'catacombs') {
    for (let i = 0; i < 2; i++) blot(g, R() * TS, R() * TS, 10 + R() * 20, 'rgba(60,45,30,0.25)');
  } else if (th.key === 'fungal') {
    for (let i = 0; i < 3; i++) blot(g, R() * TS, R() * TS, 10 + R() * 22, 'rgba(70,130,50,0.35)');
    const gg = glow.getContext('2d');
    for (let i = 0; i < 6; i++) { // tiny glowing moss specks
      const x = R() * TS, y = R() * TS;
      gg.fillStyle = 'rgba(140,255,120,0.55)';
      gg.beginPath(); gg.arc(x, y, 1 + R() * 1.5, 0, TAU); gg.fill();
    }
  } else if (th.key === 'frozen') {
    for (let i = 0; i < 3; i++) blot(g, R() * TS, R() * TS, 12 + R() * 22, 'rgba(210,235,255,0.22)');
    g.strokeStyle = 'rgba(230,245,255,0.35)';
    g.lineWidth = 1;
    crackPath(g, R() * TS, R() * TS, 5, R, 5);
    g.stroke();
  } else if (th.key === 'hell') {
    for (let i = 0; i < 2; i++) blot(g, R() * TS, R() * TS, 12 + R() * 22, 'rgba(0,0,0,0.3)');
    if (v % 4 === 0) { // glowing lava veins: dark crack in the base, bright core in the glow layer
      const gg = glow.getContext('2d');
      const sx = R() * TS, sy = R() * TS, steps = 5 + ((R() * 5) | 0), seed = R();
      for (const [ctx2, color, width] of [[g, 'rgba(10,0,0,0.85)', 5], [gg, 'rgba(255,90,20,0.9)', 2.5], [gg, 'rgba(255,220,120,0.9)', 1]]) {
        const R2 = mulberry32((seed * 1e9) | 0);
        ctx2.strokeStyle = color;
        ctx2.lineWidth = width;
        ctx2.lineCap = 'round';
        crackPath(ctx2, sx, sy, steps, R2, 7);
        ctx2.stroke();
      }
    }
  }
  return { base, glow };
}

function blot(g, x, y, r, color) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

// Soft shadows where floor meets walls. Bit mask: 1 = wall north, 2 = east, 4 = south, 8 = west.
function paintAO(mask) {
  const c = mkCanvas(TS, TS), g = c.getContext('2d');
  // [gradient from, gradient to, rect x, y, w, h, darkness]
  const sides = [
    [1, [0, 0], [0, 34], [0, 0, TS, 34], 0.6],        // wall face to the north casts the longest shadow
    [4, [0, TS], [0, TS - 16], [0, TS - 16, TS, 16], 0.35],
    [8, [0, 0], [22, 0], [0, 0, 22, TS], 0.45],
    [2, [TS, 0], [TS - 22, 0], [TS - 22, 0, 22, TS], 0.45],
  ];
  for (const [bit, from, to, rect, a] of sides) {
    if (!(mask & bit)) continue;
    const gr = g.createLinearGradient(from[0], from[1], to[0], to[1]);
    gr.addColorStop(0, `rgba(0,0,0,${a})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(rect[0], rect[1], rect[2], rect[3]);
  }
  return c;
}

// ---------------------------------------------------------------- Walls

function paintWallTop(th, v) {
  const R = mulberry32(5000 + v * 104729 + th.key.length);
  const P = th.tex;
  const c = mkCanvas(TS, TS), g = c.getContext('2d');
  const dark = tint(P.top, 0.6, [0, 0, 0]);
  g.fillStyle = rgb(tint(dark, 0.4, [0, 0, 0]));
  g.fillRect(0, 0, TS, TS);
  // big rough capstones seen from above
  const n = 2;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const s2 = TS / n;
    stoneBlock(g, i * s2 + 3 + R() * 3, j * s2 + 3 + R() * 3, s2 - 7, s2 - 7, dark, R, 3, 7);
  }
  speckle(g, TS, TS, R, 200, 2, 0.04, 0.15);
  if (th.key === 'frozen') { g.fillStyle = 'rgba(220,240,255,0.18)'; g.fillRect(0, 0, TS, TS); }
  if (th.key === 'fungal') blot(g, R() * TS, R() * TS, 30, 'rgba(70,130,50,0.35)');
  return c;
}

function paintWallFace(th, v) {
  const R = mulberry32(9000 + v * 15485863 + th.key.length);
  const P = th.tex;
  const h = Math.round(TS * FACE_H);
  const base = mkCanvas(TS, h), g = base.getContext('2d');
  const glow = th.key === 'hell' ? mkCanvas(TS, h) : null;
  g.fillStyle = rgb(P.mortar);
  g.fillRect(0, 0, TS, h);
  const rows = 3, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let x = -((r % 2) ? TS * 0.25 : 0) - R() * 10;
    while (x < TS) {
      const w = TS * (0.3 + R() * 0.25);
      stoneBlock(g, x + 1.5, r * rh + 1.5, w - 3, rh - 3, P.brick, R, 2.5, 2);
      x += w;
    }
  }
  // depth: lit lip at the top, darker towards the floor
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(255,255,255,0.1)');
  gr.addColorStop(0.25, 'rgba(0,0,0,0)');
  gr.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = gr;
  g.fillRect(0, 0, TS, h);
  g.fillStyle = 'rgba(255,255,255,0.16)';
  g.fillRect(0, 0, TS, 3);

  if (th.key === 'fungal') {
    for (let i = 0; i < 4; i++) blot(g, R() * TS, R() * h * 0.5, 10 + R() * 16, 'rgba(80,150,60,0.45)');
  } else if (th.key === 'frozen') { // icicles hanging from the lip
    g.fillStyle = 'rgba(220,240,255,0.75)';
    for (let i = 0; i < 6; i++) {
      const x = R() * TS, len = 6 + R() * 16;
      g.beginPath(); g.moveTo(x - 3, 2); g.lineTo(x + 3, 2); g.lineTo(x, 2 + len); g.closePath(); g.fill();
    }
  } else if (th.key === 'hell' && v % 2) {
    const gg = glow.getContext('2d');
    const x = R() * TS;
    for (const [ctx2, color, width] of [[g, 'rgba(10,0,0,0.9)', 4], [gg, 'rgba(255,90,20,0.85)', 2]]) {
      const R2 = mulberry32((x * 1000) | 0);
      ctx2.strokeStyle = color;
      ctx2.lineWidth = width;
      crackPath(ctx2, x, 0, 4, R2, 6);
      ctx2.stroke();
    }
  }
  return { base, glow };
}

// A round stone column occupying one tile: capital on top, fluted shaft, plinth.
function paintPillar(th) {
  const R = mulberry32(777 + th.key.length);
  const P = th.tex;
  const c = mkCanvas(TS, TS), g = c.getContext('2d');
  const cx = TS / 2, w = TS * 0.62, topY = TS * 0.34;
  // shaft (cylindrical shading)
  const gr = g.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
  const s = P.brick;
  gr.addColorStop(0, rgb(tint(s, 0.55, [0, 0, 0])));
  gr.addColorStop(0.35, rgb(tint(s, 0.15, [255, 255, 255])));
  gr.addColorStop(0.6, rgb(s));
  gr.addColorStop(1, rgb(tint(s, 0.65, [0, 0, 0])));
  g.fillStyle = gr;
  g.fillRect(cx - w / 2, topY, w, TS - topY - 8);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 1.5;
  for (let i = 1; i < 5; i++) { const x = cx - w / 2 + (w / 5) * i; g.beginPath(); g.moveTo(x, topY + 6); g.lineTo(x, TS - 12); g.stroke(); }
  speckle(g, TS, TS, R, 80, 2);
  // plinth
  stoneBlock(g, cx - w / 2 - 6, TS - 14, w + 12, 12, P.brick, R, 2, 3);
  // capital seen from above
  const cap = g.createRadialGradient(cx - 8, topY - 10, 2, cx, topY, w * 0.62);
  cap.addColorStop(0, rgb(tint(P.top, 0.25, [255, 255, 255])));
  cap.addColorStop(1, rgb(tint(P.top, 0.35, [0, 0, 0])));
  g.fillStyle = cap;
  g.beginPath(); g.ellipse(cx, topY, w * 0.6, w * 0.42, 0, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 2;
  g.stroke();
  if (th.key === 'frozen') { g.fillStyle = 'rgba(230,245,255,0.3)'; g.beginPath(); g.ellipse(cx, topY, w * 0.6, w * 0.42, 0, 0, TAU); g.fill(); }
  return c;
}

// ---------------------------------------------------------------- Props and decals

function paintProp(type, th) {
  const S = 64;
  const c = mkCanvas(S, S), g = c.getContext('2d');
  const R = mulberry32(type.length * 999 + th.key.length);
  const cx = S / 2;
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.beginPath(); g.ellipse(cx, S - 10, 20, 7, 0, 0, TAU); g.fill();
  if (type === 'barrel') {
    const body = g.createLinearGradient(cx - 17, 0, cx + 17, 0);
    body.addColorStop(0, '#3a2412'); body.addColorStop(0.4, '#8a5a30'); body.addColorStop(1, '#2e1c0e');
    g.fillStyle = body;
    g.beginPath(); g.roundRect(cx - 17, 14, 34, 40, 8); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;
    for (const x of [-9, 0, 9]) { g.beginPath(); g.moveTo(cx + x, 16); g.lineTo(cx + x, 52); g.stroke(); }
    for (const y of [22, 44]) { g.fillStyle = '#5d636b'; g.fillRect(cx - 17, y, 34, 3.5); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(cx - 17, y, 34, 1); }
    g.fillStyle = '#6b4424'; g.beginPath(); g.ellipse(cx, 15, 16, 5.5, 0, 0, TAU); g.fill();
    g.strokeStyle = '#2a180a'; g.lineWidth = 2; g.stroke();
  } else if (type === 'crate') {
    const x = cx - 18, y = 18, w = 36, h = 34;
    g.fillStyle = '#7a5530'; g.fillRect(x, y, w, h);
    g.fillStyle = '#9a7040'; g.fillRect(x, y - 10, w, 10); // top face
    g.strokeStyle = '#3a2412'; g.lineWidth = 2.5; g.strokeRect(x, y, w, h); g.strokeRect(x, y - 10, w, 10);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y + h); g.moveTo(x + w, y); g.lineTo(x, y + h); g.stroke();
    speckle(g, S, S, R, 60, 2);
  } else if (type === 'urn') {
    const gr = g.createLinearGradient(cx - 15, 0, cx + 15, 0);
    const clay = th.key === 'frozen' ? ['#3c4a5a', '#8aa0b8', '#2a3440'] : th.key === 'hell' ? ['#3a1410', '#9a4030', '#2a0c08'] : ['#4a2c1a', '#a8683a', '#3a2010'];
    gr.addColorStop(0, clay[0]); gr.addColorStop(0.4, clay[1]); gr.addColorStop(1, clay[2]);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(cx - 7, 14); g.quadraticCurveTo(cx - 20, 26, cx - 14, 46); g.quadraticCurveTo(cx, 56, cx + 14, 46); g.quadraticCurveTo(cx + 20, 26, cx + 7, 14);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = clay[2]; g.beginPath(); g.ellipse(cx, 14, 8, 3, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,220,160,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - 13, 32); g.quadraticCurveTo(cx, 36, cx + 13, 32); g.stroke();
  }
  return c;
}

function paintDecal(type) {
  const S = 48;
  const c = mkCanvas(S, S), g = c.getContext('2d');
  const R = mulberry32(type.length * 4242);
  const cx = S / 2, cy = S / 2;
  if (type === 'bones') {
    g.lineCap = 'round';
    for (const [x1, y1, x2, y2] of [[10, 18, 36, 28], [14, 32, 34, 16], [20, 38, 30, 36]]) {
      g.strokeStyle = 'rgba(40,30,20,0.6)'; g.lineWidth = 5; g.beginPath(); g.moveTo(x1, y1 + 1); g.lineTo(x2, y2 + 1); g.stroke();
      g.strokeStyle = '#d8ccb0'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      for (const [x, y] of [[x1, y1], [x2, y2]]) { g.fillStyle = '#e8dcc0'; g.beginPath(); g.arc(x, y, 2.6, 0, TAU); g.fill(); }
    }
  } else if (type === 'skull') {
    const gr = g.createRadialGradient(cx - 3, cy - 4, 1, cx, cy, 10);
    gr.addColorStop(0, '#f0e6cc'); gr.addColorStop(1, '#9a8e74');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy - 1, 9, 0, TAU); g.fill();
    g.fillRect(cx - 5, cy + 5, 10, 5);
    g.fillStyle = '#1a120c';
    g.beginPath(); g.ellipse(cx - 3.5, cy - 1, 2.6, 3, 0, 0, TAU); g.ellipse(cx + 3.5, cy - 1, 2.6, 3, 0, 0, TAU); g.fill();
    g.fillRect(cx - 0.8, cy + 3, 1.6, 2.5);
  } else if (type === 'rubble') {
    for (let i = 0; i < 7; i++) {
      const x = 8 + R() * 32, y = 10 + R() * 28, s = 3 + R() * 6;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(x + 1, y + 1.5, s, 0, TAU); g.fill();
      g.fillStyle = `rgb(${110 + R() * 40},${100 + R() * 30},${90 + R() * 30})`; g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
    }
  } else if (type === 'blood') {
    g.fillStyle = 'rgba(110,0,0,0.6)';
    g.beginPath(); g.ellipse(cx, cy, 15, 10, R(), 0, TAU); g.fill();
    for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(cx + (R() - 0.5) * 40, cy + (R() - 0.5) * 30, 1 + R() * 3, 0, TAU); g.fill(); }
  } else if (type === 'scorch') {
    const gr = g.createRadialGradient(cx, cy, 2, cx, cy, 23);
    gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.6, 'rgba(20,10,5,0.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  } else if (type === 'frost') {
    const gr = g.createRadialGradient(cx, cy, 2, cx, cy, 23);
    gr.addColorStop(0, 'rgba(220,245,255,0.55)'); gr.addColorStop(1, 'rgba(160,210,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(240,250,255,0.6)'; g.lineWidth = 1;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20); g.stroke(); }
  } else if (type === 'mushrooms' || type === 'crystals' || type === 'candles') {
    // drawn with a separate glow layer: see paintGlowDecal
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(cx, cy + 8, 14, 5, 0, 0, TAU); g.fill();
    if (type === 'mushrooms') {
      for (const [x, y, s] of [[cx - 7, cy + 4, 6], [cx + 5, cy + 6, 4.5], [cx + 1, cy - 1, 5]]) {
        g.fillStyle = '#d8e8c8'; g.fillRect(x - 1.2, y, 2.4, 7);
        g.fillStyle = '#3e8a4a'; g.beginPath(); g.ellipse(x, y, s, s * 0.6, 0, Math.PI, 0); g.fill();
      }
    } else if (type === 'crystals') {
      for (const [x, h, w] of [[cx - 6, 18, 5], [cx + 1, 24, 6], [cx + 7, 14, 4]]) {
        g.fillStyle = '#9ad4ff'; g.beginPath(); g.moveTo(x - w, cy + 8); g.lineTo(x, cy + 8 - h); g.lineTo(x + w, cy + 8); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.moveTo(x - w * 0.3, cy + 6); g.lineTo(x, cy + 8 - h); g.lineTo(x + w * 0.1, cy + 6); g.fill();
      }
    } else {
      for (const [x, h] of [[cx - 7, 12], [cx, 18], [cx + 6, 9]]) {
        g.fillStyle = '#e8dcc0'; g.fillRect(x - 2, cy + 8 - h, 4, h);
        g.fillStyle = 'rgba(200,190,170,0.8)'; g.fillRect(x - 3, cy + 7, 6, 2);
      }
    }
  }
  return c;
}

// Additive glow sprites for decals that emit light.
function paintGlowDecal(type) {
  const S = 48;
  const c = mkCanvas(S, S), g = c.getContext('2d');
  const color = { mushrooms: '120,255,140', crystals: '140,210,255', candles: '255,190,90' }[type];
  const cx = S / 2;
  const pts = type === 'candles' ? [[cx - 7, 12], [cx, 18], [cx + 6, 9]] : [[cx, 8]];
  for (const [x, h] of pts) {
    const y = type === 'candles' ? S / 2 + 8 - h - 3 : S / 2;
    const gr = g.createRadialGradient(x, y, 0, x, y, type === 'candles' ? 9 : 22);
    gr.addColorStop(0, `rgba(${color},0.9)`);
    gr.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    if (type === 'candles') { g.fillStyle = '#fff4c0'; g.beginPath(); g.ellipse(x, y, 1.6, 3, 0, 0, TAU); g.fill(); }
  }
  return c;
}

// Banners and chains hung on wall faces.
function paintWallDeco(type, th) {
  const w = 30, h = 56;
  const c = mkCanvas(w, h), g = c.getContext('2d');
  if (type === 'banner') {
    const col = { catacombs: '#6a1a1a', fungal: '#1e4a2a', frozen: '#1e3a6a', hell: '#3a0a0a' }[th.key];
    g.fillStyle = '#4a3a20'; g.fillRect(2, 2, w - 4, 3);
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, shade(col, -0.4)); gr.addColorStop(0.5, col); gr.addColorStop(1, shade(col, -0.4));
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(5, 5); g.lineTo(w - 5, 5); g.lineTo(w - 5, h - 4); g.lineTo(w / 2, h - 12); g.lineTo(5, h - 4); g.closePath(); g.fill();
    g.strokeStyle = '#c9a64a'; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = '#c9a64a';
    g.beginPath(); g.arc(w / 2, 22, 5, 0, TAU); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(w / 2, 22, 2.5, 0, TAU); g.fill();
  } else {
    g.strokeStyle = '#5a5e66'; g.lineWidth = 2;
    for (const x of [8, 22]) for (let y = 4; y < h - 8; y += 6) { g.beginPath(); g.ellipse(x, y, 2, 3.2, 0, 0, TAU); g.stroke(); }
    g.fillStyle = '#4a4e56'; g.fillRect(4, 0, 22, 3);
  }
  return c;
}

// ---------------------------------------------------------------- Cache per area

const TEXTURES = {};

function getTextures(th) {
  if (TEXTURES[th.key]) return TEXTURES[th.key];
  const floors = [], walls = [], faces = [];
  for (let v = 0; v < FLOOR_VARIANTS; v++) floors.push(paintFloor(th, v));
  for (let v = 0; v < 4; v++) walls.push(paintWallTop(th, v));
  for (let v = 0; v < 4; v++) faces.push(paintWallFace(th, v));
  const ao = [];
  for (let m = 0; m < 16; m++) ao.push(m ? paintAO(m) : null);
  const decals = {}, glows = {};
  for (const t of ['bones', 'skull', 'rubble', 'blood', 'scorch', 'frost', 'mushrooms', 'crystals', 'candles']) decals[t] = paintDecal(t);
  for (const t of ['mushrooms', 'crystals', 'candles']) glows[t] = paintGlowDecal(t);
  const props = {};
  for (const t of ['barrel', 'crate', 'urn']) props[t] = paintProp(t, th);
  const deco = { banner: paintWallDeco('banner', th), chain: paintWallDeco('chain', th) };
  TEXTURES[th.key] = { floors, walls, faces, ao, pillar: paintPillar(th), decals, glows, props, deco };
  return TEXTURES[th.key];
}
