"""python tools/sheetrange.py <capdir> <from> <to> <step> <out>"""
import sys
from PIL import Image, ImageDraw
d, a, b, step, out = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), sys.argv[5]
lst = open(d + '/list.txt').read().split('\n'); frames = []; t = 0
for i in range(len(lst) - 1):
    if lst[i].startswith('file') and lst[i + 1].startswith('duration'):
        frames.append((t, lst[i][6:-1])); t += float(lst[i + 1].split()[1])
picks = []; nxt = a
for tt, f in frames:
    if tt >= nxt and tt <= b: picks.append((tt, f)); nxt += step
W, H = 320, 180; cols = 6; rows = (len(picks) + cols - 1) // cols
sheet = Image.new('RGB', (cols * W, rows * H), 'white'); dr = ImageDraw.Draw(sheet)
for k, (tt, f) in enumerate(picks):
    im = Image.open(f'{d}/{f}').resize((W, H)); x, y = (k % cols) * W, (k // cols) * H
    sheet.paste(im, (x, y)); dr.rectangle((x, y, x + 52, y + 16), fill='black'); dr.text((x + 3, y + 2), f'{tt:.1f}s', fill='white')
sheet.save(out, quality=80)
