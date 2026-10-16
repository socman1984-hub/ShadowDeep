'use strict';
// HTML overlay: HUD bars, action buttons, minimap, banners and the Character / Skills / Inventory panel.

const UI = {
  els: {},
  cache: {},
  tab: 'character',
  selected: null, // { from: 'bag' | 'equip', key }
  forgeSel: null,
  bannerQueue: [],
  bannerBusy: false,

  init() {
    const $ = id => document.getElementById(id);
    for (const id of ['hud', 'hpFill', 'hpText', 'mpFill', 'mpText', 'xpFill', 'lvlText', 'floorText', 'goldText', 'minimap',
      'actions', 'banner', 'bannerTitle', 'bannerSub', 'toast', 'panel', 'panelBody', 'title', 'death', 'attrBadge', 'bagBadge',
      'continueBtn', 'newBtn', 'saveInfo', 'respawnBtn', 'helpBadge']) this.els[id] = $(id);
    this.mm = this.els.minimap.getContext('2d');

    // Action buttons: big Slash button plus spell buttons arranged in an arc.
    SKILL_ORDER.forEach((id, i) => {
      const b = document.createElement('button');
      b.className = `act ${i === 0 ? 'main' : 's' + i}`;
      b.innerHTML = `<span class="ic">${SKILLS[id].icon}</span><span class="lv"></span><span class="cost"></span><div class="cd"></div><span class="lock">🔒<br>Lv ${SKILLS[id].unlock}</span>`;
      this.els.actions.appendChild(b);
      Input.bindHoldButton(b, id);
      this.els['act_' + id] = b;
    });
    const pot = document.createElement('button');
    pot.className = 'act potion';
    pot.innerHTML = '<span class="ic">🧪</span><span class="lv" id="potCount"></span>';
    pot.addEventListener('pointerdown', e => { e.preventDefault(); Input.potionQueued = true; });
    this.els.actions.appendChild(pot);
    this.els.potCount = pot.querySelector('#potCount');

    document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => this.togglePanel(b.dataset.open)));
    document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { this.tab = b.dataset.tab; this.selected = null; this.renderPanel(); }));
    $('closePanel').addEventListener('click', () => this.closePanel());
    this.els.panelBody.addEventListener('click', e => this.onPanelClick(e));

    const save = loadSave();
    if (save) {
      this.els.continueBtn.classList.remove('hidden');
      this.els.saveInfo.textContent = `Level ${save.level} · Floor ${save.floor}`;
    }
    this.els.continueBtn.addEventListener('click', () => startGame(true));
    this.els.newBtn.addEventListener('click', () => {
      if (loadSave() && !confirm('Start a new character? Your current save will be overwritten.')) return;
      startGame(false);
    });
    this.els.respawnBtn.addEventListener('click', () => { this.els.death.classList.add('hidden'); respawn(); });
    $('titleVer').textContent = `v${GAME_VERSION}`;
    $('newsBtn').addEventListener('click', () => showWhatsNew(null));
    $('howBtn').addEventListener('click', () => Tutorial.start());
  },

  onGameStart() {
    this.els.title.classList.add('hidden');
    this.els.hud.classList.remove('hidden');
  },

  // Only touch the DOM when a value actually changes.
  set(key, prop, value, el) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    if (prop === 'text') el.textContent = value;
    else if (prop === 'width') el.style.width = value;
    else if (prop === 'height') el.style.height = value;
    else if (prop === 'class') el.className = value;
  },

  update() {
    const p = G.player, s = p.stats, E = this.els;
    this.set('hpw', 'width', (p.hp / s.maxHp * 100).toFixed(1) + '%', E.hpFill);
    this.set('hpt', 'text', `${Math.ceil(p.hp)} / ${s.maxHp}`, E.hpText);
    this.set('mpw', 'width', (p.mp / s.maxMp * 100).toFixed(1) + '%', E.mpFill);
    this.set('mpt', 'text', `${Math.floor(p.mp)} / ${s.maxMp}`, E.mpText);
    this.set('xpw', 'width', (p.xp / playerXpReq(p.level) * 100).toFixed(1) + '%', E.xpFill);
    this.set('lvl', 'text', `Lv ${p.level}`, E.lvlText);
    this.set('flr', 'text', `Floor ${p.floor}`, E.floorText);
    this.set('gold', 'text', `${fmt(p.gold)}g`, E.goldText);
    this.set('pot', 'text', String(p.potions), E.potCount);
    this.set('attrB', 'text', p.points ? String(p.points) : '', E.attrBadge);
    this.set('bagB', 'text', p.bag.length ? String(p.bag.length) : '', E.bagBadge);
    this.set('helpB', 'text', Updater.latest ? '!' : '', E.helpBadge);

    for (const id of SKILL_ORDER) {
      const b = E['act_' + id], sk = SKILLS[id], st = p.skills[id];
      const locked = p.level < sk.unlock;
      const cost = sk.cost(st.lvl);
      const cls = `act ${id === 'slash' ? 'main' : 's' + SKILL_ORDER.indexOf(id)}${locked ? ' locked' : ''}${!locked && p.mp < cost ? ' nomana' : ''}${Input.held[id] ? ' down' : ''}`;
      this.set('cls_' + id, 'class', cls, b);
      this.set('lv_' + id, 'text', locked ? '' : String(st.lvl), b.children[1]);
      this.set('cost_' + id, 'text', cost && !locked ? String(cost) : '', b.children[2]);
      const max = sk.cd(st.lvl);
      const cdPct = locked ? 0 : Math.min(100, ((p.cds[id] || 0) / max) * 100);
      this.set('cd_' + id, 'height', cdPct.toFixed(0) + '%', b.children[3]);
    }
    if (G.state === 'paused' && this.tab === 'inventory') this.drawDoll();
  },

  // ---------------------------------------------------------------- Banners & toasts

  banner(title, sub = '') {
    this.bannerQueue.push({ title, sub });
    if (!this.bannerBusy) this.nextBanner();
  },

  nextBanner() {
    const b = this.bannerQueue.shift();
    if (!b) { this.bannerBusy = false; return; }
    this.bannerBusy = true;
    const el = this.els.banner;
    this.els.bannerTitle.textContent = b.title;
    this.els.bannerSub.textContent = b.sub;
    el.classList.remove('show');
    void el.offsetWidth; // restart CSS animation
    el.classList.add('show');
    setTimeout(() => this.nextBanner(), 1900);
  },

  toast(text) {
    const el = this.els.toast;
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  },

  showDeath() {
    this.closePanel();
    const lost = Math.floor(G.player.gold * 0.1);
    document.getElementById('deathSub').textContent = lost ? `Respawning costs ${lost} gold.` : 'Rise again, wanderer.';
    this.els.death.classList.remove('hidden');
  },

  // ---------------------------------------------------------------- Minimap

  drawMinimap() {
    const d = G.dungeon, m = this.mm, sc = 2;
    m.clearRect(0, 0, 128, 128);
    m.fillStyle = 'rgba(200,190,170,0.55)';
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
      const i = d.idx(x, y);
      if (d.seen[i] && !d.grid[i]) m.fillRect(x * sc, y * sc, sc, sc);
    }
    const ptx = Math.floor(G.portal.x / TILE), pty = Math.floor(G.portal.y / TILE);
    if (d.seen[d.idx(ptx, pty)]) {
      m.fillStyle = G.portal.active ? '#c08aff' : '#ff5a3a';
      m.fillRect(ptx * sc - 2, pty * sc - 2, 6, 6);
    }
    const p = G.player;
    m.fillStyle = '#ffe680';
    m.fillRect(p.x / TILE * sc - 2, p.y / TILE * sc - 2, 4, 4);
  },

  // ---------------------------------------------------------------- Panel

  togglePanel(tab) {
    if (G.state === 'paused' && this.tab === tab) { this.closePanel(); return; }
    this.openPanel(tab);
  },

  openPanel(tab) {
    if (G.state !== 'play' && G.state !== 'paused') return;
    this.tab = tab;
    this.selected = null;
    this.forgeSel = null;
    G.state = 'paused';
    Input.reset();
    this.els.panel.classList.remove('hidden');
    this.renderPanel();
  },

  closePanel() {
    if (G.state !== 'paused') return;
    this.els.panel.classList.add('hidden');
    G.dirty = true;
    G.state = 'play';
    saveGame();
  },

  renderPanel() {
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === this.tab));
    const views = {
      character: () => this.characterHTML(),
      skills: () => this.skillsHTML(),
      inventory: () => this.inventoryHTML(),
      forge: () => this.forgeHTML(),
      upgrades: () => this.upgradesHTML(),
      help: () => Help.html(),
    };
    const body = this.els.panelBody, scroll = body.scrollTop;
    body.innerHTML = views[this.tab]();
    body.scrollTop = scroll;
    if (this.tab === 'inventory') this.drawDoll();
  },

  // ---------------------------------------------------------------- Hero tab

  characterHTML() {
    const p = G.player, s = p.stats;
    const req = playerXpReq(p.level);
    const attr = (key, label, hint) => `
      <div class="attr">
        <div><b>${label}</b> <span class="val">${s[key]}</span><div class="hint">${hint}</div></div>
        <button class="plus" data-action="attr" data-key="${key}" ${p.points ? '' : 'disabled'}>+</button>
      </div>`;
    const row = (k, v) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`;
    return `
      <div class="charTop">
        <div class="bigLvl">Level ${p.level}</div>
        <div class="xpLine"><div class="xpTrack"><div style="width:${(p.xp / req * 100).toFixed(1)}%"></div></div>${fmt(p.xp)} / ${fmt(req)} XP</div>
      </div>
      <div class="cols">
        <div class="col">
          <h3>Attributes ${p.points ? `<span class="pts">${p.points} points to spend</span>` : ''}</h3>
          ${attr('str', 'Strength', '+1.5% weapon damage per point')}
          ${attr('int', 'Intellect', '+1.5% spell power and mana per point')}
          ${attr('vit', 'Vitality', '+2% life per point')}
        </div>
        <div class="col">
          <h3>Stats</h3>
          ${row('Life', s.maxHp)}${row('Mana', s.maxMp)}
          ${row('Weapon Damage', s.melee.toFixed(1))}${row('Spell Power', s.spellPower.toFixed(1))}
          ${row('Crit Chance', s.critChance + '%')}${row('Armor', `${s.armor} (−${Math.round(s.dmgReduction * 100)}% dmg)`)}
          ${row('Attack Speed', '+' + Math.round((s.atkSpeed - 1) * 100) + '%')}${row('Move Speed', '+' + Math.round((s.moveSpeed / 180 - 1) * 100) + '%')}
          ${row('Life Regen', s.hpRegen.toFixed(1) + '/s')}${row('Mana Regen', s.mpRegen.toFixed(1) + '/s')}
          ${row('Deepest Floor', p.maxFloor)}
        </div>
      </div>`;
  },

  skillsHTML() {
    const p = G.player;
    const cards = SKILL_ORDER.map(id => {
      const sk = SKILLS[id], st = p.skills[id];
      const locked = p.level < sk.unlock;
      const req = skillXpReq(st.lvl);
      const maxed = st.lvl >= MAX_SKILL_LVL;
      const cost = sk.cost(st.lvl);
      return `
        <div class="skill ${locked ? 'locked' : ''}">
          <div class="skIcon">${sk.icon}</div>
          <div class="skBody">
            <div class="skHead"><b>${sk.name}</b> <span class="school">${sk.school}</span>
              <span class="skLvl">${locked ? `Unlocks at Lv ${sk.unlock}` : `Level ${st.lvl}${maxed ? ' (Max)' : ''}`}</span></div>
            <div class="skDesc">${sk.desc(st.lvl)}</div>
            <div class="skMeta">${cost ? `${cost} mana` : 'No mana cost'} · ${sk.cd(st.lvl)}s cooldown</div>
            ${locked || maxed ? '' : `<div class="xpTrack small"><div style="width:${(st.xp / req * 100).toFixed(1)}%"></div></div>`}
          </div>
        </div>`;
    }).join('');
    return `<p class="tip">Skills grow stronger the more you use them — every hit earns skill XP, and kills earn extra.</p>${cards}`;
  },

  // ---------------------------------------------------------------- Gear tab

  matsHTML() {
    const p = G.player;
    return `<div class="mats">${Object.entries(MATS).map(([k, m]) => `<span title="${m.name}">${m.icon} ${p.mats[k]} <small>${m.name}</small></span>`).join('')}<span class="gold">${fmt(p.gold)}g</span></div>`;
  },

  inventoryHTML() {
    const p = G.player, size = bagSize(p);
    const eq = SLOTS.map(slot => {
      const it = p.equip[slot];
      const sel = this.selected && this.selected.from === 'equip' && this.selected.key === slot;
      return `<div class="eqSlot ${it ? 'r-' + it.rarity : 'empty'} ${sel ? 'sel' : ''}" data-action="selEquip" data-key="${slot}">
        <span class="eqIcon">${it ? itemIcon(it) : SLOT_ICON[slot]}</span>
        <div class="eqText"><div class="eqLbl">${SLOT_LABEL[slot]}</div><div class="eqName">${it ? itemName(it) : '—'}</div></div>
      </div>`;
    }).join('');
    let cells = '';
    for (let i = 0; i < size; i++) {
      const it = p.bag[i];
      const sel = this.selected && this.selected.from === 'bag' && this.selected.key === i;
      cells += it
        ? `<div class="cell r-${it.rarity} ${sel ? 'sel' : ''}" data-action="selBag" data-key="${i}">${itemIcon(it)}${it.up ? `<i>+${it.up}</i>` : ''}</div>`
        : '<div class="cell empty"></div>';
    }
    const price = potionPrice(p.floor);
    return `
      <div class="inv">
        <div class="eqCol"><canvas id="doll"></canvas><div class="eqGrid">${eq}</div></div>
        <div class="bagCol">
          <div class="bagHead">Bag ${p.bag.length}/${size} · 🧪 ${p.potions} <span class="hint">· tap an item to equip it</span></div>
          <div class="bagGrid">${cells}</div>
          <div class="invBtns">
            <button data-action="buyPotion" ${p.gold >= price ? '' : 'disabled'}>Buy Potion (${price}g)</button>
            <button data-action="salvageJunk">Salvage all Common &amp; Magic</button>
          </div>
          ${this.matsHTML()}
        </div>
      </div>
      ${this.gearSheetHTML()}`;
  },

  drawDoll() {
    const cv = document.getElementById('doll');
    if (!cv || !G.player) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const g = c.createRadialGradient(w / 2, h - 14, 2, w / 2, h - 14, w * 0.55);
    g.addColorStop(0, 'rgba(255,190,110,0.25)');
    g.addColorStop(1, 'rgba(255,190,110,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    const sc = Math.min(2.6, h / 58);
    const facing = Math.PI / 2 + Math.sin(performance.now() / 1500) * 1.25; // slowly turns to show off gear
    c.save();
    c.translate(w / 2, h - 12);
    c.scale(sc, sc);
    cEll(c, 0, 2, 15, 5, 'rgba(0,0,0,0.45)');
    drawHumanoid(c, 0, 0, playerLook(G.player), { facing, moving: false, walk: 0, seed: 0, wAng: facing + 0.8 });
    c.restore();
  },

  itemCard(it, title = '') {
    const R = RARITIES[it.rarity];
    const lines = itemLines(it).map(l => `<div class="${l.base ? 'base' : 'aff'}">${l.text}</div>`).join('');
    return `<div class="card">
      ${title ? `<div class="cardTitle">${title}</div>` : ''}
      <div class="iName" style="color:${R.color}">${itemIcon(it)} ${itemName(it)}</div>
      <div class="iSub">${R.label} ${it.baseName} · ${SLOT_LABEL[it.slot]} · iLvl ${it.ilvl}${it.up ? ` · Upgraded +${it.up}` : ''}</div>
      ${lines || '<div class="aff dim">No bonuses</div>'}
    </div>`;
  },

  // Shows how your stats change if you equip this item.
  diffHTML(it) {
    const p = G.player, a = p.stats, b = computeStats(p, { ...p.equip, [it.slot]: it });
    const rows = [
      ['Weapon Damage', s => s.melee, 1], ['Spell Power', s => s.spellPower, 1], ['Life', s => s.maxHp, 0], ['Mana', s => s.maxMp, 0],
      ['Armor', s => s.armor, 0], ['Crit Chance', s => s.critChance, 0, '%'], ['Attack Speed', s => s.atkSpeed * 100, 0, '%'],
      ['Move Speed', s => s.moveSpeed / 1.8, 0, '%'], ['Life Regen', s => s.hpRegen, 1, '/s'], ['Mana Regen', s => s.mpRegen, 1, '/s'],
    ];
    const out = [];
    for (const [label, f, dec, suf = ''] of rows) {
      const d = f(b) - f(a);
      if (Math.abs(d) < (dec ? 0.05 : 0.5)) continue;
      out.push(`<div class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲ +' : '▼ '}${d.toFixed(dec)}${suf} ${label}</div>`);
    }
    return `<div class="card diff"><div class="cardTitle">If equipped</div>${out.join('') || '<div class="dim">No change</div>'}</div>`;
  },

  // A pop-up card for one item. The action buttons sit right under the name so they
  // are always visible on a phone; the details below scroll if they don't fit.
  sheetHTML(it, buttons, body, extra = '') {
    const R = RARITIES[it.rarity];
    return `<div class="sheetBack" data-action="closeSheet"></div>
      <div class="sheet r-${it.rarity}">
        <div class="sheetHead">
          <span class="sheetIcon">${itemIcon(it)}</span>
          <div class="sheetTitle">
            <div class="iName" style="color:${R.color}">${itemName(it)}</div>
            <div class="iSub">${R.label} ${it.baseName} · ${SLOT_LABEL[it.slot]} · iLvl ${it.ilvl}${it.up ? ` · +${it.up}` : ''}</div>
          </div>
          <button class="sheetX" data-action="closeSheet" aria-label="Close">✕</button>
        </div>
        <div class="sheetBtns">${buttons}</div>
        ${extra}
        <div class="sheetBody">${body}</div>
      </div>`;
  },

  statLines(it) {
    const lines = itemLines(it).map(l => `<div class="${l.base ? 'base' : 'aff'}">${l.text}</div>`).join('');
    return `<div class="card"><div class="cardTitle">Stats</div>${lines || '<div class="aff dim">No bonuses</div>'}</div>`;
  },

  gearSheetHTML() {
    const p = G.player, sel = this.selected;
    if (!sel) return '';
    if (sel.from === 'equip') {
      const it = p.equip[sel.key];
      if (!it) return '';
      return this.sheetHTML(it,
        `<button data-action="unequip">Unequip</button><button data-action="toForge">⚒️ Forge</button>`,
        this.statLines(it));
    }
    const it = p.bag[sel.key];
    if (!it) return '';
    const cur = p.equip[it.slot];
    return this.sheetHTML(it,
      `<button class="primary" data-action="equip">Equip</button><button data-action="salvage">Salvage</button><button data-action="sell">Sell ${itemValue(it)}g</button><button data-action="toForge">⚒️</button>`,
      `<div class="sheetCols">${this.statLines(it)}${this.diffHTML(it)}</div>${cur ? this.itemCard(cur, 'Currently equipped') : ''}`);
  },

  // ---------------------------------------------------------------- Forge tab

  getItem(sel) {
    if (!sel) return null;
    return sel.from === 'equip' ? G.player.equip[sel.key] : G.player.bag[sel.key];
  },

  costHTML(cost) {
    const p = G.player;
    const parts = [];
    if (cost.gold) parts.push(`<span class="price ${p.gold >= cost.gold ? '' : 'lack'}">${fmt(cost.gold)}g</span>`);
    for (const k of Object.keys(MATS)) {
      if (cost[k]) parts.push(`<span class="price ${p.mats[k] >= cost[k] ? '' : 'lack'}">${MATS[k].icon} ${cost[k]}</span>`);
    }
    return parts.join(' ');
  },

  canAfford(cost) {
    const p = G.player;
    if ((cost.gold || 0) > p.gold) return false;
    return Object.keys(MATS).every(k => (cost[k] || 0) <= p.mats[k]);
  },

  pay(cost) {
    const p = G.player;
    p.gold -= cost.gold || 0;
    for (const k of Object.keys(MATS)) p.mats[k] -= cost[k] || 0;
  },

  forgeHTML() {
    const p = G.player;
    const list = [
      ...SLOTS.filter(s => p.equip[s]).map(s => ({ from: 'equip', key: s, it: p.equip[s] })),
      ...p.bag.map((it, i) => ({ from: 'bag', key: i, it })),
    ];
    const sel = null;
    const rows = list.map(({ from, key, it }) => {
      const on = sel && sel.from === from && sel.key === key;
      return `<div class="fRow ${on ? 'sel' : ''}" data-action="fsel" data-from="${from}" data-key="${key}">
        <span>${itemIcon(it)}</span><span class="fName" style="color:${RARITIES[it.rarity].color}">${itemName(it)}</span>${from === 'equip' ? '<span class="tag">Worn</span>' : ''}
      </div>`;
    }).join('');

    return `<div class="forge">${this.matsHTML()}
      <p class="tip">Tap an item to upgrade, enchant or salvage it. 🔩 Scrap comes from salvaging and enemies, ✨ Dust from rares and chests, 💠 Shards from legendaries and boss chests.</p>
      <div class="forgeList">${rows || '<div class="dim center">No items.</div>'}</div></div>
      ${this.forgeSheetHTML()}`;
  },

  forgeSheetHTML() {
    const sel = this.forgeSel, it = this.getItem(sel);
    if (!it) return '';
    const up = it.up || 0;
    let buttons = '', costLine = '', upgrade = '';
    if (up < MAX_UPGRADE) {
      const cost = upgradeCost(it);
      buttons += `<button class="primary" data-action="upgrade" ${this.canAfford(cost) ? '' : 'disabled'}>⚒️ Upgrade to +${up + 1}</button>`;
      costLine = `<div class="sheetCost">Upgrade cost: ${this.costHTML(cost)}</div>`;
      const before = itemLines(it), after = itemLines({ ...it, up: up + 1 });
      upgrade = `<div class="card"><div class="cardTitle">Upgrade +${up + 1} · +12% to all stats</div>${before.map((l, i) => `<div>${l.text} <span class="arrow">→</span> <span class="up">${after[i].text}</span></div>`).join('')}</div>`;
    } else {
      upgrade = `<div class="card">${this.statLines(it)}<div class="dim">Maximum upgrade (+${MAX_UPGRADE}) reached.</div></div>`;
    }
    if (sel.from === 'bag') buttons += '<button data-action="fsalvage">🔩 Salvage</button>';
    const ecost = enchantCost(it);
    const affs = itemLines(it).filter(l => l.key);
    const enchant = affs.length
      ? `<div class="card"><div class="cardTitle">✨ Enchant · reroll one bonus for ${this.costHTML(ecost)}</div>
          ${affs.map(l => `<div class="ench"><span class="aff">${l.text}</span><button data-action="enchant" data-aff="${l.key}" ${this.canAfford(ecost) ? '' : 'disabled'}>Reroll</button></div>`).join('')}</div>`
      : '<div class="card dim">Common items have no bonuses to enchant.</div>';
    return this.sheetHTML(it, buttons, upgrade + enchant, costLine);
  },

  // ---------------------------------------------------------------- Upgrades tab

  upgradesHTML() {
    const p = G.player;
    const cards = Object.entries(UPGRADES).map(([id, u]) => {
      const r = upRank(p, id), maxed = r >= u.max, price = upgradePrice(id, r);
      let pips = '';
      for (let i = 0; i < u.max; i++) pips += `<i class="${i < r ? 'on' : ''}"></i>`;
      return `<div class="upg">
        <div class="upIcon">${u.icon}</div>
        <div class="upBody">
          <div><b>${u.name}</b> <span class="rank">Rank ${r}/${u.max}</span></div>
          <div class="upDesc">${r ? 'Now: ' + u.desc(r) : 'Not learned'}${maxed ? '' : ` <span class="arrow">→</span> <span class="up">${u.desc(r + 1)}</span>`}</div>
          <div class="pips">${pips}</div>
        </div>
        <button class="${maxed ? '' : 'primary'}" data-action="buyUp" data-key="${id}" ${!maxed && p.gold >= price ? '' : 'disabled'}>${maxed ? 'Maxed' : fmt(price) + 'g'}</button>
      </div>`;
    }).join('');
    return `<p class="tip">Permanent upgrades, bought with gold. They last forever and stack with your gear. You have <span class="gold">${fmt(p.gold)}g</span>.</p>${cards}`;
  },

  // ---------------------------------------------------------------- Actions

  salvageItem(it) {
    const p = G.player, y = salvageYield(it);
    const got = [];
    for (const [k, v] of Object.entries(y)) if (v) { p.mats[k] += v; got.push(`${MATS[k].icon} ${v}`); }
    return got;
  },

  onPanelClick(e) {
    const b = e.target.closest('[data-action]');
    if (!b || b.disabled) return;
    const p = G.player, act = b.dataset.action, key = b.dataset.key;
    if (act === 'checkUpdate' || act === 'doUpdate' || act === 'replayTutorial') { Help.onAction(act); return; }
    if (act === 'quality') { setQuality(key); this.toast(`Graphics: ${QUALITY[key].label}`); this.renderPanel(); return; }
    switch (act) {
      case 'attr':
        if (p.points > 0) {
          p.attrs[key]++;
          p.points--;
          const before = p.stats.maxHp;
          recalcStats(p);
          if (key === 'vit') p.hp += p.stats.maxHp - before;
        }
        break;
      case 'selBag': this.selected = { from: 'bag', key: +key }; break;
      case 'selEquip':
        if (!p.equip[key]) { this.toast(`No ${SLOT_LABEL[key].toLowerCase()} equipped yet — find one in the dungeon!`); return; }
        this.selected = { from: 'equip', key };
        break;
      case 'closeSheet': this.selected = null; this.forgeSel = null; break;
      case 'equip': {
        const it = p.bag[this.selected.key];
        const cur = p.equip[it.slot];
        p.equip[it.slot] = it;
        if (cur) p.bag[this.selected.key] = cur; else p.bag.splice(this.selected.key, 1);
        recalcStats(p);
        this.selected = null;
        this.toast(`Equipped ${itemName(it)}`);
        break;
      }
      case 'unequip': {
        if (p.bag.length >= bagSize(p)) { this.toast('Your bag is full'); return; }
        const slot = this.selected.key;
        if (slot === 'weapon') { this.toast('You need a weapon equipped'); return; }
        p.bag.push(p.equip[slot]);
        p.equip[slot] = null;
        recalcStats(p);
        this.selected = null;
        break;
      }
      case 'sell': {
        const it = p.bag.splice(this.selected.key, 1)[0];
        p.gold += itemValue(it);
        this.selected = null;
        break;
      }
      case 'salvage': {
        const it = p.bag.splice(this.selected.key, 1)[0];
        this.toast(`Salvaged: ${this.salvageItem(it).join('  ')}`);
        this.selected = null;
        break;
      }
      case 'salvageJunk': {
        const junk = p.bag.filter(it => it.rarity === 'common' || it.rarity === 'magic');
        if (!junk.length) { this.toast('Nothing to salvage'); return; }
        const before = { ...p.mats };
        for (const it of junk) this.salvageItem(it);
        p.bag = p.bag.filter(it => !junk.includes(it));
        this.toast(`Salvaged ${junk.length} items: ` + Object.keys(MATS).filter(k => p.mats[k] > before[k]).map(k => `${MATS[k].icon} +${p.mats[k] - before[k]}`).join('  '));
        this.selected = null;
        break;
      }
      case 'buyPotion': {
        const price = potionPrice(p.floor);
        if (p.gold >= price) { p.gold -= price; p.potions++; }
        break;
      }
      case 'toForge':
        this.forgeSel = { ...this.selected };
        this.tab = 'forge';
        break;
      case 'fsel': this.forgeSel = { from: b.dataset.from, key: b.dataset.from === 'bag' ? +key : key }; break;
      case 'upgrade': {
        const it = this.getItem(this.forgeSel);
        const cost = upgradeCost(it);
        if (!this.canAfford(cost) || (it.up || 0) >= MAX_UPGRADE) return;
        this.pay(cost);
        it.up = (it.up || 0) + 1;
        recalcStats(p);
        this.toast(`⚒️ ${it.name} upgraded to +${it.up}!`);
        break;
      }
      case 'enchant': {
        const it = this.getItem(this.forgeSel);
        const cost = enchantCost(it);
        if (!this.canAfford(cost)) return;
        this.pay(cost);
        const old = b.dataset.aff;
        const pool = Object.keys(AFFIXES).filter(k => k === old || !(k in it.affixes));
        const nk = pick(pool);
        const rebuilt = {};
        for (const [k, v] of Object.entries(it.affixes)) {
          if (k === old) rebuilt[nk] = rollAffix(nk, it.ilvl, it.rarity);
          else rebuilt[k] = v;
        }
        it.affixes = rebuilt;
        recalcStats(p);
        this.toast(`✨ New bonus: ${fmtStat(AFFIXES[nk].label, scaled(it, rebuilt[nk]))}`);
        break;
      }
      case 'fsalvage': {
        const it = p.bag.splice(this.forgeSel.key, 1)[0];
        this.toast(`Salvaged: ${this.salvageItem(it).join('  ')}`);
        this.forgeSel = null;
        break;
      }
      case 'buyUp': {
        const r = upRank(p, key), price = upgradePrice(key, r);
        if (r >= UPGRADES[key].max || p.gold < price) return;
        p.gold -= price;
        p.upgrades[key] = r + 1;
        const before = p.stats.maxHp;
        recalcStats(p);
        p.hp += Math.max(0, p.stats.maxHp - before);
        this.toast(`${UPGRADES[key].icon} ${UPGRADES[key].name} → Rank ${r + 1}`);
        break;
      }
    }
    this.renderPanel();
  },
};
