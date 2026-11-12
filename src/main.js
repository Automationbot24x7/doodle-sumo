import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Fighter, DESK, ROLE } from './fighter.js';
import { Bot, edgeDanger } from './ai.js';
import { woodTexture, paperRingTexture, rugTexture, blobTexture } from './textures.js';
import { initAudio, sfx, startMusic, setMuted, isMuted } from './audio.js';
import { loadProp, placeProps, updateHazards, resetHazards } from './props.js';

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
scene.add(new THREE.HemisphereLight('#fff4e0', '#4a3a30', 1.1));
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

// ---------- assets
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
let FIGHTERS = [], PROPS = [], gltfs = {}, propGltfs = {};
const thumbs = {};

async function loadAll() {
  const [fj, pj] = await Promise.all([fetch('data/fighters.json').then((r) => r.json()), fetch('data/props.json').then((r) => r.json()).catch(() => [])]);
  FIGHTERS = fj; PROPS = pj;
  let n = 0; const total = FIGHTERS.length + PROPS.length;
  const tick = () => { $('#loadTxt').textContent = `Sharpening crayons… ${Math.round((++n / total) * 100)}%`; };
  await Promise.all([
    ...FIGHTERS.map(async (f) => { gltfs[f.id] = await loader.loadAsync(`assets/fighters/${f.id}/fighter.glb`); tick(); }),
    ...PROPS.map(async (p) => { try { propGltfs[p.id] = await loadProp(p, loader); } catch (e) { console.warn('prop', p.id, e); } tick(); }),
  ]);
}
let colliders = [], hazards = [];
const rand = (a, b) => a + Math.random() * (b - a);

// ---------- thumbnails (3D render + skeleton) rendered once per fighter
function makeThumbs() {
  const rt = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  rt.setSize(256, 256); rt.outputColorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Scene(); s.environment = scene.environment;
  s.add(new THREE.HemisphereLight('#fff', '#888', 1.6)); const dl = new THREE.DirectionalLight('#fff', 2); dl.position.set(2, 3, 4); s.add(dl);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  for (const def of FIGHTERS) {
    const f = new Fighter(def, gltfs[def.id]);
    f.mixer.stopAllAction(); f.model.updateMatrixWorld(true);
    s.add(f.group); const h = f.height; cam.position.set(h * 0.9, h * 0.75, h * 2.6); cam.lookAt(0, h * 0.5, 0);
    rt.render(s, cam); const model = rt.domElement.toDataURL('image/png');
    const skel = new THREE.SkeletonHelper(f.model); skel.material.linewidth = 3; skel.material.depthTest = false; skel.material.color = new THREE.Color('#e2453c');
    f.model.traverse((o) => { if (o.isMesh) { o.userData.m = o.material; o.material = new THREE.MeshBasicMaterial({ color: '#c9daf2', wireframe: true, transparent: true, opacity: 0.35 }); } });
    s.add(skel); rt.render(s, cam); const skeleton = rt.domElement.toDataURL('image/png');
    s.remove(skel); s.remove(f.group);
    thumbs[def.id] = { model, skeleton };
  }
  rt.dispose();
}

// ---------- UI: roster
let mode = 1; let pick = [null, null];
function buildRoster() {
  const box = $('#roster'); box.innerHTML = '';
  for (const f of FIGHTERS) {
    const el = document.createElement('button'); el.className = 'card'; el.dataset.id = f.id;
    el.innerHTML = `<span class="badge">P1</span><div class="imgs"><img class="doodle" src="assets/fighters/${f.id}/doodle.png" alt=""><img class="toy" src="assets/fighters/${f.id}/toy.png" alt=""></div>
      <div class="nm">${f.title}</div><div class="bl">${f.blurb}</div>
      <div class="stats"><span>Weight</span><span class="bar"><i style="width:${Math.round(f.mass / 1.6 * 100)}%"></i></span><span>Speed</span><span class="bar"><i style="width:${Math.round(f.speed / 1.3 * 100)}%"></i></span><span>Power</span><span class="bar"><i style="width:${Math.round(f.power / 1.15 * 100)}%"></i></span></div>`;
    el.onclick = () => { initAudio(); sfx.ui(); choose(f.id); };
    box.appendChild(el);
  }
  if (!pick[0]) pick[0] = FIGHTERS[0]?.id;
  if (!pick[1]) pick[1] = FIGHTERS[1]?.id;
  refreshRoster();
}
let picking = 0;
function choose(id) {
  if (mode === 2) { pick[picking] = id; picking = 1 - picking; } else pick[0] = id;
  refreshRoster();
}
function refreshRoster() {
  document.querySelectorAll('.card').forEach((c) => {
    c.classList.toggle('sel', c.dataset.id === pick[0]);
    c.classList.toggle('p2', mode === 2 && c.dataset.id === pick[1] && pick[1] !== pick[0]);
    c.querySelector('.badge').textContent = mode === 2 && c.dataset.id === pick[1] && pick[1] !== pick[0] ? 'P2' : 'P1';
  });
}
document.querySelectorAll('.chip').forEach((b) => b.onclick = () => { mode = +b.dataset.mode; document.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b)); picking = 0; refreshRoster(); });

function show(id) { document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('show', s.id === id || (id === 'game' && s.id === 'hud'))); }

// ---------- input
const keys = new Set(); const pressed = new Set();
const QS = new URLSearchParams(location.search); const DEMO = QS.has('demo');
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  if (!keys.has(e.code)) pressed.add(e.code); keys.add(e.code);
  if (e.code === 'Enter') { if ($('#title').classList.contains('show')) startMatch(); else if ($('#results').classList.contains('show')) startMatch(); }
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'Escape' && state.phase !== 'menu') toMenu();
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
let shake = 0, hitStop = 0;

// ---------- match
const state = { phase: 'menu', fighters: [], bots: [], round: 0, wins: {}, t: 0, banner: 0, phaseT: 0 };
const SPAWNS = [[-1.7, 1.2], [1.7, -1.2], [1.7, 1.2], [-1.7, -1.2]];
const COLORS = ['#e2453c', '#3d7be0', '#3fae6a', '#f6c431'];

function startMatch() {
  initAudio(); startMusic();
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
  state.round++; state.t = 0; state.showdown = false;
  state.fighters.forEach((f, i) => { const [x, z] = SPAWNS[i]; f.reset(new THREE.Vector3(x, 0, z), Math.atan2(-x, -z)); });
  resetHazards(hazards);
  state.phase = 'countdown'; state.phaseT = 0; updatePlates();
  banner(`Round ${state.round}`, 'Shove them off the desk!');
}
function banner(txt, sub = '') { const b = $('#banner'); b.innerHTML = txt + (sub ? `<small>${sub}</small>` : ''); b.classList.add('on'); clearTimeout(banner.t); banner.t = setTimeout(() => b.classList.remove('on'), 1100); }
function buildPlates() {
  $('#plates').innerHTML = state.fighters.map((f) => `<div class="plate ${f.isPlayer ? 'p' + (f.slot + 1) : ''}" data-s="${f.slot}"><img src="assets/fighters/${f.id}/toy.png"><div><div class="who">${f.isPlayer ? 'PLAYER ' + (f.slot + 1) : 'CPU'}</div><div class="n">${f.name}</div><div class="pips"><i></i><i></i></div></div></div>`).join('');
}
function updatePlates() {
  state.fighters.forEach((f) => { const el = document.querySelector(`.plate[data-s="${f.slot}"]`); if (!el) return; el.classList.toggle('out', !f.alive || f.falling); el.querySelectorAll('.pips i').forEach((p, i) => p.classList.toggle('w', i < state.wins[f.slot])); });
}
function toMenu() { state.phase = 'menu'; show('title'); }

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
function step(dt) {
  const F = state.fighters; state.phaseT += dt;
  if (state.phase === 'countdown') {
    const n = 3 - Math.floor(state.phaseT / 0.7);
    if (state.phaseT > 1.0 && state.phaseT - dt <= 1.0) { /* round banner shown */ }
    if (state.phaseT > 1.2) {
      const c = Math.ceil(3 - (state.phaseT - 1.2) / 0.55);
      if (c !== state.lastCount) { state.lastCount = c; if (c > 0) { banner(String(c)); sfx.tick(); } else { banner('Hakkeyoi!', 'GO!'); sfx.go(); state.phase = 'fight'; state.phaseT = 0; } }
    }
    F.forEach((f) => f.update(dt));
    return;
  }
  if (state.phase === 'fight') state.t += dt;
  // pressure: last two standing hit harder, and harder still late in the round
  const standingNow = F.filter((f) => f.alive && !f.falling).length;
  if (state.phase === 'fight' && standingNow === 2 && !state.showdown && F.length > 2) { state.showdown = true; banner('Final showdown!', 'Shoves hit harder'); }
  state.boost = (standingNow === 2 ? 1.3 : 1) * (state.t > 45 ? 1.35 : 1);
  // inputs
  F.forEach((f, i) => {
    let inp;
    if (state.phase !== 'fight') inp = { x: 0, z: 0 };
    else if (f.isPlayer && !DEMO) inp = playerInput(f.slot);
    else inp = state.bots[i].input(F, hazards, dt);
    f.control(inp, dt, { sfx });
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
        const ch = a.attackCharge; const imp = (6.5 + 13 * ch * ch + 3 * ch) * a.power * (state.boost || 1) / Math.sqrt(b.mass * 1.15);
        const dir = v2.clone().lerp(fwd, 0.35).normalize();
        b.vel.addScaledVector(dir, imp); b.stun = 0.25 + 0.45 * ch; b.squash = 0.25 + ch * 0.2; b.lastHitBy = a; b.charging = false;
        a.vel.addScaledVector(fwd, -1.2);
        hit = true;
        const at = new THREE.Vector3((a.pos.x + b.pos.x) / 2, b.height * 0.6, (a.pos.z + b.pos.z) / 2);
        spawn(starTex, at, ch > 0.5 ? 7 : 3, 1, 3 + ch * 3, 0.5, 0.35 + ch * 0.25);
        if (ch > 0.55) { sfx.bigSlap(); shake = 0.35; hitStop = 0.09; pop(pick1(popWords.big), at, 'yel'); }
        else { sfx.slap(0.6 + ch); shake = Math.max(shake, 0.12); hitStop = Math.max(hitStop, 0.03); if (Math.random() < 0.5) pop(pick1(popWords.small), at); }
      }
      if (!hit && a.isPlayer) sfx.whoosh();
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
        if (-rv > 4) { sfx.bump(); spawn(puffTex, new THREE.Vector3((a.pos.x + b.pos.x) / 2, 0.4, (a.pos.z + b.pos.z) / 2), 3, 1, 1.5, 0.4, 0.25); if (a.dashT > 0) b.lastHitBy = a; if (b.dashT > 0) a.lastHitBy = b; }
      }
    }
  }
  // props (static circles)
  for (const f of F) {
    if (!f.alive || f.falling) continue;
    for (const c of colliders) {
      const dx = f.pos.x - c.x, dz = f.pos.z - c.z, d = Math.hypot(dx, dz), m = f.radius + c.r;
      if (d < m && d > 1e-4) { const nx = dx / d, nz = dz / d; f.pos.x += nx * (m - d); f.pos.z += nz * (m - d); const vn = f.vel.x * nx + f.vel.z * nz; if (vn < 0) { f.vel.x -= 1.6 * vn * nx; f.vel.z -= 1.6 * vn * nz; if (vn < -5) { sfx.boing(); f.squash = 0.3; } } }
    }
  }
  tickHazards(dt);
  // edges
  for (const f of F) {
    if (!f.alive || f.falling) continue;
    if (Math.abs(f.pos.x) > DESK.w / 2 + f.radius * 0.15 || Math.abs(f.pos.z) > DESK.d / 2 + f.radius * 0.15) {
      f.startFall({ sfx }); pop(f.isPlayer ? 'Nooo!' : pick1(['Aaah!', 'Wheee!', 'Bye!', 'Eep!']), new THREE.Vector3(f.pos.x, 1.4, f.pos.z), 'blu');
      if (f.lastHitBy) setTimeout(() => sfx.thud(), 650);
      updatePlates();
    }
  }
  F.forEach((f) => f.update(dt));
  // round end
  if (state.phase === 'fight') {
    const standing = F.filter((f) => f.alive && !f.falling);
    const humansLeft = F.some((f) => f.isPlayer && f.alive && !f.falling);
    if (standing.length <= 1 || state.t > 70 || (!humansLeft && standing.length <= 1)) {
      let w = standing[0];
      if (!w && F.length) w = null;
      if (standing.length > 1) w = standing.sort((a, b) => Math.hypot(a.pos.x, a.pos.z) - Math.hypot(b.pos.x, b.pos.z))[0];
      state.phase = 'roundEnd'; state.phaseT = 0; state.roundWinner = w;
      if (w) { state.wins[w.slot]++; w.won = true; w.play('cheer', 0.2); sfx.win(); banner(`${w.name}!`, w.isPlayer ? 'wins the round!' : 'takes the round'); }
      else banner('Draw!');
      updatePlates();
    }
    // timer display
    const left = Math.max(0, 70 - state.t); $('#timer').textContent = state.phase === 'fight' ? Math.ceil(left) : '';
    if (left < 20 && left + dt >= 20) banner('Recess bell!', 'Traps go wild');
  } else if (state.phase === 'roundEnd') {
    if (state.roundWinner && state.phaseT > 1.4 && state.roundWinner.currentRole !== 'dance') state.roundWinner.play('dance', 0.3);
    if (state.phaseT > 3.2) {
      const champ = state.fighters.find((f) => state.wins[f.slot] >= 2);
      if (champ) endMatch(champ); else newRound();
    }
  }
}
const hazardFx = {
  sfx,
  shake: (v) => { shake = Math.max(shake, v); },
  hitStop: (v) => { hitStop = Math.max(hitStop, v); },
  stars: (pos, n, speed, size) => spawn(starTex, pos, n, 1, speed, 0.5, size),
  puff: (pos) => spawn(puffTex, pos, 1, 0, 1, 0.5, 0.16),
  pop: (t, pos, cls) => pop(t, pos, cls),
};
function tickHazards(dt) { updateHazards(hazards, state.fighters, dt, state.phase === 'fight', state.phase === 'fight' && state.t > 50, hazardFx); }
const pick1 = (a) => a[Math.floor(Math.random() * a.length)];

function endMatch(champ) {
  state.phase = 'results'; state.champ = champ; champ.play('dance', 0.3);
  $('#winTitle').textContent = champ.isPlayer ? (mode === 2 ? `Player ${champ.slot + 1} wins!` : 'You win!') : `${champ.name} wins!`;
  $('#winLine').textContent = champ.isPlayer ? `${champ.name} is the desk champion.` : 'Better luck next time. Rematch?';
  const t = thumbs[champ.id] || {};
  $('#winFlow').innerHTML = [['doodle', `assets/fighters/${champ.id}/doodle.png`, 'Crayon doodle'], ['toy', `assets/fighters/${champ.id}/toy.png`, 'Lux3D toy concept'], ['m', t.model, 'Lux3D 3D model'], ['s', t.skeleton, 'Lux3D skeleton + moves']]
    .map(([, src, cap], i) => `${i ? '<span class="arr">→</span>' : ''}<figure><img src="${src}" alt=""><figcaption>${cap}</figcaption></figure>`).join('');
  $('#print3mf').href = `assets/print/${champ.id}.3mf`; $('#printStl').href = `assets/print/${champ.id}.stl`;
  setTimeout(() => show('results'), 1200);
}
$('#go').onclick = () => startMatch();
$('#again').onclick = () => startMatch();
$('#menu').onclick = () => toMenu();
function toggleMute() { setMuted(!isMuted()); $('#mute').classList.toggle('off', isMuted()); }
$('#mute').onclick = toggleMute;

// ---------- camera
const camTarget = new THREE.Vector3(); let camDist = 15, menuT = 0;
function updateCamera(dt) {
  const F = state.fighters.filter((f) => f.alive && (!f.falling || f.y > -3));
  if (state.phase === 'menu' || !F.length) {
    menuT += dt * 0.12; camTarget.lerp(new THREE.Vector3(0, 0, 0), 1 - Math.exp(-2 * dt));
    const wide = innerWidth >= 1100 && state.phase === 'menu';
    const off = wide ? new THREE.Vector3(-Math.cos(menuT) * 4.2, 0, Math.sin(menuT) * 4.2) : new THREE.Vector3();
    camera.position.set(Math.sin(menuT) * 14 + off.x, 8.5, Math.cos(menuT) * 14 + off.z); camera.lookAt(camTarget.x + off.x, 0, camTarget.z + off.z); return;
  }
  if (state.phase === 'results' && state.champ) {
    menuT += dt * 0.35; const c = state.champ.pos;
    camera.position.lerp(new THREE.Vector3(c.x + Math.sin(menuT) * 4.2, 2.6, c.z + Math.cos(menuT) * 4.2), 1 - Math.exp(-3 * dt)); camera.lookAt(c.x, 0.8, c.z); return;
  }
  const c = new THREE.Vector3(); F.forEach((f) => c.add(f.pos)); c.divideScalar(F.length);
  let spread = 0; F.forEach((f) => (spread = Math.max(spread, Math.hypot(f.pos.x - c.x, (f.pos.z - c.z) * 1.4))));
  c.multiplyScalar(0.55);
  camTarget.lerp(c, 1 - Math.exp(-4 * dt));
  const aspectK = Math.max(1, 1.5 / camera.aspect);
  const want = Math.min(21, Math.max(14, 11 + spread * 1.1)) * aspectK;
  camDist += (want - camDist) * (1 - Math.exp(-2.5 * dt));
  const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
  camera.position.set(camTarget.x * 0.85 + sx, camDist * 0.82 + sy, camTarget.z + camDist * 0.72);
  camera.lookAt(camTarget.x, 0, camTarget.z - 0.4);
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
  if (state.phase !== 'menu') step(dt); else state.fighters.forEach((f) => f.update(dt));
  if (state.phase !== 'fight' && state.phase !== 'roundEnd') tickHazards(dt);
  updateParts(dt); updateCamera(dt);
  renderer.render(scene, camera);
  pressed.clear(); touch.shoveP = touch.dashP = false;
}

(async function boot() {
  resize();
  try { await loadAll(); } catch (e) { $('#loadTxt').textContent = 'Could not load the toys: ' + e.message; throw e; }
  ({ colliders, hazards } = placeProps(PROPS, propGltfs, world, blobTex)); makeThumbs(); buildRoster();
  // a few fighters idling on the desk behind the menu
  state.fighters = FIGHTERS.slice(0, 4).map((def, i) => { const f = new Fighter(def, gltfs[def.id], { slot: i }); const [x, z] = SPAWNS[i]; f.reset(new THREE.Vector3(x * 1.1, 0, z * 1.4), Math.atan2(-x, -z)); f.play(i % 2 ? 'dance' : 'stance'); world.add(f.group); return f; });
  $('#loading').classList.remove('show');
  renderer.setAnimationLoop(frame);
  window.__doodle = { state, scene, camera, FIGHTERS, PROPS, hazards };
})();
