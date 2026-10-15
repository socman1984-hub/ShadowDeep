'use strict';
// Character art: layered "paper doll" humanoids with shading, outlines, walk cycles and visible gear.
// Every function takes the canvas context `c` so the same art draws in the world and in the gear preview.

const OUTLINE = 'rgba(12,8,6,0.85)';
const VIEW_FRONT = 0, VIEW_BACK = 1, VIEW_SIDE = 2;

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };
}

const shadeCache = new Map();
// Lighten (amt > 0) or darken (amt < 0) a #rrggbb color.
function shade(hex, amt) {
  const key = hex + amt;
  let v = shadeCache.get(key);
  if (v) return v;
  const n = parseInt(hex.slice(1, 7), 16);
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  const ch = x => Math.round((t - x) * p + x);
  v = `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  shadeCache.set(key, v);
  return v;
}

function cCircle(c, x, y, r, fill, outline = true) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fillStyle = fill;
  c.fill();
  if (outline) { c.strokeStyle = OUTLINE; c.lineWidth = 1.1; c.stroke(); }
}
function cEll(c, x, y, rx, ry, fill) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, TAU);
  c.fillStyle = fill;
  c.fill();
}
function cRRect(c, x, y, w, h, r, fill, outline = true) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
  if (outline) { c.strokeStyle = OUTLINE; c.lineWidth = 1.1; c.stroke(); }
}
function cLimb(c, x1, y1, x2, y2, w, color) {
  c.lineCap = 'round';
  c.strokeStyle = OUTLINE;
  c.lineWidth = w + 2;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  c.strokeStyle = color;
  c.lineWidth = w;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
}
function metalGrad(c, x0, y0, x1, y1, base) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, shade(base, 0.45));
  g.addColorStop(0.45, base);
  g.addColorStop(1, shade(base, -0.45));
  return g;
}

function viewFor(f) {
  const fx = Math.cos(f), fy = Math.sin(f);
  if (Math.abs(fy) > Math.abs(fx) * 0.75) return fy > 0 ? VIEW_FRONT : VIEW_BACK;
  return VIEW_SIDE;
}

// Tracks how far an actor moved since last frame to drive its walk cycle.
function trackWalk(a) {
  if (a.lx === undefined) { a.lx = a.x; a.ly = a.y; a.walk = 0; a.walkHold = 0; }
  const md = Math.hypot(a.x - a.lx, a.y - a.ly);
  a.walk += Math.min(md, 12) * 0.2;
  a.walkHold = md > 0.15 ? 0.15 : Math.max(0, a.walkHold - 0.016);
  a.lx = a.x;
  a.ly = a.y;
  return a.walkHold > 0;
}

// ---------------------------------------------------------------- Looks

const ARMOR_COLORS = { tunic: '#6a5a44', robe: '#38407a', leather: '#6e4a2a', chain: '#8d939c', plate: '#b6bdc6' };
const HELM_COLORS = { cap: '#6a4628', hood: '#2f3f6e', helm: '#9aa1aa', greathelm: '#a7aeb7', crown: '#e0b040' };
const rarityTint = it => (it && it.rarity !== 'common' ? RARITIES[it.rarity].color : null);

function weaponLook(it) {
  const r = it.rarity;
  return {
    type: itemType(it),
    glow: r === 'common' ? null : RARITIES[r].color,
    gem: r === 'common' ? '#7fd0ff' : RARITIES[r].color,
    blade: r === 'legendary' ? '#ffd9b0' : r === 'rare' ? '#e8e2c8' : null,
  };
}

// Builds the hero's appearance from equipped gear.
function playerLook(p) {
  const eq = p.equip;
  const at = eq.armor ? itemType(eq.armor) : 'tunic';
  const gt = eq.gloves && itemType(eq.gloves), bt = eq.boots && itemType(eq.boots);
  const helmType = eq.helm && itemType(eq.helm);
  return {
    scale: 1,
    skin: '#d9a877',
    hair: '#4a3020',
    torso: ARMOR_COLORS[at],
    armorType: at,
    robe: at === 'robe',
    sleeve: at === 'plate' || at === 'chain' ? '#7d848e' : null,
    legs: at === 'plate' ? '#8f96a0' : at === 'chain' ? '#5d6169' : '#4a3d30',
    boots: bt === 'plate' ? '#a3aab3' : bt ? '#5a3a22' : '#3d2c1e',
    hands: gt === 'plate' ? '#a3aab3' : gt ? '#6a4628' : null,
    helm: helmType ? { type: helmType, color: HELM_COLORS[helmType], trim: rarityTint(eq.helm) } : null,
    trim: rarityTint(eq.armor),
    cape: '#24345e',
    amulet: eq.amulet ? RARITIES[eq.amulet.rarity].color : null,
    weapon: eq.weapon ? weaponLook(eq.weapon) : null,
    offhand: eq.offhand ? { type: itemType(eq.offhand), rarity: eq.offhand.rarity } : null,
  };
}

const ENEMY_LOOKS = {
  skeleton: { scale: 0.95, bones: true, bone: '#d9d1b8', glowEyes: '#ff3a2a', weapon: { type: 'sword', blade: '#8a7058' } },
  zombie: {
    scale: 1.08, skin: '#86977a', hair: '#2a2a20', torso: '#4d4030', armorType: 'rags', legs: '#3a3228', boots: '#6f7f63',
    hunch: 1, armsOut: true, glowEyes: '#e8f070', mouth: 'open', belt: false,
  },
  cultist: {
    scale: 0.98, skin: '#c49a7a', torso: '#6e1616', armorType: 'robe', robe: true, helm: { type: 'hood', color: '#3d0c0c' },
    faceShadow: true, glowEyes: '#ff6a3a', weapon: { type: 'staff', gem: '#ff4a7a' },
  },
  brute: {
    scale: 1.85, bulk: 1.25, skin: '#8a4a3a', torso: '#4a4a52', armorType: 'plate', legs: '#3a2a22', boots: '#2a2a2e',
    helm: { type: 'horned', color: '#3a3a40' }, glowEyes: '#ffcc33', weapon: { type: 'cleaver' }, hands: '#2a2a2e', beard: '#2a1a12', belt: '#2a1a10',
  },
};

function enemyLook(e) {
  if (e.look) return e.look;
  const base = ENEMY_LOOKS[e.type] || {};
  e.look = e.elite ? { ...base, scale: (base.scale || 1) * 1.15, trim: '#7ea2ff' } : base;
  return e.look;
}

// ---------------------------------------------------------------- Body parts (local space: feet at 0,0; facing right in side view)

function drawCape(c, view, SH, sw, color) {
  c.beginPath();
  if (view === VIEW_BACK) {
    c.moveTo(-8.5, SH);
    c.lineTo(8.5, SH);
    c.lineTo(10.5, -3 + sw);
    c.quadraticCurveTo(0, 0, -10.5, -3 - sw);
  } else if (view === VIEW_FRONT) {
    c.moveTo(-8, SH + 1);
    c.lineTo(8, SH + 1);
    c.lineTo(10, -5);
    c.lineTo(-10, -5);
  } else {
    c.moveTo(-3, SH);
    c.lineTo(2, SH);
    c.lineTo(-6 - Math.abs(sw) * 3, -3);
    c.lineTo(-10 - Math.abs(sw) * 4, -5);
  }
  c.closePath();
  const g = c.createLinearGradient(-10, SH, 10, 0);
  g.addColorStop(0, shade(color, 0.15));
  g.addColorStop(1, shade(color, view === VIEW_BACK ? -0.35 : -0.55));
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = OUTLINE;
  c.lineWidth = 1.1;
  c.stroke();
}

function drawLegs(c, L, view, sw, ph, HIP) {
  if (L.bones) {
    const bone = L.bone;
    if (view === VIEW_SIDE) {
      for (const k of [-1, 1]) {
        const fx = sw * 6 * k, lift = Math.max(0, Math.cos(ph) * k) * 2;
        cLimb(c, 0, HIP, fx * 0.5 + 1.5, HIP / 2 - lift, 2.2, k < 0 ? shade(bone, -0.25) : bone);
        cLimb(c, fx * 0.5 + 1.5, HIP / 2 - lift, fx, -1 - lift, 2.2, k < 0 ? shade(bone, -0.25) : bone);
        cEll(c, fx + 1.5, -1 - lift, 3, 1.4, bone);
      }
    } else {
      for (const k of [-1, 1]) {
        const lift = Math.max(0, sw * k) * 2.5;
        cLimb(c, k * 3, HIP, k * 3.6, -1 - lift, 2.2, bone);
        cCircle(c, k * 3.4, HIP / 2 - lift / 2, 1.6, bone, false);
      }
    }
    return;
  }
  if (view === VIEW_SIDE) {
    for (const k of [-1, 1]) { // far leg first
      const fx = sw * 6 * k, lift = Math.max(0, Math.cos(ph) * k) * 2.2;
      const legC = k < 0 ? shade(L.legs, -0.3) : L.legs;
      const kx = fx * 0.5 + 2, ky = HIP / 2 - lift;
      cLimb(c, 0, HIP, kx, ky, 5, legC);
      cLimb(c, kx, ky, fx, -3 - lift, 4.6, legC);
      cRRect(c, fx - 2.5, -5 - lift, 7.5, 5, 2, k < 0 ? shade(L.boots, -0.3) : L.boots);
    }
  } else {
    for (const k of [-1, 1]) {
      const lift = Math.max(0, sw * k) * 2.5;
      cLimb(c, k * 3.7, HIP, k * 3.8, -4 - lift, 5.2, L.legs);
      cRRect(c, k * 3.8 - 3.3, -5.5 - lift, 6.6, 5.8, 2, L.boots);
    }
  }
}

function torsoPath(c, L, view, top, bot, sw) {
  const side = view === VIEW_SIDE;
  const hw = side ? 6 : 8.5, hwb = side ? 5 : 7;
  c.beginPath();
  c.moveTo(-hw, top + 4);
  c.quadraticCurveTo(-hw, top, -hw + 4, top);
  c.lineTo(hw - 4, top);
  c.quadraticCurveTo(hw, top, hw, top + 4);
  if (L.robe) {
    c.lineTo(hwb + 4, -1);
    c.quadraticCurveTo(0, 1.5 + sw, -hwb - 4, -1);
  } else {
    c.lineTo(hwb, bot);
    c.lineTo(-hwb, bot);
  }
  c.closePath();
  return { hw, hwb };
}

function drawTorso(c, L, view, SH, HIP, sw) {
  const top = SH - 1, bot = HIP + 1;
  if (L.bones) {
    const bone = L.bone;
    cLimb(c, 0, HIP, 0, SH + 2, 2, shade(bone, -0.15));
    c.strokeStyle = bone;
    c.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      const y = SH + 3.5 + i * 3, w = 5.5 - i * 0.6;
      c.beginPath();
      if (view === VIEW_SIDE) { c.moveTo(0, y); c.quadraticCurveTo(w + 1, y + 1, w - 1, y + 3); }
      else { c.moveTo(-w, y); c.quadraticCurveTo(0, y + 2.5, w, y); }
      c.stroke();
    }
    cLimb(c, -7, SH + 1, 7, SH + 1, 1.8, bone);
    cRRect(c, -4.5, HIP - 2, 9, 4, 2, shade(bone, -0.1));
    return;
  }
  const { hw, hwb } = torsoPath(c, L, view, top, bot, sw);
  const g = c.createLinearGradient(-hw, top, hw, bot);
  g.addColorStop(0, shade(L.torso, 0.22));
  g.addColorStop(0.5, L.torso);
  g.addColorStop(1, shade(L.torso, -0.4));
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = OUTLINE;
  c.lineWidth = 1.2;
  c.stroke();

  c.save();
  c.clip();
  const dark = 'rgba(0,0,0,0.28)';
  switch (L.armorType) {
    case 'plate':
      cEll(c, -2.5, top + 5, 3.5, 2.2, 'rgba(255,255,255,0.3)');
      c.strokeStyle = dark;
      c.lineWidth = 1;
      c.beginPath();
      for (const y of [top + 9.5, top + 12.5]) { c.moveTo(-hw, y); c.lineTo(hw, y); }
      if (view === VIEW_FRONT) { c.moveTo(0, top + 1); c.lineTo(0, top + 8); }
      c.stroke();
      break;
    case 'chain':
      c.strokeStyle = 'rgba(0,0,0,0.22)';
      c.lineWidth = 0.7;
      c.beginPath();
      for (let y = top + 2; y < bot; y += 2.2) for (let x = -hw; x < hw; x += 2.4) {
        c.moveTo(x + 1.1, y); c.arc(x, y, 1.1, 0, Math.PI);
      }
      c.stroke();
      break;
    case 'leather':
      c.strokeStyle = dark;
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(-hw, top + 1); c.lineTo(hw, bot - 3); c.stroke();
      c.setLineDash([1.2, 1.4]);
      c.lineWidth = 0.8;
      c.strokeStyle = 'rgba(255,230,190,0.35)';
      c.beginPath(); c.moveTo(0, top + 2); c.lineTo(0, bot); c.stroke();
      c.setLineDash([]);
      break;
    case 'robe':
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(-hw, HIP - 4, hw * 2, 3.5);
      c.strokeStyle = dark;
      c.lineWidth = 0.9;
      c.beginPath();
      for (const x of [-4, 0, 4]) { c.moveTo(x, HIP); c.lineTo(x * 1.4, -1); }
      c.stroke();
      if (view === VIEW_FRONT) {
        c.strokeStyle = shade(L.torso, 0.35);
        c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(-3, top); c.lineTo(0, top + 5); c.lineTo(3, top); c.stroke();
      }
      break;
    case 'rags':
      c.fillStyle = 'rgba(0,0,0,0.35)';
      for (const [x, y, r] of [[-3, top + 6, 1.6], [3, top + 10, 1.2], [-1, bot - 3, 1.3]]) cEll(c, x, y, r, r * 0.8, c.fillStyle);
      c.fillStyle = '#86977a';
      cEll(c, 2.5, top + 5.5, 1.7, 1.2, 'rgba(134,151,122,0.9)');
      break;
    default: // tunic
      if (view === VIEW_FRONT) {
        c.strokeStyle = shade(L.torso, -0.45);
        c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(-3.5, top); c.lineTo(0, top + 5); c.lineTo(3.5, top); c.stroke();
      }
  }
  c.restore();

  if (L.trim) {
    torsoPath(c, L, view, top, bot, sw);
    c.strokeStyle = L.trim;
    c.lineWidth = 1.3;
    c.stroke();
  }
  if (!L.robe && L.belt !== false) {
    cRRect(c, -hwb - 0.6, HIP - 3, (hwb + 0.6) * 2, 3.2, 1, L.belt || '#3a2616');
    if (view === VIEW_FRONT) cRRect(c, -1.4, HIP - 3.1, 2.8, 3.4, 0.6, '#c9a64a');
  }
  if (L.armorType === 'plate' && view !== VIEW_SIDE) { // pauldrons
    for (const k of [-1, 1]) {
      const g2 = c.createRadialGradient(k * hw - 1, top, 0.5, k * hw, top + 2, 5);
      g2.addColorStop(0, shade(L.torso, 0.5));
      g2.addColorStop(1, shade(L.torso, -0.3));
      cCircle(c, k * hw, top + 2, 4.3, g2);
    }
  } else if (L.armorType === 'plate') {
    cCircle(c, 0, top + 2, 4.3, shade(L.torso, 0.1));
  }
  if (L.amulet && view === VIEW_FRONT) {
    c.strokeStyle = '#c9a64a';
    c.lineWidth = 0.7;
    c.beginPath(); c.arc(0, top - 1, 3.5, 0.3, Math.PI - 0.3); c.stroke();
    cCircle(c, 0, top + 3, 1.5, L.amulet);
  }
}

function drawArm(c, L, which, SH, sw, view) {
  const k = which === 'left' ? (view === VIEW_FRONT ? 1 : -1) : which === 'right' ? (view === VIEW_FRONT ? -1 : 1) : 0;
  const far = which === 'far';
  let sx, sy = SH + 2, hx, hy;
  if (view === VIEW_SIDE) {
    sx = far ? -0.5 : 0.5;
    if (L.armsOut) { hx = far ? 12 : 14; hy = SH + 4 + (far ? sw : -sw); }
    else { hx = (far ? -sw : sw) * 6; hy = SH + 14; }
  } else {
    sx = k * 8.3;
    if (L.armsOut) { hx = k * 5.5; hy = SH + 8 + sw * k; }
    else { hx = k * 10; hy = SH + 14 + sw * 1.5 * k; }
  }
  const ex = (sx + hx) / 2 + (view === VIEW_SIDE ? -1 : k * 1.2), ey = (sy + hy) / 2;
  if (L.bones) {
    const b = far ? shade(L.bone, -0.25) : L.bone;
    cLimb(c, sx, sy, ex, ey, 1.9, b);
    cLimb(c, ex, ey, hx, hy, 1.7, b);
    cCircle(c, hx, hy, 1.5, b, false);
    return;
  }
  const dim = far ? -0.3 : 0;
  const sleeve = L.sleeve || shade(L.torso, -0.1);
  const fore = L.hands || L.skin;
  cLimb(c, sx, sy, ex, ey, 4.2, dim ? shade(sleeve.startsWith('#') ? sleeve : L.torso, dim) : sleeve);
  cLimb(c, ex, ey, hx, hy, 3.6, dim ? shade(fore, dim) : fore);
  cCircle(c, hx, hy, 2.4, dim ? shade(fore, dim) : fore);
}

function drawHead(c, L, view, hx, HEAD) {
  const side = view === VIEW_SIDE, front = view === VIEW_FRONT;
  const helm = L.helm && L.helm.type;
  const skin = L.skin;

  if (L.bones) {
    const b = L.bone;
    const g = c.createRadialGradient(hx - 2, HEAD - 3, 1, hx, HEAD, 7);
    g.addColorStop(0, shade(b, 0.3)); g.addColorStop(1, shade(b, -0.25));
    cCircle(c, hx, HEAD, 6.3, g);
    cRRect(c, hx - 3.5 + (side ? 2 : 0), HEAD + 3, 7, 3.6, 1.5, shade(b, -0.12));
    if (view !== VIEW_BACK) {
      const eyes = side ? [hx + 3.2] : [hx - 2.4, hx + 2.4];
      for (const ex of eyes) {
        cEll(c, ex, HEAD - 0.3, 1.7, 2, '#0b0806');
        cCircle(c, ex, HEAD - 0.1, 0.8, L.glowEyes, false);
      }
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.lineWidth = 0.6;
      c.beginPath();
      for (let i = -2; i <= 2; i++) { c.moveTo(hx + i * 1.2 + (side ? 2 : 0), HEAD + 3.6); c.lineTo(hx + i * 1.2 + (side ? 2 : 0), HEAD + 6); }
      c.stroke();
    }
    return;
  }

  cLimb(c, hx * 0.5, HEAD + 4, hx * 0.5, HEAD + 8, 3.6, shade(skin, -0.2));

  // Hoods and great helms enclose the head, so they are drawn as the head shape itself.
  if (helm === 'hood') {
    const hc = L.helm.color;
    const g = c.createRadialGradient(hx - 2, HEAD - 4, 1, hx, HEAD, 10);
    g.addColorStop(0, shade(hc, 0.25)); g.addColorStop(1, shade(hc, -0.4));
    c.beginPath();
    c.moveTo(hx - 9, HEAD + 6);
    c.quadraticCurveTo(hx - 10, HEAD - 9, hx + (side ? -3 : 0), HEAD - 11);
    c.quadraticCurveTo(hx + 10, HEAD - 9, hx + 9, HEAD + 6);
    c.closePath();
    c.fillStyle = g; c.fill(); c.strokeStyle = OUTLINE; c.lineWidth = 1.1; c.stroke();
    if (view !== VIEW_BACK) {
      const fx = side ? hx + 3.5 : hx;
      cEll(c, fx, HEAD + 1, side ? 3.4 : 5, 5.6, L.faceShadow ? '#120404' : skin);
      cEll(c, fx, HEAD - 2.5, side ? 3.4 : 5, 2.6, 'rgba(0,0,0,0.45)');
      drawFace(c, L, view, fx, HEAD + 1);
    }
    return;
  }
  if (helm === 'greathelm') {
    const hc = L.helm.color;
    cRRect(c, hx - 7.5, HEAD - 8, 15, 15.5, 3.5, metalGrad(c, hx - 7, HEAD - 8, hx + 7, HEAD + 7, hc));
    if (view !== VIEW_BACK) {
      const ex = side ? hx + 1 : hx - 5;
      c.fillStyle = '#0a0806';
      c.fillRect(ex, HEAD - 2, side ? 6.5 : 10, 1.8);
      if (!side) c.fillRect(hx - 0.8, HEAD - 1, 1.6, 5);
      if (L.glowEyes) cCircle(c, hx + (side ? 4 : 2.5), HEAD - 1.1, 0.7, L.glowEyes, false);
    }
    cRRect(c, hx - 1.5, HEAD - 10, 3, 4, 1, L.helm.trim || '#8a2020');
    return;
  }

  const g = c.createRadialGradient(hx - 2, HEAD - 3, 1, hx, HEAD, 8);
  g.addColorStop(0, shade(skin, 0.18)); g.addColorStop(0.6, skin); g.addColorStop(1, shade(skin, -0.32));
  cCircle(c, hx, HEAD, 7, g);

  // Hair (hidden under full helms)
  if (L.hair && helm !== 'helm' && helm !== 'horned') {
    c.fillStyle = L.hair;
    c.beginPath();
    if (view === VIEW_BACK) c.arc(hx, HEAD - 0.5, 7.4, 0, TAU);
    else if (side) { c.arc(hx, HEAD - 0.5, 7.4, Math.PI * 0.45, Math.PI * 1.75); c.lineTo(hx + 2, HEAD - 3); }
    else { c.arc(hx, HEAD - 0.5, 7.4, Math.PI, 0); c.quadraticCurveTo(hx + 4, HEAD - 5, hx, HEAD - 3.5); c.quadraticCurveTo(hx - 4, HEAD - 5, hx - 7.4, HEAD - 0.5); }
    c.fill();
    c.strokeStyle = OUTLINE; c.lineWidth = 0.9; c.stroke();
  }

  if (view !== VIEW_BACK) drawFace(c, L, view, side ? hx + 3.4 : hx, HEAD);
  if (L.beard && view !== VIEW_BACK) {
    c.fillStyle = L.beard;
    c.beginPath();
    const bx = side ? hx + 3 : hx;
    c.moveTo(bx - 5, HEAD + 2); c.quadraticCurveTo(bx, HEAD + 11, bx + 5, HEAD + 2); c.quadraticCurveTo(bx, HEAD + 5, bx - 5, HEAD + 2);
    c.fill();
  }

  if (helm === 'cap') {
    const hc = L.helm.color;
    c.beginPath(); c.arc(hx, HEAD - 1, 7.7, Math.PI, 0); c.closePath();
    c.fillStyle = metalGrad(c, hx - 7, HEAD - 8, hx + 7, HEAD, hc); c.fill(); c.strokeStyle = OUTLINE; c.lineWidth = 1; c.stroke();
    cRRect(c, hx - 8.2 + (side ? 2 : 0), HEAD - 2, 16.4, 2.2, 1, L.helm.trim || shade(hc, -0.3));
  } else if (helm === 'helm' || helm === 'horned') {
    const hc = L.helm.color;
    if (helm === 'horned') {
      for (const k of [-1, 1]) {
        c.beginPath();
        c.moveTo(hx + k * 5, HEAD - 4);
        c.quadraticCurveTo(hx + k * 15, HEAD - 6, hx + k * 13, HEAD - 16);
        c.quadraticCurveTo(hx + k * 10, HEAD - 8, hx + k * 3, HEAD - 6.5);
        c.closePath();
        c.fillStyle = '#d8c8a8'; c.fill(); c.strokeStyle = OUTLINE; c.lineWidth = 0.9; c.stroke();
      }
    }
    c.beginPath(); c.arc(hx, HEAD - 0.5, 8, Math.PI, 0); c.closePath();
    c.fillStyle = metalGrad(c, hx - 8, HEAD - 8, hx + 8, HEAD, hc); c.fill(); c.strokeStyle = OUTLINE; c.lineWidth = 1; c.stroke();
    cRRect(c, hx - 8.3, HEAD - 1.8, 16.6, 2.4, 1, L.helm.trim || shade(hc, -0.25));
    if (view === VIEW_FRONT) cRRect(c, hx - 0.8, HEAD - 1, 1.6, 5, 0.5, shade(hc, -0.1));
    if (side) cRRect(c, hx - 4, HEAD - 1, 3, 6, 1, shade(hc, -0.15));
  } else if (helm === 'crown') {
    const gold = '#e0b040';
    c.beginPath();
    c.moveTo(hx - 6, HEAD - 4);
    for (let i = 0; i <= 4; i++) { const x = hx - 6 + i * 3; c.lineTo(x, HEAD - (i % 2 ? 7 : 10)); }
    c.lineTo(hx + 6, HEAD - 4);
    c.closePath();
    c.fillStyle = metalGrad(c, hx - 6, HEAD - 10, hx + 6, HEAD - 4, gold); c.fill(); c.strokeStyle = OUTLINE; c.lineWidth = 0.8; c.stroke();
    cCircle(c, hx, HEAD - 5.5, 1.2, L.helm.trim || '#d0303a', false);
  }
}

function drawFace(c, L, view, fx, fy) {
  const side = view === VIEW_SIDE;
  const eyes = side ? [fx + 1] : [fx - 2.6, fx + 2.6];
  for (const ex of eyes) {
    if (L.glowEyes) {
      c.globalCompositeOperation = 'lighter';
      cCircle(c, ex, fy, 1.8, L.glowEyes + '66', false);
      c.globalCompositeOperation = 'source-over';
      cCircle(c, ex, fy, 0.9, L.glowEyes, false);
    } else {
      cEll(c, ex, fy + 0.2, 1.4, 1.15, '#f4efe6');
      cCircle(c, ex + (side ? 0.4 : 0), fy + 0.35, 0.75, '#2a1a10', false);
    }
  }
  if (L.faceShadow) return;
  // brows, nose and mouth
  c.strokeStyle = shade(L.hair || L.skin, -0.3);
  c.lineWidth = 0.8;
  c.beginPath();
  for (const ex of eyes) { c.moveTo(ex - 1.5, fy - 1.9); c.lineTo(ex + 1.5, fy - 2.1); }
  c.stroke();
  c.strokeStyle = shade(L.skin, -0.4);
  c.lineWidth = 0.8;
  c.beginPath();
  if (side) { c.moveTo(fx + 2.6, fy); c.lineTo(fx + 4, fy + 1.8); c.lineTo(fx + 2.6, fy + 2.1); }
  else { c.moveTo(fx, fy + 0.8); c.lineTo(fx + 0.5, fy + 2.5); }
  c.stroke();
  if (L.mouth === 'open') cEll(c, fx + (side ? 1.5 : 0), fy + 4, side ? 1.2 : 2, 1.4, '#2a0a0a');
  else {
    c.beginPath();
    c.moveTo(fx - (side ? 0 : 1.5), fy + 4); c.lineTo(fx + 1.5, fy + 4);
    c.stroke();
  }
}

function drawOffhand(c, L, view, SH) {
  const o = L.offhand;
  if (!o) return;
  const shield = o.type === 'buckler' || o.type === 'kite' || o.type === 'tower';
  if (!shield && view === VIEW_BACK) return;
  const pos = view === VIEW_FRONT ? [10.5, SH + 12] : view === VIEW_BACK ? [0, SH + 9] : [6.5, SH + 11];
  const face = { common: '#6b4a2a', magic: '#2f4f9a', rare: '#7a5a12', legendary: '#8a2a0a' }[o.rarity];
  const rim = o.rarity === 'common' ? '#9aa1aa' : RARITIES[o.rarity].color;
  c.save();
  c.translate(pos[0], pos[1]);
  if (view === VIEW_SIDE && shield) c.scale(0.45, 1);
  if (o.type === 'buckler') {
    const g = c.createRadialGradient(-1.5, -1.5, 0.5, 0, 0, 6);
    g.addColorStop(0, shade(face, 0.3)); g.addColorStop(1, shade(face, -0.3));
    cCircle(c, 0, 0, 5.8, g);
    c.strokeStyle = rim; c.lineWidth = 1.3; c.beginPath(); c.arc(0, 0, 5.2, 0, TAU); c.stroke();
    cCircle(c, 0, 0, 1.8, '#c0c6cf');
  } else if (o.type === 'kite' || o.type === 'tower') {
    c.beginPath();
    if (o.type === 'kite') { c.moveTo(0, -8); c.quadraticCurveTo(6, -7, 6, -3); c.quadraticCurveTo(5, 5, 0, 10); c.quadraticCurveTo(-5, 5, -6, -3); c.quadraticCurveTo(-6, -7, 0, -8); }
    else c.roundRect(-6, -9, 12, 18, 2);
    const g = c.createLinearGradient(-6, -9, 6, 9);
    g.addColorStop(0, shade(face, 0.3)); g.addColorStop(1, shade(face, -0.35));
    c.fillStyle = g; c.fill();
    c.strokeStyle = rim; c.lineWidth = 1.6; c.stroke();
    c.strokeStyle = shade(rim, -0.1); c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, -6); c.lineTo(0, 7); c.moveTo(-4, -2); c.lineTo(4, -2); c.stroke();
  } else if (o.type === 'orb') {
    const col = o.rarity === 'common' ? '#8fd8ff' : rim;
    const by = Math.sin(G.time * 3) * 1.5 - 3;
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(0, by, 0, 0, by, 9);
    g.addColorStop(0, col + 'aa'); g.addColorStop(1, col + '00');
    c.fillStyle = g; c.fillRect(-9, by - 9, 18, 18);
    c.globalCompositeOperation = 'source-over';
    cCircle(c, 0, by, 3.2, col);
    cCircle(c, -1, by - 1, 1, 'rgba(255,255,255,0.8)', false);
  } else if (o.type === 'tome') {
    cRRect(c, -3.5, -4.5, 7, 9, 1, '#5a1a1a');
    c.strokeStyle = rim === '#9aa1aa' ? '#c9a64a' : rim; c.lineWidth = 0.8;
    c.strokeRect(-2.5, -3.5, 5, 7);
  }
  c.restore();
}

// ---------------------------------------------------------------- Weapons (world space, grip at hand, pointing along ang)

function drawWeapon(c, hx, hy, ang, W, s = 1) {
  if (!W) return;
  c.save();
  c.translate(hx, hy);
  c.rotate(ang);
  c.scale(s, s);
  let len = 22;
  switch (W.type) {
    case 'sword':
    case 'dagger': {
      len = W.type === 'sword' ? 24 : 13;
      cRRect(c, -5, -1.3, 6, 2.6, 1, '#4a2f1a');
      cCircle(c, -5.6, 0, 1.8, '#c9a64a');
      const g = c.createLinearGradient(0, -2, 0, 2);
      g.addColorStop(0, '#f6f8fa'); g.addColorStop(0.5, W.blade || '#c3cad3'); g.addColorStop(1, '#6d7580');
      c.beginPath();
      c.moveTo(2.6, -2); c.lineTo(len, -1.5); c.lineTo(len + 4, 0); c.lineTo(len, 1.5); c.lineTo(2.6, 2);
      c.closePath();
      c.fillStyle = g; c.fill(); c.strokeStyle = OUTLINE; c.lineWidth = 0.9; c.stroke();
      c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.6;
      c.beginPath(); c.moveTo(4, 0); c.lineTo(len - 2, 0); c.stroke();
      cRRect(c, 0.6, -5, 2.2, 10, 1, '#c9a64a');
      break;
    }
    case 'axe': {
      len = 24;
      cRRect(c, -6, -1.4, 31, 2.8, 1, '#5a3a1e');
      c.beginPath();
      c.moveTo(18, -1.2); c.lineTo(16, -8); c.quadraticCurveTo(23, -12.5, 27.5, -8.5); c.lineTo(24, -1.2);
      c.closePath();
      c.fillStyle = metalGrad(c, 16, -12, 26, -1, W.blade || '#aeb5be'); c.fill(); c.strokeStyle = OUTLINE; c.lineWidth = 0.9; c.stroke();
      cRRect(c, 18, 1, 4, 3, 1, '#8a9099');
      break;
    }
    case 'mace': {
      len = 22;
      cRRect(c, -6, -1.3, 24, 2.6, 1, '#5a3a1e');
      c.fillStyle = '#7d848e';
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6;
        c.beginPath();
        c.moveTo(21 + Math.cos(a) * 3, Math.sin(a) * 3);
        c.lineTo(21 + Math.cos(a + 0.3) * 7, Math.sin(a + 0.3) * 7);
        c.lineTo(21 + Math.cos(a + 0.6) * 3, Math.sin(a + 0.6) * 3);
        c.fill();
      }
      const g = c.createRadialGradient(19.5, -1.5, 0.5, 21, 0, 5);
      g.addColorStop(0, '#eef1f4'); g.addColorStop(1, W.blade ? shade('#9aa1aa', -0.1) : '#5d646d');
      cCircle(c, 21, 0, 4.6, g);
      break;
    }
    case 'staff': {
      len = 32;
      cRRect(c, -14, -1.2, 45, 2.4, 1, '#5a3a1e');
      c.strokeStyle = '#3a2412'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(29, -1); c.lineTo(33, -4); c.moveTo(29, 1); c.lineTo(33, 4); c.stroke();
      const gem = W.gem || '#7fd0ff';
      c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(33, 0, 0, 33, 0, 11);
      g.addColorStop(0, gem + 'cc'); g.addColorStop(1, gem + '00');
      c.fillStyle = g; c.fillRect(22, -11, 22, 22);
      c.globalCompositeOperation = 'source-over';
      cCircle(c, 33, 0, 3, gem);
      cCircle(c, 32.2, -0.8, 0.9, 'rgba(255,255,255,0.85)', false);
      break;
    }
    case 'cleaver': {
      len = 34;
      cRRect(c, -8, -1.8, 14, 3.6, 1, '#3a2414');
      cRRect(c, 5, -8, 30, 12, 2, metalGrad(c, 5, -8, 35, 4, '#8a8d92'));
      c.fillStyle = 'rgba(120,10,10,0.55)';
      c.fillRect(20, -8, 9, 3);
      break;
    }
  }
  if (W.glow) {
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = W.glow + '50';
    c.lineWidth = 6;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(3, 0); c.lineTo(len, 0); c.stroke();
    c.globalCompositeOperation = 'source-over';
  }
  c.restore();
}

// ---------------------------------------------------------------- Full figures

// st: { facing, walk, moving, wAng, seed, view? }
function drawHumanoid(c, x, y, L, st) {
  const view = st.view ?? viewFor(st.facing);
  const side = view === VIEW_SIDE;
  const flip = side && Math.cos(st.facing) < 0 ? -1 : 1;
  const s = L.scale || 1, bulk = L.bulk || 1;
  const ph = st.walk || 0;
  const sw = st.moving ? Math.sin(ph) : 0;
  const bob = st.moving ? -Math.abs(Math.cos(ph)) * 1.3 : Math.sin(G.time * 2 + (st.seed || 0)) * 0.35;
  const hunch = L.hunch || 0;
  const HIP = -15, SH = -31 + bob + hunch * 2, HEAD = -39 + bob + hunch * 3.5;
  const hx = side ? 1 + hunch * 4 : 0;

  // Weapon arm is drawn in world space so attacks line up with the real aim direction.
  const wAng = st.wAng ?? st.facing + 0.8;
  const weaponBehind = L.weapon && Math.sin(wAng) < -0.15;
  if (L.weapon && weaponBehind) drawWeaponArm(c, x, y, L, view, flip, wAng, s, bulk, SH);

  c.save();
  c.translate(x, y);
  c.scale(s * flip * bulk, s);
  if (L.cape && view !== VIEW_BACK) drawCape(c, view, SH, sw, L.cape);
  if (side) drawArm(c, L, 'far', SH, sw, view);
  if (!L.robe) drawLegs(c, L, view, sw, ph, HIP);
  drawTorso(c, L, view, SH, HIP, sw);
  if (L.cape && view === VIEW_BACK) drawCape(c, view, SH, sw, L.cape);
  if (!side) {
    drawArm(c, L, 'left', SH, sw, view);
    if (!L.weapon) drawArm(c, L, 'right', SH, sw, view);
  } else if (!L.weapon) drawArm(c, L, 'near', SH, sw, view);
  if (view === VIEW_BACK) drawOffhand(c, L, view, SH);
  drawHead(c, L, view, hx, HEAD);
  if (view !== VIEW_BACK) drawOffhand(c, L, view, SH);
  c.restore();

  if (L.weapon && !weaponBehind) drawWeaponArm(c, x, y, L, view, flip, wAng, s, bulk, SH);
}

function drawWeaponArm(c, x, y, L, view, flip, wAng, s, bulk, SH) {
  const sx = (view === VIEW_FRONT ? -8.3 * bulk : view === VIEW_BACK ? 8.3 * bulk : 0.5 * flip) * s;
  const shx = x + sx, shy = y + (SH + 2) * s;
  const hx = shx + Math.cos(wAng) * 9 * s, hy = shy + (Math.sin(wAng) * 6 + 7) * s;
  const ex = (shx + hx) / 2, ey = (shy + hy) / 2 + 1.5 * s;
  drawWeapon(c, hx, hy, wAng, L.weapon, s);
  if (L.bones) {
    cLimb(c, shx, shy, ex, ey, 1.9 * s, L.bone);
    cLimb(c, ex, ey, hx, hy, 1.7 * s, L.bone);
    cCircle(c, hx, hy, 1.5 * s, L.bone, false);
    return;
  }
  const sleeve = L.sleeve || shade(L.torso, -0.1);
  const fore = L.hands || L.skin;
  cLimb(c, shx, shy, ex, ey, 4.2 * s, sleeve);
  cLimb(c, ex, ey, hx, hy, 3.6 * s, fore);
  cCircle(c, hx, hy, 2.4 * s, fore);
}

function drawBat(c, x, y, L, st) {
  const t = G.time + (st.seed || 0);
  const s = L.scale || 1;
  const flap = Math.sin(t * 20);
  const by = y - 16 + Math.sin(t * 3) * 3;
  for (const k of [-1, 1]) {
    c.save();
    c.translate(x, by);
    c.scale(k * s, s);
    c.beginPath();
    c.moveTo(2, -1);
    c.quadraticCurveTo(10, -10 - flap * 6, 21, -6 - flap * 8);
    c.quadraticCurveTo(18, -1 - flap * 3, 15.5, 1 - flap * 2);
    c.quadraticCurveTo(12.5, -1 - flap, 9.5, 3 - flap);
    c.quadraticCurveTo(6, 1, 2, 4);
    c.closePath();
    const g = c.createLinearGradient(0, -8, 18, 4);
    g.addColorStop(0, '#5a2a4e'); g.addColorStop(1, '#22101e');
    c.fillStyle = g; c.fill(); c.strokeStyle = OUTLINE; c.lineWidth = 1; c.stroke();
    c.strokeStyle = 'rgba(160,110,140,0.5)'; c.lineWidth = 0.7;
    c.beginPath();
    c.moveTo(3, 0); c.lineTo(21, -6 - flap * 8);
    c.moveTo(3, 0); c.lineTo(15.5, 1 - flap * 2);
    c.moveTo(3, 0); c.lineTo(9.5, 3 - flap);
    c.stroke();
    c.restore();
  }
  const g = c.createRadialGradient(x - 2, by - 3, 1, x, by, 8);
  g.addColorStop(0, '#7a4a6e'); g.addColorStop(1, '#2e1328');
  c.save(); c.translate(x, by); c.scale(s, s);
  for (const k of [-1, 1]) {
    c.beginPath(); c.moveTo(k * 2, -4); c.lineTo(k * 4.5, -10); c.lineTo(k * 5, -3); c.fillStyle = '#3e1a36'; c.fill();
  }
  cEll(c, 0, 0, 6, 7, g);
  c.globalCompositeOperation = 'lighter';
  cCircle(c, -2.2, -1.5, 1.8, '#ff2a2a88', false);
  cCircle(c, 2.2, -1.5, 1.8, '#ff2a2a88', false);
  c.globalCompositeOperation = 'source-over';
  cCircle(c, -2.2, -1.5, 0.9, '#ff5a4a', false);
  cCircle(c, 2.2, -1.5, 0.9, '#ff5a4a', false);
  c.fillStyle = '#fff';
  c.fillRect(-1.5, 2, 0.8, 1.6);
  c.fillRect(0.7, 2, 0.8, 1.6);
  c.restore();
}
