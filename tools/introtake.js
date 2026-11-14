// Video intro take, filmed in the real game with the real Lux3D files of the "Mittens" forge run (no UI):
// A) the crayon doodle on the desk paper, B) the 3D toy pops up out of it (skeleton flash, cheer), C) it dances for the title.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const d = window.__doodle, S = d.state;
  window.__marks = []; const mark = (n) => window.__marks.push([n, +(performance.now() / 1000).toFixed(2)]);
  const css = document.createElement('style'); css.textContent = '.screen,.pill,.toast,#loading{display:none!important}'; document.head.appendChild(css);
  S.attract = false; S.phase = 'forge'; S.fighters.forEach((f) => f.group.parent?.remove(f.group)); S.fighters = []; S.bots = [];
  const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k), ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  let cam = { p: [-0.8, 4.4, 3.5], t: [-0.8, 0, 1.15] }; window.__introCam = cam;
  async function move(to, ms) { const from = { p: [...cam.p], t: [...cam.t] }, t0 = performance.now(); for (;;) { const k = Math.min(1, (performance.now() - t0) / ms), e = ease(k); cam.p = lerp(from.p, to.p, e); cam.t = lerp(from.t, to.t, e); window.__introCam = cam; if (k >= 1) break; await sleep(16); } }
  d.introSetup();
  const def = await d.loadDemoFighter('mittens-demo', '/pipeline/work/forge/mittens/fighter-raw.glb', 'Mittens');
  d.fstage.group.visible = true;
  await d.fstage.show('doodle', '/assets/forge-demo/mittens/doodle.png');
  await sleep(1200);
  // A: the doodle, slow push in
  mark('A'); await move({ p: [-0.8, 3.75, 3.05], t: [-0.8, 0, 1.15] }, 1700);
  // B: the toy pops up out of the doodle and cheers
  mark('B');
  d.fstage.show('ready', def, { at: [-0.8, 0, 0.6], skel: 0.9, facing: 0, scale: 1.2, show: [[0, 'idle'], [0.9, 'cheer'], [2.3, 'dance']] });
  await move({ p: [-0.55, 1.75, 5.5], t: [-0.8, 1.0, 1.1] }, 900);
  await sleep(1300);
  // C: title, slow orbit while it dances
  mark('C');
  const t0 = performance.now();
  while (performance.now() - t0 < 3200) { const k = (performance.now() - t0) / 3200, a = 0.1 - 0.4 * k, R = 5.4 - 0.5 * k; cam = { p: [-0.8 + Math.sin(a) * R, 1.65 - 0.15 * k, 1.1 + Math.cos(a) * R], t: [-0.8, 1.05, 1.1] }; window.__introCam = cam; await sleep(16); }
  mark('end'); window.__captureStop = true;
})();
