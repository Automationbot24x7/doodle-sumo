// Scripted tour of lab.html for the demo video (real page, real clicks and slider drags). Record with --zoom=1.5.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  async function glide(y, ms) { const y0 = scrollY, t0 = performance.now(); for (;;) { const k = Math.min(1, (performance.now() - t0) / ms); window.scrollTo(0, y0 + (y - y0) * ease(k)); if (k >= 1) break; await sleep(16); } }
  const top = (el, off) => el.getBoundingClientRect().top + scrollY - off;
  // drag a joint slider the way a hand would: many small input events
  async function drag(input, from, to, ms) { const t0 = performance.now(); for (;;) { const k = Math.min(1, (performance.now() - t0) / ms); input.value = from + (to - from) * ease(k); input.dispatchEvent(new Event('input', { bubbles: true })); if (k >= 1) break; await sleep(16); } }
  window.__marks = []; const mark = (n) => window.__marks.push([n, +(performance.now() / 1000).toFixed(2)]);
  for (let i = 0; i < 100 && !(document.querySelector('.row .moves .btn') && document.querySelectorAll('.trap input[type=range]').length >= 4); i++) await sleep(200);
  await sleep(1500); mark('top');
  const row = document.querySelector('.row'), b = (sel) => row.querySelector(sel);
  await glide(top(row, 40), 1100); mark('fighter');
  await sleep(500); b('[data-m=skel]').click();
  await sleep(1300); [...row.querySelectorAll('.moves .btn')].find((x) => /Dance/.test(x.textContent))?.click(); b('[data-m=tex]').click();
  await sleep(1500);
  const traps = document.querySelector('#traps'); await glide(top(traps, 60), 1300); mark('traps');
  const sl = [...traps.querySelectorAll('input[type=range]')];
  await sleep(400);
  await drag(sl[0], +sl[0].min, +sl[0].max, 800); await drag(sl[0], +sl[0].max, +sl[0].min, 500); await drag(sl[0], +sl[0].min, +sl[0].max, 600);
  const lid = sl.find((s) => /lid/.test(s.parentElement.textContent)) || sl[2];
  await drag(lid, +lid.min, +lid.max, 800); await drag(lid, +lid.max, +lid.min, 600);
  await sleep(300);
  await glide(top(document.querySelector('#tasks'), 120), 1300); mark('tasks');
  await sleep(2500); mark('end');
  window.__captureStop = true;
})();
