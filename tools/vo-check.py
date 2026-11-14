"""Lists every narration line's start/end in the edit and flags overlaps or gaps under 0.3 s.
Usage: python tools/vo-check.py [end-variant] [x]"""
import sys, os
src = open(os.path.join(os.path.dirname(__file__), 'build-video.py'), encoding='utf8').read()
head = src[:src.index('def sh(cmd):')]
sys.argv = ['build-video.py'] + sys.argv[1:]
g = {}
exec(head, g)
SEG, XF = g['SEG'], g['XF']
dur = lambda f: (os.path.getsize(f) - 44) / 48000
out_dur = [s[2] / s[6] + s[4] for s in SEG]
starts, t = [], 0.0
for i in range(len(SEG)):
    starts.append(t); t += out_dur[i] - (XF if i < len(SEG) - 1 else 0)
lines = []
for i, s in enumerate(SEG):
    for vid, o in s[5]:
        a = starts[i] + o; lines.append((a, a + dur(f'C:/Hackathon/forge/video/vo/{vid}.wav'), vid, i))
lines.sort(); bad = 0
for k, (a, b, vid, i) in enumerate(lines):
    nxt = lines[k + 1][0] if k + 1 < len(lines) else t
    gap = nxt - b
    flag = '  <-- OVERLAP' if gap < 0 else ('  <-- tight' if gap < 0.3 else '')
    bad += gap < 0.3
    print(f'{vid:5s} seg{i:2d} {a:6.2f}-{b:6.2f}  gap to next {gap:5.2f}{flag}')
print('total', round(t, 2), 'problems', bad)
