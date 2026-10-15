'use strict';
// Core game state, combat, progression, loot and the main loop.

const SAVE_KEY = 'shadowdeep_save_v1';

const G = {
  state: 'title', // title | play | paused | dead
  player: null,
  dungeon: null,
  enemies: [],
  projectiles: [],
  effects: [],
  particles: [],
  texts: [],
  loot: [],
  chests: [],
  corpses: [],
  portal: null,
  flow: null,
  flowT: 0,
  seenT: 0,
  saveT: 20,
  time: 0,
  cam: { x: 0, y: 0, shake: 0 },
  autoTarget: null,
  msgT: 0,
  modal: false, // a pop-up (tutorial, update prompt) is open and the game is paused
};

// ---------------------------------------------------------------- Player

function newPlayer() {
  const skills = {};
  for (const id of SKILL_ORDER) skills[id] = { lvl: 1, xp: 0 };
  const p = {
    x: 0, y: 0, r: 15, facing: 0,
    level: 1, xp: 0, points: 0,
    attrs: { str: 5, int: 5, vit: 5 },
    hp: 1, mp: 1, gold: 0, potions: 3,
    floor: 1, maxFloor: 1,
    skills,
    equip: emptyEquip(),
    bag: [],
    mats: { scrap: 0, dust: 0, shard: 0 },
    upgrades: {},
  };
  p.equip.weapon = starterWeapon();
  initRuntime(p);
  recalcStats(p);
  p.hp = p.stats.maxHp;
  p.mp = p.stats.maxMp;
  return p;
}

function initRuntime(p) {
  Object.assign(p, { r: 15, cds: {}, swingT: 0, castT: 0, whirlT: 0, whirlTick: 0, hurtT: 0, potionCd: 0, moving: false });
}

function emptyEquip() {
  const eq = {};
  for (const slot of SLOTS) eq[slot] = null;
  return eq;
}

const upRank = (p, id) => (p.upgrades && p.upgrades[id]) || 0;
const bagSize = p => BASE_BAG + 6 * upRank(p, 'bag');

// Pure stat calculation, so the UI can preview "what if I equipped this?"
function computeStats(p, equip = p.equip) {
  const s = { str: p.attrs.str, int: p.attrs.int, vit: p.attrs.vit, hp: 0, mp: 0, spell: 0, crit: 5, armor: 0, regen: 0, manaregen: 0, speed: 0, aspd: 0, dmg: 0 };
  for (const slot of SLOTS) {
    const it = equip[slot];
    if (!it) continue;
    for (const [k, v] of Object.entries(itemStats(it))) s[k] += v;
  }
  const might = 1 + upRank(p, 'might') * 0.04;
  s.maxHp = Math.round((80 + s.vit * 10 + p.level * 6 + s.hp) * (1 + upRank(p, 'vitality') * 0.05));
  s.maxMp = Math.round((40 + s.int * 5 + p.level * 3 + s.mp) * (1 + upRank(p, 'mana') * 0.05));
  s.melee = ((s.dmg || 3) + s.str * 0.8) * might;
  s.spellPower = (5 + s.int * 1.0 + p.level * 1.2) * (1 + s.spell / 100) * might;
  s.critChance = Math.min(60, s.crit);
  s.moveSpeed = 180 * (1 + Math.min(40, s.speed) / 100);
  s.atkSpeed = 1 + Math.min(60, s.aspd) / 100;
  s.hpRegen = 0.5 + s.vit * 0.05 + s.regen;
  s.mpRegen = 1.5 + s.int * 0.2 + s.manaregen;
  s.dmgReduction = 1 - 100 / (100 + s.armor);
  return s;
}

function recalcStats(p) {
  p.stats = computeStats(p);
  p.hp = Math.min(p.hp, p.stats.maxHp);
  p.mp = Math.min(p.mp, p.stats.maxMp);
}

// ---------------------------------------------------------------- Save / load

function saveGame() {
  const p = G.player;
  if (!p) return;
  const data = {
    level: p.level, xp: p.xp, points: p.points, attrs: p.attrs, gold: p.gold, potions: p.potions,
    floor: p.floor, maxFloor: p.maxFloor, skills: p.skills, equip: p.equip, bag: p.bag,
    mats: p.mats, upgrades: p.upgrades,
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function playerFromSave(data) {
  const p = newPlayer();
  Object.assign(p, data);
  for (const id of SKILL_ORDER) if (!p.skills[id]) p.skills[id] = { lvl: 1, xp: 0 };
  p.equip = { ...emptyEquip(), ...p.equip }; // older saves had fewer slots
  p.mats = { scrap: 0, dust: 0, shard: 0, ...(p.mats || {}) };
  p.upgrades = p.upgrades || {};
  initRuntime(p);
  recalcStats(p);
  p.hp = p.stats.maxHp;
  p.mp = p.stats.maxMp;
  return p;
}

// ---------------------------------------------------------------- Floors

function buildFloor() {
  const p = G.player;
  const d = new Dungeon(p.floor);
  G.dungeon = d;
  G.enemies = [];
  G.projectiles = [];
  G.effects = [];
  G.particles = [];
  G.texts = [];
  G.loot = [];
  G.chests = [];
  G.corpses = [];
  G.flow = null;
  G.flowT = 0;
  G.autoTarget = null;
  p.x = (d.start.cx + 0.5) * TILE;
  p.y = (d.start.cy + 0.5) * TILE;
  p.cds = {};
  p.whirlT = 0;

  const exit = { x: (d.exit.cx + 0.5) * TILE, y: (d.exit.cy + 0.5) * TILE };
  G.portal = { x: exit.x, y: exit.y, active: !d.isBoss };

  const types = Object.entries(ENEMIES).filter(([, def]) => !def.boss && def.minFloor <= p.floor).map(([k, def]) => [k, def.weight]);
  for (const room of d.rooms) {
    if (room === d.start) continue;
    const count = randi(2, 4) + Math.floor(p.floor / 3);
    const packType = weightedPick(types);
    for (let i = 0; i < count; i++) {
      const pos = d.randomPointInRoom(room);
      spawnEnemy(chance(0.65) ? packType : weightedPick(types), pos.x, pos.y, chance(0.08));
    }
  }
  for (const room of d.rooms) {
    if (room === d.start || G.chests.length >= 4 || !chance(0.35)) continue;
    const pos = d.randomPointInRoom(room, 2);
    G.chests.push({ isChest: true, x: pos.x, y: pos.y, open: false, t: 0, big: false });
  }
  if (d.isBoss) {
    const b = spawnEnemy('brute', exit.x, exit.y, false);
    b.hp = b.maxHp = Math.round(b.maxHp * (1 + (p.floor / 5 - 1) * 0.5));
  }

  d.reveal(p.x, p.y, 8);
  UI.banner(`Floor ${p.floor}`, d.isBoss ? `${d.theme.name} — a dread presence stirs...` : d.theme.name);
  UI.drawMinimap();
}

function spawnEnemy(type, x, y, elite) {
  const def = ENEMIES[type];
  const sc = enemyScale(G.player.floor);
  const e = {
    type, def, x, y, r: def.r, elite, boss: !!def.boss,
    maxHp: Math.round(def.hp * sc.hp * (elite ? 2.6 : 1)),
    dmg: def.dmg * sc.dmg * (elite ? 1.4 : 1),
    speed: def.speed * (elite ? 1.1 : 1),
    xp: Math.round(def.xp * sc.xp * (elite ? 3 : 1)),
    aggro: false, atkCd: rand(0, 0.6), windT: 0, slowT: 0, hitT: 0,
    facing: rand(0, TAU), seed: rand(0, 100), slamCd: 3, slamming: 0, dead: false,
  };
  if (elite) e.r = Math.round(e.r * 1.2);
  e.hp = e.maxHp;
  G.enemies.push(e);
  return e;
}

function nextFloor() {
  const p = G.player;
  p.floor++;
  p.maxFloor = Math.max(p.maxFloor, p.floor);
  spawnParticles(p.x, p.y, 40, '#b77bff', 220, 3, 0.8);
  buildFloor();
  saveGame();
}

// ---------------------------------------------------------------- Feedback helpers

function spawnParticles(x, y, n, color, speed = 150, size = 3, life = 0.6) {
  for (let i = 0; i < n; i++) {
    if (G.particles.length > 500) G.particles.shift();
    const a = rand(0, TAU), s = rand(speed * 0.3, speed);
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(life * 0.5, life), max: life, color, size: rand(size * 0.6, size) });
  }
}

function floatText(x, y, text, color = '#fff', size = 16) {
  G.texts.push({ x: x + rand(-8, 8), y, text: String(text), color, size, t: 0, max: 0.9 });
}

function shake(amount) { G.cam.shake = Math.max(G.cam.shake, amount); }

function message(text) {
  // Throttled player-facing hint ("Not enough mana", "Bag is full", ...)
  if (G.msgT > 0) return;
  G.msgT = 1.2;
  const p = G.player;
  floatText(p.x, p.y - 40, text, '#9ec5ff', 14);
}

// ---------------------------------------------------------------- Targeting

function findTarget(from, range, exclude) {
  let best = null, bd = range;
  for (const e of G.enemies) {
    if (e.dead || (exclude && exclude.has(e))) continue;
    const d = dist(from, e);
    if (d < bd && G.dungeon.hasLOS(from.x, from.y, e.x, e.y)) { bd = d; best = e; }
  }
  return best;
}

function aimAngle() {
  const p = G.player;
  return G.autoTarget ? angleTo(p, G.autoTarget) : p.facing;
}

// ---------------------------------------------------------------- Skills

function skillLevel(id) { return G.player.skills[id].lvl; }

function rollCrit() { return Math.random() * 100 < G.player.stats.critChance; }

function tryCast(id) {
  const p = G.player, sk = SKILLS[id];
  if (p.level < sk.unlock) return;
  if ((p.cds[id] || 0) > 0) return;
  const l = skillLevel(id);
  const cost = sk.cost(l);
  if (p.mp < cost) { message('Not enough mana'); return; }
  if (CAST[id](p, l) === false) return;
  p.mp -= cost;
  const atkSpeed = sk.school === 'Melee' ? p.stats.atkSpeed : 1;
  p.cds[id] = sk.cd(l) / atkSpeed;
}

const CAST = {
  slash(p, l) {
    const sk = SKILLS.slash;
    const ang = aimAngle();
    p.facing = ang;
    p.swingT = 0.2;
    const range = sk.range(l), arc = 2.2;
    let hits = 0;
    for (const e of G.enemies) {
      if (e.dead) continue;
      const d = dist(p, e);
      if (d > range + e.r) continue;
      if (Math.abs(angDiff(ang, angleTo(p, e))) > arc / 2 && d > e.r + p.r + 6) continue;
      const crit = rollCrit();
      dealDamage(e, p.stats.melee * sk.mult(l) * rand(0.9, 1.1) * (crit ? 1.75 : 1), 'slash', { crit, knock: 8 });
      hits++;
    }
    G.effects.push({ type: 'slash', x: p.x, y: p.y, ang, arc, range, t: 0, max: 0.18 });
    if (hits) shake(2);
  },

  fireball(p, l) {
    const ang = aimAngle();
    p.facing = ang;
    p.castT = 0.2;
    G.projectiles.push({
      kind: 'fireball', owner: 'player', x: p.x + Math.cos(ang) * 18, y: p.y - 6 + Math.sin(ang) * 18,
      vx: Math.cos(ang) * 520, vy: Math.sin(ang) * 520, r: 9, life: 1.1, level: l,
    });
  },

  frostnova(p, l) {
    const sk = SKILLS.frostnova;
    const radius = sk.radius(l);
    p.castT = 0.3;
    for (const e of G.enemies) {
      if (e.dead || dist(p, e) > radius + e.r) continue;
      e.slowT = Math.max(e.slowT, sk.slow(l));
      const crit = rollCrit();
      dealDamage(e, p.stats.spellPower * sk.mult(l) * rand(0.9, 1.1) * (crit ? 1.75 : 1), 'frostnova', { crit, color: '#8fd8ff' });
    }
    G.effects.push({ type: 'nova', x: p.x, y: p.y, radius, t: 0, max: 0.4 });
    spawnParticles(p.x, p.y, 40, '#bfe9ff', radius * 2.2, 3, 0.5);
    shake(3);
  },

  chain(p, l) {
    const sk = SKILLS.chain;
    let target = G.autoTarget && dist(p, G.autoTarget) < 340 ? G.autoTarget : findTarget(p, 340);
    if (!target) { message('No target'); return false; }
    p.facing = angleTo(p, target);
    p.castT = 0.25;
    const hitSet = new Set();
    const points = [{ x: p.x, y: p.y - 8 }];
    let from = p;
    for (let i = 0; i < sk.jumps(l) && target; i++) {
      hitSet.add(target);
      points.push({ x: target.x, y: target.y - 6 });
      const crit = rollCrit();
      dealDamage(target, p.stats.spellPower * sk.mult(l) * rand(0.85, 1.15) * (crit ? 1.75 : 1), 'chain', { crit, color: '#cfe8ff' });
      spawnParticles(target.x, target.y, 8, '#cfe8ff', 160, 2, 0.3);
      from = target;
      target = findTarget(from, 230, hitSet);
    }
    G.effects.push({ type: 'lightning', points, t: 0, max: 0.25 });
  },

  whirlwind(p, l) {
    p.whirlT = SKILLS.whirlwind.duration(l);
    p.whirlTick = 0;
  },
};

function whirlwindTick() {
  const p = G.player, sk = SKILLS.whirlwind, l = skillLevel('whirlwind');
  for (const e of G.enemies) {
    if (e.dead || dist(p, e) > sk.radius(l) + e.r) continue;
    const crit = rollCrit();
    dealDamage(e, p.stats.melee * sk.mult(l) * rand(0.9, 1.1) * (crit ? 1.75 : 1), 'whirlwind', { crit, knock: 4 });
  }
}

function explodeFireball(pr) {
  const p = G.player, sk = SKILLS.fireball;
  const radius = sk.radius(pr.level);
  for (const e of G.enemies) {
    if (e.dead || Math.hypot(e.x - pr.x, e.y - pr.y) > radius + e.r) continue;
    const crit = rollCrit();
    dealDamage(e, p.stats.spellPower * sk.mult(pr.level) * rand(0.9, 1.1) * (crit ? 1.75 : 1), 'fireball', { crit, color: '#ffb35c', knock: 6, from: pr });
  }
  G.effects.push({ type: 'explosion', x: pr.x, y: pr.y, radius, t: 0, max: 0.35 });
  spawnParticles(pr.x, pr.y, 26, '#ff8a2a', 260, 4, 0.5);
  spawnParticles(pr.x, pr.y, 10, '#ffe08a', 140, 3, 0.4);
  shake(3);
}

// ---------------------------------------------------------------- Damage & progression

function dealDamage(e, amount, skillId, opts = {}) {
  if (e.dead) return;
  amount = Math.max(1, Math.round(amount));
  e.hp -= amount;
  e.hitT = 0.12;
  if (!e.aggro) { e.aggro = true; alertPack(e); }
  floatText(e.x, e.y - e.r - 14, amount, opts.crit ? '#ffd23f' : (opts.color || '#ffffff'), opts.crit ? 22 : 16);
  if (opts.knock && !e.boss) {
    const src = opts.from || G.player;
    const a = Math.atan2(e.y - src.y, e.x - src.x);
    moveEntity(G.dungeon, e, Math.cos(a) * opts.knock, Math.sin(a) * opts.knock);
  }
  gainSkillXp(skillId, SKILLS[skillId].xpPerHit);
  if (e.hp <= 0) killEnemy(e, skillId);
}

function alertPack(e) {
  for (const o of G.enemies) if (!o.aggro && dist(o, e) < 240) o.aggro = true;
}

function killEnemy(e, skillId) {
  e.dead = true;
  const colors = { skeleton: '#e8e2cc', zombie: '#6f9a4f', bat: '#8a3fae', cultist: '#c23030', brute: '#a02818' };
  spawnParticles(e.x, e.y, e.boss ? 80 : 18, colors[e.type] || '#ccc', e.boss ? 320 : 180, e.boss ? 5 : 3, 0.7);
  G.corpses.push({ e, t: 0, dir: chance(0.5) ? 1 : -1 });
  if (G.corpses.length > 30) G.corpses.shift();
  gainXp(e.xp);
  gainSkillXp(skillId, 3);
  dropLoot(e);
  if (e.boss) {
    shake(10);
    G.portal.active = true;
    const cx = G.dungeon.wallAtPx(e.x + 50, e.y) ? e.x : e.x + 50;
    G.chests.push({ isChest: true, x: cx, y: e.y, open: false, t: 0, big: true });
    UI.banner('Boss Slain!', 'A portal to the depths has opened');
    saveGame();
  }
}

function gainXp(amount) {
  const p = G.player;
  p.xp += amount;
  let leveled = false;
  while (p.xp >= playerXpReq(p.level)) {
    p.xp -= playerXpReq(p.level);
    p.level++;
    p.points += 3;
    leveled = true;
    for (const id of SKILL_ORDER) {
      if (SKILLS[id].unlock === p.level) UI.banner(`New Skill: ${SKILLS[id].name}`, SKILLS[id].icon + ' Unlocked!');
    }
  }
  if (leveled) {
    recalcStats(p);
    p.hp = p.stats.maxHp;
    p.mp = p.stats.maxMp;
    UI.banner(`Level ${p.level}!`, '+3 attribute points — open Character');
    G.effects.push({ type: 'levelup', x: p.x, y: p.y, t: 0, max: 1.0 });
    spawnParticles(p.x, p.y, 50, '#ffd84a', 220, 3, 1);
    saveGame();
  }
}

function gainSkillXp(id, amount) {
  const s = G.player.skills[id];
  if (s.lvl >= MAX_SKILL_LVL) return;
  s.xp += amount;
  if (s.xp >= skillXpReq(s.lvl)) {
    s.xp -= skillXpReq(s.lvl);
    s.lvl++;
    const p = G.player;
    floatText(p.x, p.y - 50, `${SKILLS[id].name} ${s.lvl}!`, SKILLS[id].color, 18);
    UI.toast(`${SKILLS[id].icon} ${SKILLS[id].name} reached level ${s.lvl}`);
  }
}

function hurtPlayer(amount) {
  const p = G.player;
  if (G.state !== 'play') return;
  const dmg = Math.max(1, Math.round(amount * (1 - p.stats.dmgReduction)));
  p.hp -= dmg;
  p.hurtT = 0.3;
  floatText(p.x, p.y - 30, dmg, '#ff4a4a', 16);
  shake(4);
  if (p.hp <= 0) {
    p.hp = 0;
    G.state = 'dead';
    Input.reset();
    UI.showDeath();
  }
}

function usePotion() {
  const p = G.player, s = p.stats;
  if (p.potionCd > 0) return;
  if (p.potions <= 0) { message('No potions'); return; }
  if (p.hp >= s.maxHp && p.mp >= s.maxMp) { message('Already full'); return; }
  p.potions--;
  p.potionCd = 1;
  const pct = 0.4 + upRank(p, 'potion') * 0.06;
  const hpGain = Math.round(s.maxHp * pct), mpGain = Math.round(s.maxMp * pct);
  p.hp = Math.min(s.maxHp, p.hp + hpGain);
  p.mp = Math.min(s.maxMp, p.mp + mpGain);
  floatText(p.x, p.y - 34, `+${hpGain}`, '#5dff7a', 18);
  spawnParticles(p.x, p.y, 20, '#ff5a6a', 120, 3, 0.6);
}

function respawn() {
  const p = G.player;
  const lost = Math.floor(p.gold * 0.1);
  p.gold -= lost;
  p.hp = p.stats.maxHp;
  p.mp = p.stats.maxMp;
  G.state = 'play';
  buildFloor();
  if (lost) UI.toast(`Lost ${lost} gold`);
  saveGame();
}

// ---------------------------------------------------------------- Loot

const lootBoost = b => b + upRank(G.player, 'hunter') * 0.08;
const goldAmount = n => Math.round(n * (1 + upRank(G.player, 'fortune') * 0.15));

function dropLoot(e) {
  const f = G.player.floor;
  const drops = [];
  if (chance(e.boss ? 1 : e.elite ? 0.9 : 0.45)) drops.push({ kind: 'gold', amount: goldAmount(randi(3, 8) * (1 + f * 0.5) * (e.boss ? 10 : e.elite ? 3 : 1)) });
  if (chance(e.boss ? 1 : e.elite ? 0.25 : 0.045)) drops.push({ kind: 'potion' });
  if (chance(e.boss ? 1 : e.elite ? 0.5 : 0.1)) drops.push({ kind: 'mat', mat: 'scrap', amount: e.boss ? randi(4, 8) : e.elite ? randi(2, 4) : randi(1, 2) });
  if (e.boss) {
    for (let i = 0; i < 3; i++) drops.push({ kind: 'item', item: generateItem(f + 1, lootBoost(2)) });
    drops.push({ kind: 'mat', mat: 'dust', amount: randi(2, 4) });
  } else if (e.elite) {
    drops.push({ kind: 'item', item: generateItem(f, lootBoost(1)) });
    if (chance(0.4)) drops.push({ kind: 'item', item: generateItem(f, lootBoost(0.5)) });
  } else if (chance(0.16)) {
    drops.push({ kind: 'item', item: generateItem(f, lootBoost(0)) });
  }
  for (const dr of drops) spawnLoot(e.x, e.y, dr, drops.length);
}

// Loot pops out of its source in an arc and lands nearby.
function spawnLoot(x, y, dr, n) {
  const a = rand(0, TAU), r = rand(18, 26 + n * 7);
  let tx = x + Math.cos(a) * r, ty = y + Math.sin(a) * r;
  if (G.dungeon.wallAtPx(tx, ty)) { tx = x; ty = y; }
  G.loot.push({ ...dr, x: tx, y: ty, sx: x, sy: y, pop: 0, popMax: rand(0.4, 0.6), seed: rand(0, 10), t: 0 });
}

function openChest(ch) {
  const f = G.player.floor;
  ch.open = true;
  ch.t = 0;
  const drops = [{ kind: 'gold', amount: goldAmount(randi(10, 20) * (1 + f * 0.5) * (ch.big ? 4 : 1)) }];
  const items = ch.big ? 4 : randi(1, 2);
  for (let i = 0; i < items; i++) drops.push({ kind: 'item', item: generateItem(ch.big ? f + 1 : f, lootBoost(ch.big ? 2 : 0.6)) });
  drops.push({ kind: 'mat', mat: 'scrap', amount: randi(1, 3) * (ch.big ? 3 : 1) });
  if (ch.big || chance(0.3)) drops.push({ kind: 'mat', mat: 'dust', amount: randi(1, 2) * (ch.big ? 2 : 1) });
  if (ch.big && chance(0.5)) drops.push({ kind: 'mat', mat: 'shard', amount: 1 });
  if (chance(0.35)) drops.push({ kind: 'potion' });
  for (const dr of drops) spawnLoot(ch.x, ch.y - 6, dr, drops.length);
  spawnParticles(ch.x, ch.y - 10, 30, '#ffd84a', 200, 3, 0.7);
  shake(2);
}

function updateChests(dt) {
  const p = G.player;
  for (const ch of G.chests) {
    ch.t += dt;
    if (!ch.open && dist(p, ch) < 42) openChest(ch);
  }
  for (const cp of G.corpses) cp.t += dt;
  G.corpses = G.corpses.filter(cp => cp.t < 10);
}

function updateLoot(dt) {
  const p = G.player;
  for (const l of G.loot) {
    l.t += dt;
    if (l.pop < l.popMax) {
      l.pop += dt;
      if (l.pop >= l.popMax && l.kind === 'item' && (l.item.rarity === 'rare' || l.item.rarity === 'legendary')) {
        spawnParticles(l.x, l.y, 16, RARITIES[l.item.rarity].color, 120, 3, 0.6);
      }
      continue;
    }
    const d = dist(p, l);
    if (l.kind !== 'item' && d < 90 && d > 1) { // coins, potions and materials drift toward the player
      l.x += (p.x - l.x) / d * 260 * dt;
      l.y += (p.y - l.y) / d * 260 * dt;
    }
    if (d > 28) continue;
    if (l.kind === 'gold') {
      p.gold += l.amount;
      floatText(p.x, p.y - 40, `+${l.amount}g`, '#ffd84a', 14);
    } else if (l.kind === 'potion') {
      p.potions++;
      floatText(p.x, p.y - 40, '+1 Potion', '#ff6a7a', 14);
    } else if (l.kind === 'mat') {
      p.mats[l.mat] += l.amount;
      floatText(p.x, p.y - 40, `+${l.amount} ${MATS[l.mat].name}`, MATS[l.mat].color, 14);
    } else if (l.kind === 'item') {
      if (p.bag.length >= bagSize(p)) { message('Bag is full'); continue; }
      p.bag.push(l.item);
      floatText(p.x, p.y - 40, itemName(l.item), RARITIES[l.item.rarity].color, 15);
      if (l.item.rarity === 'legendary') UI.banner('Legendary!', l.item.name);
    }
    l.taken = true;
  }
  G.loot = G.loot.filter(l => !l.taken);
}

// ---------------------------------------------------------------- Enemy AI

function updateEnemies(dt) {
  const p = G.player, d = G.dungeon;
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.hitT = Math.max(0, e.hitT - dt);
    e.swingT = Math.max(0, (e.swingT || 0) - dt);
    e.slowT = Math.max(0, e.slowT - dt);
    e.atkCd -= dt;
    const dp = dist(e, p);

    if (!e.aggro) {
      if (dp < 330 && d.hasLOS(e.x, e.y, p.x, p.y)) { e.aggro = true; alertPack(e); }
      else continue;
    }
    if (dp > 1100) continue; // too far to bother
    const slow = e.slowT > 0 ? 0.5 : 1;

    if (e.boss) {
      e.slamCd -= dt;
      if (e.slamming > 0) { e.slamming -= dt; continue; }
      if (e.slamCd <= 0 && dp < 200 && e.windT <= 0) {
        e.slamCd = rand(4.5, 6);
        e.slamming = 1.0;
        G.effects.push({ type: 'slam', x: e.x, y: e.y, radius: 150, t: 0, max: 1.0, dmg: e.dmg * 1.8, owner: e });
        continue;
      }
    }

    if (e.windT > 0) {
      e.windT -= dt;
      if (e.windT <= 0) resolveEnemyAttack(e);
      continue;
    }

    if (e.def.kind === 'ranged') {
      if (dp < e.def.range && d.hasLOS(e.x, e.y, p.x, p.y)) {
        e.facing = angleTo(e, p);
        if (dp < 140) moveEntity(d, e, -Math.cos(e.facing) * e.speed * 0.8 * slow * dt, -Math.sin(e.facing) * e.speed * 0.8 * slow * dt);
        if (e.atkCd <= 0) { e.windT = e.def.wind; e.atkCd = e.def.atkCd; }
      } else {
        followFlow(e, e.speed * slow * dt);
      }
    } else {
      const reach = e.r + p.r + e.def.reach;
      if (dp <= reach) {
        e.facing = angleTo(e, p);
        if (e.atkCd <= 0) { e.windT = e.def.wind; e.atkCd = e.def.atkCd; }
      } else {
        followFlow(e, e.speed * slow * dt);
      }
    }
  }

  // Keep enemies from stacking on each other or on the player.
  const list = G.enemies;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.dead) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 0.01) continue;
      const dd = Math.sqrt(d2), push = (min - dd) / 2;
      a.x -= dx / dd * push; a.y -= dy / dd * push;
      b.x += dx / dd * push; b.y += dy / dd * push;
    }
    const dx = a.x - p.x, dy = a.y - p.y, min = a.r + p.r;
    const d2 = dx * dx + dy * dy;
    if (d2 < min * min && d2 > 0.01) {
      const dd = Math.sqrt(d2);
      a.x += dx / dd * (min - dd);
      a.y += dy / dd * (min - dd);
    }
    collideCircle(d, a);
  }
}

function followFlow(e, step) {
  const p = G.player, d = G.dungeon, f = G.flow;
  let tx = p.x, ty = p.y;
  const ex = Math.floor(e.x / TILE), ey = Math.floor(e.y / TILE);
  const here = f ? f[d.idx(ex, ey)] : -1;
  if (here > 1) {
    let best = here, bx = ex, by = ey;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const nx = ex + ox, ny = ey + oy;
      if (d.isWall(nx, ny)) continue;
      if (ox && oy && (d.isWall(ex + ox, ey) || d.isWall(ex, ey + oy))) continue; // no corner cutting
      const v = f[d.idx(nx, ny)];
      if (v >= 0 && v < best) { best = v; bx = nx; by = ny; }
    }
    tx = (bx + 0.5) * TILE;
    ty = (by + 0.5) * TILE;
  }
  const a = Math.atan2(ty - e.y, tx - e.x);
  e.facing = a;
  moveEntity(d, e, Math.cos(a) * step, Math.sin(a) * step);
}

function resolveEnemyAttack(e) {
  const p = G.player;
  e.swingT = 0.2;
  if (e.def.kind === 'ranged') {
    const a = angleTo(e, p);
    G.projectiles.push({ kind: 'bolt', owner: 'enemy', x: e.x + Math.cos(a) * 14, y: e.y - 8 + Math.sin(a) * 14, vx: Math.cos(a) * e.def.projSpeed, vy: Math.sin(a) * e.def.projSpeed, r: 7, life: 2, dmg: e.dmg });
  } else if (dist(e, p) <= e.r + p.r + e.def.reach + 12) {
    hurtPlayer(e.dmg * rand(0.85, 1.15));
  }
}

// ---------------------------------------------------------------- Projectiles / effects / particles

function updateProjectiles(dt) {
  const p = G.player, d = G.dungeon;
  for (const pr of G.projectiles) {
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.life -= dt;
    let hit = d.wallAtPx(pr.x, pr.y) || pr.life <= 0;
    if (!hit && pr.owner === 'player') {
      for (const e of G.enemies) if (!e.dead && Math.hypot(e.x - pr.x, e.y - pr.y) < e.r + pr.r) { hit = true; break; }
    }
    if (!hit && pr.owner === 'enemy' && Math.hypot(p.x - pr.x, p.y - pr.y) < p.r + pr.r) {
      hurtPlayer(pr.dmg);
      hit = true;
    }
    if (pr.kind === 'fireball' && chance(0.8)) {
      G.particles.push({ x: pr.x, y: pr.y, vx: rand(-30, 30), vy: rand(-30, 30), life: 0.3, max: 0.3, color: chance(0.5) ? '#ff8a2a' : '#ffd36b', size: rand(2, 4) });
    }
    if (hit) {
      pr.dead = true;
      if (pr.kind === 'fireball') explodeFireball(pr);
      else spawnParticles(pr.x, pr.y, 8, '#ff5577', 100, 2, 0.3);
    }
  }
  G.projectiles = G.projectiles.filter(pr => !pr.dead);
}

function updateEffects(dt) {
  const p = G.player;
  for (const fx of G.effects) {
    fx.t += dt;
    if (fx.type === 'slam' && fx.t >= fx.max && !fx.done) {
      fx.done = true;
      if (!fx.owner.dead) {
        if (dist(p, fx) <= fx.radius + p.r) hurtPlayer(fx.dmg);
        spawnParticles(fx.x, fx.y, 40, '#8a6a4a', 300, 4, 0.6);
        shake(8);
      }
    }
  }
  G.effects = G.effects.filter(fx => fx.t < fx.max);
}

function updateParticles(dt) {
  for (const pt of G.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.92;
    pt.vy *= 0.92;
    pt.life -= dt;
  }
  G.particles = G.particles.filter(pt => pt.life > 0);
  for (const t of G.texts) { t.t += dt; t.y -= 40 * dt; }
  G.texts = G.texts.filter(t => t.t < t.max);
}

// ---------------------------------------------------------------- Main update

function update(dt) {
  const p = G.player, s = p.stats, d = G.dungeon;
  G.time += dt;
  G.msgT = Math.max(0, G.msgT - dt);

  p.hp = Math.min(s.maxHp, p.hp + s.hpRegen * dt);
  p.mp = Math.min(s.maxMp, p.mp + s.mpRegen * dt);
  for (const k in p.cds) p.cds[k] = Math.max(0, p.cds[k] - dt);
  p.potionCd = Math.max(0, p.potionCd - dt);
  p.swingT = Math.max(0, p.swingT - dt);
  p.castT = Math.max(0, p.castT - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);

  const mv = Input.getMove();
  const len = Math.hypot(mv.x, mv.y);
  p.moving = len > 0.15;
  if (p.moving) {
    const sp = s.moveSpeed * (p.whirlT > 0 ? 1.15 : 1) * Math.min(1, len * 1.25);
    moveEntity(d, p, mv.x / len * sp * dt, mv.y / len * sp * dt);
    if (p.swingT <= 0 && p.castT <= 0) p.facing = Math.atan2(mv.y, mv.x);
  }

  G.autoTarget = findTarget(p, 420);
  for (const id of SKILL_ORDER) if (Input.isHeld(id)) tryCast(id);
  if (Input.consumePotion()) usePotion();

  if (p.whirlT > 0) {
    p.whirlT -= dt;
    p.whirlTick -= dt;
    if (p.whirlTick <= 0) { p.whirlTick = 0.25; whirlwindTick(); }
  }

  G.flowT -= dt;
  if (G.flowT <= 0) {
    G.flowT = 0.25;
    G.flow = d.bfs(Math.floor(p.x / TILE), Math.floor(p.y / TILE), 30);
  }

  updateEnemies(dt);
  updateProjectiles(dt);
  updateEffects(dt);
  updateParticles(dt);
  updateLoot(dt);
  updateChests(dt);
  G.enemies = G.enemies.filter(e => !e.dead);
  if (G.state !== 'play') return;

  if (G.portal.active && dist(p, G.portal) < 34) { nextFloor(); return; }

  G.seenT -= dt;
  if (G.seenT <= 0) {
    G.seenT = 0.25;
    d.reveal(p.x, p.y, 8);
    UI.drawMinimap();
  }

  G.cam.shake = Math.max(0, G.cam.shake - dt * 30);
  G.saveT -= dt;
  if (G.saveT <= 0) { G.saveT = 20; saveGame(); }
}

// ---------------------------------------------------------------- Boot

function startGame(fromSave) {
  const data = fromSave ? loadSave() : null;
  G.player = data ? playerFromSave(data) : newPlayer();
  G.state = 'play';
  buildFloor();
  UI.onGameStart();
  saveGame();
  onboard(!fromSave);
  try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch (e) { /* not supported */ }
  try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch (e) { /* not supported */ }
}

let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (G.state === 'play' && !G.modal) update(dt);
  if (G.dungeon) render();
  if (G.player) UI.update();
  requestAnimationFrame(frame);
}

function boot() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  Input.init();
  UI.init();
  Modal.init();
  Updater.init();
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
  requestAnimationFrame(frame);
}

// Scripts are added by the loader in index.html, so the page may already be loaded by now.
if (document.readyState === 'complete') boot();
else window.addEventListener('load', boot);
