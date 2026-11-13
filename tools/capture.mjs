// Records a page with Chrome's DevTools screencast (real rendering, no mock-ups).
// Usage: node tools/capture.mjs <name> <url> <seconds> [setupJS] [--headed]
// Frames land in video/cap/<name>/ with a concat list (frame durations from real timestamps) for ffmpeg.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [name, url, secs, setup] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const HEADED = process.argv.includes('--headed');
const AUDIO = process.argv.includes('--audio');
const ZOOM = +((process.argv.find((a) => a.startsWith('--zoom=')) || '--zoom=1').split('=')[1]);
const W = 1920, H = 1080;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.resolve('video/cap', name);
const PORT = 9334 + Math.floor(Math.random() * 200);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

const prof = path.resolve('video/chrome-profile');
const args = [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, `--window-size=${W},${H + (HEADED ? 140 : 0)}`, '--hide-scrollbars', '--force-color-profile=srgb', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
if (!HEADED) args.unshift('--headless=new');
const chrome = spawn(CHROME, [...args, 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); } catch {} });

let target;
for (let i = 0; i < 60 && !target; i++) { try { target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json(); } catch { await sleep(250); } }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0; const pending = new Map(); let onFrame = null;
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method === 'Page.screencastFrame') {
    ws.send(JSON.stringify({ id: ++seq, method: 'Page.screencastFrameAck', params: { sessionId: m.params.sessionId } }));
    onFrame?.(m.params);
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.log('page error:', JSON.stringify(m.params.args).slice(0, 200));
});
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;

await cdp('Page.enable'); await cdp('Network.enable'); await cdp('Network.setCacheDisabled', { cacheDisabled: true }); await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: Math.round(W / ZOOM), height: Math.round(H / ZOOM), deviceScaleFactor: ZOOM, mobile: false });
await cdp('Page.navigate', { url });
await sleep(1500);
for (let i = 0; i < 80; i++) { if (await evaluate('document.readyState === "complete" && !document.querySelector("#loading.show")')) break; await sleep(250); }
await sleep(800);

const frames = [];
let skip = 1, seen = 0;
onFrame = (p) => { if (skip > 1 && seen++ % skip) return; const f = path.join(OUT, `f${String(frames.length).padStart(5, '0')}.jpg`); fs.writeFileSync(f, Buffer.from(p.data, 'base64')); frames.push({ f: path.basename(f), t: p.metadata.timestamp }); };
if (AUDIO) await evaluate('window.__audioRec.start()');
await cdp('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
if (setup) await cdp('Runtime.evaluate', { expression: fs.readFileSync(setup, 'utf8') });   // not awaited: the take script runs alongside the recording
const t0 = Date.now();
// the page may thin the recording (window.__captureSkip = N keeps every Nth frame) or end it early (window.__captureStop)
while ((Date.now() - t0) / 1000 < +secs) { await sleep(200); const c = await evaluate('[window.__captureSkip || 1, !!window.__captureStop]').catch(() => null); if (c) { skip = c[0]; if (c[1]) break; } }
const marks = await evaluate('JSON.stringify(window.__marks || [])').catch(() => '[]'); fs.writeFileSync(path.join(OUT, 'marks.json'), marks);
await cdp('Page.stopScreencast');
if (AUDIO) { const b64 = await evaluate('window.__audioRec.stop()'); fs.writeFileSync(path.join(OUT, 'audio.webm'), Buffer.from(b64, 'base64')); console.log('audio saved'); }
await sleep(300);

// concat list with real frame durations
let list = '';
for (let i = 0; i < frames.length; i++) {
  const d = i + 1 < frames.length ? frames[i + 1].t - frames[i].t : 1 / 30;
  list += `file '${frames[i].f}'\nduration ${Math.max(0.001, d).toFixed(4)}\n`;
}
list += `file '${frames[frames.length - 1].f}'\n`;
fs.writeFileSync(path.join(OUT, 'list.txt'), list);
const span = frames.length > 1 ? frames[frames.length - 1].t - frames[0].t : 0;
console.log(`${name}: ${frames.length} frames over ${span.toFixed(1)} s = ${(frames.length / Math.max(0.1, span)).toFixed(1)} fps`);
const fps = await evaluate('window.__fps || null'); if (fps) console.log('page fps', fps);
chrome.kill(); process.exit(0);
