"""Streams a recorded capture as an evenly timed frame sequence (for ffmpeg -f image2pipe).
The screencast frames carry real timestamps (list.txt); for each output frame time we send the frame that was on
screen at that moment. This avoids the 25 fps timestamp rounding of ffmpeg's concat demuxer with still images,
which made the old videos repeat a frame several times a second.
Usage: python3 seqpipe.py <capdir> <start s> <duration s> <speed> <fps>"""
import sys, bisect

d, ss, dur, speed, fps = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), int(sys.argv[5])
lst = open(f'{d}/list.txt').read().split('\n')
starts, files, t = [], [], 0.0
for i in range(len(lst) - 1):
    if lst[i].startswith('file') and lst[i + 1].startswith('duration'):
        starts.append(t); files.append(lst[i][6:-1]); t += float(lst[i + 1].split()[1])
n = max(1, round(dur / speed * fps))
# a clip recorded well below the output rate is shown at an even half rate (each frame twice) instead of with irregular repeats
inside = sum(1 for x in starts if ss <= x < ss + dur)
step = 2 if dur > 0.5 and inside / dur * speed < 0.92 * fps else 1   # recorded frames per output frame below ~1
sys.stderr.write('seqpipe %s %s+%s: %.0f fps recorded, cadence %d' % (d.split('/')[-1], ss, dur, inside / max(dur, 1e-6), step) + chr(10))
out = sys.stdout.buffer
cache = {}
for k in range(n):
    at = ss + (k - k % step) * speed / fps
    j = max(0, bisect.bisect_right(starts, at) - 1)
    f = files[j]
    if f not in cache:
        cache.clear(); cache[f] = open(f'{d}/{f}', 'rb').read()
    out.write(cache[f])
