// Scripted tour of lab.html for the demo video (real page, real clicks).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  async function glide(y, ms) { const y0 = scrollY, t0 = performance.now(); for (;;) { const k = Math.min(1, (performance.now() - t0) / ms); window.scrollTo(0, y0 + (y - y0) * ease(k)); if (k >= 1) break; await sleep(16); } }
  const top = (el, off) => el.getBoundingClientRect().top + scrollY - off;
  for (let i = 0; i < 80 && !document.querySelector('.row .moves .btn'); i++) await sleep(200);
  await sleep(1400);
  const row = document.querySelector('.row');
  await glide(top(row, 70), 1300);
  const b = (sel) => row.querySelector(sel);
  await sleep(500); b('[data-m=wire]').click();
  await sleep(1100); b('[data-m=skel]').click();
  await sleep(1100); [...row.querySelectorAll('.moves .btn')].find((x) => /Dance/.test(x.textContent))?.click(); b('[data-m=tex]').click();
  await sleep(1300);
  await glide(top(document.querySelector('#traps'), 110), 1400);
  await sleep(2200);
  await glide(top(document.querySelector('.iters'), 110), 1100);
  await sleep(1300);
  await glide(top(document.querySelector('#tasks'), 160), 1200);
  await sleep(1600);
  window.tourDone = true;
})();
