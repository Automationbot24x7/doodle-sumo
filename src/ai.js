import { DESK } from './fighter.js';

// Simple sumo brain: stay away from edges, line up behind a rival so a shove sends them toward the nearest edge,
// charge shoves when lined up, dash in occasionally, dodge hazard zones.
export class Bot {
  constructor(f, level = 1) { this.f = f; this.level = level; this.target = null; this.retarget = 0; this.hold = 0; this.think = 0; this.wantCharge = 0.4; this.dashBias = Math.random(); }

  input(all, hazards, dt) {
    const f = this.f, inp = { x: 0, z: 0, shoveDown: false, shoveHeld: false, dash: false };
    if (!f.alive || f.falling) return inp;
    this.retarget -= dt; this.think -= dt;
    const foes = all.filter((o) => o !== f && o.alive && !o.falling);
    if (!foes.length) return inp;
    if (!this.target || !this.target.alive || this.target.falling || this.retarget <= 0) {
      // prefer rivals near an edge (easy ring-outs), then the closest
      this.target = foes.map((o) => ({ o, s: dist(f, o) - edgeDanger(o) * 3 + (o.isPlayer ? -0.25 * this.level : 0) + Math.random() * 1.2 }))
        .sort((a, b) => a.s - b.s)[0].o;
      this.retarget = 1.5 + Math.random() * 1.5;
    }
    const t = this.target;
    // push direction: from target toward its nearest edge
    const e = nearestEdgeDir(t);
    const behind = { x: t.pos.x - e.x * (f.radius + t.radius + 0.25), z: t.pos.z - e.z * (f.radius + t.radius + 0.25) };
    let dx = behind.x - f.pos.x, dz = behind.z - f.pos.z;
    const d = Math.hypot(dx, dz);
    const tdx = t.pos.x - f.pos.x, tdz = t.pos.z - f.pos.z, td = Math.hypot(tdx, tdz);
    // when close, go straight at the target
    if (td < f.radius + t.radius + 1.2 || d < 0.35 || (foes.length === 1 && td < 3.2)) { dx = tdx; dz = tdz; }
    let mx = dx, mz = dz; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    // edge avoidance
    const m = 1.4;
    const ex = Math.max(0, f.pos.x - (DESK.w / 2 - m)) - Math.max(0, -(DESK.w / 2 - m) - f.pos.x);
    const ez = Math.max(0, f.pos.z - (DESK.d / 2 - m)) - Math.max(0, -(DESK.d / 2 - m) - f.pos.z);
    mx -= ex * 2.2; mz -= ez * 2.2;
    // hazard avoidance
    for (const h of hazards) {
      if (!h.warning) continue;
      const hx = f.pos.x - h.zone.x, hz = f.pos.z - h.zone.z;
      if (Math.abs(hx) < h.zone.hw + 0.8 && Math.abs(hz) < h.zone.hd + 0.8) { mx += Math.sign(hx || 1) * 1.5 * (h.zone.hw < h.zone.hd ? 1 : 0.3); mz += Math.sign(hz || 1) * 1.5 * (h.zone.hd <= h.zone.hw ? 1 : 0.3); }
    }
    const l2 = Math.hypot(mx, mz) || 1;
    const sp = 0.55 + 0.25 * this.level;
    inp.x = (mx / l2) * sp; inp.z = (mz / l2) * sp;

    // attack logic
    const facingDot = (Math.sin(f.facing) * tdx + Math.cos(f.facing) * tdz) / (td || 1);
    const inRange = td < f.radius + t.radius + 1.0;
    if (f.charging) {
      this.hold -= dt;
      inp.shoveHeld = this.hold > 0 && !(inRange && facingDot > 0.6 && f.charge > this.wantCharge);
      if (!inRange && this.hold < 0.2) inp.shoveHeld = false;
    } else if (inRange && facingDot > 0.5 && f.cool <= 0 && this.think <= 0) {
      inp.shoveDown = true; inp.shoveHeld = true;
      this.wantCharge = (foes.length === 1 ? 0.45 : 0.15) + Math.random() * (0.35 + 0.25 * this.level);
      this.hold = 0.15 + this.wantCharge;
      this.think = 0.25 + Math.random() * (0.6 - 0.15 * this.level);
    } else if (!inRange && td < 4 && td > 2 && f.dashCool <= 0 && Math.random() < dt * (0.3 + 0.4 * this.dashBias) * this.level && edgeDanger(f) < 0.3) {
      inp.dash = true; inp.x = tdx / td; inp.z = tdz / td;
    }
    return inp;
  }
}

const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
export function edgeDanger(f) {
  const dx = DESK.w / 2 - Math.abs(f.pos.x), dz = DESK.d / 2 - Math.abs(f.pos.z);
  return Math.max(0, 1 - Math.min(dx, dz) / 2);
}
export function nearestEdgeDir(f) {
  const dxp = DESK.w / 2 - f.pos.x, dxn = DESK.w / 2 + f.pos.x, dzp = DESK.d / 2 - f.pos.z, dzn = DESK.d / 2 + f.pos.z;
  const m = Math.min(dxp, dxn, dzp, dzn);
  if (m === dxp) return { x: 1, z: 0 }; if (m === dxn) return { x: -1, z: 0 };
  if (m === dzp) return { x: 0, z: 1 }; return { x: 0, z: -1 };
}
