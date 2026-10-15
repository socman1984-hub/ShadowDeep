'use strict';
// Small math / random helpers shared by every module.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const chance = p => Math.random() < p;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// entries: [[value, weight], ...]
function weightedPick(entries) {
  let total = 0;
  for (const e of entries) total += Math.max(0, e[1]);
  let r = Math.random() * total;
  for (const e of entries) {
    r -= Math.max(0, e[1]);
    if (r <= 0) return e[0];
  }
  return entries[entries.length - 1][0];
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Deterministic 0..1 noise per tile, so floor patterns don't flicker.
function hash2(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function fmt(n) {
  n = Math.round(n);
  return n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(n);
}
