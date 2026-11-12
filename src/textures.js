import * as THREE from 'three';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// Warm desk wood with long grain lines, knots and a few doodles + scuffs drawn on it.
export function woodTexture(renderer) {
  const W = 2048, H = 1344, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); const r = rng(42);
  g.fillStyle = '#a06a3c'; g.fillRect(0, 0, W, H);
  // planks
  const planks = 5;
  for (let p = 0; p < planks; p++) {
    const y0 = (p * H) / planks, h = H / planks;
    const tint = 0.9 + r() * 0.2;
    g.fillStyle = `rgba(${Math.round(166 * tint)},${Math.round(110 * tint)},${Math.round(66 * tint)},1)`;
    g.fillRect(0, y0, W, h);
    for (let i = 0; i < 70; i++) {
      const y = y0 + r() * h; const a = 0.05 + r() * 0.12;
      g.strokeStyle = r() < 0.5 ? `rgba(120,70,30,${a})` : `rgba(240,200,150,${a * 0.8})`;
      g.lineWidth = 1 + r() * 3; g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= W; x += 64) g.lineTo(x, y + Math.sin(x / (180 + r() * 60) + i) * (2 + r() * 5));
      g.stroke();
    }
    for (let k = 0; k < 2; k++) {
      const kx = r() * W, ky = y0 + h * (0.25 + r() * 0.5);
      for (let j = 6; j > 0; j--) { g.strokeStyle = `rgba(110,60,25,${0.08 * j})`; g.lineWidth = 2; g.beginPath(); g.ellipse(kx, ky, 8 + j * 9, 3 + j * 3.2, 0, 0, Math.PI * 2); g.stroke(); }
    }
    g.fillStyle = 'rgba(70,40,20,.55)'; g.fillRect(0, y0 - 2, W, 4);
  }
  // pencil doodles & scuffs, like a kid's desk
  g.lineCap = 'round'; g.lineJoin = 'round';
  const doodle = (fn, col, lw = 5, a = 0.35) => { g.save(); g.globalAlpha = a; g.strokeStyle = col; g.lineWidth = lw; fn(); g.restore(); };
  doodle(() => { g.beginPath(); g.arc(1650, 260, 70, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(1625, 245, 8, 0, 7); g.arc(1675, 245, 8, 0, 7); g.stroke(); g.beginPath(); g.arc(1650, 270, 35, 0.3, Math.PI - 0.3); g.stroke(); }, '#4a3a8a');
  doodle(() => { g.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 4 * Math.PI / 5; g.lineTo(380 + Math.cos(a) * 60, 1090 + Math.sin(a) * 60); } g.closePath(); g.stroke(); }, '#a8322a');
  doodle(() => { g.beginPath(); g.moveTo(220, 240); g.bezierCurveTo(300, 140, 420, 340, 520, 220); g.stroke(); }, '#225', 4, 0.25);
  // red crayon danger stripe just inside the desk edge
  g.save(); g.strokeStyle = 'rgba(226,69,60,.75)'; g.lineWidth = 16; g.setLineDash([60, 34]); g.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) { const m = 40 + pass * 6; g.strokeRect(m, m, W - 2 * m, H - 2 * m); }
  g.restore();
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(80,50,25,${0.05 + r() * 0.1})`; g.lineWidth = 1 + r() * 2; const x = r() * W, y = r() * H, l = 20 + r() * 80, a = r() * Math.PI; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
}

// The sumo ring: a crayon circle drawn on a sheet of notebook paper.
export function paperRingTexture() {
  const S = 1024, c = document.createElement('canvas'); c.width = S; c.height = S; const g = c.getContext('2d'); const r = rng(7);
  g.fillStyle = '#fbf8f1'; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#c9daf2'; g.lineWidth = 3; for (let y = 64; y < S; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
  g.strokeStyle = 'rgba(226,69,60,.45)'; g.lineWidth = 4; g.beginPath(); g.moveTo(110, 0); g.lineTo(110, S); g.stroke();
  // crayon X marks where the four toys start (sheet spans 6.4 world units)
  const k = S / 6.4; const cols = ['#e2453c', '#3d7be0', '#3fae6a', '#e0a400'];
  [[-1.7, 1.2], [1.7, -1.2], [1.7, 1.2], [-1.7, -1.2]].forEach(([x, z], i) => {
    const cx = S / 2 + x * k, cy = S / 2 + z * k;
    for (let pass = 0; pass < 3; pass++) { g.strokeStyle = cols[i]; g.globalAlpha = 0.55 + r() * 0.2; g.lineWidth = 11 + r() * 5; g.beginPath(); g.moveTo(cx - 46 + r() * 6, cy - 46); g.lineTo(cx + 46, cy + 46 + r() * 6); g.moveTo(cx + 46, cy - 46 + r() * 6); g.lineTo(cx - 46 + r() * 6, cy + 46); g.stroke(); }
  });
  g.globalAlpha = 1;
  // note in the middle: the one rule
  g.fillStyle = 'rgba(40,40,52,.82)'; g.font = 'bold 96px Gaegu, Comic Sans MS, cursive'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save(); g.translate(S / 2, S / 2 - 24); g.rotate(-0.05); g.fillText("shove 'em", 0, -36); g.fillText('off the desk!', 0, 56); g.restore();
  g.strokeStyle = 'rgba(226,69,60,.8)'; g.lineWidth = 9; g.lineCap = 'round';
  const arrow = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); const a = Math.atan2(y2 - y1, x2 - x1); g.lineTo(x2 - Math.cos(a - 0.5) * 34, y2 - Math.sin(a - 0.5) * 34); g.moveTo(x2, y2); g.lineTo(x2 - Math.cos(a + 0.5) * 34, y2 - Math.sin(a + 0.5) * 34); g.stroke(); };
  arrow(330, 420, 150, 380); arrow(700, 420, 880, 380); arrow(512, 640, 512, 800);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function rugTexture() {
  const S = 512, c = document.createElement('canvas'); c.width = S; c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#3c5a8a'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 8; i++) { g.strokeStyle = i % 2 ? '#f6c431' : '#e2453c'; g.lineWidth = 18; g.strokeRect(20 + i * 30, 20 + i * 30, S - 40 - i * 60, S - 40 - i * 60); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t;
}

// Soft round shadow blob used under props for grounding.
export function blobTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = S; c.height = S; const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); grd.addColorStop(0, 'rgba(0,0,0,.45)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S); return new THREE.CanvasTexture(c);
}
