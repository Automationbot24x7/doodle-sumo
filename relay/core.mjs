// Doodle Sumo forge relay: lets the browser run the Lux3D "doodle -> toy -> 3D -> skeleton -> moves" chain
// without ever seeing an API key. Runtime-agnostic (Web Request/Response): used by relay/local.mjs (Node)
// and relay/worker.mjs (Cloudflare Workers). State lives in a tiny key-value store.
//
//   GET  /status            -> { open, leftToday, leftForYou, minutes }
//   POST /forge             -> { id, ... }   body: { image: <png/jpeg data URL>, name }
//   GET  /forge/:id         -> { step, state, outputs, tasks, secs, error? }   (poll; advances the chain)
//   POST /forge/:id/print   -> { stl, mf }   Lux3D export of the finished model for 3D printing
//
// A visitor may send their own Aholo key in the `x-aholo-key` header; then no quota applies and the shared key is not used.

const API = 'https://api.aholo.ai/global';
const STEPS = ['toy', 'model', 'rig', 'anims'];
export const ANIMS = ['Idle_Loop', 'Crouch_Idle_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Punch_Cross', 'Punch_Jab', 'Roll', 'Swim_Fwd_Loop', 'Dance_Loop', 'Yes'];
const ETA = { toy: 40, model: 75, rig: 75, anims: 20 };   // typical seconds per step (G1-Turbo)

const TOY_PROMPT =
  'Turn this hand-drawn doodle into a cute collectible 3D vinyl toy figure of the same character, keeping its colours, face and personality. ' +
  'Make it clearly humanoid: one head, a body, two separate arms held straight out to the sides in a T-pose, and two separate legs with feet, standing upright. ' +
  'Nothing may touch or overlap the arms. Full body, front view, centred, plain white background, soft studio light.';
const TOY_PROMPT_STRICT = TOY_PROMPT +
  ' Use simple smooth rounded shapes. The arms must be long, bare and clearly separated from the body and the head. No accessories, props, tail, cape or wings.';

const CREATE = {
  toy: '/lux3d/v1/generate/multimodal-to-image/task/create',
  model: '/lux3d/v1/generate/img-to-3d/task/create',
  rig: '/lux3d/v1/animations/rig/task/create',
  anims: '/lux3d/v1/animations/retarget/task/create',
  print: '/lux3d/v1/multi-format-export/task/create',
};

const json = (obj, status = 200, cors = {}) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors } });
const day = (t) => new Date(t).toISOString().slice(0, 10);
// every http(s) URL inside a task's outputs (some outputs are JSON strings that carry URLs)
function urlsIn(v, out = []) {
  if (typeof v === 'string') {
    const t = v.trim();
    if (/^https?:\/\//.test(t)) out.push(t);
    else if (t[0] === '{' || t[0] === '[') { try { urlsIn(JSON.parse(t), out); } catch { /* not JSON */ } }
  } else if (Array.isArray(v)) v.forEach((x) => urlsIn(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => urlsIn(x, out));
  return out;
}

export function createRelay({ key, store, md5, limits = {}, origins = [], now = () => Date.now(), log = () => {} }) {
  const L = { perDay: 10, total: 40, perVisitor: 2, maxImage: 600_000, ...limits };

  async function aholo(k, method, path, body) {
    const res = await fetch(API + path, { method, headers: { Authorization: k, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { c: 'HTTP_' + res.status, m: text.slice(0, 200) }; }
  }

  // data URL -> public URL through the Aholo asset service
  async function upload(k, dataUrl) {
    const m = /^data:(image\/(png|jpeg));base64,(.+)$/s.exec(dataUrl || '');
    if (!m) throw fail('BAD_IMAGE', 'Send the drawing as a PNG or JPEG data URL.');
    const bin = Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0));
    if (bin.length > L.maxImage) throw fail('BAD_IMAGE', 'That drawing is too large.');
    const tok = await aholo(k, 'GET', '/asset/v1/token');
    const { ousToken, globalDomain } = tok.d ?? tok;
    if (!ousToken) throw fail(tok.c === '-1' || /appKey|auth/i.test(tok.m || '') ? 'BAD_KEY' : 'UPLOAD', 'Aholo did not accept the key.');
    const form = new FormData();
    form.append('md5', await md5(bin));
    form.append('file', new Blob([bin], { type: m[1] }), `doodle.${m[2] === 'jpeg' ? 'jpg' : 'png'}`);
    const up = await (await fetch(globalDomain + '/ous/api/v2/single/upload', { method: 'POST', headers: { 'ous-token-v2': ousToken }, body: form })).json();
    if (String(up.c) !== '0') throw fail('UPLOAD', 'The drawing could not be uploaded.');
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const st = await (await fetch(`${globalDomain}/ous/api/v2/upload/status?taskId=${encodeURIComponent(up.d?.taskId)}`, { headers: { 'ous-token-v2': ousToken } })).json();
      if (st.d?.url) return st.d.url;
    }
    throw fail('UPLOAD', 'The drawing upload timed out.');
  }

  const bodyFor = (rec, step) => ({
    toy: { img: rec.outputs.doodle, prompt: rec.tries ? TOY_PROMPT_STRICT : TOY_PROMPT },
    model: { img: rec.outputs.toy, version: 'G1-Turbo', faceCount: 50000, outputFormat: ['glb'] },
    rig: { modelUrl: rec.outputs.model },
    anims: { rigModelUrl: rec.outputs.rig, animationIds: ANIMS, animationOutputMode: 'combined', outFormat: 'glb', animateInPlace: true },
    print: { modelUrl: rec.outputs.model, outputFormat: ['stl', '3mf'] },
  }[step]);

  // Try to create the task for rec.step. Returns false when Lux3D is busy with another task (retry on the next poll).
  async function start(k, rec, step = rec.step) {
    const r = await aholo(k, 'POST', CREATE[step], bodyFor(rec, step));
    if (r.c === 'GENERATION_CONCURRENCY_LIMIT_EXCEEDED') return false;
    if (String(r.c) !== '0') throw fail(/credit|11003/i.test(`${r.c} ${r.m}`) ? 'NO_CREDITS' : /appKey|auth|401/i.test(`${r.c} ${r.m}`) ? 'BAD_KEY' : 'CREATE', r.m || `Lux3D refused the ${step} step.`);
    if (step === 'print') rec.printTask = r.d; else { rec.taskId = r.d; rec.tasks[step] = r.d; rec.stepAt = now(); }
    return true;
  }

  function fail(code, message) { const e = new Error(message); e.code = code; return e; }
  const view = (rec) => {
    const i = STEPS.indexOf(rec.step);
    const left = rec.state === 'done' ? 0 : STEPS.slice(Math.max(0, i)).reduce((a, s) => a + ETA[s], 0) - (rec.taskId ? Math.min(ETA[rec.step] - 5, (now() - rec.stepAt) / 1000) : 0);
    return { id: rec.id, step: rec.step, state: rec.state, outputs: rec.outputs, tasks: rec.tasks, secs: rec.secs, tries: rec.tries, eta: Math.max(5, Math.round(left)), error: rec.error, anims: ANIMS };
  };

  async function quota(visitor) {
    const d = day(now());
    const [today, total, mine] = await Promise.all([store.get(`q:${d}`), store.get('q:total'), store.get(`v:${d}:${visitor}`)]);
    const leftToday = Math.max(0, Math.min(L.perDay - (today?.n || 0), L.total - (total?.n || 0)));
    return { d, today: today?.n || 0, total: total?.n || 0, mine: mine?.n || 0, leftToday, leftForYou: Math.max(0, Math.min(leftToday, L.perVisitor - (mine?.n || 0))) };
  }

  async function poll(k, rec) {
    if (rec.state === 'done' || rec.state === 'failed') return rec;
    if (!rec.taskId) {                       // waiting for a free Lux3D slot
      rec.state = (await start(k, rec)) ? 'running' : 'queued';
      return rec;
    }
    const q = await aholo(k, 'GET', `/lux3d/v1/generate/task/get?taskid=${rec.taskId}`);
    const d = q.d || {};
    if (d.status === 3) {
      const outs = (d.outputs || []).map((o) => o.content);
      const urls = urlsIn(outs);
      const pickUrl = { toy: urls[0], model: urls.find((u) => /\.glb(\?|$)/i.test(u)) || urls[0], rig: urls[0], anims: urls.find((u) => /\.glb(\?|$)/i.test(u)) || urls[0] }[rec.step];
      if (!pickUrl) { rec.state = 'failed'; rec.error = { code: 'EMPTY', message: `Lux3D finished the ${rec.step} step without a file.` }; return rec; }
      rec.outputs[rec.step === 'anims' ? 'fighter' : rec.step] = pickUrl;
      rec.secs[rec.step] = Math.round((now() - rec.stepAt) / 1000);
      const next = STEPS[STEPS.indexOf(rec.step) + 1];
      if (!next) { rec.step = 'done'; rec.state = 'done'; rec.taskId = null; return rec; }
      rec.step = next; rec.taskId = null;
      rec.state = (await start(k, rec)) ? 'running' : 'queued';
    } else if (d.status === 4 || d.status === 6) {
      const why = JSON.stringify(d).slice(0, 400);
      const rigFail = rec.step === 'rig' || /RIG_ELIGIBILITY/i.test(why);
      if (rigFail && !rec.tries) {            // one automatic second try with a stricter toy prompt
        rec.tries = 1; rec.step = 'toy'; rec.taskId = null; rec.outputs = { doodle: rec.outputs.doodle };
        rec.state = (await start(k, rec)) ? 'running' : 'queued';
      } else {
        rec.state = 'failed';
        rec.error = rigFail
          ? { code: 'RIG', message: 'Lux3D could not find two arms and two legs to rig. Draw a simple character with its arms out and legs apart.' }
          : { code: 'TASK', message: `Lux3D could not finish the ${rec.step} step.`, detail: why.slice(0, 160) };
      }
    } else if (now() - rec.stepAt > 15 * 60e3) {
      rec.state = 'failed'; rec.error = { code: 'TIMEOUT', message: `Lux3D took too long on the ${rec.step} step.` };
    } else if (rec.state !== 'running') rec.state = 'running';
    return rec;
  }

  async function handle(req, ctx = {}) {
    const url = new URL(req.url);
    const origin = req.headers.get('origin') || '';
    const okOrigin = !origins.length || origins.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const cors = { 'access-control-allow-origin': okOrigin && origin ? origin : origins[0] || '*', 'access-control-allow-headers': 'content-type,x-aholo-key', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-max-age': '86400', vary: 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const own = (req.headers.get('x-aholo-key') || '').trim();
    const k = own || key;
    const visitor = ctx.visitor || 'local';
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (req.method === 'GET' && (path === '/status' || path === '/')) {
        const q = await quota(visitor);
        return json({ ok: true, open: !!key && q.leftToday > 0, leftToday: key ? q.leftToday : 0, leftForYou: key ? q.leftForYou : 0, minutes: 3.5, ownKey: !!own }, 200, cors);
      }
      if (req.method === 'POST' && path === '/forge') {
        if (!okOrigin) return json({ error: { code: 'ORIGIN', message: 'This forge only works from the Doodle Sumo site.' } }, 403, cors);
        if (!k) return json({ error: { code: 'CLOSED', message: 'The shared forge is closed. Use your own Aholo key.' } }, 503, cors);
        const body = await req.json().catch(() => ({}));
        let q;
        if (!own) {
          q = await quota(visitor);
          if (q.leftToday <= 0) return json({ error: { code: 'QUOTA', message: 'Today\'s free forges are used up. Come back tomorrow, or use your own Aholo key.' } }, 429, cors);
          if (q.leftForYou <= 0) return json({ error: { code: 'QUOTA_YOU', message: 'You have used your free forges for today. Use your own Aholo key to keep going.' } }, 429, cors);
        }
        const id = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');
        const rec = { id, name: String(body.name || '').slice(0, 24), own: !!own, step: 'toy', state: 'queued', taskId: null, tries: 0, outputs: {}, tasks: {}, secs: {}, createdAt: now(), stepAt: now() };
        rec.outputs.doodle = await upload(k, body.image);
        if (!own) {                          // count the forge before any credits are spent
          await Promise.all([store.put(`q:${q.d}`, { n: q.today + 1 }, 3 * 86400), store.put('q:total', { n: q.total + 1 }), store.put(`v:${q.d}:${visitor}`, { n: q.mine + 1 }, 3 * 86400)]);
        }
        rec.state = (await start(k, rec)) ? 'running' : 'queued';
        await store.put(`job:${id}`, rec, 86400);
        log({ ev: 'forge', id, own: !!own, visitor });
        return json(view(rec), 200, cors);
      }
      const m = /^\/forge\/([0-9a-f]{24})(\/print)?$/.exec(path);
      if (m) {
        const rec = await store.get(`job:${m[1]}`);
        if (!rec) return json({ error: { code: 'GONE', message: 'That forge job is no longer here.' } }, 404, cors);
        if (rec.own && !own) return json({ error: { code: 'KEY', message: 'Send your Aholo key again to continue this forge.' } }, 401, cors);
        if (m[2]) {
          if (req.method !== 'POST') return json({ error: { code: 'METHOD' } }, 405, cors);
          if (!rec.outputs.model) return json({ error: { code: 'EARLY', message: 'The model is not ready yet.' } }, 409, cors);
          if (!rec.print) {
            if (!rec.printTask && !(await start(k, rec, 'print'))) { return json({ state: 'queued' }, 200, cors); }
            const q = await aholo(k, 'GET', `/lux3d/v1/generate/task/get?taskid=${rec.printTask}`);
            if (q.d?.status === 3) { const u = urlsIn((q.d.outputs || []).map((o) => o.content)); rec.print = { stl: u.find((x) => /\.stl(\?|$)/i.test(x)), mf: u.find((x) => /\.3mf(\?|$)/i.test(x)) }; }
            else if (q.d?.status === 4 || q.d?.status === 6) { rec.printTask = null; await store.put(`job:${rec.id}`, rec, 86400); return json({ state: 'failed' }, 200, cors); }
            await store.put(`job:${rec.id}`, rec, 86400);
          }
          return json(rec.print ? { state: 'done', ...rec.print } : { state: 'running' }, 200, cors);
        }
        const before = `${rec.step}|${rec.state}|${rec.taskId}`;
        await poll(k, rec);
        if (`${rec.step}|${rec.state}|${rec.taskId}` !== before) await store.put(`job:${rec.id}`, rec, 86400);
        return json(view(rec), 200, cors);
      }
      return json({ error: { code: 'NOT_FOUND' } }, 404, cors);
    } catch (e) {
      log({ ev: 'error', code: e.code, message: e.message });
      return json({ error: { code: e.code || 'RELAY', message: e.code ? e.message : 'The forge relay hit a problem. Try again.' } }, e.code === 'BAD_IMAGE' ? 400 : 502, cors);
    }
  }
  return { handle };
}
