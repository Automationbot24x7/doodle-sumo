// Runs a page in headless Chrome and prints a JS expression every few seconds (for long gameplay tests).
// Usage: node tools/probe.mjs <url> <seconds> "<setup js>" "<probe expr>" [everySec] [shotPrefix]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const [url, secs, setup, expr, every = '3', shot] = process.argv.slice(2);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9800 + Math.floor(Math.random() * 150);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.resolve('video/chrome-probe')}`, '--hide-scrollbars', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); } catch {} });
let target; for (let i = 0; i < 60 && !target; i++) { try { target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json(); } catch { await sleep(250); } }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') console.log('EXCEPTION', JSON.stringify(m.params.exceptionDetails).slice(0, 300)); });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (x) => (await cdp('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.value;
await cdp('Page.enable'); await cdp('Network.enable'); await cdp('Network.setCacheDisabled', { cacheDisabled: true }); await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 860, deviceScaleFactor: 1, mobile: false });
await cdp('Page.navigate', { url });
for (let i = 0; i < 80; i++) { await sleep(250); if (await ev('!!window.__doodle')) break; }
if (setup) await ev(setup);
const t0 = Date.now(); let n = 0;
while ((Date.now() - t0) / 1000 < +secs) {
  await sleep(+every * 1000);
  console.log(Math.round((Date.now() - t0) / 1000) + 's', await ev(expr));
  if (shot) { const { data } = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 80 }); fs.writeFileSync(`${shot}-${String(n++).padStart(2, '0')}.jpg`, Buffer.from(data, 'base64')); }
}
chrome.kill(); process.exit(0);
