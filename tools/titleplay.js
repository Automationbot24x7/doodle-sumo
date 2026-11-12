// Video take: browse the fighter cards on the title screen, pick Big Tofu, start, then the keyboard autopilot plays P1.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cards = [...document.querySelectorAll('.card')];
  await sleep(900);
  for (const id of ['eraser', 'mug', 'battery', 'pencil', 'gummy', 'tofu']) { cards.find((c) => c.dataset.id === id)?.click(); await sleep(620); }
  await sleep(700);
  document.querySelector('#go').click();
  const s = document.createElement('script'); s.src = '/tools/autopilot.js'; document.head.appendChild(s);
})();
