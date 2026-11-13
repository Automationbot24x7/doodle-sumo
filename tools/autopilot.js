// Recording autopilot: plays Player 1 by pressing the real keys (WASD, J hold, K) using the game's bot brain.
(() => {
  const D = window.__doodle; const down = new Set();
  const key = (code, on) => { if (on === down.has(code)) return; on ? down.add(code) : down.delete(code); window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code, key: code })); };
  let brain = null, last = performance.now();
  setInterval(() => {
    const st = D.state; const me = st.fighters.find((f) => f.isPlayer);
    if (!me || st.phase !== 'fight' || !me.alive || me.falling) { ['KeyW','KeyA','KeyS','KeyD','KeyJ'].forEach((k) => key(k, false)); brain = null; return; }
    if (!brain || brain.f !== me) brain = new D.Bot(me, 1.4);
    const now = performance.now(); const inp = brain.input(st.fighters, D.hazardsList, (now - last) / 1000, D.pickupsList); last = now;
    key('KeyD', inp.x > 0.3); key('KeyA', inp.x < -0.3); key('KeyS', inp.z > 0.3); key('KeyW', inp.z < -0.3);
    key('KeyJ', !!(inp.shoveDown || inp.shoveHeld));
    if (inp.dash) { key('KeyK', true); setTimeout(() => key('KeyK', false), 60); }
    window.__ap = { x: +inp.x.toFixed(2), z: +inp.z.toFixed(2), sh: !!inp.shoveHeld, down: [...down].join('') };
  }, 50);
})();
