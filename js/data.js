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
    mult: l => 1 + 0.08 * (l - 1),
    range: l => 64 + 2 * l,
    cost: () => 0,
    cd: () => 0.42,
    desc(l) { return `Swing in a wide arc for ${pctf(this.mult(l))} weapon damage.`; },
  },
  fireball: {
    name: 'Fireball', icon: '🔥', school: 'Fire', unlock: 1, color: '#ff9a3c', xpPerHit: 1,
    mult: l => 1.4 + 0.1 * (l - 1),
    radius: l => 44 + 3 * l,
    cost: l => Math.round(8 + 0.5 * l),
    cd: () => 0.55,
    desc(l) { return `Hurl a fireball that explodes for ${pctf(this.mult(l))} spell damage in a ${this.radius(l)} radius.`; },
  },
  frostnova: {
    name: 'Frost Nova', icon: '❄️', school: 'Cold', unlock: 3, color: '#8fd8ff', xpPerHit: 1,
    mult: l => 1.0 + 0.09 * (l - 1),
    radius: l => 140 + 6 * l,
    slow: l => +(2 + 0.15 * l).toFixed(1),
    cost: l => 14 + l,
    cd: l => Math.max(2.5, +(5 - 0.12 * l).toFixed(2)),
    desc(l) { return `Blast of ice around you: ${pctf(this.mult(l))} spell damage and slows enemies 50% for ${this.slow(l)}s.`; },
  },
  chain: {
    name: 'Chain Lightning', icon: '⚡', school: 'Lightning', unlock: 5, color: '#bfe3ff', xpPerHit: 0.7,
    mult: l => 0.8 + 0.06 * (l - 1),
    jumps: l => 2 + Math.floor(l / 4),
    falloff: 0.8, // each jump deals 80% of the previous one
    cost: l => Math.round(11 + 0.8 * l),
    cd: () => 1.0,
    desc(l) { return `Lightning strikes for ${pctf(this.mult(l))} spell damage, then arcs to ${this.jumps(l) - 1} more enemies, losing 20% per jump.`; },
  },
  whirlwind: {
    name: 'Whirlwind', icon: '🌀', school: 'Melee', unlock: 8, color: '#e0e0e0', xpPerHit: 0.35,
    mult: l => 0.65 + 0.05 * (l - 1),
    duration: () => 1.6,
    radius: () => 100,
    cost: l => 15 + l,
    cd: l => Math.max(2.5, +(4.5 - 0.1 * l).toFixed(2)),
    desc(l) { return `Spin for 1.6s, hitting everything nearby 4x per second for ${pctf(this.mult(l))} weapon damage.`; },
  },
};

const skillXpReq = l => Math.floor(14 * Math.pow(l, 1.5));
const playerXpReq = l => Math.floor(60 * Math.pow(l, 1.75));

// ---------------------------------------------------------------- Enemies
const ENEMIES = {
  skeleton: { name: 'Skeleton', hp: 28, dmg: 7, speed: 88, r: 15, xp: 12, kind: 'melee', reach: 14, atkCd: 1.2, wind: 0.3, minFloor: 1, weight: 10 },
  bat:      { name: 'Blood Bat', hp: 14, dmg: 5, speed: 150, r: 11, xp: 8, kind: 'melee', reach: 10, atkCd: 0.9, wind: 0.2, minFloor: 1, weight: 6 },
  zombie:   { name: 'Ghoul', hp: 55, dmg: 13, speed: 55, r: 18, xp: 20, kind: 'melee', reach: 16, atkCd: 1.6, wind: 0.45, minFloor: 2, weight: 7 },
  cultist:  { name: 'Cultist', hp: 22, dmg: 9, speed: 72, r: 14, xp: 18, kind: 'ranged', range: 290, projSpeed: 250, atkCd: 1.9, wind: 0.45, minFloor: 3, weight: 5 },
  brute:    { name: 'Gravelord', hp: 1500, dmg: 24, speed: 80, r: 30, xp: 260, kind: 'melee', reach: 22, atkCd: 1.5, wind: 0.5, boss: true },
};

// Enemies grow ~16.5%/floor; gear grows ~12%/item level (itemScale). The gap is what
// leveling, the Forge and permanent upgrades are for.
const enemyScale = f => ({
  hp: Math.pow(1.165, f - 1),
  dmg: Math.pow(1.145, f - 1),
  xp: Math.pow(1.1, f - 1),
});
const itemScale = il => Math.pow(1.12, il - 1);
// Armor's damage reduction is armor / (armor + armorK). armorK grows with the floor,
// so armor from current-level gear always gives a similar ~25-45% reduction.
const armorK = floor => 60 * itemScale(floor);

// ---------------------------------------------------------------- Themes (change every 3 floors)
// Each area has a palette for its painted textures (tex), a tint for the darkness,
// a color-grade overlay and its own floating ambient particles.
const THEMES = [
  {
    key: 'catacombs', name: 'Catacombs', dark: 0.86, torch: '#ffb347', darkColor: [8, 5, 3], grade: 'rgba(255,170,90,0.10)', ambient: 'dust',
    tex: { floor: [84, 74, 64], grout: [28, 23, 19], top: [62, 55, 48], brick: [92, 76, 62], mortar: [34, 27, 22], accent: [120, 100, 80] },
  },
  {
    key: 'fungal', name: 'Fungal Caverns', dark: 0.88, torch: '#9dff8a', darkColor: [2, 8, 5], grade: 'rgba(90,255,140,0.08)', ambient: 'spores',
    tex: { floor: [58, 70, 60], grout: [18, 24, 19], top: [48, 62, 52], brick: [62, 80, 66], mortar: [20, 28, 22], accent: [90, 150, 60] },
  },
  {
    key: 'frozen', name: 'Frozen Depths', dark: 0.84, torch: '#8fd8ff', darkColor: [2, 6, 14], grade: 'rgba(140,200,255,0.10)', ambient: 'snow',
    tex: { floor: [72, 88, 104], grout: [24, 32, 42], top: [86, 108, 128], brick: [84, 104, 124], mortar: [28, 36, 48], accent: [190, 230, 255] },
  },
  {
    key: 'hell', name: 'Burning Hells', dark: 0.85, torch: '#ff6a2a', darkColor: [14, 2, 0], grade: 'rgba(255,90,40,0.10)', ambient: 'embers',
    tex: { floor: [70, 40, 34], grout: [20, 8, 6], top: [74, 34, 26], brick: [96, 44, 34], mortar: [26, 10, 8], accent: [255, 110, 40] },
  },
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
    { name: 'Staff', type: 'staff', icon: '🪄', dmg: 0.8, spell: 1 },
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
const ARMOR_BASE = { offhand: 6, helm: 4, armor: 9, gloves: 3, boots: 3 }; // at item level 1, grows with itemScale
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
  str:       { label: 'Strength',       adj: 'Mighty',   roll: il => randi(1, 2 + Math.floor(il * 0.3)) },
  int:       { label: 'Intellect',      adj: 'Wise',     roll: il => randi(1, 2 + Math.floor(il * 0.3)) },
  vit:       { label: 'Vitality',       adj: 'Sturdy',   roll: il => randi(1, 2 + Math.floor(il * 0.3)) },
  hp:        { label: 'Max Life',       adj: 'Vital',    roll: il => Math.round(randi(8, 16) * itemScale(il)) },
  mp:        { label: 'Max Mana',       adj: 'Arcane',   roll: il => randi(4, 8 + il * 2) },
  spell:     { label: '% Spell Damage', adj: 'Blazing',  roll: il => randi(3, 8 + Math.floor(il / 2)) },
  crit:      { label: '% Crit Chance',  adj: 'Keen',     roll: il => randi(1, 2 + Math.floor(il / 4)) },
  armor:     { label: 'Armor',          adj: 'Warded',   roll: il => Math.round(randi(2, 5) * itemScale(il)) },
  regen:     { label: 'Life Regen /s',  adj: 'Mending',  roll: il => +(rand(0.4, 1.2) * itemScale(il)).toFixed(1) },
  manaregen: { label: 'Mana Regen /s',  adj: 'Focused',  roll: il => +rand(0.2, 0.5 + il * 0.04).toFixed(1) },
  speed:     { label: '% Move Speed',   adj: 'Swift',    roll: () => randi(3, 8) },
  aspd:      { label: '% Attack Speed', adj: 'Frenzied', roll: il => randi(3, 8 + Math.floor(il / 3)) },
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
    ['legendary', 1 + boost * 2.5],
  ]);
}

let itemUid = Date.now();

function rollAffix(key, ilvl, rarity) {
  let v = AFFIXES[key].roll(ilvl);
  if (rarity === 'legendary') v = Number.isInteger(v) ? Math.round(v * 1.3) : +(v * 1.3).toFixed(1);
  return v;
}

// Weapons drive all damage, so they drop more often than any other slot.
const SLOT_DROP_WEIGHTS = { weapon: 3, offhand: 1, helm: 1, armor: 1, gloves: 1, boots: 1, amulet: 1, ring: 1 };

function generateItem(ilvl, boost = 0, slot = null) {
  slot = slot || weightedPick(Object.entries(SLOT_DROP_WEIGHTS));
  let rarity = rollRarity(boost);
  if ((slot === 'ring' || slot === 'amulet') && rarity === 'common') rarity = 'magic';
  const R = RARITIES[rarity];
  const b = pick(ITEM_BASES[slot]);
  const q = () => rand(0.85, 1.15) * R.mult;
  const base = {};
  if (slot === 'weapon') base.dmg = Math.max(2, Math.round(8 * itemScale(ilvl) * q() * b.dmg));
  if (slot === 'weapon' && b.spell) base.spell = Math.round((15 + ilvl * 0.5) * R.mult);
  if (slot === 'offhand' && b.spell) base.spell = Math.round((6 + ilvl * 0.4) * R.mult);
  if (b.crit) base.crit = b.crit;
  if (b.armor && ARMOR_BASE[slot]) base.armor = Math.max(1, Math.round(ARMOR_BASE[slot] * itemScale(ilvl) * q() * b.armor));
  if (b.mp) base.mp = Math.round((10 + ilvl * 2) * b.mp * R.mult);
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
  return { uid: itemUid++, slot: 'weapon', rarity: 'common', name: 'Rusty Sword', baseName: 'Sword', ilvl: 1, base: { dmg: 8 }, affixes: {}, up: 0, value: 3 };
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
