'use strict';
// Touch joystick + hold-to-cast buttons, with keyboard fallback for desktop testing.
//   Keyboard: WASD/arrows move, Space/J slash, 1-4 spells, Q potion, C/K/I/F/U panels, Esc close.

const KEY_SKILLS = { ' ': 'slash', j: 'slash', 1: 'fireball', 2: 'frostnova', 3: 'chain', 4: 'whirlwind' };
const JOY_RADIUS = 55;

const Input = {
  move: { x: 0, y: 0 },
  keys: {},
  held: {},
  joyId: null,
  joyBase: { x: 0, y: 0 },
  potionQueued: false,

  init() {
    const zone = document.getElementById('joyZone');
    const base = document.getElementById('joyBase');
    const knob = document.getElementById('joyKnob');

    zone.addEventListener('pointerdown', e => {
      if (this.joyId !== null) return;
      e.preventDefault();
      this.joyId = e.pointerId;
      this.joyBase = { x: e.clientX, y: e.clientY };
      zone.setPointerCapture(e.pointerId);
      base.style.left = e.clientX + 'px';
      base.style.top = e.clientY + 'px';
      base.classList.add('on');
      knob.style.transform = 'translate(-50%, -50%)';
    });
    zone.addEventListener('pointermove', e => {
      if (e.pointerId !== this.joyId) return;
      let dx = e.clientX - this.joyBase.x, dy = e.clientY - this.joyBase.y;
      const len = Math.hypot(dx, dy);
      if (len > JOY_RADIUS) { dx *= JOY_RADIUS / len; dy *= JOY_RADIUS / len; }
      this.move.x = dx / JOY_RADIUS;
      this.move.y = dy / JOY_RADIUS;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const end = e => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null;
      this.move.x = this.move.y = 0;
      base.classList.remove('on');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      if (k === ' ') e.preventDefault();
      if (k === 'q') this.potionQueued = true;
      if (k === 'c') UI.togglePanel('character');
      if (k === 'k') UI.togglePanel('skills');
      if (k === 'i') UI.togglePanel('inventory');
      if (k === 'f') UI.togglePanel('forge');
      if (k === 'u') UI.togglePanel('upgrades');
      if (k === 'escape') UI.closePanel();
    });
    window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => this.reset());
  },

  bindHoldButton(el, id) {
    const down = e => { e.preventDefault(); this.held[id] = true; el.classList.add('down'); };
    const up = () => { this.held[id] = false; el.classList.remove('down'); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', e => e.preventDefault());
  },

  getMove() {
    let x = this.move.x, y = this.move.y;
    const k = this.keys;
    if (k.a || k.arrowleft) x -= 1;
    if (k.d || k.arrowright) x += 1;
    if (k.w || k.arrowup) y -= 1;
    if (k.s || k.arrowdown) y += 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  },

  isHeld(id) {
    if (this.held[id]) return true;
    for (const [key, sid] of Object.entries(KEY_SKILLS)) if (sid === id && this.keys[key]) return true;
    return false;
  },

  consumePotion() {
    const q = this.potionQueued;
    this.potionQueued = false;
    return q;
  },

  reset() {
    this.keys = {};
    this.held = {};
    this.move.x = this.move.y = 0;
    this.joyId = null;
    document.getElementById('joyBase').classList.remove('on');
    document.querySelectorAll('.act.down').forEach(b => b.classList.remove('down'));
  },
};
