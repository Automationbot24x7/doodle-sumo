import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadURDF } from './urdf.js';

const $ = (s, el = document) => el.querySelector(s);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const NICE = { Idle_Loop: 'Idle', Crouch_Idle_Loop: 'Sumo stance', Jog_Fwd_Loop: 'Run', Sprint_Loop: 'Sprint', Punch_Cross: 'Shove', Punch_Jab: 'Jab', Roll: 'Dash roll', Swim_Fwd_Loop: 'Falling flail', Dance_Loop: 'Victory dance', Yes: 'Cheer' };
const STEP = { 'multimodal-to-image': 'Toy concept image', 'img-to-3d': 'Image → 3D model', 'text-to-3d': 'Text → 3D model', rig: 'Humanoid auto-rig', retarget: 'Animation retarget', articulate: 'Articulation (joints)', export: 'Export 3MF / STL', 'material-transfer': 'Material transfer', 'world-gen': 'SpatialGen world' };
const CREDITS = { 'multimodal-to-image': 12, 'img-to-3d': 20, 'text-to-3d': 20, rig: 15, retarget: 6, articulate: 28, export: 1, 'material-transfer': 7, 'world-gen': 10 };

// One WebGL renderer draws every viewer; each frame is copied into that viewer's 2D canvas.
const gl = new THREE.WebGLRenderer({ antialias: true, alpha: true });
gl.setPixelRatio(Math.min(devicePixelRatio, 2)); gl.toneMapping = THREE.ACESFilmicToneMapping;
const env = new THREE.PMREMGenerator(gl).fromScene(new RoomEnvironment(), 0.04).texture;
const views = [];
function makeView(canvas, setup) {
  const scene = new THREE.Scene(); scene.environment = env;
  scene.add(new THREE.HemisphereLight('#fff', '#999', 1.2)); const d = new THREE.DirectionalLight('#fff', 1.8); d.position.set(2, 4, 3); scene.add(d);
  const cam = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  const v = { canvas, ctx: canvas.getContext('2d'), scene, cam, yaw: 0.5, pitch: 0.25, dist: 3, target: new THREE.Vector3(), visible: false, spin: true, update: null };
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw: v.yaw, pitch: v.pitch }; v.spin = false; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!drag) return; v.yaw = drag.yaw - (e.clientX - drag.x) * 0.01; v.pitch = Math.max(-0.2, Math.min(1.2, drag.pitch + (e.clientY - drag.y) * 0.01)); });
  canvas.addEventListener('pointerup', () => (drag = null));
  new IntersectionObserver(([en]) => (v.visible = en.isIntersecting)).observe(canvas);
  setup(v); views.push(v); return v;
}
function frameObject(v, obj, k = 1.25) {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj); const s = b.getSize(new THREE.Vector3()); b.getCenter(v.target);
  v.dist = Math.max(s.x, s.y, s.z) * 2.3 * k;
}
const clock = new THREE.Clock();
function loop() {
  const dt = Math.min(0.05, clock.getDelta());
  for (const v of views) {
    if (!v.visible) continue;
    const w = v.canvas.clientWidth, h = v.canvas.clientHeight; if (!w || !h) continue;
    const pr = gl.getPixelRatio();
    if (v.canvas.width !== Math.round(w * pr)) { v.canvas.width = Math.round(w * pr); v.canvas.height = Math.round(h * pr); }
    if (v.spin) v.yaw += dt * 0.5;
    v.update?.(dt);
    v.cam.aspect = w / h; v.cam.updateProjectionMatrix();
    v.cam.position.set(v.target.x + Math.sin(v.yaw) * Math.cos(v.pitch) * v.dist, v.target.y + Math.sin(v.pitch) * v.dist, v.target.z + Math.cos(v.yaw) * Math.cos(v.pitch) * v.dist);
    v.cam.lookAt(v.target);
    gl.setSize(w, h, false); gl.render(v.scene, v.cam);
    v.ctx.clearRect(0, 0, v.canvas.width, v.canvas.height); v.ctx.drawImage(gl.domElement, 0, 0, v.canvas.width, v.canvas.height);
  }
  requestAnimationFrame(loop);
}

async function fighterRow(f) {
  const row = document.createElement('section'); row.className = 'row';
  row.innerHTML = `<figure><img src="assets/fighters/${f.id}/doodle.png" alt="${f.title} doodle"><figcaption>1. Crayon doodle</figcaption></figure><div class="arr">→</div>
    <figure><img src="assets/fighters/${f.id}/toy.png" alt="${f.title} toy concept"><figcaption>2. Lux3D toy concept</figcaption></figure><div class="arr">→</div>
    <div class="viewer"><canvas></canvas><div class="side"><h3>${f.title}</h3><p>${f.blurb}</p>
      <div class="toggles"><button class="btn on" data-m="tex">3. Textured</button><button class="btn" data-m="wire">Mesh</button><button class="btn" data-m="skel">4. Skeleton</button></div>
      <div class="cap">5. Moves (Lux3D retarget)</div><div class="moves"></div>
      <a class="dl" href="assets/print/${f.id}.3mf" download>6. Download for 3D printing (.3mf)</a>
      <div class="ids">Lux3D tasks: toy ${f.tasks.toy} · model ${f.tasks.model} · rig ${f.tasks.rig} · moves ${f.tasks.anims}</div></div></div>`;
  $('#fighters').appendChild(row);
  const g = await loader.loadAsync(`assets/fighters/${f.id}/fighter.glb`);
  makeView($('canvas', row), (v) => {
    const model = g.scene; v.scene.add(model);
    const mixer = new THREE.AnimationMixer(model); let cur;
    const skel = new THREE.SkeletonHelper(model); skel.visible = false; skel.material.depthTest = false; skel.material.color = new THREE.Color('#e2453c'); v.scene.add(skel);
    const mats = []; model.traverse((o) => { if (o.isMesh) mats.push([o, o.material]); });
    const wire = new THREE.MeshBasicMaterial({ color: '#3d7be0', wireframe: true });
    const ghost = new THREE.MeshBasicMaterial({ color: '#c9daf2', transparent: true, opacity: 0.25, depthWrite: false });
    const play = (i) => { cur?.stop(); cur = mixer.clipAction(g.animations[i]).play(); row.querySelectorAll('.moves .btn').forEach((b, j) => b.classList.toggle('on', i === j)); };
    (f.anims || []).forEach((id, i) => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = NICE[id] || id; b.onclick = () => play(i); $('.moves', row).appendChild(b); });
    row.querySelectorAll('.toggles .btn').forEach((b) => b.onclick = () => {
      row.querySelectorAll('.toggles .btn').forEach((x) => x.classList.toggle('on', x === b));
      const m = b.dataset.m; skel.visible = m === 'skel';
      mats.forEach(([o, mat]) => (o.material = m === 'tex' ? mat : m === 'wire' ? wire : ghost));
    });
    play(Math.max(0, (f.anims || []).indexOf('Crouch_Idle_Loop')));
    mixer.update(0); frameObject(v, model, 1.55);
    v.update = (dt) => mixer.update(dt);
  });
}

async function trapCard(p) {
  const el = document.createElement('div'); el.className = 'trap';
  el.innerHTML = `<canvas></canvas><h3>${p.title}</h3><p class="prompt"><b>Model prompt:</b> ${p.prompt}</p><p class="prompt"><b>Motion prompt:</b> ${p.motion}</p><div class="sliders"></div><details><summary class="cap">Joint file from Lux3D (URDF)</summary><pre></pre></details><div class="ids">Lux3D tasks: model ${p.tasks.model} · articulation ${p.tasks.articulate}</div>`;
  $('#traps').appendChild(el);
  const base = `assets/props/${p.id}/`;
  $('pre', el).textContent = await (await fetch(base + 'robot.urdf')).text();
  const { root, joints } = await loadURDF(base, loader);
  makeView($('canvas', el), (v) => {
    v.scene.add(root); frameObject(v, root, 1.1);
    for (const [name, j] of Object.entries(joints)) {
      const lo = isFinite(j.lower) ? j.lower : -Math.PI, hi = isFinite(j.upper) && j.upper !== j.lower ? j.upper : Math.PI;
      const lab = document.createElement('label'); lab.innerHTML = `${name} <span style="font-weight:600">(${j.type}${isFinite(j.upper) ? `, ${(j.lower * 57.3).toFixed(0)}° to ${(j.upper * 57.3).toFixed(0)}°` : ''})</span><input type="range" min="${lo}" max="${hi}" step="0.001" value="${lo}">`;
      const input = $('input', lab); let auto = true, t = 0;
      input.oninput = () => { auto = false; j.set(+input.value); };
      $('.sliders', el).appendChild(lab);
      const prev = v.update; v.update = (dt) => { prev?.(dt); if (auto) { t += dt; const val = lo + (Math.sin(t * 1.6) * 0.5 + 0.5) * (hi - lo); j.set(val); input.value = val; } };
    }
  });
}

async function propCard(p) {
  const el = document.createElement('div'); el.className = 'prop';
  el.innerHTML = `<canvas></canvas><h4>${p.title}</h4><p>${p.prompt}</p><div class="ids">Lux3D task ${p.tasks.model}</div>`;
  $('#props').appendChild(el);
  const g = await loader.loadAsync(`assets/props/${p.id}.glb`);
  makeView($('canvas', el), (v) => { v.scene.add(g.scene); frameObject(v, g.scene, 0.95); });
}

(async () => {
  const [fighters, props, pipe] = await Promise.all(['data/fighters.json', 'data/props.json', 'data/pipeline.json'].map((u) => fetch(u).then((r) => r.json())));
  const ok = pipe.tasks.filter((t) => t.ok);
  const credits = ok.reduce((s, t) => s + (CREDITS[t.kind] || 0), 0);
  const secs = ok.reduce((s, t) => s + (t.secs || 0), 0);
  $('#stats').innerHTML = `<div><b>${fighters.length}</b>fighters</div><div><b>${props.length}</b>props &amp; traps</div><div><b>${ok.length}</b>Lux3D tasks</div><div><b>${Math.round(secs / 60)}</b>minutes of Lux3D time</div><div><b>~${credits}</b>credits used</div>`;
  $('#tasks tbody').innerHTML = pipe.tasks.slice().reverse().map((t) => `<tr><td>${t.t.slice(0, 16).replace('T', ' ')}</td><td>${STEP[t.kind] || t.kind}</td><td>${t.label}</td><td>${t.taskId ?? t.worldId ?? ''}</td><td>${t.secs ?? ''}</td><td class="${t.ok ? 'ok' : 'bad'}">${t.ok ? 'done' : 'failed'}</td></tr>`).join('');
  requestAnimationFrame(loop);
  for (const f of fighters) await fighterRow(f);
  for (const p of props.filter((p) => p.urdf)) await trapCard(p);
  for (const p of props.filter((p) => !p.urdf)) await propCard(p);
})();
