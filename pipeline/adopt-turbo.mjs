// After comparing G1 and G1-Turbo for every fighter (pipeline/turbo-test.mjs), adopt the Turbo result for one fighter:
// keeps the G1 run under state.g1, points the state at the Turbo tasks, and swaps the raw animated GLB.
// Usage: node pipeline/adopt-turbo.mjs <id>   then   node pipeline/fighter.mjs <id> optimize print
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lux3d.mjs';

const id = process.argv[2];
const work = join(ROOT, 'pipeline', 'work', id), turbo = join(ROOT, 'pipeline', 'work', 'turbo');
const S = JSON.parse(readFileSync(join(work, 'state.json'), 'utf8'));
const T = JSON.parse(readFileSync(join(turbo, `${id}.json`), 'utf8'));
const log = readFileSync(join(ROOT, 'pipeline', 'log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const task = (step) => log.filter((e) => e.label === `turbo-${id}:${step}` && e.status === 3).pop()?.taskId;
if (S.version === 'G1-Turbo') { console.log('already adopted'); process.exit(0); }
S.g1 = { modelTask: S.modelTask, rigTask: S.rigTask, animTask: S.animTask, printTask: S.printTask, glbUrl: S.glbUrl };
Object.assign(S, { version: 'G1-Turbo', modelTask: task('model'), rigTask: task('rig'), animTask: task('anims'), glbUrl: T.glbUrl, rigUrl: T.rigUrl, modelOutputs: T.modelOutputs, animOutputs: T.animOutputs });
const raw = join(work, 'raw');
if (!existsSync(join(raw, 'animated-g1.glb'))) copyFileSync(join(raw, 'animated.glb'), join(raw, 'animated-g1.glb'));
if (!existsSync(join(raw, 'model-g1.glb'))) copyFileSync(join(raw, 'model.glb'), join(raw, 'model-g1.glb'));
copyFileSync(join(turbo, `${id}-animated.glb`), join(raw, 'animated.glb'));
copyFileSync(join(turbo, `${id}-model.glb`), join(raw, 'model.glb'));
writeFileSync(join(work, 'state.json'), JSON.stringify(S, null, 2));
console.log(id, 'now uses G1-Turbo tasks', S.modelTask, S.rigTask, S.animTask);
