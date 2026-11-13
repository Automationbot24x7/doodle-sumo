// Pickups: every so often a Lux3D-made item drops onto the desk. The first toy to touch it holds it in its hand
// (attached to the right-hand bone of its Lux3D skeleton) and gets a boost for a while.
import * as THREE from 'three';

export const BUFFS = {
  power: { item: 'bat', shout: 'SLUGGER!', chip: 'BAT', hits: 3, color: '#e2453c', scale: 1.15, tilt: [0, 0, 0] },         // next 3 shoves hit far harder
  speed: { item: 'skate', shout: 'ZOOM!', chip: 'SKATE', secs: 8, color: '#3d7be0', scale: 0.62, tilt: [0, 0, 0] },         // runs much faster
  heavy: { item: 'dumbbell', shout: 'HEAVY!', chip: 'HEAVY', secs: 8, color: '#8a5cd6', scale: 0.7, tilt: [0, 0, 0] },   // bigger, heavier, hard to shove
};
const KINDS = Object.keys(BUFFS);
const rand = (a, b) => a + Math.random() * (b - a);

export function createPickups({ world, loaded, colliders, blobTex, fx }) {
  const have = KINDS.filter((k) => loaded[BUFFS[k].item]);
  const proto = {};
  for (const k of have) {               // normalise each item: 1 unit tall, centred on its base
    const src = loaded[BUFFS[k].item].scene; src.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(src), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    const g = new THREE.Group(); src.position.sub(c); g.add(src); g.scale.setScalar(1 / Math.max(s.x, s.y, s.z));
    src.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    proto[k] = g;
  }
  const list = []; let timer = 3, last = null;
  const ringGeo = new THREE.RingGeometry(0.5, 0.66, 40);

  function spawn(fighters) {
    let kind; do { kind = have[Math.floor(Math.random() * have.length)]; } while (have.length > 1 && kind === last); last = kind;
    let x = 0, z = 0;
    for (let i = 0; i < 30; i++) {
      x = rand(-4.4, 4.4); z = rand(-2.7, 2.9);
      if (colliders.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + 0.9) && fighters.every((f) => !f.alive || Math.hypot(f.pos.x - x, f.pos.z - z) > 1.6)) break;
    }
    const B = BUFFS[kind];
    const holder = new THREE.Group(); const item = proto[kind].clone(true); const spin = new THREE.Group();
    item.scale.multiplyScalar(0.95); spin.add(item); spin.rotation.z = 0.35; holder.add(spin);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: B.color, transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.03, z); world.add(ring);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.set(x, 0.012, z); world.add(blob);
    holder.position.set(x, 8, z); world.add(holder);
    list.push({ kind, x, z, y: 8, vy: 0, landed: false, life: 11, holder, spin, ring, blob, t: 0 });
  }
  function remove(p) { world.remove(p.holder, p.ring, p.blob); p.ring.material.dispose(); p.blob.material.dispose(); list.splice(list.indexOf(p), 1); }

  // ---- buffs on fighters
  function clearBuff(f) {
    const b = f.buff; if (!b) return;
    if (b.held) b.held.parent?.remove(b.held);
    f.speed = f.def.speed; f.mass = f.def.mass; f.group.scale.setScalar(1); f.buff = null;
    if (f.ring) f.ring.material.color.set(f.color);
  }
  function give(f, kind) {
    clearBuff(f);
    const B = BUFFS[kind]; const b = { kind, t: B.secs || 12, hits: B.hits || 0 };
    // hold the item: attach it to the right-hand bone, sized in world units whatever the model's own scale is
    let hand = null; f.model.traverse((o) => { if (o.isBone && /RightHand$/.test(o.name)) hand = o; });
    if (hand) {
      f.group.updateMatrixWorld(true);
      const ws = hand.getWorldScale(new THREE.Vector3()).x || 1;
      const held = proto[kind].clone(true); held.scale.multiplyScalar((f.height * 0.62 * B.scale) / ws); held.rotation.set(...B.tilt);
      hand.add(held); b.held = held;
    }
    if (kind === 'speed') f.speed = f.def.speed * 1.5;
    if (kind === 'heavy') { f.mass = f.def.mass * 2.3; f.group.scale.setScalar(1.22); }
    f.buff = b;
    const at = new THREE.Vector3(f.pos.x, f.height + 0.5, f.pos.z);
    fx.pop(B.shout, at, 'yel'); fx.stars(at, 8, 4, 0.4); fx.sfx.go?.(); fx.shake(0.15);
  }

  function update(dt, fighters, fighting) {
    // buff timers
    for (const f of fighters) {
      const b = f.buff; if (!b) continue;
      if (!f.alive || f.falling) { clearBuff(f); continue; }
      if (!BUFFS[b.kind].hits) b.t -= dt;
      if (f.ring) f.ring.material.color.set(Math.sin(performance.now() / 90) > 0 ? BUFFS[b.kind].color : '#ffffff');
      if (b.t <= 0 || (BUFFS[b.kind].hits && b.hits <= 0)) clearBuff(f);
    }
    if (fighting && have.length) {
      timer -= dt;
      if (timer <= 0 && list.length < 1) { spawn(fighters); timer = rand(6.5, 9.5); }
    }
    for (const p of [...list]) {
      p.t += dt;
      if (!p.landed) {
        p.vy -= 30 * dt; p.y += p.vy * dt;
        if (p.y <= 0.75) { p.y = 0.75; if (Math.abs(p.vy) > 4) { p.vy = -p.vy * 0.35; fx.sfx.bump?.(); fx.puff(new THREE.Vector3(p.x, 0.3, p.z)); } else { p.landed = true; fx.pop('Grab it!', new THREE.Vector3(p.x, 1.7, p.z), 'small'); } }
      } else { p.life -= dt; p.y = 0.75 + Math.sin(p.t * 3) * 0.12; }
      p.holder.position.y = p.y; p.spin.rotation.y += dt * 2.6;
      p.ring.scale.setScalar(1 + 0.12 * Math.sin(p.t * 6)); p.ring.material.opacity = p.life < 2.5 ? (Math.sin(p.t * 20) > 0 ? 0.9 : 0.2) : 0.9;
      p.holder.visible = p.life > 2.5 || Math.sin(p.t * 20) > 0;
      if (p.life <= 0) { remove(p); continue; }
      if (p.y > 1.6) continue;
      const f = fighters.find((f) => f.alive && !f.falling && !f.won && Math.hypot(f.pos.x - p.x, f.pos.z - p.z) < f.radius + 0.6);
      if (f) { give(f, p.kind); remove(p); }
    }
  }
  function reset(fighters = []) { for (const p of [...list]) remove(p); fighters.forEach(clearBuff); timer = rand(2, 3.5); }
  return { list, update, reset, give, clearBuff, kinds: have };
}
