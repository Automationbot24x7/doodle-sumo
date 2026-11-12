import * as THREE from 'three';
import { loadURDF } from './urdf.js';

// Where each Lux3D prop sits on the desk: position, yaw, height (world units), collider radius.
export const LAYOUT = {
  pencilcup: { x: -6.1, z: -4.0, yaw: 0.3, h: 1.9, r: 0.62 },
  books: { x: 5.8, z: 3.95, yaw: -0.4, h: 1.0, r: 0.95 },
  clock: { x: 5.9, z: -4.1, yaw: -0.6, h: 1.15, r: 0.6 },
  duck: { x: -6.1, z: 4.0, yaw: 0.9, h: 0.95, r: 0.55 },
  crayons: { x: -2.6, z: -4.3, yaw: 0.12, h: 0.85, r: 0.8 },
  lamp: { x: 7.9, z: -5.6, yaw: -2.3, h: 6.0, r: 0, off: true },
  // traps, driven through the joints Lux3D articulation produced (URDF)
  stapler: { x: -5.2, z: 0.2, yaw: Math.PI, h: 0.95, r: 0, hazard: { kind: 'staple', zone: { x: -3.85, z: 0.2, hw: 1.4, hd: 0.65 }, period: [7, 11], warn: 1.5 } },
  fan: { x: 6.55, z: 0.5, yaw: -Math.PI / 2, h: 1.7, r: 0.55, hazard: { kind: 'wind', zone: { x: 0.6, z: 0.5, hw: 5.8, hd: 1.6 }, period: [9, 13], warn: 1.3, dur: 2.6 } },
  jack: { x: 1.4, z: -3.4, yaw: 0, h: 1.2, r: 0.7, hazard: { kind: 'pop', zone: { x: 1.4, z: -2.5, hw: 2.0, hd: 1.6 }, period: [10, 15], warn: 2.0, dur: 0.25 } },
};

export async function loadProp(p, loader) {
  if (p.urdf) { const u = await loadURDF(`assets/props/${p.id}/`, loader); return { scene: u.root, joints: u.joints }; }
  return loader.loadAsync(`assets/props/${p.id}.glb`);
}

const rand = (a, b) => a + Math.random() * (b - a);

function warnTexture(kind) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  g.strokeStyle = '#e2453c'; g.lineWidth = 10; g.setLineDash([22, 14]); g.strokeRect(8, 8, 240, 112);
  g.fillStyle = 'rgba(226,69,60,.16)'; g.fillRect(8, 8, 240, 112);
  g.setLineDash([]); g.fillStyle = '#e2453c'; g.font = 'bold 72px Gaegu, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(kind === 'wind' ? '<<<' : '!', 128, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function placeProps(PROPS, loaded, world, blobTex) {
  const colliders = [], hazards = [], placed = {};
  for (const p of PROPS) {
    const L = LAYOUT[p.id]; const g = loaded[p.id]; if (!L || !g) continue;
    const obj = g.scene; obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const holder = new THREE.Group(); holder.add(obj);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj); const s = L.h / (box.max.y - box.min.y);
    obj.scale.setScalar(s); obj.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(obj);
    obj.position.y -= b2.min.y; obj.position.x -= (b2.min.x + b2.max.x) / 2; obj.position.z -= (b2.min.z + b2.max.z) / 2;
    holder.position.set(L.x, L.y || 0, L.z); holder.rotation.y = L.yaw; world.add(holder);
    placed[p.id] = holder;
    if (!L.off) {
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
      blob.rotation.x = -Math.PI / 2; blob.position.set(L.x, 0.01, L.z);
      const sz = Math.max(b2.max.x - b2.min.x, b2.max.z - b2.min.z) * 1.3; blob.scale.set(sz, sz, 1); world.add(blob);
    }
    if (L.r) colliders.push({ x: L.x, z: L.z, r: L.r });
    if (L.hazard) {
      const zone = L.hazard.zone;
      const warnMesh = new THREE.Mesh(new THREE.PlaneGeometry(zone.hw * 2, zone.hd * 2), new THREE.MeshBasicMaterial({ map: warnTexture(L.hazard.kind), transparent: true, opacity: 0, depthWrite: false }));
      warnMesh.rotation.x = -Math.PI / 2; warnMesh.position.set(zone.x, 0.02, zone.z); world.add(warnMesh);
      hazards.push({ id: p.id, ...L.hazard, holder, obj, joints: Object.values(g.joints || {}), timer: rand(...L.hazard.period) * 0.6, warning: false, active: 0, justFired: 0, warnMesh, spin: 0, phase: 0 });
    }
  }
  return { colliders, hazards, placed };
}

export function resetHazards(hazards) {
  for (const h of hazards) { h.timer = rand(...h.period) * 0.7; h.warning = false; h.active = 0; h.warnMesh.material.opacity = 0; }
}

// Each trap moves only through its Lux3D joints: hinges open/close, rotors spin.
function driveJoints(h, dt) {
  const J = h.joints; if (!J.length) return;
  if (h.kind === 'staple') {
    const j = J[0]; const open = isFinite(j.upper) ? j.upper : 0.7;
    let target = 0.12 * open;
    if (h.warning) target = open * Math.min(1, (h.warn - h.timer) / 0.5);
    const k = h.warning ? 6 : (h.justFired > 0.9 ? 60 : 4);
    j.set(j.value + (target - j.value) * (1 - Math.exp(-k * dt)));
  } else if (h.kind === 'wind') {
    const want = h.active > 0 ? 38 : h.warning ? 22 : 1.5;
    h.spin += (want - h.spin) * (1 - Math.exp(-2.5 * dt)); h.phase += h.spin * dt;
    for (const j of J) {
      if (j.type === 'continuous') j.set(h.phase);
      else if (j.type === 'revolute' && isFinite(j.upper)) j.set(j.lower + (((h.phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * (j.upper - j.lower));
      else j.set(h.phase);
    }
  } else if (h.kind === 'pop') {
    const lid = J.find((j) => /lid/i.test(j.name)) || J[0];
    const crank = J.find((j) => j !== lid && /crank|handle/i.test(j.name));
    if (crank) { h.phase += (h.warning ? 9 : 0.3) * dt; crank.set(crank.type === 'continuous' || !isFinite(crank.upper) ? h.phase : crank.lower + ((Math.sin(h.phase) + 1) / 2) * (crank.upper - crank.lower)); }
    const upper = isFinite(lid.upper) ? lid.upper : 1.9;
    const target = h.justFired > 0 ? upper : 0;
    lid.set(lid.value + (target - lid.value) * (1 - Math.exp(-(target > lid.value ? 40 : 3) * dt)));
  }
}

// fx: { sfx, shake(v), hitStop(v), stars(pos,n,speed,size), puff(pos), pop(text,pos,cls) }
export function updateHazards(hazards, fighters, dt, fighting, fast, fx) {
  for (const h of hazards) {
    h.justFired = Math.max(0, h.justFired - dt);
    driveJoints(h, dt);
    if (!fighting) { h.warning = false; h.warnMesh.material.opacity *= Math.exp(-6 * dt); continue; }
    h.timer -= dt * (fast ? 1.8 : 1);
    if (!h.warning && h.active <= 0 && h.timer <= h.warn) { h.warning = true; if (h.kind === 'wind') fx.sfx.whirr(); if (h.kind === 'pop') fx.sfx.musicBox(); }
    if (h.warning) h.warnMesh.material.opacity = 0.55 + 0.45 * Math.sin(performance.now() / 70);
    if (h.warning && h.timer <= 0) {
      h.warning = false; h.active = h.dur || 0.2; h.justFired = 1.2; h.timer = rand(...h.period); h.warnMesh.material.opacity = 0;
      const at = new THREE.Vector3(h.holder.position.x, 1.4, h.holder.position.z);
      if (h.kind === 'staple') { fx.sfx.clack(); fx.shake(0.3); }
      if (h.kind === 'pop') { fx.sfx.boing(); fx.sfx.bigSlap(); fx.shake(0.4); fx.stars(at, 8, 5, 0.45); fx.pop('BOING!', at, 'yel'); }
    }
    if (h.active <= 0) continue;
    h.active -= dt;
    for (const f of fighters) {
      if (!f.alive || f.falling) continue;
      if (Math.abs(f.pos.x - h.zone.x) > h.zone.hw + f.radius * 0.5 || Math.abs(f.pos.z - h.zone.z) > h.zone.hd + f.radius * 0.5) continue;
      if (h.kind === 'staple' && !f.stapled) {
        f.stapled = true; setTimeout(() => (f.stapled = false), 600);
        const dir = Math.sign(f.pos.z - h.zone.z) || (Math.random() < 0.5 ? -1 : 1);
        f.vel.set(2.5, 0, (dir * 9) / f.mass); f.stun = 0.9; f.squash = 0.6; f.lastHitBy = null;
        fx.pop('STAPLED!', new THREE.Vector3(f.pos.x, 1.2, f.pos.z), 'red'); fx.stars(new THREE.Vector3(f.pos.x, 0.8, f.pos.z), 6, 4, 0.4); fx.hitStop(0.08);
      }
      if (h.kind === 'wind') { f.vel.x += (-17 / f.mass) * dt; if (Math.random() < dt * 8) fx.puff(new THREE.Vector3(f.pos.x + 0.6, 0.5 + Math.random(), f.pos.z)); }
      if (h.kind === 'pop' && !f.popped) {
        f.popped = true; setTimeout(() => (f.popped = false), 500);
        const dx = f.pos.x - h.holder.position.x, dz = f.pos.z - h.holder.position.z, d = Math.hypot(dx, dz) || 1;
        f.vel.set(((dx / d) * 11) / f.mass, 0, ((dz / d) * 11) / f.mass); f.stun = 0.7; f.squash = 0.5; f.lastHitBy = null;
      }
    }
  }
}
