"""Contact sheet of a capture: python tools/sheetcap.py <capdir> <every_sec> <out.jpg> [max_sec]"""
import sys
from PIL import Image, ImageDraw
d, every, out = sys.argv[1], float(sys.argv[2]), sys.argv[3]
mx = float(sys.argv[4]) if len(sys.argv) > 4 else 1e9
lst = open(d + '/list.txt').read().split('\n'); frames = []; t = 0
for i in range(len(lst) - 1):
    if lst[i].startswith('file') and lst[i + 1].startswith('duration'):
        frames.append((t, lst[i][6:-1])); t += float(lst[i + 1].split()[1])
picks = []; nxt = 0
for tt, f in frames:
    if tt >= nxt and tt <= mx: picks.append((tt, f)); nxt += every
W, H = 320, 180; cols = 6; rows = (len(picks) + cols - 1) // cols
sheet = Image.new('RGB', (cols * W, rows * H), 'white'); dr = ImageDraw.Draw(sheet)
for k, (tt, f) in enumerate(picks):
    im = Image.open(f'{d}/{f}').resize((W, H)); x, y = (k % cols) * W, (k // cols) * H
    sheet.paste(im, (x, y)); dr.rectangle((x, y, x + 52, y + 16), fill='black'); dr.text((x + 3, y + 2), f'{tt:.1f}s', fill='white')
sheet.save(out, quality=80); print(len(frames), 'frames', round(t, 1), 's')
