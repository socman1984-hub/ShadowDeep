'use strict';
// Procedural dungeon: random rooms joined by 2-wide corridors.

class Dungeon {
  constructor(floor) {
    this.floor = floor;
    this.w = 64;
    this.h = 64;
    this.theme = THEMES[Math.floor((floor - 1) / 3) % THEMES.length];
    this.isBoss = floor % 5 === 0;
    while (!this.tryGenerate()) { /* retry until we get enough rooms */ }
  }

  idx(x, y) { return y * this.w + x; }

  isWall(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return true;
    return this.grid[ty * this.w + tx] === 1;
  }

  wallAtPx(x, y) { return this.isWall(Math.floor(x / TILE), Math.floor(y / TILE)); }

  setFloor(x, y) {
    if (x < 1 || y < 1 || x >= this.w - 1 || y >= this.h - 1) return;
    this.grid[this.idx(x, y)] = 0;
  }

  carveRect(x, y, w, h) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.setFloor(i, j);
  }

  corridor(a, b) {
    const carveH = (x1, x2, y) => { for (let x = Math.min(x1, x2); x <= Math.max(x1, x2) + 1; x++) { this.setFloor(x, y); this.setFloor(x, y + 1); } };
    const carveV = (y1, y2, x) => { for (let y = Math.min(y1, y2); y <= Math.max(y1, y2) + 1; y++) { this.setFloor(x, y); this.setFloor(x + 1, y); } };
    if (chance(0.5)) { carveH(a.cx, b.cx, a.cy); carveV(a.cy, b.cy, b.cx); }
    else { carveV(a.cy, b.cy, a.cx); carveH(a.cx, b.cx, b.cy); }
  }

  tryGenerate() {
    const { w, h } = this;
    this.grid = new Uint8Array(w * h).fill(1);
    const rooms = [];
    const maxRooms = Math.min(16, 9 + Math.floor(this.floor / 2));
    for (let i = 0; i < 400 && rooms.length < maxRooms; i++) {
      const rw = randi(6, 12), rh = randi(6, 10);
      const x = randi(2, w - rw - 3), y = randi(2, h - rh - 3);
      if (rooms.some(r => x < r.x + r.w + 2 && x + rw + 2 > r.x && y < r.y + r.h + 2 && y + rh + 2 > r.y)) continue;
      rooms.push({ x, y, w: rw, h: rh, cx: Math.floor(x + rw / 2), cy: Math.floor(y + rh / 2) });
      this.carveRect(x, y, rw, rh);
    }
    if (rooms.length < 5) return false;

    // Connect rooms like a spanning tree (nearest unconnected room each step), plus a couple of loops.
    const connected = [rooms[0]];
    const rest = rooms.slice(1);
    while (rest.length) {
      let bi = 0, bc = connected[0], bd = Infinity;
      for (let i = 0; i < rest.length; i++) {
        for (const c of connected) {
          const d = Math.abs(rest[i].cx - c.cx) + Math.abs(rest[i].cy - c.cy);
          if (d < bd) { bd = d; bi = i; bc = c; }
        }
      }
      const r = rest.splice(bi, 1)[0];
      this.corridor(bc, r);
      connected.push(r);
    }
    for (let i = 0; i < 2; i++) {
      const a = pick(rooms), b = pick(rooms);
      if (a !== b) this.corridor(a, b);
    }

    this.rooms = rooms;
    this.start = rooms[0];
    const d = this.bfs(this.start.cx, this.start.cy, 9999);
    let far = rooms[1], fd = -1;
    for (const r of rooms) {
      const v = d[this.idx(r.cx, r.cy)];
      if (v > fd) { fd = v; far = r; }
    }
    this.exit = far;
    this.seen = new Uint8Array(w * h);
    this.addPillars();
    this.computeEdges();
    this.computeTileLook();
    this.decorate();
    return true;
  }

  // Stone columns in the corners of big rooms. Only placed where every neighbor is
  // open floor, so they can never cut a path.
  addPillars() {
    this.pillar = new Uint8Array(this.w * this.h);
    for (const r of this.rooms) {
      if (r.w < 9 || r.h < 8) continue;
      for (const [x, y] of [[r.x + 2, r.y + 2], [r.x + r.w - 3, r.y + 2], [r.x + 2, r.y + r.h - 3], [r.x + r.w - 3, r.y + r.h - 3]]) {
        let open = true;
        for (let dy = -1; dy <= 1 && open; dy++) for (let dx = -1; dx <= 1; dx++) if (this.isWall(x + dx, y + dy)) { open = false; break; }
        if (!open) continue;
        this.grid[this.idx(x, y)] = 1;
        this.pillar[this.idx(x, y)] = 1;
      }
    }
  }

  // Per-tile texture variant and wall-shadow mask (1 = wall north, 2 = east, 4 = south, 8 = west).
  computeTileLook() {
    const n = this.w * this.h;
    this.fvar = new Uint8Array(n);
    this.ao = new Uint8Array(n);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = this.idx(x, y);
      this.fvar[i] = Math.floor(hash2(x, y) * 1000) % FLOOR_VARIANTS;
      if (this.isWall(x, y) && !this.pillar[i]) continue;
      this.ao[i] = (this.isWall(x, y - 1) ? 1 : 0) | (this.isWall(x + 1, y) ? 2 : 0) | (this.isWall(x, y + 1) ? 4 : 0) | (this.isWall(x - 1, y) ? 8 : 0);
    }
  }

  // Wall tiles touching a floor tile are the only ones worth drawing.
  computeEdges() {
    this.edge = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (!this.isWall(x, y)) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!this.isWall(x + dx, y + dy)) { near = true; break; }
      }
      if (near) this.edge[this.idx(x, y)] = 1;
    }
  }

  decorate() {
    this.torches = [];
    this.decor = [];
    this.wallDeco = [];
    this.props = [];
    const glowType = { catacombs: 'candles', fungal: 'mushrooms', frozen: 'crystals' }[this.theme.key];
    for (let y = 1; y < this.h - 1; y++) for (let x = 1; x < this.w - 1; x++) {
      const i = this.idx(x, y);
      const face = this.isWall(x, y) && !this.pillar[i] && !this.isWall(x, y + 1);
      if (face && chance(0.08) && !this.torches.some(t => Math.abs(t.tx - x) < 3 && t.ty === y)) {
        this.torches.push({ tx: x, ty: y, x: x * TILE + TILE / 2, y: y * TILE + TILE * 0.62, seed: Math.random() * 10 });
      } else if (face && chance(0.1)) {
        this.wallDeco.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE * (1 - FACE_H) + 3, type: chance(0.55) ? 'banner' : 'chain' });
      } else if (!this.isWall(x, y)) {
        const nearWall = this.ao[i] !== 0;
        if (glowType && nearWall && chance(0.05)) {
          this.decor.push({ x: x * TILE + rand(12, TILE - 12), y: y * TILE + rand(12, TILE - 12), type: glowType, rot: 0, glow: true });
        } else if (chance(0.03)) {
          this.decor.push({ x: x * TILE + rand(8, TILE - 8), y: y * TILE + rand(8, TILE - 8), type: pick(['bones', 'rubble', 'skull', 'blood']), rot: rand(0, TAU) });
        }
      }
    }
    // Breakable barrels, crates and urns along the room walls.
    const types = this.theme.key === 'hell' || this.theme.key === 'catacombs' ? ['urn', 'urn', 'barrel', 'crate'] : ['barrel', 'crate', 'urn'];
    for (const r of this.rooms) {
      if (r === this.start) continue;
      const n = randi(0, 3);
      for (let k = 0; k < n; k++) {
        // Along the north wall only, and never beside a corridor opening.
        const tx = randi(r.x + 1, r.x + r.w - 2), ty = r.y;
        if (this.isWall(tx, ty) || !this.isWall(tx - 1, ty - 1) || !this.isWall(tx, ty - 1) || !this.isWall(tx + 1, ty - 1)) continue;
        const x = (tx + 0.5) * TILE + rand(-6, 6), y = (ty + 0.5) * TILE + rand(-4, 6);
        if (this.props.some(pr => Math.hypot(pr.x - x, pr.y - y) < 30)) continue;
        this.props.push({ isProp: true, type: pick(types), x, y, r: 12 });
      }
    }
  }

  // 4-way breadth-first distance map. Used for exit placement and enemy pathing.
  bfs(sx, sy, maxD) {
    const n = this.w * this.h;
    const d = new Int16Array(n).fill(-1);
    if (this.isWall(sx, sy)) return d;
    const q = new Int32Array(n);
    let head = 0, tail = 0;
    const s = this.idx(sx, sy);
    d[s] = 0;
    q[tail++] = s;
    while (head < tail) {
      const c = q[head++];
      const cd = d[c];
      if (cd >= maxD) continue;
      const cx = c % this.w, cy = (c / this.w) | 0;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of nb) {
        const nx = cx + dx, ny = cy + dy;
        if (this.isWall(nx, ny)) continue;
        const ni = this.idx(nx, ny);
        if (d[ni] !== -1) continue;
        d[ni] = cd + 1;
        q[tail++] = ni;
      }
    }
    return d;
  }

  hasLOS(x1, y1, x2, y2) {
    const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 12);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.wallAtPx(lerp(x1, x2, t), lerp(y1, y2, t))) return false;
    }
    return true;
  }

  randomPointInRoom(room, margin = 1) {
    for (let tries = 0; ; tries++) {
      const tx = randi(room.x + margin, room.x + room.w - 1 - margin), ty = randi(room.y + margin, room.y + room.h - 1 - margin);
      if (!this.isWall(tx, ty) || tries > 30) return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
    }
  }

  reveal(px, py, radius) {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    for (let y = ty - radius; y <= ty + radius; y++) for (let x = tx - radius; x <= tx + radius; x++) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      if ((x - tx) * (x - tx) + (y - ty) * (y - ty) <= radius * radius) this.seen[this.idx(x, y)] = 1;
    }
  }
}

// Push a circle entity (x, y, r) out of any wall tiles it overlaps.
function collideCircle(d, e) {
  const r = e.r;
  const x0 = Math.floor((e.x - r) / TILE), x1 = Math.floor((e.x + r) / TILE);
  const y0 = Math.floor((e.y - r) / TILE), y1 = Math.floor((e.y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (!d.isWall(tx, ty)) continue;
    const cx = clamp(e.x, tx * TILE, tx * TILE + TILE);
    const cy = clamp(e.y, ty * TILE, ty * TILE + TILE);
    const dx = e.x - cx, dy = e.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 0.0001) {
      const dd = Math.sqrt(d2);
      e.x += (dx / dd) * (r - dd);
      e.y += (dy / dd) * (r - dd);
    } else {
      // Center is inside the tile: push out along the shortest axis.
      const left = e.x - tx * TILE, right = tx * TILE + TILE - e.x;
      const top = e.y - ty * TILE, bottom = ty * TILE + TILE - e.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) e.x -= left + r; else if (m === right) e.x += right + r;
      else if (m === top) e.y -= top + r; else e.y += bottom + r;
    }
  }
}

function moveEntity(d, e, dx, dy) {
  e.x += dx;
  collideCircle(d, e);
  e.y += dy;
  collideCircle(d, e);
}
