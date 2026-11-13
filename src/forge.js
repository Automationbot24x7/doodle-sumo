// "Draw your own fighter": a crayon pad, then the live Lux3D chain (toy concept -> 3D model -> skeleton -> ten moves)
// through the forge relay. The finished fighter is stored in this browser (IndexedDB) and joins the roster.
import { saveCustom } from './store.js';
import { PUBLIC_RELAY } from './config.js';

const $ = (s) => document.querySelector(s);
const QS = new URLSearchParams(location.search);
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export const RELAY = (QS.get('relay') || (LOCAL ? 'http://localhost:8787' : PUBLIC_RELAY) || '').replace(/\/$/, '');
const STEPS = ['toy', 'model', 'rig', 'anims'];
const TALK = {
  queued: ['Waiting for a free Lux3D slot…', 'Someone else\'s doodle is in the oven. You are next.'],
  toy: ['Lux3D is imagining your doodle as a vinyl toy…', 'Rounding off the scribbles…'],
  model: ['Lux3D is sculpting the toy in 3D…', 'Adding a back, sides and a bottom…', 'Painting the textures…'],
  rig: ['Lux3D is finding its bones…', 'Elbows, knees, the works…'],
  anims: ['Teaching it to slap, roll and dance…'],
  download: ['Unboxing your toy…'],
};
const NAMES = ['Sir Scribble', 'Wobbles', 'Captain Crayon', 'Doodlebug', 'Squiggle', 'Inky', 'Scrawl', 'Smudge', 'Zigzag', 'Blot'];
const BLURBS = ['Hand-drawn. Freshly forged.', 'Straight off the page.', 'Still smells of crayon.', 'Drawn in a hurry. Fights like it.'];
const COLORS = ['#2b2b33', '#e2453c', '#ff8fb1', '#f08a24', '#f6c431', '#3fae6a', '#3d7be0', '#8a5cd6', '#8a5a33', '#f3d2b3', '#9aa0aa'];

let hooks = {}, job = null, timer = null, pad = null, busy = false, lastStepShown = '';
const saved = () => { try { return JSON.parse(localStorage.getItem('forgeJob') || 'null'); } catch { return null; } };
const persist = () => { try { job ? localStorage.setItem('forgeJob', JSON.stringify(job)) : localStorage.removeItem('forgeJob'); } catch { /* storage full or blocked */ } };
const ownKey = () => ($('#fKey')?.value || sessionStorage.getItem('aholoKey') || '').trim();
try { if (QS.get('judge')) localStorage.setItem('judgeToken', QS.get('judge')); } catch { /* storage blocked */ }
const judgeToken = () => { try { return QS.get('judge') || localStorage.getItem('judgeToken') || ''; } catch { return QS.get('judge') || ''; } };
const headers = () => { const k = ownKey(), j = judgeToken(); return { 'content-type': 'application/json', ...(k ? { 'x-aholo-key': k } : {}), ...(j ? { 'x-judge': j } : {}) }; };
let replaying = false, clockT = null;
export const forging = () => !!job;

// ---------- drawing pad (crayon strokes on a transparent layer over white paper)
function setupPad() {
  const cv = $('#fPad'), g = cv.getContext('2d', { willReadFrequently: true });
  const st = { color: COLORS[0], size: 20, erase: false, last: null, undo: [], used: false };
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) * cv.width) / r.width, y: ((e.clientY - r.top) * cv.height) / r.height }; };
  function seg(a, b) {
    const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(d / (st.size * 0.22)));
    g.globalCompositeOperation = st.erase ? 'destination-out' : 'source-over'; g.fillStyle = st.color;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      if (st.erase) { g.globalAlpha = 1; g.beginPath(); g.arc(x, y, st.size * 0.9, 0, 6.3); g.fill(); continue; }
      for (let k = 0; k < 4; k++) {   // waxy grain: a few soft dabs scattered inside the stroke width
        const ang = Math.random() * 6.283, r = Math.sqrt(Math.random()) * st.size * 0.5;
        g.globalAlpha = 0.3 + Math.random() * 0.45; g.beginPath(); g.arc(x + Math.cos(ang) * r, y + Math.sin(ang) * r, st.size * (0.16 + Math.random() * 0.2), 0, 6.283); g.fill();
      }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  const snap = () => { st.undo.push(g.getImageData(0, 0, cv.width, cv.height)); if (st.undo.length > 14) st.undo.shift(); };
  const tip = $('#fTip');
  const moveTip = (e) => { const r = cv.getBoundingClientRect(); tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top) + 'px'; tip.style.color = st.erase ? '#fff' : st.color; tip.classList.toggle('on', !busy); };
  cv.addEventListener('pointermove', moveTip); cv.addEventListener('pointerdown', moveTip); cv.addEventListener('pointerleave', () => tip.classList.remove('on'));
  cv.addEventListener('pointerdown', (e) => { if (busy) return; e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } snap(); st.last = pos(e); seg(st.last, st.last); st.used = true; $('#fGuide').classList.add('dim'); });
  cv.addEventListener('pointermove', (e) => { if (!st.last) return; const p = pos(e); seg(st.last, p); st.last = p; });
  const up = () => { st.last = null; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

  const sw = $('#fSwatches');
  sw.innerHTML = COLORS.map((c, i) => `<button class="sw${i ? '' : ' on'}" data-c="${c}" style="--c:${c}" title="crayon"></button>`).join('') + '<button class="sw er" data-c="erase" title="Eraser">⌫</button>';
  sw.onclick = (e) => { const b = e.target.closest('.sw'); if (!b) return; sw.querySelectorAll('.sw').forEach((x) => x.classList.toggle('on', x === b)); st.erase = b.dataset.c === 'erase'; if (!st.erase) st.color = b.dataset.c; };
  document.querySelectorAll('#fSizes button').forEach((b) => b.onclick = () => { st.size = +b.dataset.s; document.querySelectorAll('#fSizes button').forEach((x) => x.classList.toggle('on', x === b)); });
  $('#fUndo').onclick = () => { const im = st.undo.pop(); if (im) g.putImageData(im, 0, 0); };
  $('#fClear').onclick = () => { snap(); g.clearRect(0, 0, cv.width, cv.height); st.used = false; $('#fGuide').classList.remove('dim'); };
  $('#fPhoto').onchange = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const bm = await createImageBitmap(f); snap();
      const k = Math.min(cv.width / bm.width, cv.height / bm.height), w = bm.width * k, h = bm.height * k;
      g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(bm, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
      st.used = true; $('#fGuide').classList.add('dim');
    } catch { say('That file is not an image I can read.', true); }
    e.target.value = '';
  };
  return {
    st, cv,
    coverage() { const d = g.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 40) n++; return n / (d.length / 16); },
    export() {
      const c = document.createElement('canvas'); c.width = c.height = 768; const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, 768, 768); x.drawImage(cv, 0, 0);
      let url = c.toDataURL('image/png'); if (url.length > 480000) url = c.toDataURL('image/jpeg', 0.9); return url;
    },
    load(dataUrl) { const im = new Image(); im.onload = () => { g.clearRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height); st.used = true; $('#fGuide').classList.add('dim'); }; im.src = dataUrl; },
  };
}

// ---------- UI
function say(text, bad = false) { const m = $('#fMsg'); m.textContent = text; m.classList.toggle('bad', bad); }
function mode(which) {   // 'draw' | 'run' | 'done'
  $('#forge').dataset.mode = which; busy = which !== 'draw';
  $('#fDraw').hidden = which !== 'draw'; $('#fProg').hidden = which === 'draw'; $('#fDone').hidden = which !== 'done';
  $('#fTools').classList.toggle('off', busy);
}
function paintSteps(v) {
  const idx = v.state === 'done' ? STEPS.length : STEPS.indexOf(v.step);
  document.querySelectorAll('#fSteps li').forEach((li, i) => {
    const s = li.dataset.s; li.className = i < idx ? 'ok' : i === idx ? (v.state === 'failed' ? 'bad' : 'on') : '';
    li.querySelector('i').textContent = i < idx ? '✓' : i === idx && v.state !== 'failed' ? '' : String(i + 1);
    li.querySelector('em').textContent = v.secs?.[s] ? `${v.secs[s]} s` : '';
  });
}
function pill(text, cls = '') { const p = $('#fPill'); p.hidden = !text; p.className = 'pill ' + cls; p.querySelector('span').textContent = text || ''; }

async function refreshQuota() {
  const q = $('#fQuota'), go = $('#fGo');
  if (!RELAY) { q.innerHTML = 'The live forge needs a relay that holds an Aholo key. To use it, get the code from GitHub, run <code>node relay/local.mjs</code> with your own Aholo key and open the game on localhost (see the README). You can still draw here.'; go.disabled = true; return; }
  try {
    const s = await (await fetch(RELAY + '/status', { headers: headers() })).json();
    go.disabled = false; $('#fReplay').classList.remove('hot');
    const who = s.judge ? 'Judges\' reserved forges' : 'Free forges';
    if (s.ownKey) q.textContent = 'Using your own Aholo key (about 35 credits per fighter).';
    else if (s.open && s.leftForYou > 0) q.textContent = `${who}: ${s.leftForYou} left for you today` + (s.leftTotal != null ? ` (${s.leftTotal} left in total).` : '.');
    else {
      q.textContent = s.leftTotal <= 0 ? `${who} are all used up. Watch a real forge run below, play Spike or Sir Whiskers (drawn on this pad), or add your own Aholo key.` : s.leftToday > 0 ? 'You have used your free forges for today. Watch a real forge run below, or add your own Aholo key to keep going.' : 'Today\'s free forges are used up. Watch a real forge run below, add your own Aholo key, or come back tomorrow.';
      go.disabled = true; $('#fOwn').open = true; $('#fReplay').classList.add('hot');
    }
  } catch { q.textContent = 'The forge relay is not reachable from here right now. You can still watch a real forge run below.'; go.disabled = true; $('#fReplay').classList.add('hot'); }
}

export function openForge() {
  hooks.enter?.(); $('#forge').classList.add('show'); $('#title').classList.remove('show');
  if (job) { mode('run'); if (job.doodle) hooks.stage?.('doodle', job.doodle); } else { mode('draw'); say(''); refreshQuota(); }
}
export function closeForge() { $('#forge').classList.remove('show'); hooks.leave?.(); }

async function begin() {
  if (busy || job) return;
  if (pad.coverage() < 0.012) { say('Draw a bit more first: a head, a body, arms and legs.', true); return; }
  const name = ($('#fName').value.trim() || NAMES[Math.floor(Math.random() * NAMES.length)]).slice(0, 18);
  $('#fName').value = name;
  const doodle = pad.export(); const k = ownKey(); if (k) sessionStorage.setItem('aholoKey', k);
  const t0 = Date.now(); clock(t0);   // the clock starts when the button is pressed, upload included
  mode('run'); paintSteps({ step: 'toy', state: 'running' }); say('Sending your doodle to Lux3D…'); hooks.stage?.('doodle', doodle);
  try {
    const r = await fetch(RELAY + '/forge', { method: 'POST', headers: headers(), body: JSON.stringify({ image: doodle, name }) });
    const v = await r.json();
    if (v.error) throw Object.assign(new Error(v.error.message || 'The forge said no.'), { code: v.error.code });
    job = { id: v.id, name, doodle, startedAt: t0, own: !!k }; persist(); lastStepShown = ''; update(v); loop();
  } catch (e) { clock(0); mode('draw'); say(e.message || 'Could not reach the forge.', true); hooks.stage?.('reset'); refreshQuota(); }
}

function loop() { clearTimeout(timer); timer = setTimeout(tick, 3500); }
// wall-clock time since the button was pressed (the real time, so a recording cannot hide the wait)
function clock(start, speed = 1, label = '') {
  clearInterval(clockT); const el = $('#fClock');
  if (!start) { el.textContent = ''; return; }
  const draw = () => { const s = Math.floor(((Date.now() - start) * speed) / 1000); el.innerHTML = `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}<small>${label || 'since you pressed the button'}</small>`; };
  draw(); clockT = setInterval(draw, 250);
}
async function tick() {
  if (!job) return;
  try {
    const v = await (await fetch(`${RELAY}/forge/${job.id}`, { headers: headers() })).json();
    if (v.error) { if (v.error.code === 'GONE') { fail({ message: 'That forge job expired. Draw it again?' }); return; } throw new Error(v.error.message); }
    job.errors = 0; update(v);
    if (v.state === 'done') return finish(v);
    if (v.state === 'failed') return fail(v.error || {});
  } catch (e) { job.errors = (job.errors || 0) + 1; if (job.errors > 12) return fail({ message: 'Lost contact with the forge.' }); }
  loop();
}
function update(v) {
  paintSteps(v);
  const key = v.state === 'queued' ? 'queued' : v.step, lines = TALK[key] || [''];
  const mins = v.eta > 75 ? `about ${Math.round(v.eta / 60)} min left` : v.eta > 20 ? 'about a minute left' : 'nearly there';
  say(`${lines[Math.floor(Date.now() / 9000) % lines.length]} (${mins})`);
  const n = STEPS.indexOf(v.step) + 1;
  pill(`Forging ${job.name}: step ${Math.max(1, n)} of 4`, 'run');
  if (v.tries && !job.toldRetry) { job.toldRetry = true; hooks.toast?.('The auto-rig wanted clearer arms and legs. Trying once more…'); }
  // tell the 3D stage about each new result as it lands
  const stamp = `${v.tries}|${Object.keys(v.outputs || {}).join()}`;
  if (stamp !== lastStepShown) {
    lastStepShown = stamp;
    if (v.outputs?.toy) { $('#fToy').src = v.outputs.toy; $('#fToy').hidden = false; hooks.stage?.('toy', v.outputs.toy); }
    if (v.outputs?.model) hooks.stage?.('model', v.outputs.model);
    if (v.outputs?.rig) hooks.stage?.('rig');
  }
}
function fail(err) {
  clearTimeout(timer); clock(0); const keep = job?.doodle; job = null; persist(); pill('');
  mode('draw'); say((err.message || 'Lux3D could not finish this one. Try a simpler drawing.') + ' This one did not use up a free forge.', true); hooks.stage?.('reset');
  if (keep && pad && !pad.st.used) pad.load(keep);
  refreshQuota();
}

const blob = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error('download ' + r.status); return r.blob(); };
async function finish(v) {
  clearTimeout(timer); clearInterval(clockT); say(TALK.download[0]); pill(`Unboxing ${job.name}…`, 'run');
  try {
    const [glb, toy, doodle] = await Promise.all([blob(v.outputs.fighter), blob(v.outputs.toy), blob(job.doodle)]);
    const rec = {
      id: 'my-' + job.id.slice(0, 10), custom: true, title: job.name, blurb: BLURBS[Math.floor(Math.random() * BLURBS.length)],
      anims: v.anims, tasks: v.tasks, secs: v.secs, createdAt: Date.now(), job: job.id, glb, toy, doodle,
    };
    const def = await hooks.addFighter(rec);          // loads the model, works out its stats from its shape
    Object.assign(rec, { mass: def.mass, speed: def.speed, power: def.power });
    await saveCustom(rec).catch(() => hooks.toast?.('Could not save the toy in this browser, so it will be gone after a reload.'));
    const done = job; job = null; persist();
    pill(`${rec.title} is ready!`, 'ok'); showDone(rec, def, v); hooks.stage?.('ready', def);
    printFiles(done, rec);
  } catch (e) { fail({ message: 'The toy was made, but downloading it failed. Check your connection and try again.' }); }
}
function showDone(rec, def, v) {
  mode('done');
  $('#fDoneName').textContent = rec.title;
  const bar = (n, max) => `<span class="bar"><i style="width:${Math.round((n / max) * 100)}%"></i></span>`;
  $('#fStats').innerHTML = `<span>Weight</span>${bar(def.mass, 1.6)}<span>Speed</span>${bar(def.speed, 1.3)}<span>Power</span>${bar(def.power, 1.15)}`;
  const total = Object.values(v.secs || {}).reduce((a, b) => a + b, 0);
  $('#fTimes').textContent = `Lux3D made it in ${Math.floor(total / 60)} min ${total % 60} s: toy ${v.secs.toy} s, 3D ${v.secs.model} s, skeleton ${v.secs.rig} s, ten moves ${v.secs.anims} s.`;
  $('#fFight').textContent = `Fight as ${rec.title}!`;
  $('#fFight').onclick = () => { pill(''); $('#forge').classList.remove('show'); hooks.fight?.(rec.id); };
  say('');
}
// Lux3D export of the finished model to STL + 3MF, fetched in the background so the toy can be 3D-printed later.
async function printFiles(done, rec) {
  try {
    for (let i = 0; i < 40; i++) {
      const p = await (await fetch(`${RELAY}/forge/${done.id}/print`, { method: 'POST', headers: headers() })).json();
      if (p.state === 'done') {
        const [stl, mf] = await Promise.all([p.stl ? blob(p.stl) : null, p.mf ? blob(p.mf) : null]);
        Object.assign(rec, { stl, mf }); await saveCustom(rec); hooks.printReady?.(rec); return;
      }
      if (p.state === 'failed' || p.error) return;
      await new Promise((r) => setTimeout(r, 5000));
    }
  } catch { /* print files are a bonus */ }
}

// A real forge run, replayed from its saved Lux3D outputs at 10x speed (for judges who will not draw, or when the forge is out).
async function replay() {
  if (busy || job || replaying) return;
  const runs = await fetch('data/forge-demo.json').then((r) => r.json()).catch(() => []);
  const r = runs.find((x) => x.id === 'sir-whiskers'); const def = hooks.def?.('whiskers');
  if (!r || !def) { say('The replay is not available right now.', true); return; }
  const base = 'assets/forge-demo/sir-whiskers/', K = 10, wait = (s) => new Promise((ok) => setTimeout(ok, (s * 1000) / K));
  replaying = true; pad.load(base + 'doodle.png'); $('#fName').value = r.name; mode('run'); $('#fWait').hidden = true;
  hooks.stage?.('doodle', base + 'doodle.png'); clock(Date.now(), K, `replay of a real run, ${K}× speed`);
  say('Replaying a real forge run: these are its real Lux3D outputs and times.');
  const steps = { step: 'toy', state: 'running', secs: {} }; paintSteps(steps);
  const phases = [['toy', () => { $('#fToy').src = base + 'toy.png'; $('#fToy').hidden = false; hooks.stage?.('toy', base + 'toy.png'); }],
    ['model', () => hooks.stage?.('model', base + 'model.glb')], ['rig', () => hooks.stage?.('rig')], ['anims', () => {}]];
  for (const [s, show] of phases) {
    await wait(r.secs[s] + 3); if (!replaying) return;
    steps.secs[s] = r.secs[s]; const next = STEPS[STEPS.indexOf(s) + 1]; steps.step = next || 'done'; steps.state = next ? 'running' : 'done';
    paintSteps(steps); show();
  }
  clearInterval(clockT); replaying = false;
  hooks.stage?.('ready', def); showDone({ id: def.id, title: def.title }, def, { secs: r.secs });
  $('#fTimes').textContent += ' (Replay of a real run. Sir Whiskers is in everyone\'s roster.)';
}

export function initForge(h) {
  hooks = h; pad = setupPad();
  $('#fGo').onclick = begin;
  $('#fReplay').onclick = () => replay();
  document.querySelectorAll('.examples button').forEach((b) => b.onclick = () => { if (!busy) { pad.load(b.dataset.ex); say(''); } });
  $('#fClose').onclick = () => { replaying = false; closeForge(); if (!job && $('#forge').dataset.mode === 'done') pill(''); };
  $('#fWait').onclick = () => closeForge();
  $('#fAgain').onclick = () => { pill(''); replaying = false; clock(0); $('#fWait').hidden = false; pad.st.used = false; $('#fPad').getContext('2d').clearRect(0, 0, 768, 768); $('#fGuide').classList.remove('dim'); $('#fName').value = ''; $('#fToy').hidden = true; hooks.stage?.('reset'); mode('draw'); refreshQuota(); };
  $('#fPill').onclick = () => openForge();
  $('#fKey').onchange = () => { const k = ownKey(); if (k) sessionStorage.setItem('aholoKey', k); refreshQuota(); };
  const k = sessionStorage.getItem('aholoKey'); if (k) $('#fKey').value = k;
  // a forge that was running when the page was closed carries on
  const old = saved();
  if (old && RELAY && Date.now() - old.startedAt < 60 * 60e3) { job = old; mode('run'); clock(job.startedAt); pill(`Forging ${job.name}…`, 'run'); loop(); } else persist();
}
