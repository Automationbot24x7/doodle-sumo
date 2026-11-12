// Screenshots pages with headless Chrome. Usage: node tools/shoot.mjs jobs.json
// jobs: [{ url, out, w, h, wait?: ms, ready?: "js expression", js?: "js to run before shooting" }]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9600 + Math.floor(Math.random() * 200);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.resolve('video/chrome-shoot')}`, '--hide-scrollbars', '--force-color-profile=srgb', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); } catch {} });
let target; for (let i = 0; i < 60 && !target; i++) { try { target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json(); } catch { await sleep(250); } }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (x) => (await cdp('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.value;
await cdp('Page.enable');
for (const j of jobs) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: j.w || 1280, height: j.h || 720, deviceScaleFactor: j.scale || 1, mobile: false });
  await cdp('Emulation.setDefaultBackgroundColorOverride', j.transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
  await cdp('Page.navigate', { url: j.url });
  const ready = j.ready || 'window.done === true';
  for (let i = 0; i < 120; i++) { await sleep(250); if (await ev(`(()=>{try{return !!(${ready})}catch(e){return false}})()`)) break; }
  if (j.js) await ev(j.js);
  await sleep(j.wait ?? 300);
  if (j.pdf) {
    const { data } = await cdp('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
    fs.mkdirSync(path.dirname(j.out), { recursive: true }); fs.writeFileSync(j.out, Buffer.from(data, 'base64'));
  } else {
    const { data } = await cdp('Page.captureScreenshot', { format: j.out.endsWith('.png') ? 'png' : 'jpeg', quality: 90 });
    fs.mkdirSync(path.dirname(j.out), { recursive: true }); fs.writeFileSync(j.out, Buffer.from(data, 'base64'));
  }
  console.log('shot', j.out);
}
chrome.kill(); process.exit(0);
