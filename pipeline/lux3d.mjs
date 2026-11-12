// Minimal Aholo Lux3D client: upload, create task, poll, download. Every task is logged to pipeline/log.jsonl.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const KEY = (process.env.AHOLO_KEY || readFileSync(join(ROOT, 'Credentials', 'aholo-key.txt'), 'utf8')).trim();
const API = 'https://api.aholo.ai/global';
const LOG = join(HERE, 'log.jsonl');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();
export const log = (o) => appendFileSync(LOG, JSON.stringify({ t: now(), ...o }) + '\n');

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: KEY, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`); }
  return json;
}

// Upload a local file through the OUS asset service; returns a public URL.
export async function upload(file) {
  const tok = await api('GET', '/asset/v1/token');
  const { ousToken, globalDomain } = tok.d ?? tok;
  if (!ousToken) throw new Error('no upload token: ' + JSON.stringify(tok).slice(0, 300));
  const buf = readFileSync(file);
  const md5 = createHash('md5').update(buf).digest('hex');
  const form = new FormData();
  form.append('md5', md5);
  form.append('file', new Blob([buf]), basename(file));
  const up = await (await fetch(globalDomain + '/ous/api/v2/single/upload', {
    method: 'POST', headers: { 'ous-token-v2': ousToken }, body: form,
  })).json();
  if (up.c !== '0' && up.c !== 0) throw new Error('upload failed: ' + JSON.stringify(up).slice(0, 300));
  const taskId = up.d?.taskId;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const st = await (await fetch(`${globalDomain}/ous/api/v2/upload/status?taskId=${encodeURIComponent(taskId)}`, {
      headers: { 'ous-token-v2': ousToken },
    })).json();
    if (st.d?.url && (st.d.status === 5 || st.d.status === '5' || st.d.status === undefined)) {
      log({ kind: 'upload', file: basename(file), url: st.d.url });
      return st.d.url;
    }
    if (i === 59) throw new Error('upload status timeout: ' + JSON.stringify(st).slice(0, 300));
  }
}

const CREATE = {
  'multimodal-to-image': '/lux3d/v1/generate/multimodal-to-image/task/create',
  'four-view': '/lux3d/v1/generate/image-to-four-view/task/create',
  'img-to-3d': '/lux3d/v1/generate/img-to-3d/task/create',
  'text-to-3d': '/lux3d/v1/generate/text-to-3d/task/create',
  'material-transfer': '/lux3d/v1/generate/material-transfer/task/create',
  'part-split': '/lux3d/v1/part-split/task/create',
  'export': '/lux3d/v1/multi-format-export/task/create',
  'articulate': '/lux3d/v1/articulation-animation/task/create',
  'rig': '/lux3d/v1/animations/rig/task/create',
  'retarget': '/lux3d/v1/animations/retarget/task/create',
};

// Create a task (retrying while another task is still running), wait for it, return outputs.
export async function run(kind, body, label = '') {
  let created;
  for (let i = 0; i < 120; i++) {
    created = await api('POST', CREATE[kind], body);
    if (created.c === 'GENERATION_CONCURRENCY_LIMIT_EXCEEDED') { await sleep(10000); continue; }
    break;
  }
  if (created.c !== '0') { log({ kind, label, body, error: created }); throw new Error(`${kind} create failed: ${JSON.stringify(created).slice(0, 400)}`); }
  const taskId = created.d;
  log({ kind, label, body, taskId, status: 'created' });
  console.log(`[${kind}] ${label} task ${taskId} created`);
  const t0 = Date.now();
  for (;;) {
    await sleep(8000);
    const q = await api('GET', `/lux3d/v1/generate/task/get?taskid=${taskId}`);
    const d = q.d || {};
    if ([3, 4, 6].includes(d.status)) {
      const outputs = (d.outputs || []).map((o) => o.content);
      log({ kind, label, taskId, status: d.status, secs: Math.round((Date.now() - t0) / 1000), outputs, raw: d.status === 3 ? undefined : d });
      if (d.status !== 3) throw new Error(`${kind} task ${taskId} ended with status ${d.status}: ${JSON.stringify(d).slice(0, 500)}`);
      console.log(`[${kind}] ${label} done in ${Math.round((Date.now() - t0) / 1000)} s`);
      return { taskId, outputs, data: d };
    }
    process.stdout.write('.');
  }
}

export async function download(url, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

export const firstUrl = (outputs, ext) => outputs.find((u) => typeof u === 'string' && u.startsWith('http') && (!ext || u.split('?')[0].toLowerCase().endsWith(ext)));
export { ROOT, existsSync };
