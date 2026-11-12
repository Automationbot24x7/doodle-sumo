// Scripted tour of lab.html for the demo video (real page, real clicks).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  async function scrollTo(y, ms) { const y0 = scrollY, t0 = performance.now(); for (;;) { const k = Math.min(1, (performance.now() - t0) / ms); scrollTo0(y0 + (y - y0) * ease(k)); if (k >= 1) break; await sleep(16); } }
  const scrollTo0 = (y) => window.scrollTo(0, y);
  const top = (el, off = 90) => el.getBoundingClientRect().top + scrollY - off;
  for (let i = 0; i < 60 && !document.querySelector('.row .moves .btn'); i++) await sleep(200);
  await sleep(1800);
  const row = document.querySelector('.row');
  await scrollTo(top(row, 120), 1600);
  const btn = (sel) => row.querySelector(sel);
  await sleep(700); btn('[data-m=wire]').click();
  await sleep(1300); btn('[data-m=skel]').click();
  await sleep(1300); const moves = [...row.querySelectorAll('.moves .btn')]; moves.find((b) => /Dance/.test(b.textContent))?.click(); btn('[data-m=tex]').click();
  await sleep(1400);
  await scrollTo(top(document.querySelector('#traps'), 140), 1600);
  await sleep(2600);
  await scrollTo(top(document.querySelector('#tasks'), 160), 1500);
  await sleep(1500);
  window.tourDone = true;
})();
