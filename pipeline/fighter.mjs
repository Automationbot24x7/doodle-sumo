// Doodle -> toy reference image -> 3D model -> humanoid rig -> animations, one stage at a time with resume.
// Usage: node pipeline/fighter.mjs <name> [stage...]   stages: upload toy model rig anims
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { upload, run, download, firstUrl, ROOT } from './lux3d.mjs';

const name = process.argv[2];
const want = new Set(process.argv.slice(3));
const work = join(ROOT, 'pipeline', 'work', name);
const out = join(ROOT, 'assets', 'fighters', name);
const raw = join(work, 'raw');
mkdirSync(raw, { recursive: true });
mkdirSync(work, { recursive: true });
mkdirSync(out, { recursive: true });
const stateFile = join(work, 'state.json');
const S = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};
const save = () => writeFileSync(stateFile, JSON.stringify(S, null, 2));
const doodle = join(ROOT, 'doodles', `${name}.png`);
const cfg = JSON.parse(readFileSync(join(ROOT, 'doodles', 'fighters.json'), 'utf8'))[name] || {};

const TOY_PROMPT = cfg.toyPrompt ||
  'Turn this crayon doodle into a cute collectible 3D vinyl toy figure with the same character, colours and proportions. ' +
  'Full body, standing in a T-pose with both arms straight out to the sides, legs apart, front view, plain white background, soft studio light.';
// Order matters: the combined GLB names clips animation_1..10 in this order.
const ANIMS = cfg.anims || ['Idle_Loop', 'Crouch_Idle_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Punch_Cross', 'Punch_Jab', 'Roll', 'Swim_Fwd_Loop', 'Dance_Loop', 'Yes'];

if (!want.size || want.has('upload')) {
  S.doodleUrl = await upload(doodle); save();
}
if (!want.size || want.has('toy')) {
  const r = await run('multimodal-to-image', { img: S.doodleUrl, prompt: TOY_PROMPT }, `${name}:toy`);
  S.toyUrl = firstUrl(r.outputs); S.toyTask = r.taskId; save();
  await download(S.toyUrl, join(out, 'toy.png'));
}
if (!want.size || want.has('model')) {
  const r = await run('img-to-3d', { img: S.toyUrl, version: 'G1', faceCount: 60000, outputFormat: ['zip', 'glb'] }, `${name}:model`);
  S.modelOutputs = r.outputs; S.modelTask = r.taskId;
  S.glbUrl = firstUrl(r.outputs, '.glb'); S.zipUrl = firstUrl(r.outputs, '.zip'); save();
  await download(S.glbUrl, join(raw, 'model.glb'));
}
if (!want.size || want.has('rig')) {
  const r = await run('rig', { modelUrl: S.glbUrl }, `${name}:rig`);
  S.rigOutputs = r.outputs; S.rigTask = r.taskId;
  S.rigUrl = firstUrl(r.outputs); save();
  if (!S.rigUrl) throw new Error('rig gave no URL: ' + JSON.stringify(r.outputs));
  await download(S.rigUrl, join(raw, 'rigged.glb'));
}
if (!want.size || want.has('anims')) {
  const r = await run('retarget', { rigModelUrl: S.rigUrl, animationIds: ANIMS, animationOutputMode: 'combined', outFormat: 'glb', animateInPlace: true }, `${name}:anims`);
  S.animOutputs = r.outputs; S.animTask = r.taskId; save();
  const parsed = JSON.parse(r.outputs[0]);
  S.animParsed = parsed; save();
  const urls = [...new Set(JSON.stringify(parsed).match(/https?:[^"\\]+/g) || [])];
  S.animNames = ANIMS; save();
  await download(urls[0], join(raw, 'animated.glb'));
}
if (!want.size || want.has('optimize')) {
  // 1024px WebP textures, resampled keyframes, meshopt compression: ~15 MB -> <1 MB
  const { execSync } = await import('node:child_process');
  const sh = (c) => execSync(c, { cwd: ROOT, stdio: 'inherit' });
  const a = join(raw, 'animated.glb'), t1 = join(raw, 'o1.glb'), t2 = join(raw, 'o2.glb'), t3 = join(raw, 'o3.glb'), t4 = join(raw, 'o4.glb');
  sh(`npx gltf-transform resize "${a}" "${t1}" --width 1024 --height 1024`);
  sh(`npx gltf-transform webp "${t1}" "${t2}" --quality 85`);
  sh(`npx gltf-transform prune "${t2}" "${t3}"`);
  sh(`npx gltf-transform resample "${t3}" "${t4}"`);
  sh(`npx gltf-transform meshopt "${t4}" "${join(out, 'fighter.glb')}"`);
}
console.log(JSON.stringify(S, null, 2));
