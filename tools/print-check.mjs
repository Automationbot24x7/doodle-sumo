// Print-readiness check for the Lux3D STL exports: triangle count, watertightness (every edge shared by exactly
// two triangles), volume, and the size / plastic needed when printed 80 mm tall. Writes data/print.json.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(ROOT, 'assets', 'print');
const TALL = 80;           // mm
const PLA = 1.24;          // g per cm3

function check(file) {
  const buf = readFileSync(file);
  if (buf.subarray(0, 5).toString() === 'solid' && buf.readUInt32LE(80) * 50 + 84 !== buf.length) throw new Error('ASCII STL not supported');
  const n = buf.readUInt32LE(80);
  const ids = new Map(); const tri = new Uint32Array(n * 3); const pos = [];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let vol = 0;
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12; const v = [];
    for (let k = 0; k < 3; k++) {
      const x = buf.readFloatLE(o + k * 12), y = buf.readFloatLE(o + k * 12 + 4), z = buf.readFloatLE(o + k * 12 + 8);
      const key = `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`;
      let id = ids.get(key); if (id === undefined) { id = pos.length; ids.set(key, id); pos.push([x, y, z]); }
      tri[i * 3 + k] = id; v.push([x, y, z]);
      min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y); min[2] = Math.min(min[2], z);
      max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y); max[2] = Math.max(max[2], z);
    }
    const [a, b, c] = v;
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  const edges = new Map();
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
    const a = tri[i * 3 + k], b = tri[i * 3 + ((k + 1) % 3)], key = a < b ? a * 4294967296 + b : b * 4294967296 + a;
    edges.set(key, (edges.get(key) || 0) + 1);
  }
  let open = 0, multi = 0; for (const c of edges.values()) { if (c === 1) open++; else if (c > 2) multi++; }
  const size = max.map((m, i) => m - min[i]); const tallAxis = size.indexOf(Math.max(...size));
  const k = TALL / size[tallAxis];
  const mm = size.map((s) => +(s * k).toFixed(1));
  const cm3 = Math.abs(vol) * k * k * k / 1000;
  return { triangles: n, vertices: pos.length, watertight: open === 0 && multi === 0, openEdges: open, nonManifoldEdges: multi, upAxis: 'xyz'[tallAxis], sizeMm: mm, volumeCm3: +cm3.toFixed(1), plaGrams: +(cm3 * PLA).toFixed(0) };
}

const out = {};
for (const f of readdirSync(dir).filter((f) => f.endsWith('.stl'))) {
  const id = f.replace('.stl', '');
  out[id] = check(join(dir, f));
  console.log(id, JSON.stringify(out[id]));
}
writeFileSync(join(ROOT, 'data', 'print.json'), JSON.stringify({ tallMm: TALL, plaDensity: PLA, fighters: out }, null, 2));
