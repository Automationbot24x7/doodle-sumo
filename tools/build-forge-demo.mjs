// Publishes the two live-forge runs recorded for the report and Lab page (doodle + toy concept images, task IDs, real timings).
// Reads pipeline/work/forge/<name>/ (written by tools/save-forge.mjs), writes assets/forge-demo/ and data/forge-demo.json.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(ROOT, 'pipeline', 'work', 'forge'), out = [];
for (const id of existsSync(src) ? readdirSync(src).filter((d) => !d.startsWith('_')) : []) {
  const dir = join(src, id); if (!existsSync(join(dir, 'job.json'))) continue;
  const job = JSON.parse(readFileSync(join(dir, 'job.json'), 'utf8'));
  const dest = join(ROOT, 'assets', 'forge-demo', id); mkdirSync(dest, { recursive: true });
  for (const f of ['doodle.png', 'toy.png']) if (existsSync(join(dir, f))) copyFileSync(join(dir, f), join(dest, f));
  out.push({ id, ...job, total: Object.values(job.secs).reduce((a, b) => a + b, 0) });
}
out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
writeFileSync(join(ROOT, 'data', 'forge-demo.json'), JSON.stringify(out, null, 2));
console.log(out.map((o) => `${o.name}: ${o.total}s`).join(', '));
