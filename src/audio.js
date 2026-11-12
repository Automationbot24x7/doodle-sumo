// All sound is synthesised live with WebAudio (no audio files, nothing to license).
let ctx, master, musicGain, sfxGain, muted = false, musicTimer = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ctx.destination);
  sfxGain = ctx.createGain(); sfxGain.gain.value = 0.8; sfxGain.connect(master);
  musicGain = ctx.createGain(); musicGain.gain.value = 0.22; musicGain.connect(master);
}
export function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05); }
export const isMuted = () => muted;

function noise(dur) {
  const b = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(); s.buffer = b; return s;
}
function env(g, t, a, peak, rel) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + rel);
}
function tone(type, f0, f1, dur, vol = 0.4, when = 0, dest = sfxGain) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); env(g, t, 0.005, vol, dur);
  o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
}
function burst(dur, freq, q, vol, when = 0, type = 'bandpass') {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const n = noise(dur + 0.05); const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); env(g, t, 0.003, vol, dur);
  n.connect(f).connect(g).connect(sfxGain); n.start(t); n.stop(t + dur + 0.05);
}

export const sfx = {
  slap(power = 1) { burst(0.09, 1800, 0.8, 0.7 * power); tone('triangle', 260, 90, 0.12, 0.35 * power); },
  bigSlap() { burst(0.16, 1200, 0.6, 0.9); tone('square', 180, 50, 0.25, 0.3); tone('sine', 90, 40, 0.3, 0.5); },
  whoosh() { if (!ctx) return; const t = ctx.currentTime; const n = noise(0.3); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.25); const g = ctx.createGain(); env(g, t, 0.02, 0.35, 0.25); n.connect(f).connect(g).connect(sfxGain); n.start(t); n.stop(t + 0.35); },
  bump() { tone('sine', 200, 120, 0.1, 0.35); },
  boing() { tone('sine', 220, 660, 0.18, 0.4); tone('sine', 660, 330, 0.25, 0.25, 0.15); },
  scream() { tone('sawtooth', 900, 300, 0.9, 0.12); tone('triangle', 1200, 380, 0.9, 0.1); },
  thud() { tone('sine', 120, 40, 0.35, 0.6); burst(0.2, 300, 0.7, 0.5); },
  clack() { burst(0.05, 3500, 2, 0.8); tone('square', 900, 300, 0.06, 0.25); burst(0.12, 600, 1, 0.6, 0.02); },
  whirr() { tone('sawtooth', 70, 110, 1.2, 0.08); burst(1.1, 900, 0.5, 0.18); },
  charge(level) { tone('triangle', 300 + level * 500, 320 + level * 520, 0.06, 0.08); },
  tick() { tone('square', 1400, 1400, 0.04, 0.12); },
  go() { tone('square', 523, 523, 0.12, 0.25); tone('square', 784, 784, 0.25, 0.25, 0.12); },
  out() { tone('triangle', 500, 120, 0.5, 0.35); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.22, 0.3, i * 0.11)); burst(1.2, 3000, 0.4, 0.15, 0.3); },
  ui() { tone('sine', 880, 1100, 0.06, 0.2); },
  // jack-in-the-box wind-up tune (plays during the 2 s warning)
  musicBox() { [784, 659, 698, 587, 659, 523, 587, 494, 523, 392].forEach((f, i) => tone('sine', f, f, 0.16, 0.16, i * 0.19)); },
};

// Light taiko-and-pluck loop in a pentatonic scale.
export function startMusic() {
  if (!ctx || musicTimer) return;
  const scale = [0, 3, 5, 7, 10, 12, 15];
  const base = 196; let step = 0; const bpm = 132; const dt = 60 / bpm / 2;
  let next = ctx.currentTime + 0.05;
  const pattern = [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0];
  musicTimer = setInterval(() => {
    while (next < ctx.currentTime + 0.2) {
      const when = next - ctx.currentTime;
      if (pattern[step % 16]) tone('sine', 110, 50, 0.22, 0.6, when, musicGain);
      if (step % 4 === 2) { const t = ctx.currentTime + when; const n = noise(0.05); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000; const g = ctx.createGain(); env(g, t, 0.002, 0.25, 0.05); n.connect(f).connect(g).connect(musicGain); n.start(t); n.stop(t + 0.08); }
      if (step % 2 === 0 && Math.random() < 0.55) {
        const n = scale[Math.floor(Math.random() * scale.length)];
        tone('triangle', base * Math.pow(2, n / 12) * 2, base * Math.pow(2, n / 12) * 2 * 0.995, 0.18, 0.18, when, musicGain);
      }
      step++; next += dt;
    }
  }, 50);
}
export function stopMusic() { clearInterval(musicTimer); musicTimer = null; }
