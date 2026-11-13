// Video take: pick the forged toy (or ?pick=<id>) on the title screen, start a match, the keyboard autopilot plays Player 1.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = new URLSearchParams(location.search), $ = (s) => document.querySelector(s);
  window.__marks = []; const mark = (name) => window.__marks.push([name, +(performance.now() / 1000).toFixed(2)]);
  mark('start'); await sleep(2500);
  const cards = [...document.querySelectorAll('.card[data-id]')];
  const want = q.get('pick'); const card = cards.find((c) => (want ? c.dataset.id === want : c.dataset.id.startsWith('my-')));
  card?.scrollIntoView({ block: 'nearest' }); await sleep(600); card?.click(); mark('picked ' + card?.dataset.id); await sleep(1300);
  $('#go').click(); mark('go');
  await new Promise((r) => { const s = document.createElement('script'); s.src = '/tools/autopilot.js'; s.onload = r; document.head.appendChild(s); });
  let round = 0;
  for (let i = 0; i < 3000; i++) {
    await sleep(100); const st = window.__doodle.state;
    if (st.round !== round) { round = st.round; mark('round ' + round); }
    if (st.phase === 'results') break;
  }
  mark('results ' + $('#winTitle').textContent); await sleep(11000); mark('end'); window.__captureStop = true;
})();
