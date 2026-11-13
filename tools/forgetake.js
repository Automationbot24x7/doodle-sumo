// Video take: draw a doodle on the forge pad, forge it live through Lux3D, then fight as the new toy.
// Real page, real Lux3D calls; the strokes and Player 1's keys are sent by script (tools/draw-doodle.js, tools/autopilot.js).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = new URLSearchParams(location.search), $ = (s) => document.querySelector(s);
  const load = (src) => new Promise((r) => { const s = document.createElement('script'); s.src = src + '?' + Date.now(); s.onload = r; document.head.appendChild(s); });
  window.__captureSkip = 1; window.__marks = []; const mark = (name) => window.__marks.push([name, +(performance.now() / 1000).toFixed(2)]);
  mark('start'); await sleep(1200);
  // start from the house roster: remove toys forged in earlier takes (through the normal delete button)
  window.confirm = () => true; for (const d of [...document.querySelectorAll('.card .del')]) { d.click(); await sleep(300); }
  await sleep(1000);
  $('#drawCard').click(); mark('forge-open'); await load('/tools/draw-doodle.js'); await sleep(1200);
  mark('draw'); await window.drawDoodle(q.get('doodle') || 'cat', 1.5); mark('drawn');
  await sleep(500);
  const name = q.get('name') || 'Sir Whiskers', inp = $('#fName'); inp.focus();
  for (let i = 1; i <= name.length; i++) { inp.value = name.slice(0, i); inp.dispatchEvent(new Event('input', { bubbles: true })); await sleep(70); }
  await sleep(700); mark('go'); $('#fGo').click();
  // time-lapse the waits (keep every 3rd frame), full rate for a few seconds after each Lux3D result lands
  let seen = '', fullUntil = performance.now() + 5000;
  for (let i = 0; i < 4500; i++) {
    await sleep(100);
    const st = [...document.querySelectorAll('#fSteps li.ok')].length + '|' + $('#forge').dataset.mode;
    if (st !== seen) { seen = st; mark('step ' + st); fullUntil = performance.now() + 6500; }
    window.__captureSkip = performance.now() < fullUntil ? 1 : 3;
    if ($('#forge').dataset.mode === 'done') break;
    if ($('#forge').dataset.mode === 'draw' && i > 50) { mark('FAILED ' + $('#fMsg').textContent); window.__captureStop = true; return; }
  }
  window.__captureSkip = 1; mark('alive'); await sleep(11000);
  mark('fight'); $('#fFight').click(); await load('/tools/autopilot.js');
  for (let i = 0; i < 2400; i++) { await sleep(100); if (window.__doodle.state.phase === 'results') break; }
  mark('results ' + $('#winTitle').textContent); await sleep(10000); mark('end');
  window.__captureStop = true;
})();
