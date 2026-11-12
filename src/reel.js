// Pipeline reel: the doodle draws itself, becomes the Lux3D toy concept, then the Lux3D 3D model,
// its mesh, its skeleton and its moves. Used for the demo video; ?f=<fighter> picks the fighter, ?auto=0 waits for window.reel.play().
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const qs = new URLSearchParams(location.search);
const id = qs.get('f') || 'tofu';
const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fighters = await (await fetch('data/fighters.json')).json();
const def = fighters.find((f) => f.id === id) || fighters[0];

// 1) inline the crayon SVG and prepare stroke-drawing
$('#doodle').innerHTML = await (await fetch(`doodles/src/${def.id}.svg`)).text();
const svg = $('#doodle svg'); svg.setAttribute('viewBox', '0 0 1024 1024'); svg.removeAttribute('width'); svg.removeAttribute('height');
const shapes = [...svg.querySelectorAll('g path, g circle, g ellipse, g rect, g text')];
for (const el of shapes) {
  const len = el.getTotalLength ? el.getTotalLength() : 600;
  el.dataset.fill = el.getAttribute('fill') || '';
  el.style.fillOpacity = 0; el.style.strokeDasharray = `${len}`; el.style.strokeDashoffset = `${len}`;
}
$('#toy').src = `assets/fighters/${def.id}/toy.png`;

// 3) three.js stage for the model
const canvas = $('#three');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight('#fff', '#999', 1.1)); const dl = new THREE.DirectionalLight('#fff', 2); dl.position.set(2, 4, 3); scene.add(dl);
const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
const g = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(`assets/fighters/${def.id}/fighter.glb`);
const model = g.scene; scene.add(model);
model.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(model); const h = box.max.y - box.min.y; const center = box.getCenter(new THREE.Vector3());
const mixer = new THREE.AnimationMixer(model);
const skel = new THREE.SkeletonHelper(model); skel.visible = false; skel.material.depthTest = false; skel.material.color = new THREE.Color('#e2453c'); scene.add(skel);
const mats = []; model.traverse((o) => { if (o.isMesh) mats.push([o, o.material]); });
const wire = new THREE.MeshBasicMaterial({ color: '#3d7be0', wireframe: true, transparent: true, opacity: 0.35 });
const ghost = new THREE.MeshBasicMaterial({ color: '#c9daf2', transparent: true, opacity: 0.18, depthWrite: false });
const setMat = (m) => mats.forEach(([o, mat]) => (o.material = m || mat));
let yaw = 0, spin = 1.2, current;
const play = (animId, fade = 0.25) => {
  const i = (def.anims || []).indexOf(animId); if (i < 0) return;
  const a = mixer.clipAction(g.animations[i]); a.reset().play(); if (current && current !== a) current.crossFadeTo(a, fade, false); current = a;
};
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(0.05, clock.getDelta()); mixer.update(dt); yaw += dt * spin;
  const w = innerWidth, hh = innerHeight; renderer.setSize(w, hh, false); cam.aspect = w / hh; cam.updateProjectionMatrix();
  const d = h * 3.2; cam.position.set(center.x + Math.sin(yaw) * d, center.y + h * 0.25, center.z + Math.cos(yaw) * d); cam.lookAt(center.x, center.y, center.z);
  renderer.render(scene, cam); requestAnimationFrame(frame);
}
frame();

const cap = (html) => { $('#cap').innerHTML = html; };
const step = (n, txt) => { $('#step').innerHTML = `<i>${n}</i> &nbsp;${txt}`; };
const flash = async () => { $('#flash').style.opacity = 0.8; await sleep(120); $('#flash').style.opacity = 0; };

async function playReel() {
  step('1/5', 'CRAYON DOODLE'); cap('A doodle…');
  // draw strokes in order, then fill
  const per = Math.max(30, 1500 / shapes.length);
  shapes.forEach((el, i) => { el.style.transition = `stroke-dashoffset ${per * 3}ms ease ${i * per}ms, fill-opacity 300ms ease ${1500 + i * 8}ms`; });
  await sleep(50); shapes.forEach((el) => { el.style.strokeDashoffset = 0; el.style.fillOpacity = 1; });
  await sleep(2300);
  step('2/5', 'LUX3D · TOY CONCEPT'); cap('…becomes a <b>Lux3D</b> toy…'); await flash();
  $('#toy').style.opacity = 1; $('#doodle').style.opacity = 0; $('#toy').style.transform = 'translate(-50%,-50%) scale(1.04)';
  await sleep(1600);
  step('3/5', 'LUX3D · 3D MODEL'); cap('…a real <b>3D model</b>…'); await flash();
  play('A_TPose'); mixer.stopAllAction(); canvas.style.opacity = 1; $('#toy').style.opacity = 0; spin = 2.2;
  await sleep(1600);
  step('4/5', 'LUX3D · AUTO-RIG'); cap('…with a <b>skeleton</b>…'); setMat(wire); await sleep(500); setMat(ghost); skel.visible = true; spin = 0.6;
  await sleep(1500);
  step('5/5', 'LUX3D · MOVES'); cap('…and <b>moves</b>.'); setMat(null); skel.visible = false; spin = 0.4;
  play('Punch_Cross', 0.1); await sleep(700); play('Roll', 0.1); await sleep(900); play('Dance_Loop', 0.2); await sleep(1600);
  window.reelDone = true;
}
window.reel = { play: playReel };
if (qs.get('auto') !== '0') { await sleep(600); playReel(); }
