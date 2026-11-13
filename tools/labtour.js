// Scripted tour of lab.html for the demo video (real page, real clicks and slider drags). Record with --zoom=2.
// Three beats: a trap's joint slider, a fighter's skeleton, the task log.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  async function glide(y, ms) { const y0 = scrollY, t0 = performance.now(); for (;;) { const k = Math.min(1, (performance.now() - t0) / ms); window.scrollTo(0, y0 + (y - y0) * ease(k)); if (k >= 1) break; await sleep(16); } }
  const top = (el, off) => el.getBoundingClientRect().top + scrollY - off;
  async function drag(input, from, to, ms) { const t0 = performance.now(); for (;;) { const k = Math.min(1, (performance.now() - t0) / ms); input.value = from + (to - from) * ease(k); input.dispatchEvent(new Event('input', { bubbles: true })); if (k >= 1) break; await sleep(16); } }
  window.__marks = []; const mark = (n) => window.__marks.push([n, +(performance.now() / 1000).toFixed(2)]);
  for (let i = 0; i < 120 && !(document.querySelectorAll('.row .moves .btn').length >= 10 && document.querySelectorAll('.trap input[type=range]').length >= 4); i++) await sleep(200);
  await sleep(800);
  // 1) the stapler's hinge: a joint Lux3D articulation created
  const trap = document.querySelector('.trap'); window.scrollTo(0, top(trap, 20)); await sleep(700); mark('trap');
  const sl = trap.querySelector('input[type=range]');
  await drag(sl, +sl.min, +sl.max, 900); await drag(sl, +sl.max, +sl.min, 600); await drag(sl, +sl.min, +sl.max, 700);
  await sleep(500);
  // 2) a fighter's Lux3D skeleton, facing the camera
  const row = document.querySelector('.row'); window.scrollTo(0, top(row, 20)); await sleep(400); mark('skeleton');
  row.querySelector('[data-m=skel]').click(); await sleep(1600);
  [...row.querySelectorAll('.moves .btn')].find((x) => /Shove/.test(x.textContent))?.click(); await sleep(1100);
  row.querySelector('[data-m=tex]').click(); [...row.querySelectorAll('.moves .btn')].find((x) => /Dance/.test(x.textContent))?.click(); await sleep(900);
  // 3) the receipts
  window.scrollTo(0, top(document.querySelector('#tasks'), 90)); mark('tasks'); await sleep(2600);
  mark('end'); window.__captureStop = true;
})();
