// Cloudflare Worker wrapper for the forge relay (free plan). Secrets/bindings:
//   AHOLO_KEY  (secret)   shared Aholo key used for the capped free forges
//   FORGE_KV   (KV)       job state and daily counters
//   PER_DAY, TOTAL, PER_VISITOR, ORIGINS (vars, optional)
import { createRelay } from './core.mjs';

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export default {
  async fetch(req, env) {
    const store = {
      get: (k) => env.FORGE_KV.get(k, 'json'),
      put: (k, v, ttl) => env.FORGE_KV.put(k, JSON.stringify(v), ttl ? { expirationTtl: Math.max(60, ttl) } : undefined),
    };
    const ip = req.headers.get('cf-connecting-ip') || 'unknown';
    const visitor = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + (env.SALT || 'doodle')))).slice(0, 16);
    const relay = createRelay({
      key: env.AHOLO_KEY || '', store,
      md5: async (bytes) => hex(await crypto.subtle.digest('MD5', bytes)),
      limits: { perDay: +(env.PER_DAY || 10), total: +(env.TOTAL || 20), perVisitor: +(env.PER_VISITOR || 2), judgePerDay: +(env.JUDGE_PER_DAY || 20), judgeTotal: +(env.JUDGE_TOTAL || 30), judgePerVisitor: +(env.JUDGE_PER_VISITOR || 6) },
      judgeToken: env.JUDGE_TOKEN || '',
      origins: (env.ORIGINS || 'https://automationbot24x7.github.io').split(','),
    });
    return relay.handle(req, { visitor });
  },
};
