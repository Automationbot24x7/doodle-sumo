// Iteration comparison for the report: doodle straight to 3D (skipping the toy-concept step).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { run, download, firstUrl, ROOT } from './lux3d.mjs';
const name = process.argv[2] || 'tofu';
const S = JSON.parse(readFileSync(join(ROOT, 'pipeline', 'work', name, 'state.json'), 'utf8'));
const r = await run('img-to-3d', { img: S.doodleUrl, version: 'G1', faceCount: 60000, outputFormat: ['zip', 'glb'] }, `${name}:direct-from-doodle`);
await download(firstUrl(r.outputs, '.glb'), join(ROOT, 'pipeline', 'work', name, 'raw', 'direct-from-doodle.glb'));
console.log('ok', r.taskId);
