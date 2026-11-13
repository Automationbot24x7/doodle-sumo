import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Fighter, DESK, ROLE, lerpAngle } from './fighter.js';
import { Bot, edgeDanger } from './ai.js';
import { woodTexture, paperRingTexture, rugTexture, blobTexture } from './textures.js';
import { initAudio, sfx, startMusic, setMuted, isMuted } from './audio.js';
import { loadProp, placeProps, updateHazards, resetHazards } from './props.js';
import { listCustom, deleteCustom } from './store.js';
import { initForge, openForge, forging, RELAY } from './forge.js';
import { createForgeStage } from './stage.js';
import { createPickups, BUFFS } from './pickups.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#2a2420');
scene.fog = new THREE.Fog('#2a2420', 30, 70);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
camera.position.set(0, 12, 12);

// ---------- lights
scene.add(new THREE.HemisphereLight('#fff4e0', '#4a3a30', 0.95));
const rim = new THREE.DirectionalLight('#bcd4ff', 1.6); rim.position.set(4, 6, -10); scene.add(rim);
const sun = new THREE.DirectionalLight('#fff1d6', 2.3);
sun.position.set(-6, 14, 7); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 9, bottom: -9, near: 1, far: 40 });
scene.add(sun);
const lampLight = new THREE.PointLight('#ffd08a', 30, 14, 1.6); lampLight.position.set(5.5, 5, -5.5); scene.add(lampLight);

// ---------- desk + room
const world = new THREE.Group(); scene.add(world);
const wood = woodTexture(renderer);
const deskMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.62, metalness: 0 });
const edgeMat = new THREE.MeshStandardMaterial({ color: '#8a5a33', roughness: 0.7 });
const top = new THREE.Mesh(new THREE.BoxGeometry(DESK.w, 0.5, DESK.d), [edgeMat, edgeMat, deskMat, edgeMat, edgeMat, edgeMat]);
top.position.y = -0.25; top.receiveShadow = true; world.add(top);
for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 9, 0.6), edgeMat); leg.position.set(x * (DESK.w / 2 - 0.6), -4.75, z * (DESK.d / 2 - 0.6)); world.add(leg);
}
const ring = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4), new THREE.MeshStandardMaterial({ map: paperRingTexture(), roughness: 0.95 }));
ring.rotation.x = -Math.PI / 2; ring.rotation.z = 0.06; ring.position.y = 0.006; ring.receiveShadow = true; world.add(ring);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: '#5b4636', roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -9.3; floor.receiveShadow = true; world.add(floor);
const rug = new THREE.Mesh(new THREE.PlaneGeometry(22, 16), new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1 }));
rug.rotation.x = -Math.PI / 2; rug.position.y = -9.28; world.add(rug);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.MeshStandardMaterial({ color: '#d9c7a6', roughness: 1 }));
wall.position.set(0, 4, -14); world.add(wall);
const blobTex = blobTexture();

// The room around the desk: a 360° panorama generated with Aholo SpatialGen (if present).
async function loadRoom() {
  try {
    const tex = await new THREE.TextureLoader().loadAsync('assets/world/pano.jpg');
    tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex; scene.backgroundBlurriness = 0.035; scene.backgroundIntensity = 0.95;
    scene.backgroundRotation.set(0, Math.PI * 0.5, 0);
    scene.fog = null; wall.visible = false; floor.visible = false; rug.visible = false;
  } catch { /* plain room fallback */ }
}

// ---------- assets
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
let FIGHTERS = [], PROPS = [], gltfs = {}, propGltfs = {};
const thumbs = {};

async function loadAll() {
  const [fj, pj, mine] = await Promise.all([fetch('data/fighters.json').then((r) => r.json()), fetch('data/props.json').then((r) => r.json()).catch(() => []), listCustom()]);
  FIGHTERS.push(...fj); PROPS = pj;
  let n = 0; const total = FIGHTERS.length + PROPS.length + mine.length;
  const tick = () => { $('#loadTxt').textContent = `Sharpening crayons… ${Math.round((++n / total) * 100)}%`; };
  await Promise.all([
    ...FIGHTERS.map(async (f) => { gltfs[f.id] = await loader.loadAsync(`assets/fighters/${f.id}/fighter.glb`); tick(); }),
    ...PROPS.map(async (p) => { try { propGltfs[p.id] = await loadProp(p, loader); } catch (e) { console.warn('prop', p.id, e); } tick(); }),
  ]);
  // fighters this visitor drew and forged earlier (kept in this browser)
  // toys drawn on the pad and forged live, shipped with the site: their stats come from their shape, like any drawn toy
  for (const f of FIGHTERS) if (f.drawn && !f.mass) Object.assign(f, shapeStats(gltfs[f.id].scene));
  for (const rec of mine.sort((a, b) => a.createdAt - b.createdAt)) { try { await registerCustom(rec); } catch (e) { console.warn('custom fighter', rec.id, e); } tick(); }
}
let colliders = [], hazards = [], pickups = { list: [], update() {}, reset() {} };
const rand = (a, b) => a + Math.random() * (b - a);
const srcOf = (def, kind) => def.src?.[kind] || `assets/fighters/${def.id}/${kind}.png`;

// Lux3D models arrive with 2K-4K textures; a toy on a desk needs 1K at most.
function shrinkTextures(root, max = 1024) {
  const seen = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
      const t = m[k]; if (!t?.image) continue;
      if (!seen.has(t)) {
        const img = t.image, w = img.width, h = img.height;
        if (Math.max(w, h) <= max) seen.set(t, t);
        else {
          const c = document.createElement('canvas'), s = max / Math.max(w, h); c.width = Math.round(w * s); c.height = Math.round(h * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          const nt = new THREE.CanvasTexture(c); nt.flipY = t.flipY; nt.colorSpace = t.colorSpace; nt.wrapS = t.wrapS; nt.wrapT = t.wrapT; nt.channel = t.channel; nt.anisotropy = 4;
          seen.set(t, nt); t.dispose(); img.close?.();
        }
      }
      m[k] = seen.get(t); m.needsUpdate = true;
    }
  });
}
// A forged toy's stats come from its shape: chunky toys are heavy and hit hard, skinny ones are quick.
function shapeStats(root) {
  root.updateMatrixWorld(true);
  const s = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  const k = THREE.MathUtils.clamp((s.z / s.y - 0.2) / 0.3, 0, 1);
  return { mass: +(0.75 + 0.85 * k).toFixed(2), speed: +(1.3 - 0.45 * k).toFixed(2), power: +(0.85 + 0.3 * k).toFixed(2) };
}
async function registerCustom(rec) {
  const url = URL.createObjectURL(rec.glb);
  let gltf; try { gltf = await loader.loadAsync(url); } finally { URL.revokeObjectURL(url); }
  shrinkTextures(gltf.scene);
  const def = {
    id: rec.id, custom: true, title: rec.title, blurb: rec.blurb, anims: rec.anims, tasks: rec.tasks, secs: rec.secs,
    src: { doodle: URL.createObjectURL(rec.doodle), toy: URL.createObjectURL(rec.toy) },
    print: { mf: rec.mf ? URL.createObjectURL(rec.mf) : null, stl: rec.stl ? URL.createObjectURL(rec.stl) : null },
    ...(rec.mass ? { mass: rec.mass, speed: rec.speed, power: rec.power } : shapeStats(gltf.scene)),
  };
  gltfs[def.id] = gltf;
  const i = FIGHTERS.findIndex((f) => f.id === def.id); if (i >= 0) FIGHTERS.splice(i, 1, def); else FIGHTERS.push(def);
  return def;
}

// ---------- thumbnails (3D render + skeleton) rendered once per fighter
function makeThumbs(list = FIGHTERS) {
  const rt = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  rt.setSize(320, 320); rt.outputColorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Scene(); s.environment = scene.environment;
  s.add(new THREE.HemisphereLight('#fff', '#888', 1.6)); const dl = new THREE.DirectionalLight('#fff', 2); dl.position.set(2, 3, 4); s.add(dl);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  for (const def of list) {
    const f = new Fighter(def, gltfs[def.id], { marker: false });
    f.mixer.stopAllAction(); f.model.updateMatrixWorld(true);
    s.add(f.group); const h = f.height; cam.position.set(h * 0.9, h * 0.75, h * 2.6); cam.lookAt(0, h * 0.5, 0);
    rt.render(s, cam); const model = rt.domElement.toDataURL('image/png');
    // card portrait: sumo stance, facing the camera
    f.play('idle', 0); f.mixer.update(0.5); f.body.rotation.y = 0.35; f.model.updateMatrixWorld(true);
    cam.position.set(h * 0.15, h * 0.62, h * 2.25); cam.lookAt(0, h * 0.45, 0);
    rt.render(s, cam); const card = rt.domElement.toDataURL('image/png');
    f.mixer.stopAllAction(); f.body.rotation.y = 0; f.model.updateMatrixWorld(true);
    cam.position.set(h * 0.9, h * 0.75, h * 2.6); cam.lookAt(0, h * 0.5, 0);
    const skel = new THREE.SkeletonHelper(f.model); skel.material.linewidth = 3; skel.material.depthTest = false; skel.material.color = new THREE.Color('#e2453c');
    f.model.traverse((o) => { if (o.isMesh) { o.userData.m = o.material; o.material = new THREE.MeshBasicMaterial({ color: '#c9daf2', wireframe: true, transparent: true, opacity: 0.35 }); } });
    s.add(skel); rt.render(s, cam); const skeleton = rt.domElement.toDataURL('image/png');
    s.remove(skel); s.remove(f.group);
    f.model.traverse((o) => { if (o.isMesh && o.userData.m) { o.material.dispose(); o.material = o.userData.m; delete o.userData.m; } });
    thumbs[def.id] = { model, skeleton, card };
  }
  rt.dispose(); rt.forceContextLoss?.();
}

// ---------- UI: roster
let mode = 1; let pick = [null, null];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function buildRoster() {
  const box = $('#roster'); box.innerHTML = '';
  for (const f of FIGHTERS) {
    const el = document.createElement('button'); el.className = 'card'; el.dataset.id = f.id;
    el.innerHTML = `<span class="badge">P1</span>${f.custom ? '<span class="mine">yours</span><span class="del" title="Delete this toy">×</span>' : f.drawn ? '<span class="mine drawn">drawn live</span>' : ''}<div class="imgs"><img class="toy3d" src="${thumbs[f.id]?.card || srcOf(f, 'toy')}" alt="${esc(f.title)}"><img class="sticker" src="${srcOf(f, 'doodle')}" alt="original doodle"></div>
      <div class="nm">${esc(f.title)}</div>
      <div class="stats"><span>Weight</span><span class="bar"><i style="width:${Math.round(f.mass / 1.6 * 100)}%"></i></span><span>Speed</span><span class="bar"><i style="width:${Math.round(f.speed / 1.3 * 100)}%"></i></span><span>Power</span><span class="bar"><i style="width:${Math.round(f.power / 1.15 * 100)}%"></i></span></div>`;
    el.onclick = (e) => {
      initAudio(); sfx.ui();
      if (e.target.classList.contains('del')) { if (confirm(`Delete ${f.title} from this browser?`)) removeCustom(f.id); return; }
      choose(f.id);
    };
    box.appendChild(el);
  }
  /* the roster's own 'Draw your own' card was replaced by the big button next to Fight! */
  if (false) { const draw = document.createElement('button'); draw.className = 'card draw'; draw.id = 'drawCard';
  draw.innerHTML = `<div class="imgs"><svg viewBox="0 0 64 64" fill="none" stroke="#3d7be0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 52l4-14L42 12l10 10-26 26z" fill="#fff7d1"/><path d="M36 18l10 10M12 52l14-4"/><path d="M50 40v14M43 47h14" stroke="#e2453c"/></svg></div><div class="nm">Draw your own</div><div class="sub">${RELAY ? 'Lux3D builds it live in about 3 minutes' : 'Live Lux3D forge: runs with your own Aholo key'}</div>`;
  draw.onclick = () => { initAudio(); sfx.ui(); openForge(); };
  box.appendChild(draw); }
  if (!FIGHTERS.some((f) => f.id === pick[0])) pick[0] = FIGHTERS[0]?.id;
  if (!FIGHTERS.some((f) => f.id === pick[1])) pick[1] = FIGHTERS[1]?.id;
  refreshRoster();
}
async function removeCustom(id) {
  const i = FIGHTERS.findIndex((f) => f.id === id); if (i < 0) return;
  FIGHTERS.splice(i, 1); delete gltfs[id]; delete thumbs[id];
  await deleteCustom(id).catch(() => {}); buildRoster(); if (state.attract) startAttract();
}
let picking = 0;
function choose(id) {
  if (mode === 2) { pick[picking] = id; picking = 1 - picking; } else pick[0] = id;
  refreshRoster();
}
function refreshRoster() {
  document.querySelectorAll('.card[data-id]').forEach((c) => {
    c.classList.toggle('sel', c.dataset.id === pick[0]);
    c.classList.toggle('p2', mode === 2 && c.dataset.id === pick[1] && pick[1] !== pick[0]);
    c.querySelector('.badge').textContent = mode === 2 && c.dataset.id === pick[1] && pick[1] !== pick[0] ? 'P2' : 'P1';
  });
  const a = FIGHTERS.find((f) => f.id === pick[0]), b = FIGHTERS.find((f) => f.id === pick[1]);
  $('#pickLine').innerHTML = !a ? '' : mode === 2 && b && b !== a ? `<b>P1 ${esc(a.title)}</b> vs <b>P2 ${esc(b.title)}</b>` : `<b>${esc(a.title)}.</b> ${esc(a.blurb || '')}`;
}
function setMode(m) { mode = m; document.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', +x.dataset.mode === m)); document.body.classList.toggle('two', m === 2); picking = 0; refreshRoster(); }
document.querySelectorAll('.chip').forEach((b) => b.onclick = () => setMode(+b.dataset.mode));

function show(id) { document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('show', s.id === id || (id === 'game' && s.id === 'hud'))); }

// ---------- input
const keys = new Set(); const pressed = new Set();
const QS = new URLSearchParams(location.search); const DEMO = QS.has('demo'); const VIDEO = QS.has('video');
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;   // typing a fighter's name in the forge
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  if (!keys.has(e.code)) pressed.add(e.code); keys.add(e.code);
  if (e.code === 'Enter') { if ($('#title').classList.contains('show')) startMatch(); else if ($('#results').classList.contains('show')) startMatch(); else if (state.spectating && state.phase === 'fight') state.skip = true; }
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'Escape' && !state.attract) toMenu();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const touch = { x: 0, z: 0, shove: false, dash: false, dashP: false, shoveP: false };
setupTouch();
function setupTouch() {
  const stick = $('#stick'), nub = stick.querySelector('.nub'); let id = null, cx = 0, cy = 0;
  stick.addEventListener('pointerdown', (e) => { id = e.pointerId; const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; stick.setPointerCapture(id); move(e); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
  const end = () => { id = null; touch.x = touch.z = 0; nub.style.transform = ''; };
  stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
  function move(e) { let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy), m = 55; if (l > m) { dx *= m / l; dy *= m / l; } nub.style.transform = `translate(${dx}px,${dy}px)`; touch.x = dx / m; touch.z = dy / m; }
  const btn = (el, k) => { el.addEventListener('pointerdown', (e) => { e.preventDefault(); initAudio(); touch[k] = true; touch[k + 'P'] = true; }); el.addEventListener('pointerup', () => touch[k] = false); el.addEventListener('pointercancel', () => touch[k] = false); };
  btn($('#tShove'), 'shove'); btn($('#tDash'), 'dash');
}
function playerInput(slot) {
  const k = (c) => keys.has(c), p = (c) => pressed.has(c);
  let x = 0, z = 0, held = false, down = false, dash = false;
  if (slot === 0) {
    x = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0); z = (k('KeyS') ? 1 : 0) - (k('KeyW') ? 1 : 0);
    held = k('KeyJ') || k('KeyF'); down = p('KeyJ') || p('KeyF'); dash = p('KeyK') || p('KeyG');
    if (mode === 1) {
      x += (k('ArrowRight') ? 1 : 0) - (k('ArrowLeft') ? 1 : 0); z += (k('ArrowDown') ? 1 : 0) - (k('ArrowUp') ? 1 : 0);
      held = held || k('Space'); down = down || p('Space'); dash = dash || p('ShiftLeft') || p('ShiftRight');
    }
    x += touch.x; z += touch.z; held = held || touch.shove; down = down || touch.shoveP; dash = dash || touch.dashP;
  } else {
    x = (k('ArrowRight') ? 1 : 0) - (k('ArrowLeft') ? 1 : 0); z = (k('ArrowDown') ? 1 : 0) - (k('ArrowUp') ? 1 : 0);
    held = k('Period') || k('Numpad0'); down = p('Period') || p('Numpad0'); dash = p('Slash') || p('NumpadDecimal');
  }
  // rotate input to camera yaw (camera looks down -z, so screen-up = -z)
  const l = Math.hypot(x, z); if (l > 1) { x /= l; z /= l; }
  return { x, z, shoveHeld: held, shoveDown: down, dash };
}

// ---------- FX
const fxGroup = new THREE.Group(); scene.add(fxGroup);
const starTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#f6c431'; g.strokeStyle = '#2b2b33'; g.lineWidth = 7; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 26 : 58; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const puffTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.strokeStyle = '#2b2b33'; g.lineWidth = 4; g.beginPath(); g.arc(32, 32, 26, 0, 7); g.fill(); g.stroke(); const t = new THREE.CanvasTexture(c); return t; })();
const confettiTex = ['#e2453c', '#3d7be0', '#f6c431', '#3fae6a', '#ff8fb1'].map((col) => { const c = document.createElement('canvas'); c.width = 32; c.height = 20; const g = c.getContext('2d'); g.fillStyle = col; g.fillRect(0, 0, 32, 20); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; });
const parts = [];
function spawn(tex, pos, n, spread, speed, life, size) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.position.copy(pos); s.scale.setScalar(size); fxGroup.add(s);
    const a = Math.random() * Math.PI * 2; parts.push({ s, v: new THREE.Vector3(Math.cos(a) * speed * (0.5 + Math.random()), speed * (0.6 + Math.random()), Math.sin(a) * speed * (0.5 + Math.random())), life, max: life, size });
  }
}
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt; p.v.y -= 9 * dt; p.s.position.addScaledVector(p.v, dt);
    const k = p.life / p.max; p.s.scale.setScalar(p.size * (0.4 + 0.6 * k)); p.s.material.opacity = Math.min(1, k * 2); p.s.material.rotation += dt * 4;
    if (p.life <= 0) { fxGroup.remove(p.s); p.s.material.dispose(); parts.splice(i, 1); }
  }
}
const popWords = { small: ['Slap!', 'Pat!', 'Boop!', 'Shove!'], big: ['WHAM!', 'KA-SLAP!', 'OOF!', 'BONK!'] };
function pop(text, worldPos, cls = '') {
  const v = worldPos.clone().project(camera); const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = text;
  el.style.left = ((v.x + 1) / 2) * innerWidth + 'px'; el.style.top = ((1 - v.y) / 2) * innerHeight + 'px';
  $('#pops').appendChild(el); setTimeout(() => el.remove(), 850);
}
let shake = 0, hitStop = 0, slowmo = 0;
// the bout that plays behind the title screen is silent
const quiet = new Proxy(sfx, { get: (t, k) => (state.attract ? () => {} : t[k]) });

// ---------- match
const state = { phase: 'menu', fighters: [], bots: [], round: 0, wins: {}, t: 0, banner: 0, phaseT: 0 };
const ROUND_LEN = 60;
const SPAWNS = [[-1.7, 1.2], [1.7, -1.2], [1.7, 1.2], [-1.7, -1.2]];
const COLORS = ['#e2453c', '#3d7be0', '#3fae6a', '#f6c431'];

// Behind the title screen: a silent exhibition bout between four random toys, restarted every round.
function startAttract() {
  state.attract = true;
  state.fighters.forEach((f) => world.remove(f.group));
  const ids = FIGHTERS.map((f) => f.id).sort(() => Math.random() - 0.5).slice(0, 4);
  const newest = [...FIGHTERS].reverse().find((f) => f.custom); if (newest && !ids.includes(newest.id)) ids[0] = newest.id;
  state.fighters = ids.map((id, i) => {
    const f = new Fighter(FIGHTERS.find((d) => d.id === id), gltfs[id], { slot: i, color: COLORS[i], marker: false });
    world.add(f.group); return f;
  });
  state.bots = state.fighters.map((f) => new Bot(f, 1));
  state.wins = Object.fromEntries(state.fighters.map((f) => [f.slot, 0]));
  state.round = 0; newRound(); state.phase = 'fight'; state.phaseT = 0;
}

function startMatch() {
  initAudio(); if (!QS.has('nomusic')) startMusic();
  state.attract = false;
  state.fighters.forEach((f) => world.remove(f.group));
  const ids = [pick[0]];
  if (mode === 2) ids.push(pick[1] !== pick[0] ? pick[1] : FIGHTERS.find((f) => f.id !== pick[0]).id);
  const pool = FIGHTERS.map((f) => f.id).filter((id) => !ids.includes(id)).sort(() => Math.random() - 0.5);
  while (ids.length < 4 && pool.length) ids.push(pool.shift());
  while (ids.length < 4) ids.push(FIGHTERS[Math.floor(Math.random() * FIGHTERS.length)].id);
  state.fighters = ids.map((id, i) => {
    const def = FIGHTERS.find((f) => f.id === id);
    const f = new Fighter(def, gltfs[id], { player: i < mode, slot: i, color: COLORS[i] });
    world.add(f.group); return f;
  });
  state.bots = state.fighters.map((f) => (f.isPlayer && !DEMO ? null : new Bot(f, 1)));
  state.wins = Object.fromEntries(state.fighters.map((f) => [f.slot, 0]));
  state.round = 0; buildPlates(); show('game'); newRound();
}
function newRound() {
  state.round++; state.t = 0; state.showdown = false; state.spectating = false; state.skip = false;
  state.fighters.forEach((f, i) => { const [x, z] = SPAWNS[i]; f.reset(new THREE.Vector3(x, 0, z), Math.atan2(-x, -z)); });
  resetHazards(hazards); pickups.reset(state.fighters);
  state.phase = 'countdown'; state.phaseT = 0; updatePlates();
  banner(`Round ${state.round}`, state.round === 1 && !DEMO ? (matchMedia('(pointer: coarse)').matches ? 'Drag the stick · hold SHOVE to charge' : 'Hold J to charge a big slap') : state.round === 2 ? 'Grab the items that drop in!' : 'Shove them off the desk!');
}
function banner(txt, sub = '') { const b = $('#banner'); b.innerHTML = txt + (sub ? `<small>${sub}</small>` : ''); b.classList.add('on'); clearTimeout(banner.t); banner.t = setTimeout(() => b.classList.remove('on'), 1100); }
function buildPlates() {
  $('#plates').innerHTML = state.fighters.map((f) => `<div class="plate ${f.isPlayer ? 'p' + (f.slot + 1) : ''}" data-s="${f.slot}" style="border-color:${f.color}"><img src="${srcOf(f.def, 'doodle')}"><div><div class="who">${f.isPlayer ? 'PLAYER ' + (f.slot + 1) : 'CPU'}</div><div class="n">${esc(f.name)}</div><div class="pips"><i></i><i></i><span class="buff"></span></div></div></div>`).join('');
}
function outStamp(f) {
  const el = document.createElement('div'); el.className = 'outstamp';
  el.innerHTML = `<img src="${srcOf(f.def, 'doodle')}" alt=""><b>OUT!</b><span>${esc(f.name)}</span>`;
  $('#pops').appendChild(el); setTimeout(() => el.remove(), 1500);
}
// which item each toy is holding, on its name plate
function buffChips() {
  for (const f of state.fighters) {
    const b = f.buff, txt = !b ? '' : `${BUFFS[b.kind].chip} ${BUFFS[b.kind].hits ? '×' + b.hits : Math.ceil(b.t) + 's'}`;
    if (txt === f._chip) continue; f._chip = txt;
    const el = document.querySelector(`.plate[data-s="${f.slot}"] .buff`); if (el) { el.textContent = txt; el.style.background = b ? BUFFS[b.kind].color : ''; el.classList.toggle('on', !!b); }
  }
}
function updatePlates() {
  state.fighters.forEach((f) => { const el = document.querySelector(`.plate[data-s="${f.slot}"]`); if (!el) return; el.classList.toggle('out', !f.alive || f.falling); el.querySelectorAll('.pips i').forEach((p, i) => p.classList.toggle('w', i < state.wins[f.slot])); });
}
function toMenu() { state.forging = false; fstage.group.visible = false; show('title'); startAttract(); }

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
function step(dt) {
  const F = state.fighters; state.phaseT += dt;
  if (state.phase === 'countdown') {
    const n = 3 - Math.floor(state.phaseT / 0.7);
    if (state.phaseT > 1.0 && state.phaseT - dt <= 1.0) { /* round banner shown */ }
    if (state.phaseT > 1.2) {
      const c = Math.ceil(3 - (state.phaseT - 1.2) / 0.55);
      if (c !== state.lastCount) { state.lastCount = c; if (c > 0) { banner(String(c)); quiet.tick(); } else { banner('Hakkeyoi!', 'GO!'); quiet.go(); state.phase = 'fight'; state.phaseT = 0; } }
    }
    F.forEach((f) => f.update(dt));
    return;
  }
  if (state.phase === 'fight') state.t += dt;
  // pressure: last two standing hit harder, and harder still late in the round
  const standingNow = F.filter((f) => f.alive && !f.falling).length;
  if (state.phase === 'fight' && standingNow === 2 && !state.showdown && F.length > 2) { state.showdown = true; banner('Final showdown!', 'Shoves hit harder'); }
  state.boost = (standingNow === 2 ? 1.6 : 1) * (state.t > ROUND_LEN - 25 ? 1.4 : 1);
  // inputs
  F.forEach((f, i) => {
    let inp;
    if (state.phase !== 'fight') inp = { x: 0, z: 0 };
    else if (f.isPlayer && !DEMO) inp = playerInput(f.slot);
    else inp = state.bots[i].input(F, hazards, dt, pickups.list);
    f.control(inp, dt, { sfx: quiet });
  });
  // attacks land ~0.13 s after release
  for (const a of F) {
    if (a.attackT >= 0.12 && a.attackT - dt < 0.12 && a.alive && !a.falling) {
      const fwd = a.forward(v1); const reach = a.radius + 1.0 + a.attackCharge * 0.35; let hit = false;
      for (const b of F) {
        if (b === a || !b.alive || b.falling) continue;
        v2.set(b.pos.x - a.pos.x, 0, b.pos.z - a.pos.z); const d = v2.length();
        if (d > reach + b.radius) continue; v2.normalize();
        if (fwd.dot(v2) < Math.cos(1.15)) continue;
        const ch = a.attackCharge; const slug = a.buff?.kind === 'power';   // holding the bat
        const imp = (5 + 11 * ch * ch + 2.5 * ch) * a.power * (state.boost || 1) * (slug ? 1.9 : 1) / Math.sqrt(b.mass * 1.15);
        if (slug) a.buff.hits--;
        const dir = v2.clone().lerp(fwd, 0.35).normalize();
        b.vel.addScaledVector(dir, imp); b.stun = 0.25 + 0.45 * ch; b.squash = 0.25 + ch * 0.2; b.lastHitBy = a; b.charging = false;
        a.vel.addScaledVector(fwd, -1.2);
        hit = true;
        const at = new THREE.Vector3((a.pos.x + b.pos.x) / 2, b.height * 0.6, (a.pos.z + b.pos.z) / 2);
        spawn(starTex, at, ch > 0.5 ? 7 : 3, 1, 3 + ch * 3, 0.32, 0.35 + ch * 0.25);
        if (ch > 0.55 || slug) { quiet.bigSlap(); shake = slug ? 0.5 : 0.35; hitStop = 0.09; pop(slug ? 'HOME RUN!' : pick1(popWords.big), at, slug ? 'red' : 'yel'); }
        else { quiet.slap(0.6 + ch); shake = Math.max(shake, 0.12); hitStop = Math.max(hitStop, 0.03); if (Math.random() < 0.5) pop(pick1(popWords.small), at, 'small'); }
      }
      if (!hit && a.isPlayer) quiet.whoosh();
    }
  }
  // bodies
  for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
    const a = F[i], b = F[j]; if (!a.alive || !b.alive || a.falling || b.falling) continue;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), m = a.radius + b.radius;
    if (d < m && d > 1e-4) {
      const nx = dx / d, nz = dz / d, o = m - d, wa = b.mass / (a.mass + b.mass), wb = a.mass / (a.mass + b.mass);
      a.pos.x -= nx * o * wa; a.pos.z -= nz * o * wa; b.pos.x += nx * o * wb; b.pos.z += nz * o * wb;
      const rv = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
      if (rv < 0) {
        const dashBoost = (a.dashT > 0 || b.dashT > 0) ? 1.9 : 1.15;
        const jimp = -rv * dashBoost / (1 / a.mass + 1 / b.mass);
        a.vel.x -= (jimp / a.mass) * nx; a.vel.z -= (jimp / a.mass) * nz; b.vel.x += (jimp / b.mass) * nx; b.vel.z += (jimp / b.mass) * nz;
        if (-rv > 4) { quiet.bump(); spawn(puffTex, new THREE.Vector3((a.pos.x + b.pos.x) / 2, 0.4, (a.pos.z + b.pos.z) / 2), 3, 1, 1.5, 0.4, 0.25); if (a.dashT > 0) b.lastHitBy = a; if (b.dashT > 0) a.lastHitBy = b; }
      }
    }
  }
  // props (static circles)
  for (const f of F) {
    if (!f.alive || f.falling) continue;
    for (const c of colliders) {
      const dx = f.pos.x - c.x, dz = f.pos.z - c.z, d = Math.hypot(dx, dz), m = f.radius + c.r;
      if (d < m && d > 1e-4) { const nx = dx / d, nz = dz / d; f.pos.x += nx * (m - d); f.pos.z += nz * (m - d); const vn = f.vel.x * nx + f.vel.z * nz; if (vn < 0) { f.vel.x -= 1.6 * vn * nx; f.vel.z -= 1.6 * vn * nz; if (vn < -5) { quiet.boing(); f.squash = 0.3; } } }
    }
  }
  tickHazards(dt);
  pickups.update(dt, F, state.phase === 'fight'); buffChips();
  // edges
  for (const f of F) {
    if (!f.alive || f.falling) continue;
    // a toy that has already won the round cannot slide off the desk afterwards
    if (f.won) { const mx = DESK.w / 2 - f.radius, mz = DESK.d / 2 - f.radius; f.pos.x = Math.max(-mx, Math.min(mx, f.pos.x)); f.pos.z = Math.max(-mz, Math.min(mz, f.pos.z)); continue; }
    if (Math.abs(f.pos.x) > DESK.w / 2 + f.radius * 0.15 || Math.abs(f.pos.z) > DESK.d / 2 + f.radius * 0.15) {
      f.startFall({ sfx: quiet }); pop(f.isPlayer ? 'Nooo!' : pick1(['Aaah!', 'Wheee!', 'Bye!', 'Eep!']), new THREE.Vector3(f.pos.x, 1.4, f.pos.z), 'blu');
      setTimeout(() => outStamp(f), 380);
      if (f.lastHitBy) setTimeout(() => quiet.thud(), 650);
      if (performance.now() - (state.lastSlow || 0) > 2500) { state.lastSlow = performance.now(); slowmo = 0.55; }
      updatePlates();
    }
  }
  F.forEach((f) => f.update(dt));
  // round end
  if (state.phase === 'fight') {
    const standing = F.filter((f) => f.alive && !f.falling);
    const humansLeft = F.some((f) => f.isPlayer && f.alive && !f.falling);
    const anyHumans = F.some((f) => f.isPlayer) && !DEMO;
    if (anyHumans && !humansLeft && standing.length > 1 && !state.spectating) { state.spectating = true; setTimeout(() => state.phase === 'fight' && banner('Knocked out!', 'Watching at 1.7× speed · Enter to skip'), 900); }
    if (standing.length <= 1 || state.t > ROUND_LEN || state.skip) {
      let w = standing[0];
      if (!w && F.length) w = null;
      if (standing.length > 1) w = standing.sort((a, b) => Math.hypot(a.pos.x, a.pos.z) - Math.hypot(b.pos.x, b.pos.z))[0];
      state.phase = 'roundEnd'; state.phaseT = 0; state.roundWinner = w;
      if (w) { state.wins[w.slot]++; w.won = true; w.vel.multiplyScalar(0.25); w.stun = 0; w.play('cheer', 0.2); quiet.win(); banner(`${esc(w.name)}!`, w.isPlayer ? 'wins the round!' : 'takes the round'); }
      else banner('Draw!');
      updatePlates();
    }
    // timer display
    const left = Math.max(0, ROUND_LEN - state.t); $('#timer').textContent = state.phase === 'fight' ? Math.ceil(left) : '';
    if (left < 20 && left + dt >= 20) banner('Recess bell!', 'Traps go wild');
  } else if (state.phase === 'roundEnd') {
    if (state.roundWinner && state.phaseT > 1.4 && state.roundWinner.currentRole !== 'dance') state.roundWinner.play('dance', 0.3);
    if (state.attract) { if (state.phaseT > 2.6) startAttract(); return; }
    if (state.phaseT > 3.2) {
      let champ = state.fighters.find((f) => state.wins[f.slot] >= 2);
      if (!champ && state.round >= 5) champ = [...state.fighters].sort((a, b) => state.wins[b.slot] - state.wins[a.slot] || (b === state.roundWinner) - (a === state.roundWinner))[0];
      if (champ) endMatch(champ); else newRound();
    }
  } else if (state.phase === 'results' && state.champ) {
    const c = state.champ, dx = 0 - c.pos.x, dz = 0.9 - c.pos.z, d = Math.hypot(dx, dz);
    if (!c.arrived && d > 0.12) {
      const sp = Math.min(d, 5.2 * dt); c.pos.x += (dx / d) * sp; c.pos.z += (dz / d) * sp; c.vel.set(0, 0, 0);
      c.facing = lerpAngle(c.facing, Math.atan2(dx, dz), 1 - Math.exp(-12 * dt)); c.play('sprint', 0.15, 1.05);
    } else {
      if (!c.arrived) { c.arrived = true; c.play('dance', 0.25); quiet.win(); }
      c.facing = lerpAngle(c.facing, 0.25, 1 - Math.exp(-5 * dt));
      state.confetti = (state.confetti || 0) - dt;
      if (state.confetti <= 0) { state.confetti = 0.16; spawn(pick1(confettiTex), new THREE.Vector3(c.pos.x + rand(-2.2, 2.2), c.height + rand(1.6, 2.6), c.pos.z + rand(-1.6, 1.2)), 2, 1, 1.1, 1.5, 0.2); }
    }
  }
}
const hazardFx = {
  sfx: quiet,
  shake: (v) => { shake = Math.max(shake, v); },
  hitStop: (v) => { hitStop = Math.max(hitStop, v); },
  stars: (pos, n, speed, size) => spawn(starTex, pos, n, 1, speed, 0.5, size),
  puff: (pos) => spawn(puffTex, pos, 1, 0, 1, 0.5, 0.16),
  pop: (t, pos, cls) => pop(t, pos, cls),
};
const VIDEO_SCHEDULE = { stapler: [3.5, 19], fan: [8, 24], jack: [13, 28] };
function tickHazards(dt) {
  if (VIDEO && state.phase === 'fight') for (const h of hazards) {
    const sch = VIDEO_SCHEDULE[h.id]; if (!sch) continue;
    const due = sch.some((at) => state.t >= at - h.warn && state.t - dt < at - h.warn);
    if (due) { h.timer = h.warn; h.warning = false; h.active = 0; }
    else if (!h.warning && h.active <= 0) h.timer = Math.max(h.timer, h.warn + 0.5);
  } updateHazards(hazards, state.fighters, dt, state.phase === 'fight', state.phase === 'fight' && state.t > ROUND_LEN - 20, hazardFx); }
const pick1 = (a) => a[Math.floor(Math.random() * a.length)];

function endMatch(champ) {
  pickups.reset([]);
  state.phase = 'results'; state.champ = champ; champ.arrived = false; champ.won = true;
  $('#winTitle').textContent = champ.isPlayer ? (mode === 2 ? `Player ${champ.slot + 1} wins!` : 'You win!') : `${champ.name} wins!`;
  $('#winLine').textContent = champ.isPlayer ? `${champ.name} is the desk champion.` : 'Better luck next time. Rematch?';
  const t = thumbs[champ.id] || {};
  $('#winFlow').innerHTML = [['doodle', srcOf(champ.def, 'doodle'), 'Crayon doodle'], ['toy', srcOf(champ.def, 'toy'), 'Lux3D toy concept'], ['m', t.model, 'Lux3D 3D model'], ['s', t.skeleton, 'Lux3D skeleton + moves']]
    .map(([, src, cap], i) => `${i ? '<span class="arr">→</span>' : ''}<figure><img src="${src}" alt=""><figcaption>${cap}</figcaption></figure>`).join('');
  const pr = champ.def.custom ? champ.def.print : { mf: `assets/print/${champ.id}.3mf`, stl: `assets/print/${champ.id}.stl` };
  $('.print').hidden = !pr?.mf && !pr?.stl;
  if (pr?.mf) { $('#print3mf').href = pr.mf; $('#print3mf').download = `${champ.name}.3mf`; } if (pr?.stl) { $('#printStl').href = pr.stl; $('#printStl').download = `${champ.name}.stl`; }
  setTimeout(() => show('results'), 1200);
}
$('#go').onclick = () => startMatch();
$('#again').onclick = () => startMatch();
$('#menu').onclick = () => toMenu();
function toggleMute() { setMuted(!isMuted()); $('#mute').classList.toggle('off', isMuted()); }
$('#mute').onclick = toggleMute;

// ---------- forge stage (src/stage.js): Lux3D results appear on the desk while a doodle is being forged
const fstage = createForgeStage({
  scene, world, loader, gltfs, shrinkTextures, sfx: quiet,
  stars: (pos, n, speed, size) => spawn(starTex, pos, n, 1, speed, 0.5, size),
  confetti: (pos) => spawn(pick1(confettiTex), pos, 2, 1, 1.1, 1.5, 0.2),
});
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 4200); }

// ---------- camera
const camTarget = new THREE.Vector3(); let camDist = 15, menuT = 0;
function updateCamera(dt) {
  const F = state.fighters.filter((f) => f.alive && (!f.falling || f.y > -3));
  if (state.forging) {     // close on the middle of the desk, where the forge results appear
    menuT += dt; const wide = innerWidth >= 1100;
    // the forge paper covers the left part of a wide screen: frame the stage in what is left
    const pr = wide ? $('#forge .paper').getBoundingClientRect() : null;
    const cover = pr && pr.width ? Math.min(0.62, pr.right / innerWidth) : 0;
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    const R = THREE.MathUtils.clamp(5.9 / ((1 - cover) * 2 * half), 6.8, 13), a = Math.sin(menuT * 0.3) * 0.16 + 0.06;
    const tgt = new THREE.Vector3(0.2 - cover * half * R * 1.04, 0.95, 0.35);
    camera.position.lerp(new THREE.Vector3(tgt.x + Math.sin(a) * R, R * 0.5, tgt.z + Math.cos(a) * R), 1 - Math.exp(-2.5 * dt));
    camera.lookAt(tgt); return;
  }
  if (state.attract || !F.length) {
    menuT += dt * 0.12; camTarget.lerp(new THREE.Vector3(0, 0, 0), 1 - Math.exp(-2 * dt));
    const wide = innerWidth >= 1100 && state.attract;
    const off = wide ? new THREE.Vector3(-Math.cos(menuT) * 4.2, 0, Math.sin(menuT) * 4.2) : new THREE.Vector3();
    camera.position.set(Math.sin(menuT) * 14 + off.x, 8.5, Math.cos(menuT) * 14 + off.z); camera.lookAt(camTarget.x + off.x, 0, camTarget.z + off.z); return;
  }
  if (state.phase === 'results' && state.champ) {
    menuT += dt; const c = state.champ.pos, h = state.champ.height;
    const wide = innerWidth >= 1100, R = h * 3.3 * Math.max(1, 1.25 / camera.aspect);
    const lookX = c.x - (wide ? h * 0.8 : 0);   // on wide screens the toy stands to the right of the results card
    const ang = Math.sin(menuT * 0.4) * 0.4 - (wide ? 0.05 : 0);
    camera.position.lerp(new THREE.Vector3(lookX + Math.sin(ang) * R, h * 1.05, c.z + Math.cos(ang) * R), 1 - Math.exp(-2.5 * dt));
    camera.lookAt(lookX, h * 0.55, c.z); return;
  }
  const c = new THREE.Vector3(); F.forEach((f) => c.add(f.pos)); c.divideScalar(F.length);
  let spread = 0; F.forEach((f) => (spread = Math.max(spread, Math.hypot(f.pos.x - c.x, (f.pos.z - c.z) * 1.4))));
  c.multiplyScalar(0.55);
  // video mode: ease in on a trap while it warns and fires
  const hot = VIDEO && state.phase === 'fight' ? hazards.find((h) => h.warning || h.justFired > 0.4) : null;
  if (hot) c.lerp(new THREE.Vector3(hot.holder.position.x * 0.8, 0, hot.holder.position.z * 0.8 + 0.6), 0.7);
  camTarget.lerp(c, 1 - Math.exp(-(hot ? 2.5 : 4) * dt));
  const aspectK = Math.max(1, 1.5 / camera.aspect);
  // recordings (?video) frame the fight closer so the toys read on a small screen
  const want = (hot ? 8.5 : Math.min(17, Math.max(10.5, 8.2 + spread * 1.05))) * aspectK * (VIDEO ? (hot ? 0.9 : 0.8) : 1);
  camDist += (want - camDist) * (1 - Math.exp(-2.5 * dt));
  const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
  camera.position.set(camTarget.x * 0.9 + sx, camDist * 0.66 + sy, camTarget.z + camDist * 0.86);
  camera.lookAt(camTarget.x, 0.35, camTarget.z - 0.2);
  shake *= Math.exp(-8 * dt);
}

function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

// ---------- main loop
const clock = new THREE.Clock();
function frame() {
  if (canvas.clientWidth && (canvas.width !== Math.floor(canvas.clientWidth * renderer.getPixelRatio()))) resize();
  let dt = Math.min(0.05, clock.getDelta());
  if (hitStop > 0) { hitStop -= dt; dt *= 0.08; }
  else if (slowmo > 0) { slowmo -= dt; dt *= 0.35; }
  if (state.spectating && state.phase === 'fight') dt *= 1.7;
  step(dt);
  if (state.phase === 'countdown') tickHazards(dt);
  fstage.update(dt); updateParts(dt); updateCamera(dt);
  renderer.render(scene, camera);
  pressed.clear(); touch.shoveP = touch.dashP = false;
}

(async function boot() {
  resize();
  try { await Promise.all([loadAll(), loadRoom()]); } catch (e) { $('#loadTxt').textContent = 'Could not load the toys: ' + e.message; throw e; }
  ({ colliders, hazards } = placeProps(PROPS, propGltfs, world, blobTex)); makeThumbs(); buildRoster();
  pickups = createPickups({ world, loaded: propGltfs, colliders, blobTex, fx: hazardFx });
  startAttract();
  initForge({
    enter() { pickups.reset(state.fighters); state.attract = false; state.forging = true; state.phase = 'forge'; state.fighters.forEach((f) => world.remove(f.group)); state.fighters = []; state.bots = []; fstage.group.visible = true; },
    leave() { if (!forging()) fstage.clear(); toMenu(); },
    stage: (kind, data) => fstage.show(kind, data),
    async addFighter(rec) { const def = await registerCustom(rec); makeThumbs([def]); buildRoster(); return def; },
    printReady(rec) { const def = FIGHTERS.find((f) => f.id === rec.id); if (def) def.print = { mf: rec.mf ? URL.createObjectURL(rec.mf) : null, stl: rec.stl ? URL.createObjectURL(rec.stl) : null }; },
    fight(id) { pick[0] = id; setMode(1); state.forging = false; fstage.group.visible = false; fstage.clear(); startMatch(); },
    toast,
    def: (id) => FIGHTERS.find((f) => f.id === id),
  });
  $('#drawBtn').onclick = () => { initAudio(); sfx.ui(); openForge(); };
  $('#loading').classList.remove('show');
  renderer.setAnimationLoop(frame);
  window.__doodle = { state, scene, camera, FIGHTERS, PROPS, hazards, Bot, get hazardsList() { return hazards; }, get pickupsList() { return pickups.list; }, get pickups() { return pickups; }, endMatch: (i = 0) => endMatch(state.fighters[i]), fstage };
})();
