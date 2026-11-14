// Forge stage: each Lux3D result lands on the desk as it arrives
// (doodle on the page -> toy concept card -> 3D model on a turntable -> the rigged toy showing its moves).
import * as THREE from 'three';
import { Fighter } from './fighter.js';

const SKEL_SECS = 2.6;
const READY_SHOW = [[0, 'idle'], [2.7, 'shove'], [3.6, 'jab'], [4.4, 'roll'], [5.6, 'sprint'], [6.9, 'cheer'], [8.2, 'dance']];
const UP = new THREE.Vector3(0, 1, 0), va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
const SPOT = new THREE.Vector3(1.3, 0, -0.1);   // where the model and the finished toy stand (stage-local)

export function createForgeStage({ scene, world, loader, gltfs, shrinkTextures, stars, confetti, sfx }) {
  const group = new THREE.Group(); group.position.set(0, 0, 0.5); group.visible = false; world.add(group);
  const texLoader = new THREE.TextureLoader().setCrossOrigin('anonymous');
  let items = {}, tweens = [], t = 0, timing = { skel: SKEL_SECS, show: READY_SHOW };
  const at = (v) => v.clone().add(group.position);
  const popIn = (o) => { o.userData.s = o.scale.x; o.scale.setScalar(0.001); tweens.push({ o, t: 0 }); };

  function clear() {
    for (const o of [...group.children]) group.remove(o);
    if (items.skel) scene.remove(items.skel);
    items = {}; tweens = []; t = 0;
  }

  // opts (optional, for the video intro): { at: [x, y, z] stage-local spot, skel: seconds of skeleton, show: [[t, role]...], scale }
  async function show(kind, data, opts = {}) {
    const it = items;
    try {
      if (kind === 'reset') return clear();
      if (kind === 'resume') { if (!it.doodle) show('doodle', data); return; }
      if (kind === 'doodle') {
        clear(); const cur = items; cur.doodle = true;
        const tex = await texLoader.loadAsync(data); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
        if (items !== cur) return;
        // multiply blending: the white of the drawing vanishes into the notebook page, the crayon stays
        const m = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.7), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true, blending: THREE.MultiplyBlending, depthWrite: false }));
        m.rotation.set(-Math.PI / 2, 0, -0.07); m.position.set(-0.8, 0.014, 0.6); m.renderOrder = 2;
        cur.doodle = m; group.add(m); popIn(m);
      }
      if (kind === 'toy' && !it.toy) {        // the toy concept image stands up behind the page like a photo card
        it.toy = true; const tex = await texLoader.loadAsync(data); tex.colorSpace = THREE.SRGBColorSpace;
        if (items !== it) return;
        const card = new THREE.Group();
        const back = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.5, 0.06), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 })); back.castShadow = true;
        const face = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); face.position.z = 0.035;
        card.add(back, face); card.position.set(-1.0, 1.32, -1.6); card.rotation.set(-0.1, 0.22, 0);
        it.toy = card; group.add(card); popIn(card); sfx.boing?.();
        stars(at(new THREE.Vector3(-1.0, 2.2, -1.0)), 6, 3, 0.35);
      }
      if (kind === 'model' && !it.model && !it.fighter) {   // the Lux3D model on a slow turntable
        it.model = true; const g = await loader.loadAsync(data);
        if (items !== it || it.fighter) return;
        shrinkTextures(g.scene); const root = g.scene;
        const b = new THREE.Box3().setFromObject(root); root.scale.setScalar(2.1 / (b.max.y - b.min.y));
        const b2 = new THREE.Box3().setFromObject(root);
        root.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
        root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        const holder = new THREE.Group(); holder.add(root); holder.position.copy(SPOT);
        it.model = holder; group.add(holder); popIn(holder); sfx.boing?.();
        stars(at(new THREE.Vector3(SPOT.x, 2.2, 0)), 8, 3.5, 0.4);
      }
      if (kind === 'rig' && !it.rigged) { it.rigged = true; stars(at(new THREE.Vector3(SPOT.x, 1.4, 0.2)), 5, 3, 0.3); sfx.tick?.(); }
      if (kind === 'ready') {                 // the finished fighter: a flash of its skeleton, then its moves
        if (it.model?.isObject3D) group.remove(it.model);
        const f = new Fighter(data, gltfs[data.id], { marker: false });
        const spot = opts.at ? new THREE.Vector3(...opts.at) : SPOT; it.spot = spot;
        timing = { skel: opts.skel ?? SKEL_SECS, show: opts.show || READY_SHOW };
        f.won = true; f.pos.copy(spot); f.facing = opts.facing ?? 0.15; f.mixer.stopAllAction();
        f.group.scale.setScalar(opts.scale || 1.2); group.add(f.group); it.fighter = f; it.model = null; t = 0; it.shown = -1;
        f.model.traverse((o) => { if (o.isMesh) { o.userData.m = o.material; o.material = new THREE.MeshBasicMaterial({ color: '#7fa8ee', transparent: true, opacity: 0.42, depthWrite: false }); } });
        // the Lux3D skeleton, drawn boldly: a red ball on every joint and a red bar along every bone
        const bones = []; f.model.traverse((o) => { if (o.isBone) bones.push(o); });
        const red = new THREE.MeshBasicMaterial({ color: '#e2453c', depthTest: false, transparent: true });
        const ballGeo = new THREE.SphereGeometry(1, 10, 8), barGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
        it.skel = new THREE.Group(); it.skel.renderOrder = 5; scene.add(it.skel);
        it.bones = bones.map((b) => {
          const ball = new THREE.Mesh(ballGeo, red); ball.renderOrder = 6; it.skel.add(ball);
          let bar = null; if (b.parent?.isBone) { bar = new THREE.Mesh(barGeo, red); bar.renderOrder = 5; it.skel.add(bar); }
          return { b, ball, bar };
        });
        stars(at(new THREE.Vector3(spot.x, 2.3, spot.z + 0.1)), 12, 4.5, 0.45); sfx.boing?.();
      }
    } catch (e) { console.warn('forge stage', kind, e); }
  }

  function update(dt) {
    if (!group.visible) return;
    const it = items;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const w = tweens[i]; w.t += dt; const k = Math.min(1, w.t / 0.5), c = 1.70158;
      w.o.scale.setScalar(w.o.userData.s * Math.max(0.001, 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2)));
      if (k >= 1) tweens.splice(i, 1);
    }
    if (it.model?.isObject3D) it.model.rotation.y += dt * 0.9;
    if (it.fighter) {
      const f = it.fighter; t += dt;
      if (it.skel && t > timing.skel) {
        scene.remove(it.skel); it.skel = null; it.bones = null;
        f.model.traverse((o) => { if (o.isMesh && o.userData.m) { o.material.dispose(); o.material = o.userData.m; } });
      }
      const S = timing.show, sp = it.spot || SPOT;
      const idx = S.findLastIndex(([when]) => t >= when);
      if (idx !== it.shown) { it.shown = idx; f.play(S[idx][1], 0.15, 1); if (idx === S.length - 1) sfx.win?.(); }
      if (idx === S.length - 1 && Math.random() < dt * 9) confetti(at(new THREE.Vector3(sp.x + (Math.random() - 0.5) * 4, 3.2 + Math.random(), sp.z + 0.3 + (Math.random() - 0.5) * 2.4)));
      f.update(dt);
      if (it.bones) {
        f.group.updateMatrixWorld(true); const r = f.height * 0.022;
        for (const { b, ball, bar } of it.bones) {
          b.getWorldPosition(va); ball.position.copy(va); ball.scale.setScalar(r);
          if (bar) {
            b.parent.getWorldPosition(vb); const len = va.distanceTo(vb);
            bar.position.copy(va).add(vb).multiplyScalar(0.5); bar.scale.set(r * 0.45, Math.max(1e-4, len), r * 0.45);
            bar.quaternion.setFromUnitVectors(UP, vc.copy(va).sub(vb).normalize());
          }
        }
      }
    }
  }
  return { group, show, update, clear };
}
