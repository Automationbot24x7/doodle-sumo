// Aholo SpatialGen: generate the kid's bedroom around the desk (panorama + 3D Gaussian splat).
// Usage: node pipeline/world.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { download, log, ROOT } from './lux3d.mjs';

const KEY = (process.env.AHOLO_KEY || readFileSync(join(ROOT, 'Credentials', 'aholo-key.txt'), 'utf8')).trim();
const API = 'https://api.aholo.ai/global';
const work = join(ROOT, 'pipeline', 'work', 'world'); mkdirSync(work, { recursive: true });
const out = join(ROOT, 'assets', 'world'); mkdirSync(out, { recursive: true });
const stateFile = join(work, 'state.json');
const S = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};
const save = () => writeFileSync(stateFile, JSON.stringify(S, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROMPT = 'A cozy, colourful child\'s bedroom in warm afternoon light: wooden floor with a striped rug, a bed with a patchwork quilt, ' +
  'shelves full of toys and books, crayon drawings taped to pastel walls, a big window with sunlight, a beanbag and a toy box. Playful, clean, cartoon-like.';

if (!S.worldId) {
  const res = await fetch(API + '/world/v1/generations', {
    method: 'POST', headers: { Authorization: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Doodle Sumo bedroom', prompt: PROMPT }),
  });
  const j = await res.json();
  if (!j.worldId) throw new Error('world create failed: ' + JSON.stringify(j).slice(0, 400));
  S.worldId = j.worldId; S.prompt = PROMPT; save();
  log({ kind: 'world-gen', label: 'bedroom:world', worldId: j.worldId, status: 'created', body: { prompt: PROMPT } });
  console.log('world', j.worldId);
}
const t0 = Date.now();
for (;;) {
  const d = await (await fetch(`${API}/world/v1/${S.worldId}`, { headers: { Authorization: KEY } })).json();
  const st = d.status || d.d?.status;
  process.stdout.write(`\r${st} ${Math.round((d.progress || 0) * 100)}%   `);
  if (['SUCCEEDED', 'FAILED', 'CANCELED', 'TIMEOUT', 'REJECTED'].includes(st)) {
    S.detail = d; save();
    log({ kind: 'world-gen', label: 'bedroom:world', worldId: S.worldId, status: st === 'SUCCEEDED' ? 3 : 4, secs: Math.round((Date.now() - t0) / 1000) });
    if (st !== 'SUCCEEDED') throw new Error('world ' + st + ' ' + JSON.stringify(d).slice(0, 400));
    break;
  }
  await sleep(10000);
}
const a = S.detail.assets || {};
if (a.imagery?.panoUrl) await download(a.imagery.panoUrl, join(work, 'pano' + (a.imagery.panoUrl.split('?')[0].match(/\.\w+$/) || ['.jpg'])[0]));
const u = a.splats?.urls || {};
if (u.spzPath) await download(u.spzPath, join(work, 'world.spz'));
console.log('\n', JSON.stringify(S.detail, null, 2).slice(0, 1500));
