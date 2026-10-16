'use strict';
// Update checks, tutorial, "What's new" and the Help tab.

const VERSION_URL = 'js/version.js';
const UPDATE_EVERY_MS = 5 * 60 * 1000;
const LS_TUTORIAL = 'shadowdeep_tutorial_done';
const LS_LAST_VERSION = 'shadowdeep_last_version';

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }

// ---------------------------------------------------------------- Modal (pauses the game while open)

const Modal = {
  handlers: {},

  init() {
    this.el = document.getElementById('modal');
    this.box = document.getElementById('modalBox');
    this.box.addEventListener('click', e => {
      const b = e.target.closest('[data-m]');
      if (b && this.handlers[b.dataset.m]) this.handlers[b.dataset.m](b);
    });
  },

  show(html, handlers = {}) {
    this.handlers = handlers;
    this.box.innerHTML = html;
    this.el.classList.remove('hidden');
    G.modal = true;
    Input.reset();
  },

  hide() {
    this.el.classList.add('hidden');
    G.modal = false;
  },

  get open() { return !this.el.classList.contains('hidden'); },
};

// ---------------------------------------------------------------- Update checker

const Updater = {
  latest: null,      // newer version found on the server
  snoozeUntil: 0,

  init() {
    setTimeout(() => this.check(), 20000);
    setInterval(() => this.check(), UPDATE_EVERY_MS);
    // Phones suspend pages in the background, so also check whenever the player comes back.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.check(); });
  },

  async fetchServerVersion() {
    const r = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const m = (await r.text()).match(/GAME_VERSION\s*=\s*'([^']+)'/);
    if (!m) throw new Error('no version');
    return m[1];
  },

  // Returns 'new', 'current' or 'offline'.
  async check(manual = false) {
    let v;
    try { v = await this.fetchServerVersion(); } catch (e) { return 'offline'; }
    if (versionCmp(v, GAME_VERSION) <= 0) return 'current';
    this.latest = v;
    UI.cache.helpB = null; // refresh the ❓ badge
    if (manual || (Date.now() > this.snoozeUntil && !Modal.open)) this.prompt();
    return 'new';
  },

  prompt() {
    Modal.show(`
      <div class="mIcon">⬆️</div>
      <h2>Update available</h2>
      <p>Version <b>${this.latest}</b> is out. You have <b>${GAME_VERSION}</b>.</p>
      <p class="dim">Reload to get the newest version. Your progress is saved first.</p>
      <div class="mBtns"><button class="primary" data-m="reload">Reload now</button><button data-m="later">Later</button></div>`, {
      reload: () => this.reload(),
      later: () => { this.snoozeUntil = Date.now() + 10 * 60 * 1000; Modal.hide(); },
    });
  },

  reload() {
    saveGame();
    // A new URL makes the browser fetch fresh HTML; the loader then fetches fresh scripts for this version.
    location.replace(`${location.pathname}?v=${encodeURIComponent(this.latest || Date.now())}`);
  },
};

// ---------------------------------------------------------------- Tutorial

const TUTORIAL = [
  { icon: '🕹️', title: 'Move', text: 'Touch and drag anywhere on the <b>left half</b> of the screen to walk.' },
  { icon: '⚔️', title: 'Fight', text: '<b>Hold</b> the big ⚔️ button to attack. Attacks aim at the nearest enemy for you. 🔥 casts Fireball, which uses mana (the blue bar).' },
  { icon: '❄️', title: 'Skills grow with use', text: 'Every hit gives that skill XP, so the skills you use most get stronger. New spells unlock at levels 3, 5 and 8.' },
  { icon: '🧪', title: 'Stay alive', text: 'Keep an eye on the red health bar. Tap 🧪 to drink a potion. Enemies flash a <span class="red">red arc</span> just before they hit, so step away!' },
  { icon: '💰', title: 'Loot', text: 'Enemies and chests drop gold, potions, materials and gear. Walk over loot to pick it up. A light beam marks better items: <span class="rm">Magic</span>, <span class="rr">Rare</span>, <span class="rl">Legendary</span>.' },
  { icon: '🎒', title: 'Gear up', text: 'Tap 🎒 to open your bag. Tap an item, check the <span class="up">▲ green</span> / <span class="down">▼ red</span> comparison, then tap <b>Equip</b>. Your gear shows on your hero!' },
  { icon: '⭐', title: 'Grow stronger', text: 'Each level up gives 3 points to spend in 👤 Hero. Upgrade items at the ⚒️ Forge, and buy permanent boosts in ⭐ Upgrades.' },
  { icon: '🌀', title: 'Go deeper', text: 'Find the <b>purple portal</b> to reach the next floor. Every 5th floor has a boss. Tap ❓ any time for help.' },
];

const Tutorial = {
  start(onDone) {
    this.onDone = onDone;
    this.step = 0;
    this.render();
  },

  render() {
    const s = TUTORIAL[this.step], last = this.step === TUTORIAL.length - 1;
    const dots = TUTORIAL.map((_, i) => `<i class="${i === this.step ? 'on' : ''}"></i>`).join('');
    Modal.show(`
      <div class="mIcon">${s.icon}</div>
      <h2>${s.title}</h2>
      <p>${s.text}</p>
      <div class="dots">${dots}</div>
      <div class="mBtns">
        ${this.step ? '<button data-m="back">Back</button>' : '<button data-m="skip">Skip</button>'}
        <button class="primary" data-m="next">${last ? "Let's go!" : 'Next'}</button>
      </div>`, {
      back: () => { this.step--; this.render(); },
      skip: () => this.finish(),
      next: () => { if (last) this.finish(); else { this.step++; this.render(); } },
    });
  },

  finish() {
    lsSet(LS_TUTORIAL, '1');
    Modal.hide();
    if (this.onDone) this.onDone();
  },
};

// ---------------------------------------------------------------- What's new / release notes

function releaseNotesHTML(sinceVersion = null) {
  return RELEASE_NOTES
    .filter(r => !sinceVersion || versionCmp(r.version, sinceVersion) > 0)
    .map(r => `<div class="release">
      <div class="relHead"><b>v${r.version}</b> <span class="dim">${r.date}</span>${r.version === GAME_VERSION ? ' <span class="tag">Current</span>' : ''}</div>
      <ul>${r.notes.map(n => `<li>${n}</li>`).join('')}</ul>
    </div>`).join('');
}

function showWhatsNew(sinceVersion) {
  Modal.show(`
    <div class="mIcon">✨</div>
    <h2>What's new</h2>
    <div class="mScroll">${releaseNotesHTML(sinceVersion)}</div>
    <div class="mBtns"><button class="primary" data-m="ok">Got it</button></div>`, { ok: () => Modal.hide() });
}

// Called when a game starts: tutorial for new players, release notes for returning ones.
function onboard(isNewGame) {
  const last = lsGet(LS_LAST_VERSION);
  lsSet(LS_LAST_VERSION, GAME_VERSION);
  if (isNewGame && !lsGet(LS_TUTORIAL)) { Tutorial.start(); return; }
  if (last && versionCmp(GAME_VERSION, last) > 0) showWhatsNew(last);
}

// ---------------------------------------------------------------- Help tab

const HELP_SECTIONS = [
  ['🕹️ Controls', `<b>Move:</b> drag on the left half of the screen. <b>Attack:</b> hold ⚔️. <b>Spells:</b> hold 🔥 ❄️ ⚡ 🌀. <b>Potion:</b> tap 🧪.<br>
    <span class="dim">Keyboard: WASD to move · Space to slash · 1–4 for spells · Q for a potion · C/K/I/F/U/H for the menus · Esc to close.</span>`],
  ['⚔️ Combat', 'Attacks and spells aim at the nearest enemy (marked with a red ring). Enemies flash a red arc just before they strike, so move away to dodge. Champions (blue name) are tougher but drop better loot.'],
  ['📜 Skills', 'Skills level up from use: every hit earns that skill XP, and kills earn extra. Higher levels mean more damage and bigger areas. Frost Nova unlocks at level 3, Chain Lightning at 5 and Whirlwind at 8.'],
  ['👤 Leveling', 'Killing enemies gives XP. Each level up fully heals you and gives 3 attribute points: <b>Strength</b> (+1.5% weapon damage each), <b>Intellect</b> (+1.5% spell power and mana each) and <b>Vitality</b> (+2% life each). Each level also adds 4% damage. Your weapon\'s damage powers both melee and spells, so always look for a better weapon.'],
  ['🎒 Loot & Gear', 'Walk over loot to pick it up. Item rarity: <span class="rc">Common</span>, <span class="rm">Magic</span>, <span class="rr">Rare</span>, <span class="rl">Legendary</span>. Open 🎒, tap an item, compare the ▲/▼ stats and tap <b>Equip</b>. Sell items for gold, or salvage them for materials. Smash barrels, crates and urns with attacks for extra gold and potions.'],
  ['⚒️ Forge', 'Spend gold and materials to upgrade gear from +1 to +10 (each level gives +12% to all its stats), or reroll a bonus you don\'t like. 🔩 Iron Scrap comes from salvaging and enemies, ✨ Arcane Dust from rares and chests, and 💠 Ember Shards from legendaries and boss chests.'],
  ['⭐ Upgrades', 'Permanent boosts bought with gold: more life, mana and damage, stronger potions, a bigger bag, more gold found and better loot.'],
  ['🌀 Floors & Bosses', 'Clear your way to the purple portal to go deeper. Every 3 floors brings a new area, and every 5th floor has a boss guarding the portal. Treasure chests open when you walk up to them.'],
  ['💾 Saving', 'The game saves automatically. If you die, you lose 10% of your gold and restart the floor.'],
];

const Help = {
  status: '',

  html() {
    const sections = HELP_SECTIONS.map(([t, body]) => `<details><summary>${t}</summary><div>${body}</div></details>`).join('');
    const upd = Updater.latest ? `<button class="primary" data-action="doUpdate">⬆️ Update to v${Updater.latest}</button>` : '<button data-action="checkUpdate">Check for updates</button>';
    return `
      <div class="helpTop">
        <div><b class="gameName">Shadowdeep</b> <span class="ver">v${GAME_VERSION}</span><div class="dim small">${this.status}</div></div>
        <div class="helpBtns">${upd}<button data-action="replayTutorial">Replay tutorial</button></div>
      </div>
      <h3>How to play</h3>
      <div class="howto">${sections}</div>
      <h3>Release notes</h3>
      ${releaseNotesHTML()}`;
  },

  async onAction(act) {
    if (act === 'checkUpdate') {
      this.status = 'Checking…';
      UI.renderPanel();
      const r = await Updater.check(true);
      this.status = r === 'current' ? "✓ You're on the latest version." : r === 'offline' ? "Couldn't reach the server. Try again later." : '';
      UI.renderPanel();
    }
    if (act === 'doUpdate') Updater.reload();
    if (act === 'replayTutorial') Tutorial.start();
  },
};
