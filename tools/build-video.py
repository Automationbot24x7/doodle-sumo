"""Assembles the Doodle Sumo demo video from real captures (video/cap/*), narration (video/vo/*.wav)
and the game's own music bed. Runs ffmpeg inside WSL. Usage: python tools/build-video.py [end-variant]"""
import json, subprocess, os, sys

ROOT = 'C:/Hackathon/forge'
WROOT = '/mnt/c/Hackathon/forge'
XF = 0.35  # crossfade seconds
FPS = 60   # the recordings are 60 fps; keep every frame
END = sys.argv[1] if len(sys.argv) > 1 else 'end4'      # end2 = "draw your own" end card, end3 = plain
ENDVO = 'e1'

# (capture, start, duration of source, use game audio, hold-last-frame seconds, [(vo id, offset in segment)], speed)
SEG = [
    ('forge3', 216.2,  3.0, True,  0.0, [], 1),                       # hook: the doodle on the pad, its toy card, the live cat dancing
    ('match46', 13.9,  1.1, True,  0.0, [('h1', 0.4)], 0.5),         # HOME RUN in slow motion
    ('forge3',   3.6, 10.8, False, 0.0, [('d1', 0.5)], 2.5),          # drawing on the in-game pad (2.5x)
    ('forge3',  14.3,  3.2, True,  0.0, [('d2a', 0.6)], 1),           # "Bring it to life": the doodle lands on the desk, the clock starts
    ('forge3',  66.5,  3.3, True,  0.0, [], 1),                       # Lux3D toy concept image lands
    ('forge3', 132.3,  3.4, True,  0.0, [('d2b', 0.7)], 1),           # Lux3D 3D model lands on the turntable
    ('forge3', 206.9,  3.7, True,  0.0, [('d2c', 1.2)], 1),           # skeleton
    ('forge3', 210.6,  5.6, True,  0.0, [('d2d', 0.1), ('d2e', 2.0)], 1),  # ten moves
    ('forge3', 219.5,  4.4, True,  0.0, [('d3', 0.4)], 1),            # its roster card
    ('match46',  7.5,  1.6, True,  0.0, [('fx1', 0.3)], 1),           # Hakkeyoi!
    ('match46',  9.7,  4.2, True,  0.0, [], 1),                       # bat drops in, SLUGGER, KA-SLAP, OUT (HOME RUN already in the open)
    ('match46', 15.6,  3.5, True,  0.0, [('t1', 0.2)], 1),            # fan gust (trap cam)
    ('match46', 20.9,  3.5, True,  0.0, [], 1),                       # jack-in-the-box fires
    ('match46', 25.5,  3.5, True,  0.0, [], 1),                       # stapler warns and snaps
    ('match46', 29.0,  4.4, True,  0.0, [], 1),                       # Volt with the dumbbell knocks the cat off: round lost
    ('match46', 61.0,  5.0, True,  0.0, [], 1),                       # comeback: round 4, "Mittens! wins the round"
    ('match46', 67.4,  6.6, True,  0.0, [('w1', 0.8)], 1),            # champion dance, results card, print link
    ('lab3',     0.9,  7.7, False, 2.0, [('l1', 0.4)], 1),            # Lab: joint slider, skeleton, task log
    (END,        0.0,  0.03, False, 5.6, [(ENDVO, 0.5)], 1),
]
# (overlay png, segment index, offset in segment (output seconds), duration)
OVER = [
    ('v4-hook', 0, 0.3, 2.6),
    ('v4-logo', 1, 0.3, 1.8),
    ('v4-pad', 2, 0.4, 3.6), ('v4-note-draw', 2, 0.2, 4.0),
    ('v4-note-wait', 3, 0.3, 2.8), ('v4-note-wait', 4, 0.1, 3.0), ('v4-note-wait', 5, 0.1, 3.1), ('v4-note-wait', 6, 0.1, 3.4), ('v4-note-wait', 7, 0.1, 5.2),
    ('v4-toy', 4, 0.6, 2.6), ('v4-model', 5, 0.7, 2.6), ('v4-rig', 6, 1.1, 2.4), ('v4-moves', 7, 0.3, 3.4),
    ('v4-roster', 8, 1.2, 2.8),
    ('v4-note-play', 9, 0.1, 1.3), ('v4-note-play', 10, 0.1, 3.9), ('v4-note-play', 14, 0.1, 4.1), ('v4-note-play', 15, 0.1, 4.7),
    ('v4-pick', 10, 1.8, 2.3),
    ('v4-fan', 11, 0.4, 2.8), ('v4-jack', 12, 0.4, 2.8), ('v4-stapler', 13, 0.4, 2.8),
    ('v4-flail', 14, 2.4, 1.9),
    ('v4-print', 16, 3.0, 3.4),
    ('v4-lab', 17, 7.7, 2.0),
]

OUTNAME, BUILD = 'doodle-sumo-demo.mp4', 'build'
if len(sys.argv) > 2 and sys.argv[2] == 'x':   # 28-second cut for X: muted autoplay, so captions carry it, music and game sound only
    OUTNAME, BUILD = 'doodle-sumo-x.mp4', 'build-x'
    SEG = [
        ('forge3', 216.2,  2.8, True,  0.0, [], 1),
        ('match46', 13.9,  1.1, True,  0.0, [('h1', 0.3)], 0.5),
        ('forge3',   3.6, 10.8, False, 0.0, [], 3.6),
        ('forge3',  66.6,  2.2, True,  0.0, [], 1),
        ('forge3', 132.6,  2.4, True,  0.0, [], 1),
        ('forge3', 207.7,  4.6, True,  0.0, [], 1),
        ('match46',  9.7,  4.2, True,  0.0, [], 1),
        ('match46', 20.9,  2.8, True,  0.0, [], 1),
        ('match46', 67.6,  3.2, True,  0.0, [], 1),
        (END,        0.0,  0.03, False, 3.4, [], 1),
    ]
    OVER = [
        ('v4-hook', 0, 0.2, 2.5), ('v4-logo', 1, 0.2, 1.8),
        ('v4-note-draw', 2, 0.1, 2.8), ('v4-note-wait', 3, 0.1, 2.0), ('v4-note-wait', 4, 0.1, 2.2), ('v4-note-wait', 5, 0.1, 4.4),
        ('v4-toy', 3, 0.2, 1.9), ('v4-model', 4, 0.2, 2.1), ('v4-rig', 5, 0.3, 2.0), ('v4-moves', 5, 2.4, 2.1),
        ('v4-pick', 6, 1.6, 2.4), ('v4-note-play', 6, 0.1, 4.0), ('v4-jack', 7, 0.3, 2.4), ('v4-print', 8, 0.6, 2.5),
    ]

def sh(cmd):
    print('>', cmd[:200] + ('…' if len(cmd) > 200 else ''))
    r = subprocess.run(['wsl', '-d', 'Ubuntu-24.04', '--', 'bash', '-lc', cmd], capture_output=True, text=True)
    if r.returncode: print(r.stderr[-3000:]); raise SystemExit(1)
    return r.stdout

os.makedirs(f'{ROOT}/video/{BUILD}', exist_ok=True)
B = f'{WROOT}/video/{BUILD}'
out_dur = [s[2] / s[6] + s[4] for s in SEG]
starts, t = [], 0.0
for i, s in enumerate(SEG):
    starts.append(t); t += out_dur[i] - (XF if i < len(SEG) - 1 else 0)
total = t
print('total', round(total, 2))

# 1) per-segment video and game audio
RESUME = os.environ.get('RESUME') == '1'   # reuse the finished segment clips; redo the joining, sound and assembly
for i, (cap, ss, dur, aud, hold, _, speed) in enumerate([] if RESUME else SEG):
    d = f'{WROOT}/video/cap/{cap}'
    pad = f',tpad=stop_mode=clone:stop_duration={hold}' if hold else ''
    # evenly timed frames straight from the screencast timestamps (see tools/seqpipe.py), FPS frames per second
    sh(f'python3 {WROOT}/tools/seqpipe.py {d} {ss} {dur} {speed} {FPS} | ffmpeg -y -v error -f image2pipe -framerate {FPS} -c:v mjpeg -i - -vf "scale=1920:1080:flags=lanczos,setsar=1{pad},format=yuv420p" -t {out_dur[i]:.3f} -c:v libx264 -preset medium -crf 17 -an {B}/v{i}.mp4')
    if aud:
        tempo = f'atempo={speed},' if speed != 1 else ''
        sh(f'cd {d} && ffmpeg -y -v error -i audio.webm -ss {ss} -t {dur} -af "{tempo}aresample=48000,apad=whole_dur={out_dur[i]:.3f}" -ac 2 {B}/a{i}.wav')

# 2) video crossfade chain + caption overlays
inputs = ' '.join(f'-i {B}/v{i}.mp4' for i in range(len(SEG)))
fc, prev, off = [], '[0:v]', 0.0
for i in range(1, len(SEG)):
    off += out_dur[i - 1] - XF
    out = f'[x{i}]' if i < len(SEG) - 1 else '[vout]'
    fc.append(f'{prev}[{i}:v]xfade=transition=fade:duration={XF}:offset={off:.3f}{out}')
    prev = out
n = len(SEG); prev = '[vout]'; oin = ''
for j, (png, si, o, d) in enumerate(OVER):
    st = starts[si] + o; oin += f' -loop 1 -t {total:.2f} -i {WROOT}/video/overlays/{png}.png'
    fc.append(f'[{n + j}:v]format=rgba,fade=in:st={st:.2f}:d=0.2:alpha=1,fade=out:st={st + d - 0.25:.2f}:d=0.25:alpha=1[o{j}]')
    out = f'[ov{j}]'
    fc.append(f"{prev}[o{j}]overlay=0:0:enable='between(t,{st:.2f},{st + d:.2f})'{out}"); prev = out
fc.append(f'{prev}null[vfinal]')
sh(f'ffmpeg -y -v error {inputs}{oin} -filter_complex "{";".join(fc)}" -map "[vfinal]" -t {total:.2f} -c:v libx264 -preset medium -crf 17 -pix_fmt yuv420p {B}/video.mp4')

# 3) audio: music bed + game sfx at segment starts + narration, music ducked under the voice
ain = [f'-i {WROOT}/video/cap/music/music.wav']
parts, labels, k = [], [], 1
for i, s in enumerate(SEG):
    if s[3]:
        ain.append(f'-i {B}/a{i}.wav'); ms = int(starts[i] * 1000)
        parts.append(f'[{k}:a]volume=1.5,afade=t=in:d=0.25,afade=t=out:st={out_dur[i]-0.3:.2f}:d=0.3,adelay={ms}|{ms}[g{k}]'); labels.append(f'[g{k}]'); k += 1
vo = []
for i, s in enumerate(SEG):
    for vid, o in s[5]:
        ain.append(f'-i {WROOT}/video/vo/{vid}.wav'); ms = int((starts[i] + o) * 1000)
        parts.append(f'[{k}:a]aresample=48000,volume=1.6,adelay={ms}|{ms}[n{k}]'); vo.append(f'[n{k}]'); k += 1
parts.append(f'{"".join(vo)}amix=inputs={len(vo)}:normalize=0,apad=whole_dur={total:.2f}[voice]')
parts.append('[voice]asplit=2[voice1][voice2]')
parts.append(f'[0:a]aresample=48000,volume=2.2,atrim=0:{total:.2f},afade=t=in:d=1,afade=t=out:st={total-2:.2f}:d=2[mus]')
parts.append('[mus][voice2]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=500[musd]')
parts.append(f'[musd]{"".join(labels)}[voice1]amix=inputs={len(labels)+2}:normalize=0,atrim=0:{total:.2f},loudnorm=I=-15:TP=-1.5:LRA=9[aout]')
sh(f'ffmpeg -y -v error {" ".join(ain)} -filter_complex "{";".join(parts)}" -map "[aout]" -ar 48000 -ac 2 {B}/audio.wav')

# 4) mux
out = f'{WROOT}/video/{OUTNAME}'
sh(f'ffmpeg -y -v error -i {B}/video.mp4 -i {B}/audio.wav -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart {out}')
print(sh(f'ffprobe -v error -show_entries format=duration -of csv=p=0 {out}'))
json.dump({'segments': SEG, 'starts': starts, 'total': total}, open(f'{ROOT}/video/{BUILD}/edit.json', 'w'), indent=1)
