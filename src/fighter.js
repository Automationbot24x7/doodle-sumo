import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Clip roles -> Lux3D retarget animation ids (clips arrive as animation_1..N in request order).
export const ROLE = {
  idle: 'Idle_Loop', stance: 'Crouch_Idle_Loop', run: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop',
  shove: 'Punch_Cross', jab: 'Punch_Jab', roll: 'Roll', flail: 'Swim_Fwd_Loop', dance: 'Dance_Loop', cheer: 'Yes',
};

export const BASE_HEIGHT = 1.62;     // world units for a 1.0-size fighter
export const DESK = { w: 14, d: 10 };  // play surface (x: -7..7, z: -4.5..4.5)

const tmp = new THREE.Vector3();

export class Fighter {
  constructor(def, gltf, opts = {}) {
    this.def = def; this.id = def.id; this.name = def.title;
    this.mass = def.mass; this.speed = def.speed; this.power = def.power;
    this.isPlayer = !!opts.player; this.slot = opts.slot ?? 0; this.color = opts.color || '#e2453c';
    const root = SkeletonUtils.clone(gltf.scene);
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
    // normalise size: bind-pose height -> target height (heavier = bigger)
    const box = new THREE.Box3().setFromObject(root);
    const h = box.max.y - box.min.y;
    const target = BASE_HEIGHT * (0.82 + 0.22 * def.mass);
    const s = target / h;
    this.model = root; root.scale.setScalar(s);
    const b2 = new THREE.Box3().setFromObject(root);
    root.position.y = -b2.min.y;
    this.height = target;
    this.radius = Math.max(0.34, Math.min(0.62, ((b2.max.x - b2.min.x) * 0.28 + (b2.max.z - b2.min.z) * 0.5) * 0.5 + 0.08));
    // group = position only; body = facing + squash; marker ring + player tag stay upright
    this.group = new THREE.Group(); this.body = new THREE.Group(); this.body.add(root); this.group.add(this.body);
    if (opts.marker !== false) {
      const col = new THREE.Color(opts.color || '#2b2b33');
      this.ring = new THREE.Mesh(new THREE.RingGeometry(this.radius * 1.05, this.radius * 1.32, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthWrite: false }));
      this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.02; this.group.add(this.ring);
      this.chargeRing = new THREE.Mesh(new THREE.RingGeometry(this.radius * 1.4, this.radius * 1.62, 40, 1, 0, 0.001), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
      this.chargeRing.rotation.x = -Math.PI / 2; this.chargeRing.position.y = 0.025; this.group.add(this.chargeRing);
      this.group.add(this.tag = makeTag(this.isPlayer ? `P${this.slot + 1}` : 'CPU', opts.color, target + 0.45, !this.isPlayer));
    }
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = {};
    const names = def.anims || [];
    gltf.animations.forEach((clip, i) => { const id = names[i]; if (id) this.clips[id] = clip; });
    this.actions = {};
    for (const [role, id] of Object.entries(ROLE)) {
      const clip = this.clips[id]; if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      if (['shove', 'jab', 'roll', 'cheer'].includes(role)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[role] = a;
    }
    this.reset(new THREE.Vector3(), 0);
  }

  reset(pos, facing) {
    this.pos = pos.clone(); this.vel = new THREE.Vector3(); this.y = 0; this.vy = 0;
    this.facing = facing; this.state = 'idle'; this.alive = true; this.falling = false; this.out = false;
    this.stun = 0; this.cool = 0; this.dashCool = 0; this.dashT = 0; this.charge = 0; this.charging = false;
    this.attackT = -1; this.attackCharge = 0; this.tumble = 0; this.lastHitBy = null; this.squash = 0; this.won = false;
    this.group.position.copy(this.pos); this.body.rotation.set(0, facing, 0); this.body.scale.set(1, 1, 1);
    this.model.rotation.set(0, 0, 0);
    this.play('stance', 0);
  }

  play(role, fade = 0.15, speed = 1) {
    const a = this.actions[role]; if (!a) return;
    if (this.current === a && a.isRunning() && !['shove', 'jab', 'roll', 'cheer'].includes(role)) return;
    a.reset(); a.setEffectiveTimeScale(speed); a.setEffectiveWeight(1); a.play();
    if (this.current && this.current !== a) this.current.crossFadeTo(a, fade, false);
    this.current = a; this.currentRole = role;
  }

  forward(out = tmp) { return out.set(Math.sin(this.facing), 0, Math.cos(this.facing)); }

  // input: {x, z} desired direction (length 0..1), shoveDown, shoveUp, dash
  control(input, dt, fx) {
    if (!this.alive || this.falling || this.won) return;
    const ctl = this.stun > 0 ? 0.15 : (this.charging ? 0.45 : 1);
    const len = Math.hypot(input.x, input.z);
    if (len > 0.05 && this.dashT <= 0) {
      const ax = (input.x / Math.max(1, len)) * 34 * this.speed * ctl;
      const az = (input.z / Math.max(1, len)) * 34 * this.speed * ctl;
      this.vel.x += ax * dt; this.vel.z += az * dt;
      if (this.stun <= 0 && this.attackT < 0) this.facing = lerpAngle(this.facing, Math.atan2(input.x, input.z), 1 - Math.exp(-14 * dt));
    }
    // shove (hold to charge)
    if (input.shoveDown && this.cool <= 0 && this.stun <= 0 && !this.charging && this.attackT < 0) { this.charging = true; this.charge = 0; }
    if (this.charging) {
      const before = this.charge; this.charge = Math.min(1, this.charge + dt / 0.85);
      if (this.isPlayer && Math.floor(before * 5) !== Math.floor(this.charge * 5)) fx.sfx?.charge(this.charge);
      if (!input.shoveHeld || this.stun > 0) { this.charging = false; this.attackT = 0; this.attackCharge = this.charge; this.play(this.charge > 0.35 ? 'shove' : 'jab', 0.06, 1.25); fx.sfx?.whoosh(); }
    }
    // dash
    if (input.dash && this.dashCool <= 0 && this.stun <= 0) {
      const f = len > 0.1 ? tmp.set(input.x / len, 0, input.z / len) : this.forward();
      this.facing = Math.atan2(f.x, f.z);
      this.vel.x += f.x * 10 * this.speed; this.vel.z += f.z * 10 * this.speed;
      this.dashT = 0.32; this.dashCool = 1.3; this.play('roll', 0.05, 1.5); fx.sfx?.whoosh();
    }
  }

  update(dt) {
    this.cool -= dt; this.dashCool -= dt; this.dashT -= dt; this.stun -= dt; this.squash *= Math.exp(-10 * dt);
    if (this.attackT >= 0) this.attackT += dt;
    if (this.falling) {
      this.vy -= 26 * dt; this.y += this.vy * dt;
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      this.vel.multiplyScalar(Math.exp(-0.4 * dt));
      this.tumble += dt;
      this.model.rotation.x += dt * 4.5; this.model.rotation.z += dt * 2.2;
      if (this.y < -9 && !this.out) { this.out = true; this.alive = false; }
    } else {
      const maxV = (this.dashT > 0 ? 13 : 4.6) * this.speed;
      const damp = this.stun > 0 ? 2.3 : (this.dashT > 0 ? 1.6 : 7.5);
      this.vel.multiplyScalar(Math.exp(-damp * dt));
      const v = Math.hypot(this.vel.x, this.vel.z);
      if (this.stun <= 0 && v > maxV) this.vel.multiplyScalar(maxV / v);
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      // animation state
      if (this.won) { /* dance set elsewhere */ }
      else if (this.attackT >= 0) { if (this.attackT > 0.45) { this.attackT = -1; this.cool = 0.35; } }
      else if (this.dashT > 0) { /* rolling */ }
      else if (v > 2.8) this.play('sprint', 0.12, 0.9 + v * 0.05);
      else if (v > 0.6) this.play('run', 0.15, 0.8 + v * 0.12);
      else this.play('stance', 0.25);
    }
    this.group.position.set(this.pos.x, this.y, this.pos.z);
    this.body.rotation.y = this.facing;
    const sq = this.charging ? this.charge * 0.12 : 0;
    const k = 1 + this.squash;
    this.body.scale.set(k + sq * 0.6, 1 / k - sq, k + sq * 0.6);
    if (this.ring) {
      this.ring.visible = this.chargeRing.visible = !this.falling && this.alive && !this.won;
      const c = this.charging ? this.charge : 0;
      if (c !== this._lastC) { this._lastC = c; this.chargeRing.geometry.dispose(); this.chargeRing.geometry = new THREE.RingGeometry(this.radius * 1.4, this.radius * 1.62, 40, 1, Math.PI / 2, Math.max(0.001, c * Math.PI * 2)); }
    }
    if (this.tag) this.tag.visible = this.alive && !this.won;
    this.mixer.update(dt);
  }

  startFall(fx) {
    if (this.falling) return;
    this.falling = true; this.vy = 4; this.charging = false; this.attackT = -1;
    this.play('flail', 0.1, 1.4); fx.sfx?.scream();
  }
}

export function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function makeTag(text, color, y, small) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 96; const g = c.getContext('2d');
  g.fillStyle = color || '#e2453c'; g.strokeStyle = '#2b2b33'; g.lineWidth = 6;
  g.beginPath(); g.roundRect(8, 6, 112, 60, 16); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(52, 64); g.lineTo(64, 88); g.lineTo(76, 64); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#fff'; g.font = 'bold 44px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 38);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  const k = small ? 0.78 : 1; s.scale.set(0.62 * k, 0.47 * k, 1); s.position.y = y; s.renderOrder = 10; return s;
}
