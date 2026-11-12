// Prop / hazard generation: text -> 3D (or image -> 3D), optional articulation by motion prompt, optimisation.
// Usage: node pipeline/prop.mjs <name> [stage...]   stages: model articulate optimize export
// Config lives in doodles/props.json: { name: { prompt, style, img?, motion?, export? } }
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { upload, run, download, firstUrl, ROOT } from './lux3d.mjs';

const name = process.argv[2];
const want = new Set(process.argv.slice(3));
const cfg = JSON.parse(readFileSync(join(ROOT, 'doodles', 'props.json'), 'utf8'))[name];
if (!cfg) throw new Error('no config for ' + name);
const work = join(ROOT, 'pipeline', 'work', 'props', name);
const raw = join(work, 'raw');
const out = join(ROOT, 'assets', 'props');
mkdirSync(raw, { recursive: true });
mkdirSync(out, { recursive: true });
const stateFile = join(work, 'state.json');
const S = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};
const save = () => writeFileSync(stateFile, JSON.stringify(S, null, 2));
const all = !want.size;

if (all || want.has('model')) {
  let r;
  if (cfg.img) {
    const url = cfg.img.startsWith('http') ? cfg.img : await upload(join(ROOT, cfg.img));
    r = await run('img-to-3d', { img: url, version: 'G1', faceCount: cfg.faces || 30000, outputFormat: ['zip', 'glb'] }, `${name}:model`);
  } else {
    r = await run('text-to-3d', { prompt: cfg.prompt, style: cfg.style || 'cartoon', version: 'G1', faceCount: cfg.faces || 30000, outputFormat: ['zip', 'glb'] }, `${name}:model`);
  }
  S.modelTask = r.taskId; S.modelOutputs = r.outputs;
  S.glbUrl = firstUrl(r.outputs, '.glb'); S.zipUrl = firstUrl(r.outputs, '.zip'); save();
  await download(S.glbUrl, join(raw, 'model.glb'));
}
if ((all && cfg.motion) || want.has('articulate')) {
  const r = await run('articulate', { glbUrl: S.glbUrl, prompt: cfg.motion }, `${name}:articulate`);
  S.artTask = r.taskId; S.artOutputs = r.outputs; S.artUrl = firstUrl(r.outputs); save();
  const ext = (S.artUrl.split('?')[0].match(/\.(\w+)$/) || [, 'glb'])[1];
  await download(S.artUrl, join(raw, 'articulated.' + ext));
}
const sh = (c) => execSync(c, { cwd: ROOT, stdio: 'inherit' });
function optimize(src, dest) {
  const b = dest.replace(/\.glb$/, '');
  sh(`npx gltf-transform resize "${src}" "${b}.o1.glb" --width ${cfg.tex || 512} --height ${cfg.tex || 512}`);
  sh(`npx gltf-transform webp "${b}.o1.glb" "${b}.o2.glb" --quality 85`);
  sh(`npx gltf-transform prune "${b}.o2.glb" "${b}.o3.glb"`);
  sh(`npx gltf-transform meshopt "${b}.o3.glb" "${dest}"`);
  for (const k of ['o1', 'o2', 'o3']) execSync(`rm -f "${b}.${k}.glb"`);
}
if (all || want.has('optimize')) {
  if (existsSync(join(raw, 'articulated.zip'))) {
    // Articulation returns a URDF package: links as separate GLBs + joints (origin, axis, limits).
    execSync(`mkdir -p art && cd art && unzip -o -q ../articulated.zip`, { cwd: raw, shell: 'bash' });
    const urdfDir = join(raw, 'art', 'urdf');
    const dest = join(out, name); mkdirSync(dest, { recursive: true });
    const urdf = readFileSync(join(urdfDir, 'robot.urdf'), 'utf8');
    writeFileSync(join(dest, 'robot.urdf'), urdf);
    for (const m of [...urdf.matchAll(/filename="meshes\/([^"]+)"/g)].map((x) => x[1])) {
      mkdirSync(join(raw, 'tmp'), { recursive: true });
      optimize(join(urdfDir, 'meshes', m), join(dest, m));
    }
    S.urdf = true; save();
  } else {
    const src = existsSync(join(raw, 'articulated.glb')) ? join(raw, 'articulated.glb') : join(raw, 'model.glb');
    optimize(src, join(out, name + '.glb'));
  }
}
if (want.has('export')) {
  const r = await run('export', { modelUrl: S.zipUrl || S.glbUrl, outputFormat: ['stl', '3mf'] }, `${name}:export`);
  S.exportOutputs = r.outputs; save();
}
console.log(JSON.stringify({ name, ...S }, null, 2));
