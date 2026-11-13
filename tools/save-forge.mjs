// Saves the files of finished local forge jobs (doodle, toy concept, model, animated fighter) for the report and Lab page.
// Usage: node tools/save-forge.mjs        -> pipeline/work/forge/<name>/
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const mem = JSON.parse(readFileSync(join(ROOT, 'pipeline', 'work', 'relay-state.json'), 'utf8'));
const base = join(ROOT, 'pipeline', 'work', 'forge'); mkdirSync(base, { recursive: true });
const saved = new Set(readdirSync(base).map((d) => { try { return JSON.parse(readFileSync(join(base, d, 'job.json'), 'utf8')).createdAt; } catch { return null; } }));
for (const [k, v] of Object.entries(mem)) {
  if (!k.startsWith('job:') || v.v.state !== 'done') continue;
  const r = v.v, dir = join(ROOT, 'pipeline', 'work', 'forge', (r.name || r.id).replace(/[^a-z0-9]+/gi, '-').toLowerCase());
  if (saved.has(new Date(r.createdAt).toISOString()) || existsSync(join(dir, 'job.json'))) continue;
  mkdirSync(dir, { recursive: true });
  for (const [name, file] of [['doodle', 'doodle.png'], ['toy', 'toy.png'], ['model', 'model.glb'], ['fighter', 'fighter-raw.glb']]) {
    try { const res = await fetch(r.outputs[name]); if (!res.ok) throw new Error(res.status); writeFileSync(join(dir, file), Buffer.from(await res.arrayBuffer())); }
    catch (e) { console.log(r.name, name, 'not saved:', e.message); }
  }
  writeFileSync(join(dir, 'job.json'), JSON.stringify({ name: r.name, tasks: r.tasks, secs: r.secs, tries: r.tries, createdAt: new Date(r.createdAt).toISOString() }, null, 2));
  console.log('saved', dir, JSON.stringify(r.secs));
}
