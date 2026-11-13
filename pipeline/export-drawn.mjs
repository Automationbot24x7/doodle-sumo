// Lux3D multi-format export (3MF + STL) for the toys drawn on the pad and forged live.
// Usage: node pipeline/export-drawn.mjs        (reads doodles/drawn.json, writes assets/print/<id>.{stl,3mf})
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { upload, run, download, ROOT } from './lux3d.mjs';

const drawn = JSON.parse(readFileSync(join(ROOT, 'doodles', 'drawn.json'), 'utf8'));
mkdirSync(join(ROOT, 'assets', 'print'), { recursive: true });
for (const [id, c] of Object.entries(drawn)) {
  const dir = join(ROOT, 'pipeline', 'work', 'forge', c.run);
  if (existsSync(join(ROOT, 'assets', 'print', `${id}.stl`))) continue;
  const url = await upload(join(dir, 'model-small.glb'));
  const r = await run('export', { modelUrl: url, outputFormat: ['stl', '3mf'] }, `${id}:print`);
  const stl = r.outputs.find((u) => /\.stl(\?|$)/i.test(u || '')), mf = r.outputs.find((u) => /\.3mf(\?|$)/i.test(u || ''));
  if (stl) await download(stl, join(ROOT, 'assets', 'print', `${id}.stl`));
  if (mf) await download(mf, join(ROOT, 'assets', 'print', `${id}.3mf`));
  const jf = join(dir, 'job.json'); const j = JSON.parse(readFileSync(jf, 'utf8')); j.tasks.print = r.taskId; writeFileSync(jf, JSON.stringify(j, null, 2));
  console.log(id, 'print task', r.taskId, !!stl, !!mf);
}
