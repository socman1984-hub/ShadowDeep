'use strict';
// All canvas drawing. Characters are drawn procedurally (no image assets yet).

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const lightCanvas = document.createElement('canvas');
const lctx = lightCanvas.getContext('2d');
const LIGHT_SCALE = 0.5; // lighting is rendered at half resolution for speed
let DPR = 1, VW = 0, VH = 0, ZOOM = 1;

function resizeCanvas() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  VW = window.innerWidth;
  VH = window.innerHeight;
  canvas.width = Math.floor(VW * DPR);
  canvas.height = Math.floor(VH * DPR);
  canvas.style.width = VW + 'px';
  canvas.style.height = VH + 'px';
  lightCanvas.width = Math.ceil(VW * LIGHT_SCALE);
  lightCanvas.height = Math.ceil(VH * LIGHT_SCALE);
  // Show roughly 8.5 tiles across the short side of the screen.
  ZOOM = clamp(Math.min(VW, VH) / (TILE * 8.5), 0.55, 1.5);
}

function circle(x, y, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function render() {
  const p = G.player, d = G.dungeon, th = d.theme;
  const T = getTextures(th);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#050404';
  ctx.fillRect(0, 0, VW, VH);

  const vw = VW / ZOOM, vh = VH / ZOOM;
  const sh = G.cam.shake;
  const camX = p.x - vw / 2 + (sh ? rand(-sh, sh) : 0);
  const camY = p.y - vh / 2 + (sh ? rand(-sh, sh) : 0);
  G.cam.x = camX;
  G.cam.y = camY;
  const k = DPR * ZOOM;
  const world = () => ctx.setTransform(k, 0, 0, k, -camX * k, -camY * k);
  world();

  const inView = (x, y, m = 80) => x > camX - m && x < camX + vw + m && y > camY - m && y < camY + vh + m;
  const view = tileRange(d, camX, camY, vw, vh);

  // ---- ground
  drawTiles(d, T, view);
  for (const wd of d.wallDeco) if (inView(wd.x, wd.y)) ctx.drawImage(T.deco[wd.type], wd.x - 7.5, wd.y, 15, 28);
  for (const dc of d.decor) if (inView(dc.x, dc.y)) drawDecor(dc, T);
  for (const dc of G.decals) if (inView(dc.x, dc.y)) drawDecal(dc, T);
  for (const t of d.torches) if (inView(t.x, t.y)) drawTorchBracket(t);
  if (G.portal.active) drawPortal(G.portal);
  for (const cp of G.corpses) if (inView(cp.e.x, cp.e.y)) drawCorpse(cp);
  for (const fx of G.effects) if (fx.type === 'slam' || fx.type === 'nova' || fx.type === 'explosion') drawEffect(fx);

  // ---- everything that stands up, sorted by y so nearer things overlap farther ones
  const actors = G.enemies.filter(e => inView(e.x, e.y));
  for (const ch of G.chests) if (inView(ch.x, ch.y)) actors.push(ch);
  for (const pr of G.props) if (inView(pr.x, pr.y)) actors.push(pr);
  for (const l of G.loot) if (inView(l.x, l.y)) actors.push(l);
  actors.push(p);
  actors.sort((a, b) => a.y - b.y);
  for (const a of actors) {
    if (a === p) drawPlayer(p);
    else if (a.isChest) drawChest(a);
    else if (a.isProp) ctx.drawImage(T.props[a.type], a.x - 16, a.y - 25, 32, 32);
    else if (a.kind) drawLoot(a);
    else drawEnemy(a);
  }
  if (G.autoTarget) drawTargetMarker(G.autoTarget);

  // ---- darkness, then things that glow on top of it
  drawLighting(d, th, camX, camY, inView);
  world();
  ctx.globalCompositeOperation = 'lighter';
  drawGlowTiles(d, T, view);
  for (const dc of d.decor) {
    if (!dc.glow || !inView(dc.x, dc.y)) continue;
    ctx.globalAlpha = 0.75 + Math.sin(G.time * 2 + dc.x) * 0.25;
    ctx.drawImage(T.glows[dc.type], dc.x - 12, dc.y - 12, 24, 24);
  }
  ctx.globalAlpha = 1;
  for (const t of d.torches) if (inView(t.x, t.y, 150)) drawTorchFlame(t, th);
  for (const pr of G.projectiles) drawProjectile(pr);
  for (const fx of G.effects) if (fx.type === 'slash' || fx.type === 'lightning' || fx.type === 'levelup' || fx.type === 'explosion') drawEffect(fx, true);
  for (const pt of G.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.max);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  drawAmbient(th, camX, camY, vw, vh);

  // ---- readable layer: names, damage numbers, loot labels
  for (const l of G.loot) if (l.kind === 'item' && inView(l.x, l.y)) drawLootLabel(l);
  for (const e of G.enemies) if (inView(e.x, e.y)) drawEnemyBars(e);
  ctx.textAlign = 'center';
  for (const t of G.texts) {
    const pop = t.t < 0.12 ? 1.45 - (t.t / 0.12) * 0.45 : 1; // numbers pop in, then settle
    ctx.globalAlpha = 1 - Math.max(0, (t.t - t.max * 0.6) / (t.max * 0.4));
    ctx.font = `bold ${Math.round(t.size * pop)}px Georgia, serif`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;

  // ---- screen-space color grade and vignettes
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = th.grade;
  ctx.fillRect(0, 0, VW, VH);
  ctx.globalCompositeOperation = 'source-over';
  const vg = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.45, VW / 2, VH / 2, Math.max(VW, VH) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, VW, VH);
  const lowHp = p.hp / p.stats.maxHp < 0.3;
  if (p.hurtT > 0 || lowHp) {
    const a = Math.max(p.hurtT / 0.3 * 0.45, lowHp ? 0.25 + Math.sin(G.time * 5) * 0.12 : 0);
    const g = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.35, VW / 2, VH / 2, Math.max(VW, VH) * 0.75);
    g.addColorStop(0, 'rgba(160,0,0,0)');
    g.addColorStop(1, `rgba(160,0,0,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
  }
}

// ---------------------------------------------------------------- World

function tileRange(d, camX, camY, vw, vh) {
  return {
    x0: Math.max(0, Math.floor(camX / TILE) - 1), x1: Math.min(d.w - 1, Math.ceil((camX + vw) / TILE) + 1),
    y0: Math.max(0, Math.floor(camY / TILE) - 1), y1: Math.min(d.h - 1, Math.ceil((camY + vh) / TILE) + 1),
  };
}

function drawTiles(d, T, v) {
  // Floors (also under pillars), with soft shadows along the walls
  for (let ty = v.y0; ty <= v.y1; ty++) {
    for (let tx = v.x0; tx <= v.x1; tx++) {
      const i = d.idx(tx, ty);
      if (d.isWall(tx, ty) && !d.pillar[i]) continue;
      const px = tx * TILE, py = ty * TILE;
      ctx.drawImage(T.floors[d.fvar[i]].base, px, py, TILE + 0.6, TILE + 0.6);
      if (d.ao[i]) ctx.drawImage(T.ao[d.ao[i]], px, py, TILE, TILE);
    }
  }
  // Walls: stone tops everywhere, brick faces where the wall looks onto floor, round pillars
  for (let ty = v.y0; ty <= v.y1; ty++) {
    for (let tx = v.x0; tx <= v.x1; tx++) {
      const i = d.idx(tx, ty);
      if (!d.edge[i]) continue;
      const px = tx * TILE, py = ty * TILE;
      if (d.pillar[i]) { ctx.drawImage(T.pillar, px, py, TILE, TILE); continue; }
      const vr = d.fvar[i] % 4;
      ctx.drawImage(T.walls[vr], px, py, TILE + 0.6, TILE + 0.6);
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      if (!d.isWall(tx - 1, ty)) ctx.fillRect(px, py, 2, TILE);
      if (!d.isWall(tx + 1, ty)) ctx.fillRect(px + TILE - 2, py, 2, TILE);
      if (!d.isWall(tx, ty - 1)) ctx.fillRect(px, py, TILE, 2);
      if (!d.isWall(tx, ty + 1)) ctx.drawImage(T.faces[vr].base, px, py + TILE * (1 - FACE_H), TILE + 0.6, TILE * FACE_H);
    }
  }
}

// Glowing lava veins and moss, drawn additively after the darkness so they light up the dark.
function drawGlowTiles(d, T, v) {
  const pulse = 0.7 + Math.sin(G.time * 1.7) * 0.3;
  ctx.globalAlpha = pulse;
  for (let ty = v.y0; ty <= v.y1; ty++) {
    for (let tx = v.x0; tx <= v.x1; tx++) {
      const i = d.idx(tx, ty);
      const px = tx * TILE, py = ty * TILE;
      if (!d.isWall(tx, ty)) {
        const gl = T.floors[d.fvar[i]].glow;
        if (gl) ctx.drawImage(gl, px, py, TILE, TILE);
      } else if (d.edge[i] && !d.pillar[i] && !d.isWall(tx, ty + 1)) {
        const gl = T.faces[d.fvar[i] % 4].glow;
        if (gl) ctx.drawImage(gl, px, py + TILE * (1 - FACE_H), TILE, TILE * FACE_H);
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawDecor(dc, T) {
  const img = T.decals[dc.type];
  if (dc.glow) { ctx.drawImage(img, dc.x - 12, dc.y - 12, 24, 24); return; }
  ctx.save();
  ctx.translate(dc.x, dc.y);
  ctx.rotate(dc.rot);
  ctx.drawImage(img, -12, -12, 24, 24);
  ctx.restore();
}

function drawDecal(dc, T) {
  const fade = Math.min(1, (dc.life - dc.t) / 3);
  const s = 24 * dc.scale;
  ctx.globalAlpha = fade;
  ctx.save();
  ctx.translate(dc.x, dc.y);
  ctx.rotate(dc.rot);
  ctx.drawImage(T.decals[dc.type], -s / 2, -s / 2, s, s);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawTorchBracket(t) {
  ctx.fillStyle = '#2a1e12';
  ctx.fillRect(t.x - 2.5, t.y - 3, 5, 13);
  ctx.fillStyle = '#5a5e66';
  ctx.fillRect(t.x - 5, t.y + 6, 10, 3);
  ctx.fillStyle = '#3a2a1a';
  ctx.beginPath(); ctx.moveTo(t.x - 4, t.y - 4); ctx.lineTo(t.x + 4, t.y - 4); ctx.lineTo(t.x + 2.5, t.y + 1); ctx.lineTo(t.x - 2.5, t.y + 1); ctx.fill();
}

// Layered teardrop flame plus a soft glow; called in the additive pass.
function drawTorchFlame(t, th) {
  const time = G.time + t.seed;
  const fl = Math.sin(time * 13) * 0.12 + Math.sin(time * 7.3) * 0.08;
  const x = t.x + Math.sin(time * 9) * 0.6, y = t.y - 5;
  const g = ctx.createRadialGradient(x, y - 4, 0, x, y - 4, 60);
  g.addColorStop(0, th.torch + '55');
  g.addColorStop(1, th.torch + '00');
  ctx.fillStyle = g;
  ctx.fillRect(x - 60, y - 64, 120, 120);
  for (const [sc, col] of [[1, th.torch + 'cc'], [0.68, '#ffcf70'], [0.38, '#fff8e0']]) {
    const h = 15 * sc * (1 + fl), w = 5 * sc;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.quadraticCurveTo(x + w * 1.5, y - h * 0.25, x, y + w * 0.5);
    ctx.quadraticCurveTo(x - w * 1.5, y - h * 0.25, x, y - h);
    ctx.fill();
  }
  if (chance(0.04)) G.particles.push({ x, y: y - 10, vx: rand(-15, 15), vy: rand(-70, -40), life: 0.7, max: 0.7, color: '#ffb050', size: 1.6 });
}

// ---------------------------------------------------------------- Ambient particles (dust, spores, snow, embers)

const AMBIENT = [];
const AMBIENT_COUNT = 46;

function drawAmbient(th, camX, camY, vw, vh) {
  const kind = th.ambient;
  if (AMBIENT.kind !== kind) { AMBIENT.length = 0; AMBIENT.kind = kind; }
  const dt = 1 / 60;
  while (AMBIENT.length < AMBIENT_COUNT) {
    AMBIENT.push({ x: camX + Math.random() * vw, y: camY + Math.random() * vh, ph: Math.random() * TAU, s: 0.6 + Math.random() * 1.2 });
  }
  ctx.globalCompositeOperation = kind === 'snow' || kind === 'dust' ? 'source-over' : 'lighter';
  for (const a of AMBIENT) {
    a.ph += dt;
    if (kind === 'snow') { a.x += (12 + Math.sin(a.ph) * 8) * dt; a.y += 28 * a.s * dt; }
    else if (kind === 'embers') { a.x += Math.sin(a.ph * 2) * 10 * dt; a.y -= 32 * a.s * dt; }
    else if (kind === 'spores') { a.x += Math.sin(a.ph * 0.8) * 8 * dt; a.y -= 9 * a.s * dt; }
    else { a.x += Math.sin(a.ph * 0.5) * 6 * dt; a.y += Math.cos(a.ph * 0.4) * 4 * dt; }
    // wrap around the view so the screen always has particles
    if (a.x < camX - 10) a.x += vw + 20; else if (a.x > camX + vw + 10) a.x -= vw + 20;
    if (a.y < camY - 10) a.y += vh + 20; else if (a.y > camY + vh + 10) a.y -= vh + 20;
    const tw = 0.6 + Math.sin(a.ph * 3) * 0.4;
    if (kind === 'snow') ctx.fillStyle = `rgba(235,245,255,${0.55 * tw})`;
    else if (kind === 'embers') ctx.fillStyle = `rgba(255,${120 + (tw * 80) | 0},40,${0.8 * tw})`;
    else if (kind === 'spores') ctx.fillStyle = `rgba(150,255,140,${0.5 * tw})`;
    else ctx.fillStyle = `rgba(220,200,170,${0.22 * tw})`;
    const s = a.s * (kind === 'snow' ? 2.2 : 1.6);
    ctx.fillRect(a.x - s / 2, a.y - s / 2, s, s);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawPortal(pt) {
  const t = G.time;
  ctx.save();
  ctx.translate(pt.x, pt.y);
  ctx.scale(1, 0.55);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = `rgba(${150 + i * 25},${80 + i * 20},255,${0.7 - i * 0.12})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 30 - i * 6, t * (2 + i) + i, t * (2 + i) + i + 4.2);
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 34);
  g.addColorStop(0, 'rgba(200,150,255,0.8)');
  g.addColorStop(1, 'rgba(90,40,200,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.fill();
  ctx.restore();
  if (chance(0.3)) G.particles.push({ x: pt.x + rand(-20, 20), y: pt.y + rand(-8, 8), vx: 0, vy: rand(-60, -30), life: 0.8, max: 0.8, color: '#b98aff', size: 2.5 });
}

const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

function lootIcon(l) {
  if (l.kind === 'item') return itemIcon(l.item);
  if (l.kind === 'mat') return MATS[l.mat].icon;
  return null;
}

function drawLoot(l) {
  let x = l.x, y = l.y, z = 0;
  if (l.pop < l.popMax) {
    const t = l.pop / l.popMax;
    x = lerp(l.sx, l.x, t);
    y = lerp(l.sy, l.y, t);
    z = Math.sin(t * Math.PI) * 30;
  }
  const landed = z === 0;
  const bob = landed ? Math.sin(l.t * 3 + l.seed) * 1.5 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(x, y + 4, 7, 3, 0, 0, TAU); ctx.fill();
  const iy = y - z - 4 + bob;

  if (l.kind === 'gold') {
    for (const [ox, oy] of [[-4, 2], [3, 1], [0, -1]]) {
      cEll(ctx, x + ox, iy + oy + 4, 4.2, 2.6, '#9a6f0b');
      cEll(ctx, x + ox, iy + oy + 3.2, 4.2, 2.6, '#ffd84a');
    }
    return;
  }
  if (l.kind === 'potion') {
    cCircle(ctx, x, iy + 2, 5.5, '#c21f35');
    cRRect(ctx, x - 2, iy - 7, 4, 5, 1, '#d8d0c0');
    cCircle(ctx, x - 2, iy, 1.5, 'rgba(255,255,255,0.6)', false);
    return;
  }
  const col = l.kind === 'item' ? RARITIES[l.item.rarity].color : MATS[l.mat].color;
  if (landed && l.kind === 'item' && l.item.rarity !== 'common') {
    const g = ctx.createLinearGradient(x, y - 90, x, y);
    g.addColorStop(0, col + '00');
    g.addColorStop(1, col + '77');
    ctx.fillStyle = g;
    ctx.fillRect(x - 4, y - 90, 8, 90);
  }
  ctx.strokeStyle = col;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(x, y + 4, 11, 4.5, 0, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.font = `${l.kind === 'item' ? 17 : 13}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(lootIcon(l), x, iy);
  ctx.textBaseline = 'alphabetic';
}

function drawLootLabel(l) {
  if (l.pop < l.popMax) return;
  const col = RARITIES[l.item.rarity].color;
  const name = itemName(l.item);
  ctx.font = 'bold 11px Georgia, serif';
  ctx.textAlign = 'center';
  const w = ctx.measureText(name).width + 8;
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(l.x - w / 2, l.y - 32, w, 14);
  ctx.fillStyle = col;
  ctx.fillText(name, l.x, l.y - 21);
}

function drawChest(ch) {
  const { x, y } = ch;
  const big = ch.big ? 1.35 : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(big, big);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(0, 6, 17, 6, 0, 0, TAU); ctx.fill();
  const wood = ch.big ? '#6a3a1a' : '#5a3a1e', band = ch.big ? '#e0b040' : '#8a8f98';
  // body
  cRRect(ctx, -14, -10, 28, 16, 2, wood);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-14, -2, 28, 8);
  if (ch.open) {
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, -10, 0, 0, -10, 22);
    g.addColorStop(0, `rgba(255,210,90,${Math.max(0.2, 0.9 - ch.t * 0.3)})`);
    g.addColorStop(1, 'rgba(255,150,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-22, -32, 44, 30);
    ctx.globalCompositeOperation = 'source-over';
    cRRect(ctx, -14, -22, 28, 10, 3, shade(wood, -0.25)); // lid flipped back
    cRRect(ctx, -12, -11, 24, 3, 1, '#1a0f08', false);
  } else {
    cRRect(ctx, -15, -17, 30, 9, 4, shade(wood, 0.15)); // lid
    for (const bx of [-9, 7]) cRRect(ctx, bx, -17, 2.5, 23, 0.5, band);
    cRRect(ctx, -2.5, -10, 5, 6, 1, '#e0b040');
    cCircle(ctx, 0, -7, 0.9, '#1a0f08', false);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- Characters

function drawShadow(x, y, r) {
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.35, r * 1.05, r * 0.42, 0, 0, TAU);
  ctx.fill();
}

function playerWeaponAngle(p) {
  if (p.whirlT > 0) return G.time * 18;
  if (p.swingT > 0) return p.facing - 1.2 + (1 - p.swingT / 0.2) * 2.4;
  if (p.castT > 0) return p.facing - 0.6;
  return p.facing + 0.8;
}

function enemyWeaponAngle(e) {
  if (e.swingT > 0) return e.facing - 1.4 + (1 - e.swingT / 0.2) * 2.4;
  if (e.windT > 0) return e.facing - 1.4 * (1 - e.windT / e.def.wind);
  return e.facing + 0.8;
}

function drawPlayer(p) {
  const moving = trackWalk(p);
  drawShadow(p.x, p.y, p.r);
  if (p.whirlT > 0) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(220,230,255,${0.5 - i * 0.12})`;
      ctx.lineWidth = 5 - i;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 12, 58 + i * 14, G.time * 18 + i * 2, G.time * 18 + i * 2 + 2.2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  drawHumanoid(ctx, p.x, p.y, playerLook(p), { facing: p.facing, walk: p.walk, moving, wAng: playerWeaponAngle(p), seed: 0 });
  if (p.castT > 0) {
    ctx.globalCompositeOperation = 'lighter';
    const cx = p.x + Math.cos(p.facing) * 14, cy = p.y - 22 + Math.sin(p.facing) * 8;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16);
    g.addColorStop(0, 'rgba(255,210,140,0.9)');
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 16, cy - 16, 32, 32);
    ctx.globalCompositeOperation = 'source-over';
  }
}

function drawEnemy(e) {
  const moving = trackWalk(e);
  const L = enemyLook(e);
  const s = L.scale || 1;
  const t = G.time + e.seed;
  if (e.type === 'bat') drawShadow(e.x, e.y + 4, e.r * 0.7); else drawShadow(e.x, e.y, e.r);
  if (e.elite || e.boss) {
    ctx.strokeStyle = e.boss ? 'rgba(255,80,40,0.75)' : 'rgba(100,150,255,0.85)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + e.r * 0.35, e.r + 4 + Math.sin(t * 4) * 2, (e.r + 4) * 0.42, 0, 0, TAU);
    ctx.stroke();
  }
  if (e.windT > 0) { // red warning arc so the player can react
    const a = 1 - e.windT / e.def.wind;
    ctx.strokeStyle = `rgba(255,50,30,${0.3 + a * 0.6})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r + e.def.reach + 6, e.facing - 0.7, e.facing + 0.7);
    ctx.stroke();
  }
  const st = { facing: e.facing, walk: e.walk, moving, wAng: enemyWeaponAngle(e), seed: e.seed };
  if (e.type === 'bat') drawBat(ctx, e.x, e.y, L, st);
  else drawHumanoid(ctx, e.x, e.y, L, st);

  const bodyY = e.type === 'bat' ? e.y - 16 : e.y - 22 * s;
  if (e.slowT > 0) cEll(ctx, e.x, bodyY, 11 * s, e.type === 'bat' ? 10 : 24 * s, 'rgba(120,200,255,0.3)');
  if (e.hitT > 0) cEll(ctx, e.x, bodyY, 10 * s * (L.bulk || 1), e.type === 'bat' ? 9 : 23 * s, 'rgba(255,255,255,0.45)');
}

function drawCorpse(cp) {
  const e = cp.e;
  const fade = cp.t > 7 ? Math.max(0, 1 - (cp.t - 7) / 3) : 1;
  if (fade <= 0) return;
  ctx.globalAlpha = fade;
  if (e.type !== 'skeleton') cEll(ctx, e.x, e.y + 2, e.r * 1.4, e.r * 0.6, 'rgba(70,0,0,0.45)');
  const fall = Math.min(1, cp.t / 0.35);
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(cp.dir * fall * 1.45);
  const L = enemyLook(e);
  if (e.type === 'bat') drawBat(ctx, 0, 14, L, { seed: 0 });
  else drawHumanoid(ctx, 0, 0, { ...L, weapon: null }, { facing: Math.PI / 2, walk: 0, moving: false, seed: e.seed });
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawEnemyBars(e) {
  const top = e.y - e.r * 2 - (e.boss ? 30 : 18);
  if (e.elite || e.boss) {
    ctx.font = `bold ${e.boss ? 14 : 11}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = e.boss ? '#ff8c4a' : '#7ea2ff';
    ctx.fillText(e.boss ? e.def.name : `Champion ${e.def.name}`, e.x, top - 4);
  }
  if (e.hp >= e.maxHp && !e.boss) return;
  const w = e.boss ? 80 : e.elite ? 44 : 32;
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(e.x - w / 2 - 1, top - 1, w + 2, 6);
  ctx.fillStyle = e.boss ? '#e04a1a' : '#d62828';
  ctx.fillRect(e.x - w / 2, top, w * Math.max(0, e.hp / e.maxHp), 4);
}

function drawTargetMarker(e) {
  const t = G.time;
  ctx.strokeStyle = 'rgba(255,90,60,0.8)';
  ctx.lineWidth = 2;
  const r = e.r + 8;
  for (let i = 0; i < 4; i++) {
    const a = t * 2 + i * (TAU / 4);
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + e.r * 0.5, r, r * 0.45, 0, a, a + 0.8);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- Projectiles / effects

function drawProjectile(pr) {
  if (pr.kind === 'fireball') {
    // comet tail
    const tr = pr.trail || [];
    for (let i = 0; i < tr.length; i++) {
      const f = (i + 1) / tr.length, r = 3 + f * 7;
      ctx.fillStyle = `rgba(255,${(90 + f * 100) | 0},30,${0.12 + f * 0.3})`;
      ctx.beginPath(); ctx.arc(tr[i].x, tr[i].y, r, 0, TAU); ctx.fill();
    }
    const g = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, 20);
    g.addColorStop(0, 'rgba(255,255,230,1)');
    g.addColorStop(0.3, 'rgba(255,190,70,0.95)');
    g.addColorStop(0.65, 'rgba(255,90,20,0.5)');
    g.addColorStop(1, 'rgba(255,40,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(pr.x - 20, pr.y - 20, 40, 40);
  } else {
    const g = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, 13);
    g.addColorStop(0, 'rgba(255,225,245,1)');
    g.addColorStop(0.4, 'rgba(255,60,130,0.9)');
    g.addColorStop(1, 'rgba(160,0,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(pr.x - 13, pr.y - 13, 26, 26);
  }
}

// glowPass: true when called during the additive pass after the darkness.
function drawEffect(fx, glowPass = false) {
  const a = fx.t / fx.max;
  switch (fx.type) {
    case 'slash': {
      // crescent blade trail
      const sweep = fx.arc * Math.min(1, a * 2.5);
      const start = fx.ang - fx.arc / 2;
      const r0 = fx.range * 0.45, r1 = fx.range * 0.95;
      ctx.fillStyle = `rgba(255,240,210,${0.35 * (1 - a)})`;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y - 6, r1, start, start + sweep);
      ctx.arc(fx.x, fx.y - 6, r0, start + sweep, start, true);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - a)})`;
      ctx.lineWidth = 3 * (1 - a) + 1;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y - 6, r1 * 0.92, start + sweep * 0.15, start + sweep);
      ctx.stroke();
      break;
    }
    case 'nova': {
      const r = fx.radius * Math.min(1, a * 1.6);
      ctx.fillStyle = `rgba(140,210,255,${0.22 * (1 - a)})`;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(220,245,255,${0.95 * (1 - a)})`;
      ctx.lineWidth = 4;
      ctx.stroke();
      // ice shards bursting outward
      ctx.fillStyle = `rgba(200,235,255,${0.85 * (1 - a)})`;
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * TAU + fx.x * 0.01, rr = r * (0.75 + ((i * 37) % 10) / 40);
        const x = fx.x + Math.cos(ang) * rr, y = fx.y + Math.sin(ang) * rr * 0.9;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(ang) * 12, y + Math.sin(ang) * 12 - 8);
        ctx.lineTo(x + Math.cos(ang + 1.6) * 4, y + Math.sin(ang + 1.6) * 4);
        ctx.lineTo(x + Math.cos(ang - 1.6) * 4, y + Math.sin(ang - 1.6) * 4);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'explosion': {
      if (glowPass) { // bright fire core
        const r = fx.radius * (0.35 + a * 0.6);
        const g = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, r);
        g.addColorStop(0, `rgba(255,245,200,${0.95 * (1 - a)})`);
        g.addColorStop(0.45, `rgba(255,140,40,${0.75 * (1 - a)})`);
        g.addColorStop(1, 'rgba(140,30,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, TAU); ctx.fill();
      } else { // shockwave ring on the ground
        ctx.strokeStyle = `rgba(255,200,140,${0.6 * (1 - a)})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(fx.x, fx.y, fx.radius * (0.5 + a * 0.8), fx.radius * (0.4 + a * 0.6), 0, 0, TAU); ctx.stroke();
      }
      break;
    }
    case 'lightning': {
      const fade = 1 - a;
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? `rgba(255,255,255,${fade})` : `rgba(110,170,255,${0.8 * fade})`;
        ctx.lineWidth = pass ? 1.8 : 7;
        ctx.beginPath();
        for (let i = 0; i < fx.points.length - 1; i++) {
          const p0 = fx.points[i], p1 = fx.points[i + 1];
          ctx.moveTo(p0.x, p0.y);

          for (let s = 1; s <= 7; s++) {
            const tt = s / 7, j = s === 7 ? 0 : 10;
            const x = lerp(p0.x, p1.x, tt) + rand(-j, j), y = lerp(p0.y, p1.y, tt) + rand(-j, j);
            ctx.lineTo(x, y);
            if (pass && s % 3 === 0 && chance(0.6)) { // forks
              const fa = rand(0, TAU);
              ctx.moveTo(x, y);
              ctx.lineTo(x + Math.cos(fa) * rand(10, 22), y + Math.sin(fa) * rand(10, 22));
              ctx.moveTo(x, y);
            }

          }
        }
        ctx.stroke();
      }
      for (const pt of fx.points.slice(1)) { // impact flashes
        const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 22);
        g.addColorStop(0, `rgba(220,240,255,${0.8 * fade})`);
        g.addColorStop(1, 'rgba(120,170,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(pt.x - 22, pt.y - 22, 44, 44);
      }
      break;
    }
    case 'slam': {
      ctx.fillStyle = `rgba(255,40,20,${0.12 + a * 0.25})`;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.radius, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,60,30,0.85)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,90,40,0.35)';
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.radius * a, 0, TAU); ctx.fill();
      break;
    }
    case 'levelup': {
      const p = G.player;
      const g = ctx.createLinearGradient(p.x, p.y - 160, p.x, p.y);
      g.addColorStop(0, 'rgba(255,216,74,0)');
      g.addColorStop(1, `rgba(255,216,74,${0.55 * (1 - a)})`);
      ctx.fillStyle = g;
      ctx.fillRect(p.x - 22, p.y - 160, 44, 165);
      ctx.strokeStyle = `rgba(255,230,140,${1 - a})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 6 - a * 40, 30 + a * 20, 12 + a * 8, 0, 0, TAU);
      ctx.stroke();
      break;
    }
  }
}

// ---------------------------------------------------------------- Lighting

function drawLighting(d, th, camX, camY, inView) {
  const lw = lightCanvas.width, lh = lightCanvas.height;
  const s = ZOOM * LIGHT_SCALE;
  const dc = th.darkColor;
  lctx.globalCompositeOperation = 'source-over';
  lctx.clearRect(0, 0, lw, lh);
  lctx.fillStyle = `rgba(${dc[0]},${dc[1]},${dc[2]},${th.dark})`; // darkness tinted to the area
  lctx.fillRect(0, 0, lw, lh);
  lctx.globalCompositeOperation = 'destination-out';

  const light = (wx, wy, r, intensity) => {
    const x = (wx - camX) * s, y = (wy - camY) * s, rr = r * s;
    const g = lctx.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, `rgba(0,0,0,${intensity})`);
    g.addColorStop(0.6, `rgba(0,0,0,${intensity * 0.55})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = g;
    lctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  };

  const p = G.player;
  light(p.x, p.y, 340 + Math.sin(G.time * 3) * 6, 1);
  for (const t of d.torches) {
    if (inView(t.x, t.y, 200)) light(t.x, t.y, 175 + Math.sin(G.time * 9 + t.seed) * 10, 0.85);
  }
  for (const dc2 of d.decor) if (dc2.glow && inView(dc2.x, dc2.y, 100)) light(dc2.x, dc2.y, 80, 0.5);
  for (const pr of G.projectiles) light(pr.x, pr.y, pr.kind === 'fireball' ? 150 : 80, 0.85);
  for (const fx of G.effects) {
    if (fx.type === 'explosion') light(fx.x, fx.y, fx.radius * 3.2, 1 - fx.t / fx.max);
    if (fx.type === 'nova') light(fx.x, fx.y, fx.radius * 1.5, 0.7 * (1 - fx.t / fx.max));
    if (fx.type === 'lightning') for (const pt of fx.points) light(pt.x, pt.y, 170, 0.85 * (1 - fx.t / fx.max));
  }
  if (G.portal.active && inView(G.portal.x, G.portal.y, 200)) light(G.portal.x, G.portal.y, 190, 0.9);
  for (const l of G.loot) if (l.kind === 'item' && l.item.rarity !== 'common' && inView(l.x, l.y)) light(l.x, l.y, 70, 0.6);
  for (const ch of G.chests) if (inView(ch.x, ch.y)) light(ch.x, ch.y, ch.open ? 110 : 60, ch.open ? 0.8 : 0.35);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(lightCanvas, 0, 0, canvas.width, canvas.height);
}
