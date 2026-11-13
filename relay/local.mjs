// Local forge relay for development and for running the forge with your own key:
//   AHOLO_KEY=... node relay/local.mjs        (or put the key in Credentials/aholo-key.txt)
// Then open the game with ?relay=http://localhost:8787
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRelay } from './core.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const keyFile = join(ROOT, 'Credentials', 'aholo-key.txt');
const key = (process.env.AHOLO_KEY || (existsSync(keyFile) ? readFileSync(keyFile, 'utf8') : '')).trim();
const PORT = +(process.env.PORT || 8787);

// tiny file-backed key-value store
const dir = join(ROOT, 'pipeline', 'work'); mkdirSync(dir, { recursive: true });
const file = join(dir, 'relay-state.json');
const mem = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
const store = {
  async get(k) { const v = mem[k]; if (!v) return null; if (v.exp && v.exp < Date.now()) { delete mem[k]; return null; } return v.v; },
  async put(k, v, ttl) { mem[k] = { v, exp: ttl ? Date.now() + ttl * 1000 : 0 }; writeFileSync(file, JSON.stringify(mem)); },
};
const relay = createRelay({
  key, store,
  md5: async (bytes) => createHash('md5').update(bytes).digest('hex'),
  limits: { perDay: +(process.env.PER_DAY || 50), total: +(process.env.TOTAL || 500), perVisitor: +(process.env.PER_VISITOR || 50) },
  judgeToken: process.env.JUDGE_TOKEN || '',
  log: (o) => console.log(new Date().toISOString(), JSON.stringify(o)),
});

http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const request = new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : Buffer.concat(chunks) });
  const r = await relay.handle(request, { visitor: 'local' });
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT, () => console.log(`forge relay on http://localhost:${PORT} (${key ? 'key loaded' : 'no key: send x-aholo-key'})`));
