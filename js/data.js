'use strict';
// Game content: skills, enemies, themes, items. Tweak numbers here to rebalance.

const TILE = 48;
const MAX_SKILL_LVL = 20;
const BASE_BAG = 24;
const MAX_UPGRADE = 10;

const pctf = m => Math.round(m * 100) + '%';

// ---------------------------------------------------------------- Skills
// Skills level up from use: every hit grants skill XP, kills grant more.
const SKILL_ORDER = ['slash', 'fireball', 'frostnova', 'chain', 'whirlwind'];

const SKILLS = {
  slash: {
    name: 'Slash', icon: '⚔️', school: 'Melee', unlock: 1, color: '#f1e6c8', xpPerHit: 0.6,
    mult: l => 1 + 0.1 * (l - 1),
    range: l => 64 + 2 * l,
    cost: () => 0,
    cd: () => 0.42,
    desc(l) { return `Swing in a wide arc for ${pctf(this.mult(l))} weapon damage.`; },
  },
  fireball: {
    name: 'Fireball', icon: '🔥', school: 'Fire', unlock: 1, color: '#ff9a3c', xpPerHit: 1,
    mult: l => 1.5 + 0.15 * (l - 1),
    radius: l => 44 + 3 * l,
    cost: l => Math.round(7 + 0.6 * l),
    cd: () => 0.55,
    desc(l) { return `Hurl a fireball that explodes for ${pctf(this.mult(l))} spell damage in a ${this.radius(l)} radius.`; },
  },
  frostnova: {
    name: 'Frost Nova', icon: '❄️', school: 'Cold', unlock: 3, color: '#8fd8ff', xpPerHit: 1,
    mult: l => 0.8 + 0.1 * (l - 1),
    radius: l => 140 + 6 * l,
    slow: l => +(2 + 0.15 * l).toFixed(1),
    cost: l => 14 + l,
    cd: l => Math.max(2.5, +(5 - 0.12 * l).toFixed(2)),
    desc(l) { return `Blast of ice around you: ${pctf(this.mult(l))} spell damage and slows enemies 50% for ${this.slow(l)}s.`; },
  },
  chain: {
    name: 'Chain Lightning', icon: '⚡', school: 'Lightning', unlock: 5, color: '#bfe3ff', xpPerHit: 0.7,
    mult: l => 1.0 + 0.12 * (l - 1),
    jumps: l => 2 + Math.ceil(l / 3),
    cost: l => Math.round(10 + 0.8 * l),
    cd: () => 0.9,
    desc(l) { return `Lightning arcs between ${this.jumps(l)} enemies for ${pctf(this.mult(l))} spell damage each.`; },
  },
  whirlwind: {
    name: 'Whirlwind', icon: '🌀', school: 'Melee', unlock: 8, color: '#e0e0e0', xpPerHit: 0.35,
    mult: l => 0.55 + 0.06 * (l - 1),
    duration: () => 1.6,
    radius: () => 95,
    cost: l => 18 + l,
    cd: l => Math.max(3, +(6 - 0.15 * l).toFixed(2)),
    desc(l) { return `Spin for 1.6s, hitting everything nearby 4x per second for ${pctf(this.mult(l))} weapon damage.`; },
  },
};

const skillXpReq = l => Math.floor(14 * Math.pow(l, 1.5));
const playerXpReq = l => Math.floor(60 * Math.pow(l, 1.6));

// ---------------------------------------------------------------- Enemies
const ENEMIES = {
  skeleton: { name: 'Skeleton', hp: 30, dmg: 6, speed: 88, r: 15, xp: 12, kind: 'melee', reach: 14, atkCd: 1.2, wind: 0.3, minFloor: 1, weight: 10 },
  bat:      { name: 'Blood Bat', hp: 15, dmg: 4, speed: 150, r: 11, xp: 8, kind: 'melee', reach: 10, atkCd: 0.9, wind: 0.2, minFloor: 1, weight: 6 },
  zombie:   { name: 'Ghoul', hp: 60, dmg: 11, speed: 55, r: 18, xp: 20, kind: 'melee', reach: 16, atkCd: 1.6, wind: 0.45, minFloor: 2, weight: 7 },
  cultist:  { name: 'Cultist', hp: 24, dmg: 7, speed: 72, r: 14, xp: 18, kind: 'ranged', range: 290, projSpeed: 250, atkCd: 1.9, wind: 0.45, minFloor: 3, weight: 5 },
  brute:    { name: 'Gravelord', hp: 650, dmg: 20, speed: 80, r: 30, xp: 260, kind: 'melee', reach: 22, atkCd: 1.5, wind: 0.5, boss: true },
};

const enemyScale = f => ({
  hp: Math.pow(1.2, f - 1),
  dmg: Math.pow(1.15, f - 1),
  xp: Math.pow(1.17, f - 1),
});

// ---------------------------------------------------------------- Themes (change every 3 floors)
const THEMES = [
  { name: 'Catacombs',      floor: '#3b3530', floor2: '#423b35', floor3: '#35302b', wallTop: '#5c534a', wallFace: '#2c2621', wallLine: '#1c1815', dark: 0.86, torch: '#ffb347' },
  { name: 'Fungal Caverns', floor: '#2d3830', floor2: '#334036', floor3: '#28322b', wallTop: '#46594b', wallFace: '#1f2a22', wallLine: '#131a15', dark: 0.88, torch: '#9dff8a' },
  { name: 'Frozen Depths',  floor: '#34404c', floor2: '#3b4855', floor3: '#2f3a45', wallTop: '#61798d', wallFace: '#27323d', wallLine: '#18202a', dark: 0.84, torch: '#8fd8ff' },
  { name: 'Burning Hells',  floor: '#3e2420', floor2: '#472a24', floor3: '#361f1b', wallTop: '#6e3024', wallFace: '#2e1410', wallLine: '#1e0c09', dark: 0.85, torch: '#ff6a2a' },
];

// ---------------------------------------------------------------- Items
const SLOTS = ['weapon', 'offhand', 'helm', 'armor', 'gloves', 'boots', 'amulet', 'ring'];
const SLOT_LABEL = { weapon: 'Weapon', offhand: 'Off-hand', helm: 'Helm', armor: 'Chest', gloves: 'Gloves', boots: 'Boots', amulet: 'Amulet', ring: 'Ring' };
const SLOT_ICON = { weapon: '🗡️', offhand: '🛡️', helm: '⛑️', armor: '🥋', gloves: '🧤', boots: '👢', amulet: '📿', ring: '💍' };

// Each base decides how the item looks on your hero and which built-in stats it rolls.
const ITEM_BASES = {
  weapon: [
    { name: 'Sword', type: 'sword', icon: '🗡️', dmg: 1 },
    { name: 'Falchion', type: 'sword', icon: '🗡️', dmg: 1.05 },
    { name: 'Dagger', type: 'dagger', icon: '🔪', dmg: 0.8, crit: 5 },
    { name: 'Axe', type: 'axe', icon: '🪓', dmg: 1.15 },
    { name: 'Mace', type: 'mace', icon: '🔨', dmg: 1.1 },
    { name: 'Staff', type: 'staff', icon: '🪄', dmg: 0.6, spell: 1 },
  ],
  offhand: [
    { name: 'Buckler', type: 'buckler', icon: '🛡️', armor: 0.7 },
    { name: 'Kite Shield', type: 'kite', icon: '🛡️', armor: 1 },
    { name: 'Tower Shield', type: 'tower', icon: '🛡️', armor: 1.3 },
    { name: 'Orb', type: 'orb', icon: '🔮', spell: 1 },
    { name: 'Tome', type: 'tome', icon: '📕', mp: 1 },
  ],
  helm: [
    { name: 'Cap', type: 'cap', icon: '🧢', armor: 0.7 },
    { name: 'Hood', type: 'hood', icon: '🧙', armor: 0.6, mp: 0.5 },
    { name: 'Helm', type: 'helm', icon: '⛑️', armor: 1 },
    { name: 'Great Helm', type: 'greathelm', icon: '⛑️', armor: 1.25 },
    { name: 'Crown', type: 'crown', icon: '👑', armor: 0.6 },
  ],
  armor: [
    { name: 'Robe', type: 'robe', icon: '👘', armor: 0.5, mp: 1 },
    { name: 'Leathers', type: 'leather', icon: '🦺', armor: 0.8 },
    { name: 'Chainmail', type: 'chain', icon: '🥋', armor: 1 },
    { name: 'Plate', type: 'plate', icon: '🥋', armor: 1.3 },
  ],
  gloves: [
    { name: 'Gloves', type: 'cloth', icon: '🧤', armor: 0.8 },
    { name: 'Gauntlets', type: 'plate', icon: '🧤', armor: 1.2 },
  ],
  boots: [
    { name: 'Boots', type: 'leather', icon: '👢', armor: 0.8, speed: 1 },
    { name: 'Greaves', type: 'plate', icon: '👢', armor: 1.2 },
  ],
  amulet: [
    { name: 'Amulet', type: 'amulet', icon: '📿' },
    { name: 'Pendant', type: 'amulet', icon: '📿' },
  ],
  ring: [
    { name: 'Ring', type: 'ring', icon: '💍' },
    { name: 'Band', type: 'ring', icon: '💍' },
    { name: 'Signet', type: 'ring', icon: '💍' },
  ],
};
const ARMOR_BASE = { offhand: [4, 2], helm: [3, 1.6], armor: [6, 3], gloves: [2, 1.1], boots: [2, 1.1] }; // [flat, per item level]
const LEGACY_BASES = { Blade: 'Sword', Cleaver: 'Axe', Visor: 'Great Helm', Mail: 'Chainmail', Hauberk: 'Chainmail', Loop: 'Band' };

function findBase(it) {
  const list = ITEM_BASES[it.slot] || [];
  const name = LEGACY_BASES[it.baseName] || it.baseName;
  return list.find(b => b.name === name) || list[0];
}
const itemType = it => findBase(it).type;
const itemIcon = it => findBase(it).icon;

const RARITIES = {
  common:    { label: 'Common',    color: '#d6d6d6', affixes: [0, 0], mult: 1,   value: 1 },
  magic:     { label: 'Magic',     color: '#6b8cff', affixes: [1, 2], mult: 1.1, value: 2 },
  rare:      { label: 'Rare',      color: '#ffd84a', affixes: [3, 4], mult: 1.2, value: 4 },
  legendary: { label: 'Legendary', color: '#ff8c1a', affixes: [5, 5], mult: 1.4, value: 10 },
};

const AFFIXES = {
  str:       { label: 'Strength',       adj: 'Mighty',   roll: il => randi(1, 2 + Math.floor(il * 0.6)) },
  int:       { label: 'Intellect',      adj: 'Wise',     roll: il => randi(1, 2 + Math.floor(il * 0.6)) },
  vit:       { label: 'Vitality',       adj: 'Sturdy',   roll: il => randi(1, 2 + Math.floor(il * 0.6)) },
  hp:        { label: 'Max Life',       adj: 'Vital',    roll: il => randi(5, 10 + il * 4) },
  mp:        { label: 'Max Mana',       adj: 'Arcane',   roll: il => randi(4, 8 + il * 3) },
  spell:     { label: '% Spell Damage', adj: 'Blazing',  roll: il => randi(4, 8 + Math.floor(il * 1.5)) },
  crit:      { label: '% Crit Chance',  adj: 'Keen',     roll: il => randi(1, 3 + Math.floor(il / 3)) },
  armor:     { label: 'Armor',          adj: 'Warded',   roll: il => randi(3, 6 + il * 2) },
  regen:     { label: 'Life Regen /s',  adj: 'Mending',  roll: il => +rand(0.5, 1 + il * 0.25).toFixed(1) },
  manaregen: { label: 'Mana Regen /s',  adj: 'Focused',  roll: il => +rand(0.5, 1 + il * 0.2).toFixed(1) },
  speed:     { label: '% Move Speed',   adj: 'Swift',    roll: () => randi(3, 8) },
  aspd:      { label: '% Attack Speed', adj: 'Frenzied', roll: il => randi(4, 10 + Math.floor(il / 2)) },
};
const BASE_LABEL = { dmg: 'Weapon Damage', armor: 'Armor', spell: '% Spell Damage', crit: '% Crit Chance', mp: 'Max Mana', speed: '% Move Speed' };

const RARE_A = ['Doom', 'Grim', 'Storm', 'Soul', 'Blood', 'Shadow', 'Dread', 'Bone', 'Ash', 'Night', 'Rune', 'Wraith'];
const RARE_B = ['Song', 'Bite', 'Ward', 'Shroud', 'Reaver', 'Call', 'Grasp', 'Brand', 'Veil', 'Fang', 'Mark'];
const LEGEND_NAMES = {
  weapon: ['Emberfang', 'The Last Whisper', 'Gravecleaver', 'Stormcaller'],
  offhand: ['Aegis of Dawn', 'Wardens Promise', 'Heart of the Abyss'],
  helm: ['Crown of the Lich', 'Ashen Visage', 'Helm of Echoes'],
  armor: ['Shroud of Embers', 'Bonewoven Plate', 'Mantle of the Void'],
  gloves: ['Grasp of the Lich', 'Emberhands'],
  boots: ['Stridewalkers', 'Ashen Treads'],
  amulet: ['Eye of the Deep', 'Tear of the Ancients'],
  ring: ['Ouroboros Band', 'Seal of Ashes'],
};

function rollRarity(boost) {
  return weightedPick([
    ['common', 60 - boost * 25],
    ['magic', 28 + boost * 5],
    ['rare', 10 + boost * 12],
    ['legendary', 2 + boost * 4],
  ]);
}

let itemUid = Date.now();

function rollAffix(key, ilvl, rarity) {
  let v = AFFIXES[key].roll(ilvl);
  if (rarity === 'legendary') v = Number.isInteger(v) ? Math.round(v * 1.5) : +(v * 1.5).toFixed(1);
  return v;
}

function generateItem(ilvl, boost = 0, slot = null) {
  slot = slot || pick(SLOTS);
  let rarity = rollRarity(boost);
  if ((slot === 'ring' || slot === 'amulet') && rarity === 'common') rarity = 'magic';
  const R = RARITIES[rarity];
  const b = pick(ITEM_BASES[slot]);
  const q = () => rand(0.85, 1.15) * R.mult;
  const base = {};
  if (slot === 'weapon') base.dmg = Math.max(2, Math.round((4 + ilvl * 1.8) * q() * b.dmg));
  if (slot === 'weapon' && b.spell) base.spell = Math.round((8 + ilvl * 1.2) * R.mult);
  if (slot === 'offhand' && b.spell) base.spell = Math.round((5 + ilvl) * R.mult);
  if (b.crit) base.crit = b.crit;
  if (b.armor && ARMOR_BASE[slot]) base.armor = Math.max(1, Math.round((ARMOR_BASE[slot][0] + ilvl * ARMOR_BASE[slot][1]) * q() * b.armor));
  if (b.mp) base.mp = Math.round((8 + ilvl * 3) * b.mp * R.mult);
  if (b.speed) base.speed = 3;

  const keys = shuffle(Object.keys(AFFIXES)).slice(0, randi(R.affixes[0], R.affixes[1]));
  const affixes = {};
  for (const k of keys) affixes[k] = rollAffix(k, ilvl, rarity);

  let name = b.name;
  if (rarity === 'magic') name = `${AFFIXES[keys[0]].adj} ${b.name}`;
  if (rarity === 'rare') name = `${pick(RARE_A)} ${pick(RARE_B)}`;
  if (rarity === 'legendary') name = pick(LEGEND_NAMES[slot]);

  return {
    uid: itemUid++, slot, rarity, name, baseName: b.name, ilvl, base, affixes, up: 0,
    value: Math.round((5 + ilvl * 3) * R.value),
  };
}

function starterWeapon() {
  return { uid: itemUid++, slot: 'weapon', rarity: 'common', name: 'Rusty Sword', baseName: 'Sword', ilvl: 1, base: { dmg: 6 }, affixes: {}, up: 0, value: 3 };
}

// ---------------------------------------------------------------- Item upgrades (+1 .. +10 at the Forge)
const upMult = it => 1 + 0.12 * (it.up || 0);
function scaled(it, v) {
  const m = upMult(it);
  return Number.isInteger(v) ? Math.round(v * m) : +(v * m).toFixed(1);
}

// All stats an item gives, after its upgrade level.
function itemStats(it) {
  const out = {};
  for (const [k, v] of Object.entries(it.base)) out[k] = (out[k] || 0) + scaled(it, v);
  for (const [k, v] of Object.entries(it.affixes)) out[k] = (out[k] || 0) + scaled(it, v);
  return out;
}

function fmtStat(label, v, plus = true) {
  return label.startsWith('%') ? `${plus ? '+' : ''}${v}${label}` : `${plus ? '+' : ''}${v} ${label}`;
}

function itemLines(it) {
  const lines = [];
  for (const [k, v] of Object.entries(it.base)) lines.push({ text: fmtStat(BASE_LABEL[k], scaled(it, v), k !== 'dmg' && k !== 'armor'), base: true });
  for (const [k, v] of Object.entries(it.affixes)) lines.push({ text: fmtStat(AFFIXES[k].label, scaled(it, v)), key: k });
  return lines;
}

const itemName = it => (it.up ? `+${it.up} ` : '') + it.name;
const itemValue = it => Math.round(it.value * (1 + 0.3 * (it.up || 0)));

// ---------------------------------------------------------------- Crafting materials
const MATS = {
  scrap: { name: 'Iron Scrap', icon: '🔩', color: '#c0c0c0' },
  dust:  { name: 'Arcane Dust', icon: '✨', color: '#8fa8ff' },
  shard: { name: 'Ember Shard', icon: '💠', color: '#ff8c1a' },
};

function upgradeCost(it) {
  const n = it.up || 0;
  return {
    gold: Math.round((12 + it.ilvl * 5) * (n + 1) * Math.sqrt(RARITIES[it.rarity].value)),
    scrap: 3 + n * 3,
    dust: n >= 4 ? n - 3 : 0,
    shard: n >= 7 ? 1 : 0,
  };
}

function enchantCost(it) {
  const c = { gold: 25 + it.ilvl * 6 };
  if (it.rarity === 'legendary') c.shard = 1;
  else if (it.rarity === 'rare') c.dust = 2;
  else c.scrap = 5;
  return c;
}

function salvageYield(it) {
  const y = { scrap: it.up || 0 };
  if (it.rarity === 'common') y.scrap += randi(1, 2);
  if (it.rarity === 'magic') y.scrap += randi(3, 4);
  if (it.rarity === 'rare') { y.scrap += 2; y.dust = randi(2, 3); }
  if (it.rarity === 'legendary') { y.scrap += 4; y.dust = 3; y.shard = 1; }
  return y;
}

// ---------------------------------------------------------------- Permanent upgrades (bought with gold)
const UPGRADES = {
  vitality: { name: 'Shrine of Vitality', icon: '❤️', max: 10, base: 120, desc: r => `+${r * 5}% max life` },
  mana:     { name: 'Well of Mana',       icon: '💧', max: 10, base: 120, desc: r => `+${r * 5}% max mana` },
  might:    { name: 'Sharpened Arms',     icon: '⚔️', max: 10, base: 150, desc: r => `+${r * 4}% all damage` },
  potion:   { name: 'Alchemy',            icon: '🧪', max: 6,  base: 150, desc: r => `Potions restore ${40 + r * 6}%` },
  bag:      { name: 'Bigger Bag',         icon: '🎒', max: 3,  base: 400, desc: r => `${BASE_BAG + r * 6} bag slots` },
  fortune:  { name: 'Fortune',            icon: '💰', max: 10, base: 120, desc: r => `+${r * 15}% gold found` },
  hunter:   { name: 'Treasure Hunter',    icon: '🔍', max: 10, base: 200, desc: r => `+${r * 10}% better loot rarity` },
};
const upgradePrice = (id, rank) => Math.round(UPGRADES[id].base * Math.pow(1.6, rank));

const potionPrice = floor => 30 + floor * 6;
