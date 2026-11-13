// Prints the shared Lux3D counts (src/stats.js) for captions and notes.
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../src/stats.js', import.meta.url), 'utf8');
const { lux3dStats } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
const j = (f) => JSON.parse(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'));
let credits = null; try { credits = j('data/credits.json'); } catch { /* not checked yet */ }
console.log(JSON.stringify(lux3dStats(j('data/pipeline.json'), j('data/fighters.json'), j('data/forge-demo.json'), credits)));
