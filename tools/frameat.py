"""Extract the capture frame nearest a time: python tools/frameat.py <capdir> <sec> <out.jpg> [w]"""
import sys
from PIL import Image
d, sec, out = sys.argv[1], float(sys.argv[2]), sys.argv[3]
w = int(sys.argv[4]) if len(sys.argv) > 4 else 1600
lst = open(d + '/list.txt').read().split('\n'); t = 0; best = None
for i in range(len(lst) - 1):
    if lst[i].startswith('file') and lst[i + 1].startswith('duration'):
        if t <= sec: best = lst[i][6:-1]
        t += float(lst[i + 1].split()[1])
im = Image.open(f'{d}/{best}').convert('RGB'); im = im.resize((w, int(im.height * w / im.width)), Image.LANCZOS); im.save(out, quality=88)
print(out)
