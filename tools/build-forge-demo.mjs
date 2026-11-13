// Publishes every live forge run (doodle + toy concept images, task IDs, real timings, outcome) for the report and Lab page.
// Sources: pipeline/work/forge/<run>/job.json (demo and test runs, written by tools/save-forge.mjs)
//          pipeline/work/stress/results.json + <doodle>/ (stress test, written by tools/stress-forge.mjs)
// Writes assets/forge-demo/<id>/{doodle,toy}.png and data/forge-demo.json.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = [];
const copy = (from, id) => {
  const dest = join(ROOT, 'assets', 'forge-demo', id); mkdirSync(dest, { recursive: true });
  for (const f of ['doodle.png', 'toy.png']) if (existsSync(join(from, f))) copyFileSync(join(from, f), join(dest, f));
};
const KIND = { 'sir-whiskers': 'demo', spike: 'demo', 'whiskers-take-1': 'take', prickles: 'test' };

const src = join(ROOT, 'pipeline', 'work', 'forge');
for (const id of existsSync(src) ? readdirSync(src) : []) {
  const dir = join(src, id); if (!existsSync(join(dir, 'job.json'))) continue;
  const job = JSON.parse(readFileSync(join(dir, 'job.json'), 'utf8'));
  copy(dir, id);
  out.push({ id, ...job, kind: job.kind || KIND[id] || 'demo', state: 'done', total: Object.values(job.secs).reduce((a, b) => a + b, 0) });
}
const sdir = join(ROOT, 'pipeline', 'work', 'stress');
const stress = existsSync(join(sdir, 'results.json')) ? JSON.parse(readFileSync(join(sdir, 'results.json'), 'utf8')) : {};
for (const [name, r] of Object.entries(stress)) {
  const id = 'stress-' + name; copy(join(sdir, name), id);
  out.push({ id, name, kind: 'stress', state: r.state, tries: r.tries || 0, secs: r.secs || {}, tasks: r.tasks || {}, error: r.error?.code || null,
    total: Object.values(r.secs || {}).reduce((a, b) => a + b, 0), wall: r.wall, createdAt: '2026-11-13T16:00:00.000Z' });
}
const order = { demo: 0, take: 1, test: 2, stress: 3 };
out.sort((a, b) => order[a.kind] - order[b.kind] || String(a.createdAt).localeCompare(String(b.createdAt)));
writeFileSync(join(ROOT, 'data', 'forge-demo.json'), JSON.stringify(out, null, 2));
console.log(out.map((o) => `${o.name} [${o.kind}] ${o.state} ${o.total}s`).join('\n'));
