"""Timestamped contact sheets from 1-fps frames: python tools/sheetfiles.py <dir> <prefix> <cols> <rows> <outprefix> [step=1.0] [offset=0.5]"""
import sys, glob
from PIL import Image, ImageDraw
d, prefix, cols, rows, outp = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
step = float(sys.argv[6]) if len(sys.argv) > 6 else 1.0
off = float(sys.argv[7]) if len(sys.argv) > 7 else 0.5
files = sorted(glob.glob(f'{d}/{prefix}*.jpg'))
per = cols * rows
for s in range(0, len(files), per):
    chunk = files[s:s + per]
    im0 = Image.open(chunk[0]); W, H = im0.size
    sheet = Image.new('RGB', (cols * W, rows * H), 'white'); dr = ImageDraw.Draw(sheet)
    for k, f in enumerate(chunk):
        im = Image.open(f).convert('RGB'); x, y = (k % cols) * W, (k // cols) * H
        sheet.paste(im, (x, y)); t = (s + k) * step + off
        dr.rectangle((x, y, x + 70, y + 20), fill='black'); dr.text((x + 4, y + 4), f'{t:.1f}s', fill='white')
    o = f'{outp}{s // per + 1:02d}.jpg'; sheet.save(o, quality=85); print(o, sheet.size)
