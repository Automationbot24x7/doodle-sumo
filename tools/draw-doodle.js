// Recording helper: draws a doodle on the forge pad by sending real pointer events to it, stroke by stroke,
// the way a hand would (used for automated tests and for the demo video; disclosed in the README).
// Usage in the page: await window.drawDoodle('cat', 1)   (second argument = speed multiplier)
(() => {
  const C = { ink: '#2b2b33', orange: '#f08a24', pink: '#ff8fb1', peach: '#f3d2b3', red: '#e2453c', yellow: '#f6c431', green: '#3fae6a', blue: '#3d7be0', purple: '#8a5cd6', grey: '#9aa0aa', brown: '#8a5a33' };
  const wob = (seed) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s / 2147483647) * 2 - 1; }; };
  const R = wob(4242);
  // wobbly primitives (pad space is 768 x 768)
  const ellipse = (cx, cy, rx, ry, a0 = -1.7, sweep = 6.6, n = 46) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (sweep * i) / n, k = 1 + R() * 0.018; return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]; });
  const line = (x0, y0, x1, y1, n = 10) => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n + R() * 1.6, y0 + ((y1 - y0) * i) / n + R() * 1.6]);
  const poly = (pts, n = 6) => pts.slice(1).flatMap((p, i) => line(pts[i][0], pts[i][1], p[0], p[1], n));
  // colouring-in: one continuous zigzag across an ellipse, kept a little inside its outline
  const fill = (cx, cy, rx, ry, gap = 22, inset = 10) => {
    const out = []; let dir = 1;
    for (let y = cy - ry + inset; y <= cy + ry - inset; y += gap) {
      const k = Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)), w = Math.max(0, rx * k - inset);
      out.push([cx - w * dir + R() * 4, y + R() * 3], [cx + w * dir + R() * 4, y + gap * 0.5 + R() * 3]); dir = -dir;
    }
    return out.flatMap((p, i) => (i ? line(out[i - 1][0], out[i - 1][1], p[0], p[1], 5) : [p]));
  };
  const DOODLES = {
    // an orange cat with its arms out
    cat: [
      { c: C.ink, s: 9, p: ellipse(384, 215, 118, 104) },                                   // head
      { c: C.ink, s: 9, p: poly([[288, 152], [272, 74], [342, 118]]) },                    // ears
      { c: C.ink, s: 9, p: poly([[426, 118], [496, 74], [480, 152]]) },
      { c: C.ink, s: 9, p: ellipse(384, 452, 128, 148, -1.2, 6.5) },                       // body
      { c: C.ink, s: 9, p: poly([[262, 400], [112, 388], [108, 440], [262, 452]]) },       // arms
      { c: C.ink, s: 9, p: poly([[506, 400], [656, 388], [660, 440], [506, 452]]) },
      { c: C.ink, s: 9, p: poly([[318, 586], [312, 690], [272, 694], [272, 716], [360, 716], [364, 594]]) },   // legs
      { c: C.ink, s: 9, p: poly([[404, 594], [408, 716], [496, 716], [496, 694], [456, 690], [450, 586]]) },
      { c: C.orange, s: 42, p: fill(384, 215, 112, 98, 26, 14) },                           // colour the head
      { c: C.orange, s: 42, p: [...line(290, 140, 284, 96, 4), ...line(284, 96, 326, 122, 4)] },
      { c: C.orange, s: 42, p: [...line(478, 140, 484, 96, 4), ...line(484, 96, 442, 122, 4)] },
      { c: C.orange, s: 42, p: fill(384, 452, 122, 142, 26, 14) },                          // body
      { c: C.orange, s: 42, p: [...line(250, 424, 132, 414, 8), ...line(132, 414, 250, 430, 8)] },             // arms
      { c: C.orange, s: 42, p: [...line(518, 424, 636, 414, 8), ...line(636, 414, 518, 430, 8)] },
      { c: C.orange, s: 42, p: [...line(340, 600, 336, 696, 7), ...line(336, 696, 300, 704, 3)] },             // legs
      { c: C.orange, s: 42, p: [...line(428, 600, 432, 696, 7), ...line(432, 696, 468, 704, 3)] },
      { c: C.peach, s: 42, p: fill(384, 478, 66, 84, 24, 8) },                              // pale belly
      { c: C.ink, s: 9, p: ellipse(340, 200, 13, 17, 0, 6.5, 14) },                        // eyes
      { c: C.ink, s: 9, p: ellipse(428, 200, 13, 17, 0, 6.5, 14) },
      { c: C.ink, s: 20, p: line(340, 200, 341, 202, 2) }, { c: C.ink, s: 20, p: line(428, 200, 429, 202, 2) },
      { c: C.pink, s: 20, p: poly([[372, 236], [396, 236], [384, 250], [372, 236]], 3) },   // nose
      { c: C.ink, s: 9, p: [...line(384, 252, 384, 266, 3), ...ellipse(366, 264, 18, 14, 0, 2.6, 8)] },        // smile
      { c: C.ink, s: 9, p: ellipse(402, 264, 18, 14, 0.5, 2.6, 8) },
      { c: C.ink, s: 9, p: line(310, 238, 236, 226, 6) }, { c: C.ink, s: 9, p: line(310, 252, 240, 262, 6) },   // whiskers
      { c: C.ink, s: 9, p: line(458, 238, 532, 226, 6) }, { c: C.ink, s: 9, p: line(458, 252, 528, 262, 6) },
      { c: C.brown, s: 20, p: line(356, 128, 362, 156, 3) }, { c: C.brown, s: 20, p: line(384, 122, 384, 154, 3) }, { c: C.brown, s: 20, p: line(412, 128, 406, 156, 3) },   // stripes
      { c: C.red, s: 20, p: ellipse(384, 318, 92, 16, 0.2, 2.75, 14) },                    // collar
    ],
    // a green cactus in a pot, arms out
    cactus: [
      { c: C.ink, s: 9, p: poly([[300, 560], [300, 200], [318, 150], [384, 126], [450, 150], [468, 200], [468, 560], [300, 560]], 8) },
      { c: C.ink, s: 9, p: poly([[300, 360], [150, 352], [146, 404], [300, 414]]) },
      { c: C.ink, s: 9, p: poly([[468, 360], [618, 352], [622, 404], [468, 414]]) },
      { c: C.ink, s: 9, p: poly([[330, 560], [326, 690], [290, 694], [290, 716], [368, 716], [372, 560]]) },
      { c: C.ink, s: 9, p: poly([[396, 560], [400, 716], [478, 716], [478, 694], [442, 690], [438, 560]]) },
      { c: C.green, s: 42, p: fill(384, 345, 78, 210, 26, 12) },
      { c: C.green, s: 42, p: [...line(288, 386, 170, 378, 8), ...line(170, 378, 288, 392, 8)] },
      { c: C.green, s: 42, p: [...line(480, 386, 598, 378, 8), ...line(598, 378, 480, 392, 8)] },
      { c: C.brown, s: 42, p: [...line(350, 580, 346, 696, 7), ...line(346, 696, 312, 704, 3)] },
      { c: C.brown, s: 42, p: [...line(418, 580, 422, 696, 7), ...line(422, 696, 456, 704, 3)] },
      { c: C.ink, s: 20, p: line(350, 250, 351, 252, 2) }, { c: C.ink, s: 20, p: line(418, 250, 419, 252, 2) },
      { c: C.ink, s: 9, p: ellipse(384, 290, 30, 20, 0.3, 2.5, 10) },
      { c: C.pink, s: 42, p: ellipse(384, 118, 18, 14, 0, 6.4, 10) },
    ],
  };
  // ---- deliberately messy test doodles (forge stress test): stick figure, outline only, no arms, tiny, non-humanoid...
  const move = (strokes, k, dx, dy) => strokes.map((s) => ({ ...s, s: Math.max(9, Math.round(s.s * Math.max(k, 0.5))), p: s.p.map(([x, y]) => [x * k + dx, y * k + dy]) }));
  DOODLES.stick = [
    { c: C.ink, s: 9, p: ellipse(384, 190, 62, 62) },
    { c: C.ink, s: 9, p: line(384, 252, 392, 470, 12) },
    { c: C.ink, s: 9, p: line(386, 320, 230, 300, 8) }, { c: C.ink, s: 9, p: line(388, 320, 546, 296, 8) },
    { c: C.ink, s: 9, p: line(392, 470, 318, 660, 10) }, { c: C.ink, s: 9, p: line(392, 470, 470, 662, 10) },
    { c: C.ink, s: 20, p: line(362, 178, 363, 180, 2) }, { c: C.ink, s: 20, p: line(406, 178, 407, 180, 2) },
    { c: C.ink, s: 9, p: ellipse(386, 212, 24, 14, 0.3, 2.5, 8) },
  ];
  DOODLES.outline = DOODLES.cat.filter((s) => s.c === C.ink);
  DOODLES.bean = [   // a red bean with legs and a face, but no arms
    { c: C.ink, s: 9, p: ellipse(384, 330, 150, 200) },
    { c: C.red, s: 42, p: fill(384, 330, 144, 194, 26, 14) },
    { c: C.ink, s: 9, p: poly([[330, 524], [326, 690], [282, 700], [372, 702], [370, 528]]) },
    { c: C.ink, s: 9, p: poly([[400, 528], [402, 702], [492, 700], [446, 690], [442, 524]]) },
    { c: C.ink, s: 20, p: line(340, 280, 341, 282, 2) }, { c: C.ink, s: 20, p: line(428, 280, 429, 282, 2) },
    { c: C.ink, s: 9, p: ellipse(384, 340, 40, 22, 0.3, 2.5, 10) },
  ];
  DOODLES.tiny = move(DOODLES.cactus, 0.32, 40, 30);   // a small cactus squeezed into the top-left corner
  DOODLES.car = [    // not a character at all
    { c: C.ink, s: 9, p: poly([[150, 470], [170, 380], [270, 370], [330, 290], [500, 290], [560, 380], [640, 395], [640, 470], [150, 470]], 6) },
    { c: C.blue, s: 42, p: fill(395, 400, 230, 70, 24, 10) },
    { c: C.ink, s: 9, p: ellipse(260, 480, 52, 52) }, { c: C.ink, s: 9, p: ellipse(540, 480, 52, 52) },
    { c: C.grey, s: 42, p: fill(260, 480, 46, 46, 20, 8) }, { c: C.grey, s: 42, p: fill(540, 480, 46, 46, 20, 8) },
    { c: C.yellow, s: 20, p: poly([[345, 305], [395, 305], [395, 370], [300, 370], [345, 305]], 3) },
  ];
  DOODLES.ghost = [  // no legs, stubby arms
    { c: C.ink, s: 9, p: [...ellipse(384, 300, 150, 170, 3.14, 3.14, 26), ...poly([[534, 300], [534, 600], [490, 560], [440, 610], [384, 560], [330, 610], [280, 560], [234, 600], [234, 300]], 4)] },
    { c: C.purple, s: 42, p: fill(384, 380, 140, 210, 26, 16) },
    { c: C.ink, s: 9, p: poly([[236, 400], [170, 380], [176, 430], [236, 440]]) }, { c: C.ink, s: 9, p: poly([[532, 400], [598, 380], [592, 430], [532, 440]]) },
    { c: C.ink, s: 20, p: ellipse(340, 290, 14, 22, 0, 6.4, 10) }, { c: C.ink, s: 20, p: ellipse(428, 290, 14, 22, 0, 6.4, 10) },
  ];
  DOODLES.scribble = [   // a quick messy multicolour person, big loose zigzags
    { c: C.orange, s: 20, p: [...ellipse(384, 170, 70, 70, 0, 7.4, 30), ...line(384, 240, 384, 470, 8)] },
    { c: C.green, s: 42, p: [[300, 280], [470, 300], [290, 340], [480, 360], [300, 410], [470, 430]].flatMap((p, i, a) => (i ? line(a[i - 1][0], a[i - 1][1], p[0], p[1], 4) : [p])) },
    { c: C.blue, s: 20, p: [...line(310, 300, 180, 250, 6), ...line(180, 250, 200, 240, 2)] }, { c: C.blue, s: 20, p: [...line(460, 300, 600, 340, 6), ...line(600, 340, 610, 320, 2)] },
    { c: C.purple, s: 20, p: [...line(370, 470, 300, 680, 8), ...line(300, 680, 250, 690, 2)] }, { c: C.purple, s: 20, p: [...line(400, 470, 470, 680, 8), ...line(470, 680, 520, 676, 2)] },
    { c: C.ink, s: 20, p: line(360, 160, 361, 161, 2) }, { c: C.ink, s: 20, p: line(408, 162, 409, 163, 2) },
  ];
  DOODLES.dino = [   // a green dinosaur: big tail, tiny arms
    { c: C.ink, s: 9, p: poly([[300, 600], [280, 420], [300, 300], [330, 220], [420, 170], [520, 200], [540, 250], [470, 270], [450, 330], [470, 470], [560, 560], [700, 600], [470, 600], [460, 700], [420, 700], [410, 610], [360, 610], [350, 700], [306, 700], [300, 600]], 5) },
    { c: C.green, s: 42, p: fill(400, 420, 110, 200, 26, 12) },
    { c: C.green, s: 42, p: [...line(420, 230, 500, 220, 4), ...line(480, 560, 650, 590, 6)] },
    { c: C.ink, s: 9, p: line(452, 360, 520, 380, 4) }, { c: C.ink, s: 9, p: line(450, 400, 518, 410, 4) },
    { c: C.ink, s: 20, p: line(470, 215, 471, 217, 2) },
    { c: C.yellow, s: 20, p: [[330, 260], [300, 300], [330, 330], [300, 380], [330, 420]].flatMap((p, i, a) => (i ? line(a[i - 1][0], a[i - 1][1], p[0], p[1], 3) : [p])) },
  ];
  window.DOODLE_NAMES = Object.keys(DOODLES);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.drawDoodle = async (which = 'cat', speed = 1) => {
    const cv = document.querySelector('#fPad'), sw = document.querySelector('#fSwatches');
    const fire = (type, x, y) => { const r = cv.getBoundingClientRect(); cv.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'pen', clientX: r.left + (x * r.width) / 768, clientY: r.top + (y * r.height) / 768 })); };
    for (const st of DOODLES[which]) {
      sw.querySelector(`[data-c="${st.c}"]`)?.click();
      document.querySelector(`#fSizes [data-s="${st.s}"]`)?.click();
      await sleep(120 / speed);
      fire('pointerdown', ...st.p[0]);
      for (let i = 1; i < st.p.length; i++) { fire('pointermove', ...st.p[i]); if (i % Math.max(1, Math.round(2 * speed)) === 0) await sleep(16); }
      fire('pointerup', ...st.p[st.p.length - 1]);
      await sleep(90 / speed);
    }
    return true;
  };
})();
