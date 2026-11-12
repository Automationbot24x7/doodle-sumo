// Builds data/fighters.json, data/props.json and data/pipeline.json from the pipeline state + task log.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(ROOT, 'data'), { recursive: true });
const cfg = JSON.parse(readFileSync(join(ROOT, 'doodles', 'fighters.json'), 'utf8'));
const propCfg = JSON.parse(readFileSync(join(ROOT, 'doodles', 'props.json'), 'utf8'));
const log = existsSync(join(ROOT, 'pipeline', 'log.jsonl'))
  ? readFileSync(join(ROOT, 'pipeline', 'log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];

const fighters = [];
for (const [id, c] of Object.entries(cfg)) {
  const sf = join(ROOT, 'pipeline', 'work', id, 'state.json');
  if (!existsSync(sf) || !existsSync(join(ROOT, 'assets', 'fighters', id, 'fighter.glb'))) continue;
  const s = JSON.parse(readFileSync(sf, 'utf8'));
  fighters.push({ id, ...c, anims: s.animNames, tasks: { toy: s.toyTask, model: s.modelTask, rig: s.rigTask, anims: s.animTask } });
}
writeFileSync(join(ROOT, 'data', 'fighters.json'), JSON.stringify(fighters, null, 2));

const props = [];
for (const [id, c] of Object.entries(propCfg)) {
  const urdf = existsSync(join(ROOT, 'assets', 'props', id, 'robot.urdf'));
  if (!urdf && !existsSync(join(ROOT, 'assets', 'props', id + '.glb'))) continue;
  const sf = join(ROOT, 'pipeline', 'work', 'props', id, 'state.json');
  const s = existsSync(sf) ? JSON.parse(readFileSync(sf, 'utf8')) : {};
  let joints = [];
  if (urdf) {
    const x = readFileSync(join(ROOT, 'assets', 'props', id, 'robot.urdf'), 'utf8');
    joints = [...x.matchAll(/<joint name="([^"]+)" type="([^"]+)">[\s\S]*?<\/joint>/g)].map((m) => {
      const lim = m[0].match(/lower="([^"]+)" upper="([^"]+)"/);
      return { name: m[1], type: m[2], lower: lim ? +lim[1] : null, upper: lim ? +lim[2] : null };
    });
  }
  props.push({ id, title: c.title || id, prompt: c.prompt, motion: c.motion || null, role: c.role || 'decor', urdf, joints, tasks: { model: s.modelTask, articulate: s.artTask } });
}
writeFileSync(join(ROOT, 'data', 'props.json'), JSON.stringify(props, null, 2));

// Public task log: no URLs (they expire / are signed), just what ran, how long, and the outcome.
const done = log.filter((e) => e.status === 3 || e.status === 4).map((e) => ({ t: e.t, kind: e.kind, label: e.label, taskId: e.taskId, ok: e.status === 3, secs: e.secs }));
const prompts = log.filter((e) => e.status === 'created').map((e) => ({ taskId: e.taskId, prompt: e.body?.prompt, version: e.body?.version, anims: e.body?.animationIds }));
writeFileSync(join(ROOT, 'data', 'pipeline.json'), JSON.stringify({ built: new Date().toISOString(), tasks: done, prompts }, null, 2));
console.log(`fighters ${fighters.length}, props ${props.length}, tasks ${done.length}`);
