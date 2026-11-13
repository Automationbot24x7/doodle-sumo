// Forge stress test: draws each test doodle on the real in-game pad (headless Chrome), exports it exactly as the game does,
// then sends it through a forge relay and records what Lux3D did. One forge at a time (Lux3D runs one task at a time).
// Usage: node tools/stress-forge.mjs <relayUrl> <doodle,doodle,...>     -> pipeline/work/stress/<doodle>/ + results.json
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [relay = 'http://localhost:8787', list = 'stick,outline,bean,tiny,car,ghost,scribble,dino'] = process.argv.slice(2);
const names = list.split(',');
const OUT = path.resolve('pipeline/work/stress'); fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) draw and export every doodle with the real pad
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9700 + Math.floor(Math.random() * 150);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.resolve('video/chrome-stress')}`, '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore' });
let target; for (let i = 0; i < 60 && !target; i++) { try { target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json(); } catch { await sleep(250); } }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (x) => (await cdp('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.value;
await cdp('Page.enable'); await cdp('Network.enable'); await cdp('Network.setCacheDisabled', { cacheDisabled: true });
await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
for (const n of names) {
  if (fs.existsSync(path.join(OUT, n, 'doodle.png'))) continue;
  await cdp('Page.navigate', { url: `http://localhost:5191/index.html?relay=none&s=${Date.now()}` });
  for (let i = 0; i < 120; i++) { await sleep(250); if (await ev("!!window.__doodle && !document.querySelector('#loading.show')")) break; }
  const url = await ev(`(async () => {
    document.querySelector('#drawBtn').click();
    await new Promise((r) => { const s = document.createElement('script'); s.src = '/tools/draw-doodle.js?' + Date.now(); s.onload = r; document.head.appendChild(s); });
    await window.drawDoodle(${JSON.stringify(n)}, 12);
    const cv = document.querySelector('#fPad'), c = document.createElement('canvas'); c.width = c.height = 768;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 768, 768); x.drawImage(cv, 0, 0);
    return c.toDataURL('image/png');
  })()`);
  fs.mkdirSync(path.join(OUT, n), { recursive: true });
  fs.writeFileSync(path.join(OUT, n, 'doodle.png'), Buffer.from(url.split(',')[1], 'base64'));
  console.log('drawn', n);
}
chrome.kill();

// 2) forge them one by one
const resFile = path.join(OUT, 'results.json');
const results = fs.existsSync(resFile) ? JSON.parse(fs.readFileSync(resFile, 'utf8')) : {};
for (const n of names) {
  if (results[n]?.state === 'done') continue;
  const img = 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, n, 'doodle.png')).toString('base64');
  const t0 = Date.now();
  let v = await (await fetch(relay + '/forge', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:5191' }, body: JSON.stringify({ image: img, name: n }) })).json();
  if (v.error) { results[n] = { state: 'refused', error: v.error }; console.log(n, 'refused', v.error); continue; }
  const id = v.id;
  for (;;) {
    await sleep(5000);
    try { v = await (await fetch(`${relay}/forge/${id}`, { headers: { origin: 'http://localhost:5191' } })).json(); } catch { continue; }
    if (v.state === 'done' || v.state === 'failed' || v.error?.code === 'GONE') break;
    if (Date.now() - t0 > 20 * 60e3) { v.state = 'timeout'; break; }
  }
  const r = { state: v.state, secs: v.secs, tries: v.tries, tasks: v.tasks, error: v.error, wall: Math.round((Date.now() - t0) / 1000) };
  for (const k of ['toy', 'model', 'fighter']) {
    const u = v.outputs?.[k]; if (!u) continue;
    try { const b = Buffer.from(await (await fetch(u)).arrayBuffer()); fs.writeFileSync(path.join(OUT, n, k === 'toy' ? 'toy.png' : `${k}.glb`), b); } catch { /* link may have expired */ }
  }
  results[n] = r; fs.writeFileSync(resFile, JSON.stringify(results, null, 2));
  console.log(n, r.state, JSON.stringify(r.secs), 'tries', r.tries, r.error ? JSON.stringify(r.error) : '', `${r.wall}s`);
}
console.log('STRESS-DONE');
process.exit(0);
